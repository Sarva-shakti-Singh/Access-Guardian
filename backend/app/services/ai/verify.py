"""Local axe-core verification for one modified HTML element."""
from __future__ import annotations

from html.parser import HTMLParser

from ...config import get_settings
from .fix import SUPPORTED_RULES


class VerificationError(Exception):
    pass


class _FirstTag(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.tag: str | None = None
        self.raw: str | None = None

    def handle_starttag(self, tag, attrs):
        if self.tag is None:
            self.tag, self.raw = tag, self.get_starttag_text()

    handle_startendtag = handle_starttag


def classify_verification(violations: int, incomplete: int) -> dict:
    if violations:
        return {
            "status": "complete",
            "outcome": "unresolved",
            "message": "The original axe-core rule remains detected in the modified element.",
        }
    if incomplete:
        return {
            "status": "complete",
            "outcome": "partially_resolved",
            "message": "The original axe-core rule is incomplete and could not be confirmed as resolved.",
        }
    return {
        "status": "complete",
        "outcome": "resolved",
        "message": "The original axe-core rule was not detected in the modified element.",
    }


def validate_verification_element(element: str) -> str:
    if not isinstance(element, str) or not element.strip():
        raise VerificationError("The modified HTML element is empty")
    element = element.strip()
    if len(element) > 5000:
        raise VerificationError("The modified HTML element is too large")
    if element.lower().startswith(("<script", "<style", "<iframe", "<object", "<embed")):
        raise VerificationError("Executable or embedded HTML cannot be verified")
    parser = _FirstTag()
    parser.feed(element)
    if not parser.tag or not parser.raw or not element.startswith(parser.raw):
        raise VerificationError("The modified HTML must start with a complete element")
    rest = element[len(parser.raw):]
    void_tags = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
    if parser.tag in {"script", "style", "iframe", "object", "embed"}:
        raise VerificationError("Executable or embedded HTML cannot be verified")
    if parser.tag not in void_tags:
        closing = f"</{parser.tag}>"
        if not rest.strip().lower().endswith(closing):
            raise VerificationError("The modified HTML must include its matching closing tag")
    return element


def verify_element(rule_id: str, element: str) -> dict:
    if rule_id not in SUPPORTED_RULES:
        raise VerificationError("Rule is not supported for verification")
    element = validate_verification_element(element)
    settings = get_settings()
    if not settings.axe_path.is_file():
        return {
            "status": "inconclusive",
            "outcome": "inconclusive",
            "rule_id": rule_id,
            "message": "axe-core is unavailable; verification could not be completed.",
            "remaining_violations": 0,
            "remaining_incomplete": 0,
            "human_review_required": True,
        }
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise VerificationError("Playwright is not installed") from exc

    axe_src = settings.axe_path.read_text(encoding="utf-8")
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                java_script_enabled=True,
                accept_downloads=False,
            )
            context.route("**/*", lambda route: route.abort())
            page = context.new_page()
            page.set_content(f"<!doctype html><html><body>{element}</body></html>", wait_until="domcontentloaded")
            page.add_script_tag(content=axe_src)
            result = page.evaluate(
                """async (ruleId) => await axe.run(document, {
                    runOnly: { type: 'rule', values: [ruleId] },
                    resultTypes: ['violations', 'incomplete']
                })""",
                rule_id,
            )
            violations = sum(len(item.get("nodes", [])) for item in result.get("violations", []))
            incomplete = sum(len(item.get("nodes", [])) for item in result.get("incomplete", []))
            browser.close()
    except (PlaywrightError, OSError) as exc:
        raise VerificationError("The local verification browser could not complete the check") from exc

    classification = classify_verification(violations, incomplete)

    return {
        "status": classification["status"],
        "outcome": classification["outcome"],
        "rule_id": rule_id,
        "message": classification["message"],
        "remaining_violations": violations,
        "remaining_incomplete": incomplete,
        "human_review_required": True,
    }
