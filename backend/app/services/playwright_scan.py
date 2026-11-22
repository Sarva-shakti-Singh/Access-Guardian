"""Bounded same-origin crawl with Playwright + local axe-core. No clicks, no form submission."""
from __future__ import annotations

import re
import time
import traceback
from urllib.parse import urlsplit, urlunsplit

from ..config import get_settings
from ..database.store import Store
from .ai import vision
from .ai.provider import AIError
from .security import UnsafeTarget, redact, validate_target

AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]
SKIP_EXT = re.compile(r"\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3|docx?|xlsx?|pptx?|exe|dmg)$", re.I)
MAX_NODES_PER_RULE = 20
MAX_FINDINGS_PER_PAGE = 200

TAB_JS = """() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const cs = getComputedStyle(e);
  const has_outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const has_box_shadow = cs.boxShadow !== 'none';
  return { tag: e.tagName.toLowerCase(), id: e.id || null,
    name: (e.getAttribute('aria-label') || e.innerText || e.getAttribute('alt') || '').trim().slice(0, 40),
    has_outline, has_outline_or_shadow: has_outline || has_box_shadow };
}"""
METRICS_JS = """() => ({ viewport_width: window.innerWidth, viewport_height: window.innerHeight,
  scroll_width: document.documentElement.scrollWidth, horizontal_overflow: document.documentElement.scrollWidth > window.innerWidth + 1 })"""
AXE_JS = """async (tags) => await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] })"""


def _wcag(tags: list[str]) -> list[str]:
    out = []
    for t in tags:
        m = re.fullmatch(r"wcag(\d)(\d)(\d{1,2})", t)
        if m:
            out.append(".".join(m.groups()))
    return out


def _clean_url(url: str) -> str:
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path or "/", "", ""))


def _axe_findings(result: dict, page_url: str, page_index: int) -> list[dict]:
    findings: list[dict] = []
    for bucket, confidence, source in (("violations", "confirmed", "axe"), ("incomplete", "potential", "axe_incomplete")):
        for rule in result.get(bucket, []):
            for node in rule.get("nodes", [])[:MAX_NODES_PER_RULE]:
                selector = ", ".join(node.get("target", []) if all(isinstance(t, str) for t in node.get("target", [])) else [])
                findings.append({
                    "rule_id": rule["id"],
                    "wcag": _wcag(rule.get("tags", [])),
                    "severity": rule.get("impact") or node.get("impact") or "unknown",
                    "message": rule.get("help", rule["id"]),
                    "selector": selector[:300] or None,
                    "html_snippet": redact(node.get("html")),
                    "page_url": page_url,
                    "page_index": page_index,
                    "source": source,
                    "confidence": confidence,
                    "title": rule.get("help"),
                    "category": next((t.replace("cat.", "") for t in rule.get("tags", []) if t.startswith("cat.")), None),
                    "evidence": {"description": rule.get("description"), "help_url": rule.get("helpUrl"),
                                 "failure_summary": redact(node.get("failureSummary"), 400)},
                    "screenshot_available": True,
                })
                if len(findings) >= MAX_FINDINGS_PER_PAGE:
                    return findings
    return findings


