"""Constrained source-element proposals. Only accessible-name attributes may change."""
from __future__ import annotations

from html.parser import HTMLParser

from .provider import AIError, chat_json

SUPPORTED_RULES = {
    "image-alt", "input-image-alt", "role-img-alt", "svg-img-alt", "button-name", "input-button-name",
    "link-name", "label", "select-name", "aria-input-field-name",
}
ALLOWED_ATTRS = {"alt", "aria-label", "title"}

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

    def handle_starttag(self, tag, attrs):  # noqa: D401
        if self.tag is None:
            self.tag, self.attrs, self.raw = tag, dict(attrs), self.get_starttag_text()

    handle_startendtag = handle_starttag


def _split(element: str) -> tuple[str, dict, str]:
    s = element.strip()
    p = _FirstTag()
    p.feed(s)
    if not p.tag or not p.raw or not s.startswith(p.raw):
        raise AIError("Element must start with an HTML start tag")
    return p.tag, p.attrs, s[len(p.raw):]


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
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Rule: {rule_id}\nProblem: {message}\nPage context: {context}\nElement:\n{element}"},
        ],
    )
    replacement = data.get("replacement")
    if not isinstance(replacement, str):
        raise AIError("AI provider did not return a replacement string")
    return validate_replacement(element, replacement)
