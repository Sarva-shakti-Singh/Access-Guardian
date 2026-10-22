import hashlib
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ARTIFACTS_DIR = Path(__file__).resolve().parents[2] / "artifacts"
SCREENSHOT_DIR = ARTIFACTS_DIR / "screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def _safe_text(value):
    return (value or "").strip()[:4000]


def scan_url(target_url: str, scan_id: str):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1200}, ignore_https_errors=True)
        page.set_default_timeout(30000)
        page.goto(target_url, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2500)

        title = page.title()
        page_url = page.url
        current_dom = page.evaluate("document.body.innerHTML")
        interactive_elements = page.evaluate(
            """
            () => Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]'))
                .slice(0, 60)
                .map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    role: el.getAttribute('role'),
                    text: (el.textContent || '').trim().slice(0, 120),
                    name: (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('name') || '').trim(),
                    href: el.getAttribute('href') || '',
                    id: el.getAttribute('id') || ''
                }))
            """
        )
        accessibility_tree = page.accessibility.snapshot()

        screenshot_path = SCREENSHOT_DIR / f"{scan_id}.png"
        page.screenshot(path=str(screenshot_path), full_page=True)

        try:
            page.add_script_tag(url="https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js")
            axe_results = page.evaluate(
                """
                async () => {
                    const results = await axe.run(document.body, {
                        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
                    });
                    return results;
                }
                """
            )
        except Exception:
            axe_results = { violations: [], passes: [], incomplete: [] }

        findings = []
        for violation in axe_results.get("violations", []):
            rule_id = violation.get("id") or "unknown-rule"
            severity = (violation.get("impact") or "moderate").lower()
            selector = (violation.get("nodes") or [{}])[0].get("target", [None])[0] if (violation.get("nodes") or [{}]) else None
            snippet = (violation.get("nodes") or [{}])[0].get("html") if (violation.get("nodes") or [{}]) else None
            findings.append(
                {
                    "rule_id": rule_id,
                    "wcag": violation.get("tags", []),
                    "severity": severity,
                    "message": _safe_text(violation.get("help")),
                    "selector": selector,
                    "html_snippet": _safe_text(snippet),
                    "help_url": violation.get("helpUrl"),
                    "screenshot_path": str(screenshot_path),
                    "status": "open",
                    "source": "axe-core",
                    "page_url": page_url,
                }
            )

        score = max(0, 100 - (len(findings) * 8))
        return {
            "scan_id": scan_id,
            "target_url": target_url,
            "status": "complete",
            "title": title,
            "page_url": page_url,
            "pages_scanned": 1,
            "score": score,
            "summary": {
                "total_findings": len(findings),
                "page_title": title,
                "interactive_elements": interactive_elements,
            },
            "dom_snapshot": _safe_text(current_dom),
            "accessibility_tree": accessibility_tree,
            "findings": findings,
            "screenshot_path": str(screenshot_path),
        }
