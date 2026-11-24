"""Constrained source-element proposals. Only accessible-name attributes may change."""
from __future__ import annotations

from html.parser import HTMLParser

from .provider import AIError, chat_json

SUPPORTED_RULES = {
    "image-alt", "input-image-alt", "role-img-alt", "svg-img-alt", "button-name", "input-button-name",
    "link-name", "label", "select-name", "aria-input-field-name",
}
ALLOWED_ATTRS = {"alt", "aria-label", "title"}
VOID_ELEMENTS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SYSTEM_PROMPT = (
    "You fix ONE accessibility problem in ONE HTML element. Return JSON: {\"replacement\": \"<the same element>\"}. "
    "Keep tag, children, and existing attributes unchanged; only add or change alt, aria-label or title. "
    "Use a short meaningful accessible name; do not add scripts, handlers, URLs, or elements."
)


class _FirstTag(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.tag: str | None = None
        self.attrs: dict[str, str | None] = {}
        self.raw: str | None = None
        self.stack: list[str] = []
        self.complete = False
        self.extra_content = False

    def handle_starttag(self, tag, attrs):
        name = tag.lower()
        if self.tag is None:
            normalized: dict[str, str | None] = {}
            for attr, value in attrs:
                key = attr.lower()
                if key in normalized:
                    raise AIError("Element contains duplicate attributes")
                normalized[key] = value
            self.tag, self.attrs, self.raw = name, normalized, self.get_starttag_text()
            if name in VOID_ELEMENTS:
                self.complete = True
            else:
                self.stack.append(name)
        elif self.complete:
            self.extra_content = True
        elif name not in VOID_ELEMENTS:
            self.stack.append(name)

    def handle_startendtag(self, tag, attrs):
        if tag.lower() not in VOID_ELEMENTS:
            raise AIError("Self-closing non-void elements are not supported")
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        name = tag.lower()
        if self.complete or not self.stack or self.stack[-1] != name:
            self.extra_content = True
            return
        self.stack.pop()
        if not self.stack:
            self.complete = True

    def handle_data(self, data):
        if self.complete and data.strip():
            self.extra_content = True

    def handle_comment(self, data):
        if self.complete:
            self.extra_content = True

    def handle_decl(self, decl):
        if self.complete or self.tag is not None:
            self.extra_content = True

    def handle_pi(self, data):
        self.extra_content = True


def _split(element: str) -> tuple[str, dict, str]:
    if not isinstance(element, str):
        raise AIError("Element must be a string")
    text = element.strip()
    if not text or len(text) > 5000:
        raise AIError("Element must be non-empty and no longer than 5000 characters")
    parser = _FirstTag()
    try:
        parser.feed(text)
        parser.close()
    except AIError:
        raise
    except Exception as exc:
        raise AIError("Element must be valid HTML") from exc
    if not parser.tag or not parser.raw or not text.startswith(parser.raw):
        raise AIError("Element must start with an HTML start tag")
    if parser.tag in VOID_ELEMENTS:
        if text[len(parser.raw):].strip():
            raise AIError("Selection contains content after a void element")
        return parser.tag, parser.attrs, ""
    if not parser.complete or parser.stack:
        raise AIError("Element must have a complete closing tag")
    if parser.extra_content:
        raise AIError("Selection must contain exactly one complete HTML element")
    tail = text[len(parser.raw):]
    if not tail.rstrip().lower().endswith(f"</{parser.tag}>"):
        raise AIError("Element must be one complete element")
    return parser.tag, parser.attrs, tail


def validate_replacement(original: str, replacement: str) -> str:
    if not isinstance(replacement, str) or not replacement.strip() or len(replacement) > 5000:
        raise AIError("Replacement has an invalid length")
    old_tag, old_attrs, old_children = _split(original)
    new_tag, new_attrs, new_children = _split(replacement)
    if old_tag != new_tag or old_children != new_children:
        raise AIError("Replacement changed the element tag or its children")
    frozen = lambda attrs: {key: value for key, value in attrs.items() if key not in ALLOWED_ATTRS}  # noqa: E731
    if frozen(old_attrs) != frozen(new_attrs):
        raise AIError("Replacement changed attributes outside the allowed set")
    changed = False
    for name in ALLOWED_ATTRS:
        old, new = old_attrs.get(name), new_attrs.get(name)
        if old != new:
            if new is None:
                raise AIError("Replacement cannot remove an existing accessible-name attribute")
            if len(new) > 150 or "<" in new or ">" in new or not new.strip():
                raise AIError("Replacement attribute value is not acceptable")
            changed = True
        elif new is not None and (len(new) > 150 or "<" in new or ">" in new or not new.strip()):
            raise AIError("Replacement attribute value is not acceptable")
    if not changed:
        raise AIError("Replacement does not add an accessible name")
    return replacement.strip()


def propose(base_url: str, model: str, api_key: str, rule_id: str, message: str, element: str, context: str = "") -> str:
    data = chat_json(base_url, model, api_key, [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Rule: {rule_id}\nProblem: {message}\nPage context: {context}\nElement:\n{element}"},
    ])
    replacement = data.get("replacement")
    if not isinstance(replacement, str):
        raise AIError("AI provider did not return a replacement string")
    return validate_replacement(element, replacement)
