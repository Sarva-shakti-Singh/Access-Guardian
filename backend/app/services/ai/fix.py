"""Constrained source-element proposals. Only accessible-name attributes may change."""
from __future__ import annotations

from html.parser import HTMLParser

from .provider import AIError, chat_json

SUPPORTED_RULES = {
    "image-alt", "input-image-alt", "role-img-alt", "svg-img-alt", "button-name", "input-button-name",
    "link-name", "label", "select-name", "aria-input-field-name",
}
ALLOWED_ATTRS = {"alt", "aria-label", "title"}
VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
}

SYSTEM_PROMPT = (
    "You fix ONE accessibility problem in ONE HTML element. Return JSON: {\"replacement\": \"<the same element>\"}. "
    "Rules: keep the same tag, children and every existing attribute unchanged; you may only add or change the "
    "attributes alt, aria-label or title. Use a short, meaningful, human-readable name. Do not add scripts, "
    "event handlers, URLs or new elements."
)


class _FirstTag(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.tag: str | None = None
        self.attrs: dict[str, str | None] = {}
        self.raw: str | None = None
        self.stack: list[str] = []
        self.complete = False

    def handle_starttag(self, tag, attrs):
        if self.tag is None:
            self.tag, self.attrs, self.raw = tag.lower(), dict(attrs), self.get_starttag_text()
            if tag.lower() not in VOID_ELEMENTS:
                self.stack.append(tag.lower())
        elif tag.lower() not in VOID_ELEMENTS:
            self.stack.append(tag.lower())

    def handle_startendtag(self, tag, attrs):
        if self.tag is None:
            self.tag, self.attrs, self.raw = tag.lower(), dict(attrs), self.get_starttag_text()

    def handle_endtag(self, tag):
        if not self.stack:
            return
        tag = tag.lower()
        if self.stack[-1] != tag:
            raise AIError("Element contains mismatched closing tags")
        self.stack.pop()
        if not self.stack:
            self.complete = True


def _split(element: str) -> tuple[str, dict, str]:
    s = element.strip()
    if len(s) > 5000:
        raise AIError("Element must not exceed 5000 characters")
    p = _FirstTag()
    try:
        p.feed(s)
        p.close()
    except AIError:
        raise
    except Exception as exc:
        raise AIError("Element must be valid HTML") from exc

    if not p.tag or not p.raw or not s.startswith(p.raw):
        raise AIError("Element must start with an HTML start tag")

    if p.tag in VOID_ELEMENTS:
        if s[len(p.raw):].strip():
            raise AIError("Selection contains content after a void element")
        return p.tag, p.attrs, ""

    if not p.complete:
        raise AIError("Element must have a complete closing tag")

    raw_end = s.find(p.raw) + len(p.raw)
    tail = s[raw_end:]
    # Require the first element to end after all nested content and before no extra sibling.
    if tail and not tail.rstrip().endswith(f"</{p.tag}>"):
        raise AIError("Element must be one complete element")
    return p.tag, p.attrs, tail


def validate_replacement(original: str, replacement: str) -> str:
    """Return the cleaned replacement or raise AIError when it exceeds the allowed change."""
    if not replacement or len(replacement) > 5000:
        raise AIError("Replacement has an invalid length")
    o_tag, o_attrs, o_rest = _split(original)
    n_tag, n_attrs, n_rest = _split(replacement)
    if o_tag != n_tag or o_rest != n_rest:
        raise AIError("Replacement changed the element tag or its children")
    frozen = lambda a: {k: v for k, v in a.items() if k not in ALLOWED_ATTRS}  # noqa: E731
    if frozen(o_attrs) != frozen(n_attrs):
        raise AIError("Replacement changed attributes outside the allowed set")
    changed = False
    for k in ALLOWED_ATTRS:
        new = n_attrs.get(k)
        if new is None:
            continue
        if len(new) > 150 or "<" in new or ">" in new or not new.strip():
            raise AIError("Replacement attribute value is not acceptable")
        if new != o_attrs.get(k):
            changed = True
    if not changed:
        raise AIError("Replacement does not add an accessible name")
    return replacement.strip()


def propose(base_url: str, model: str, api_key: str, rule_id: str, message: str, element: str, context: str = "") -> str:
    data = chat_json(
        base_url, model, api_key,
        [{"role": "system", "content": SYSTEM_PROMPT},
         {"role": "user", "content": f"Rule: {rule_id}\nProblem: {message}\nPage context: {context}\nElement:\n{element}"}],
    )
    replacement = data.get("replacement")
    if not isinstance(replacement, str):
        raise AIError("AI provider did not return a replacement string")
    return validate_replacement(element, replacement)