def run_scan(scan_id: str, store: Store) -> None:
    settings = get_settings()
    scan = store.get_scan(scan_id)
    if not scan:
        return
    cfg = scan["config"]
    errors: list[str] = []
    pages: list[dict] = []
    started = time.time()
    store.update_scan(scan_id, status="crawling", started_at=started)
    shots = settings.artifacts_dir / "screenshots" / scan_id
    shots.mkdir(parents=True, exist_ok=True)
    try:
        target = validate_target(scan["target_url"], settings.allowed_ports)
    except UnsafeTarget as exc:
        store.update_scan(scan_id, status="failed", errors=[str(exc)], finished_at=time.time())
        return

    axe_src = settings.axe_path.read_text(encoding="utf-8") if settings.axe_path.exists() else None
    if axe_src is None:
        errors.append("axe-core script not found; run `npm install` in frontend/ - results are incomplete")

    try:
        from playwright.sync_api import sync_playwright  # imported lazily so the API starts without browsers
    except ImportError:
        store.update_scan(scan_id, status="failed", errors=["Playwright is not installed"], finished_at=time.time())
        return

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=[f"--host-resolver-rules=MAP {target.host} {target.ip}"])
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=False)

            def guard(route, request):
                u = urlsplit(request.url)
                if u.scheme in ("data", "blob", "about"):
                    return route.continue_()
                port = u.port or (443 if u.scheme == "https" else 80)
                if u.scheme in ("http", "https") and (u.hostname or "").lower() == target.host and port == target.port:
                    return route.continue_()
                return route.abort()

            ctx.route("**/*", guard)
            queue: list[tuple[str, int]] = [(target.url, 0)]
            seen = {target.url}
            while queue and len(pages) < cfg.get("max_pages", 1):
                if store.is_cancel_requested(scan_id):
                    break
                url, depth = queue.pop(0)
                idx = len(pages)
                entry = {
                    "url": url, "title": "", "status": "failed", "page_index": idx,
                    "screenshot_available": False, "evidence": {},
                }
                page = ctx.new_page()
                page.set_default_timeout(cfg.get("timeout_seconds", 20) * 1000)
                try:
                    page.goto(url, wait_until="load")
                    entry["title"] = (page.title() or "")[:200]
                    entry["evidence"].update(page.evaluate(METRICS_JS))
                    tab_order = []
                    for _ in range(12):
                        page.keyboard.press("Tab")
                        info = page.evaluate(TAB_JS)
                        if info is None:
                            break
                        tab_order.append(info)
                    entry["evidence"]["tab_order"] = tab_order
                    page.screenshot(path=str(shots / f"{idx}.png"), mask=[page.locator("input, textarea")])
                    entry["screenshot_available"] = True
                    if axe_src:
                        page.add_script_tag(content=axe_src)
                        result = page.evaluate(AXE_JS, AXE_TAGS)
                        store.add_findings(scan_id, _axe_findings(result, url, idx))
                        entry["status"] = "complete"
                    else:
                        entry["status"] = "partial"
                    if depth < cfg.get("max_depth", 1):
                        for href in page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)"):
                            u = urlsplit(href)
                            if u.scheme in ("http", "https") and (u.hostname or "").lower() == target.host \
                                    and (u.port or target.port) == target.port and not SKIP_EXT.search(u.path):
                                clean = _clean_url(href)
                                if clean not in seen:
                                    seen.add(clean)
                                    queue.append((clean, depth + 1))
                except Exception as exc:  # noqa: BLE001 - keep scanning other pages
                    errors.append(f"{url}: {type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
                finally:
                    page.close()
                pages.append(entry)
                store.update_scan(scan_id, pages=pages, pages_scanned=len(pages), errors=errors,
                                  title=pages[0]["title"], page_url=pages[0]["url"])
            browser.close()
    except Exception as exc:  # noqa: BLE001
        errors.append(f"Browser error: {type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
        traceback.print_exc()

    if store.is_cancel_requested(scan_id):
        store.update_scan(scan_id, status="cancelled", pages=pages, errors=errors, finished_at=time.time())
        return

    ai_status = "disabled"
    if cfg.get("analyze_with_ai") and cfg.get("consent_to_ai_analysis"):
        store.update_scan(scan_id, status="analyzing", ai_analysis_status="pending")
        ai_status = _vision_pass(store, scan_id, pages, shots, errors)

    done = [p for p in pages if p["status"] == "complete"]
    if not pages or not any(p["screenshot_available"] for p in pages):
        status = "failed"
    elif errors or len(done) != len(pages):
        status = "partial"
    else:
        status = "complete"
    store.update_scan(scan_id, status=status, pages=pages, errors=errors, ai_analysis_status=ai_status,
                      finished_at=time.time())


def _vision_pass(store: Store, scan_id: str, pages: list[dict], shots, errors: list[str]) -> str:
    settings = get_settings()
    if not vision.configured(settings):
        errors.append("AI analysis requested but no vision model is configured")
        return "unavailable"
    ok = failed = 0
    for page in [p for p in pages if p["screenshot_available"]][:3]:
        idx = page["page_index"]
        summary = store.list_findings(scan_id=scan_id, source="axe", limit=15)
        evidence = {
            "page_title": page["title"],
            "axe_findings": [{"rule": f["rule_id"], "message": f["message"], "selector": f["selector"]}
                             for f in summary if f["page_url"] == page["url"]],
            "viewport": {k: page["evidence"].get(k) for k in ("viewport_width", "viewport_height", "horizontal_overflow")},
        }
        try:
            for o in vision.analyze(settings, shots / f"{idx}.png", evidence):
                store.add_findings(scan_id, [{
                    "rule_id": "vision-observation", "wcag": o["wcag"], "severity": o["severity"],
                    "message": o["message"], "selector": o["selector"], "html_snippet": None,
                    "page_url": page["url"], "page_index": idx, "source": "vision_llm", "confidence": "potential",
                    "title": "Potential visual barrier (needs human review)", "category": "vision",
                    "evidence": {"note": "Unverified AI observation"}, "screenshot_available": True,
                }])
            ok += 1
        except (AIError, OSError) as exc:
            failed += 1
            errors.append(f"AI analysis failed for {page['url']}: {exc}")
    if ok and not failed:
        return "complete"
    return "partial" if ok else "unavailable"
