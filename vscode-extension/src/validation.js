const ALLOWED_ATTRIBUTES = new Set(["alt", "aria-label", "title"]);
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

function validateBackendUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("The Access Guardian API URL is invalid.");
  let url;
  try { url = new URL(value); }
  catch { throw new Error("Access Guardian API URL is invalid. Check the accessGuardian.backendUrl setting."); }

  const hostname = url.hostname.toLowerCase();
  const isIpv4Loopback = /^127(?:\.\d{1,3}){3}$/.test(hostname);
  const isLoopback = hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || isIpv4Loopback;
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("Use HTTPS for remote APIs. HTTP is allowed only for localhost; credentials, query strings, and fragments are not allowed.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function findTagEnd(text, start) {
  let quote = "";
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quote) { if (char === quote) quote = ""; }
    else if (char === "'" || char === '"') quote = char;
    else if (char === ">") return i;
  }
  return -1;
}

function scanTags(text) {
  const tags = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("<", i);
    if (start < 0) break;
    if (text.startsWith("<!--", start)) {
      const end = text.indexOf("-->", start + 4);
      if (end < 0) throw new Error("contains an unterminated comment");
      i = end + 3;
      continue;
    }
    const end = findTagEnd(text, start + 1);
    if (end < 0) throw new Error("contains an unterminated tag");
    const raw = text.slice(start, end + 1);
    if (/^<!|^<\?/i.test(raw)) { i = end + 1; continue; }
    if (!/^<\/?[a-zA-Z][^>]*>$/.test(raw)) throw new Error("contains malformed markup");
    const closing = /^<\/\s*([a-zA-Z][a-zA-Z0-9:-]*)\s*>$/.exec(raw);
    if (closing) tags.push({ closing: true, tag: closing[1].toLowerCase(), raw });
    else {
      const opening = /^<\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(raw);
      if (!opening) throw new Error("contains malformed markup");
      const tag = opening[1].toLowerCase();
      const selfClosing = /\/\s*>$/.test(raw);
      if (selfClosing && !VOID_ELEMENTS.has(tag)) throw new Error("self-closing non-void elements are not supported by the backend");
      tags.push({ closing: false, tag, raw, selfClosing });
    }
    i = end + 1;
  }
  return tags;
}

function validateCompleteHtmlElement(element) {
  if (typeof element !== "string" || !element.trim()) throw new Error("Selection is empty");
  const text = element.trim();
  if (/^<!--|^<!|^<\?/i.test(text)) throw new Error("Selection must begin with the opening element tag");
  if (!/^<[a-zA-Z]/.test(text)) throw new Error("Selection must begin with the opening element tag");
  const tags = scanTags(text);
  if (!tags.length || tags[0].closing) throw new Error("Selection must start with an opening HTML tag");
  const first = tags[0];
  if (["html", "body", "head"].includes(first.tag)) throw new Error("Select only the target element, not a document/container root");
  if (first.selfClosing || VOID_ELEMENTS.has(first.tag)) {
    const end = findTagEnd(text, 1);
    if (text.slice(end + 1).trim()) throw new Error("Selection contains content after a void element");
    return;
  }

  const stack = [first.tag];
  for (let i = 1; i < tags.length; i += 1) {
    const item = tags[i];
    if (item.closing) {
      if (!stack.length) throw new Error("Selection contains an unmatched closing tag");
      if (stack[stack.length - 1] !== item.tag) throw new Error("Selection contains mismatched closing tags");
      stack.pop();
    } else if (!item.selfClosing && !VOID_ELEMENTS.has(item.tag)) stack.push(item.tag);
  }
  if (stack.length) throw new Error("Selection has an unclosed HTML element");
  const last = tags[tags.length - 1];
  if (!last.closing || last.tag !== first.tag) throw new Error("Selection must end with the opening element's closing tag");
  const closeIndex = text.lastIndexOf(last.raw);
  if (text.slice(closeIndex + last.raw.length).trim()) throw new Error("Selection contains extra markup after the target element");
}

function parseElement(element) {
  const text = element.trim();
  validateCompleteHtmlElement(text);
  const end = findTagEnd(text, 1);
  if (end < 0) throw new Error("HTML start tag is incomplete");
  const startTag = text.slice(1, end);
  const tagMatch = /^\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(startTag);
  if (!tagMatch) throw new Error("HTML element has no tag name");
  const tag = tagMatch[1].toLowerCase();
  const attributes = new Map();
  let index = tagMatch[0].length;
  while (index < startTag.length) {
    while (/\s/.test(startTag[index] || "")) index += 1;
    if (index >= startTag.length) break;
    if (startTag[index] === "/") {
      if (!/^\/\s*$/.test(startTag.slice(index))) throw new Error("Malformed closing syntax in HTML start tag");
      break;
    }
    const attrMatch = /^[^\s=/>]+/.exec(startTag.slice(index));
    if (!attrMatch) throw new Error("Malformed HTML attribute");
    const name = attrMatch[0].toLowerEqual ? attrMatch[0].toLowerEqual() : attrMatch[0].toLowerCase();
    if (attributes.has(name)) throw new Error("Duplicate HTML attribute");
    index += attrMatch[0].length;
    while (/\s/.test(startTag[index] || "")) index += 1;
    let value = null;
    if (startTag[index] === "=") {
      index += 1;
      while (/\s/.test(startTag[index] || "")) index += 1;
      const quote = startTag[index];
      if (quote === "'" || quote === '"') {
        index += 1;
        const valueEnd = startTag.indexOf(quote, index);
        if (valueEnd < 0) throw new Error("Unterminated attribute value");
        value = startTag.slice(index, valueEnd);
        index = valueEnd + 1;
      } else {
        const valueMatch = /^[^\s>]+/.exec(startTag.slice(index));
        if (!valueMatch) throw new Error("Empty attribute value");
        value = valueMatch[0];
        index += valueMatch[0].length;
      }
    }
    attributes.set(name, value);
  }
  return { tag, attributes, tail: text.slice(end + 1) };
}

function validateReplacement(original, replacement) {
  if (typeof replacement !== "string" || !replacement.trim() || replacement.length > 5000) throw new Error("The AI returned an empty or oversized replacement.");
  const before = parseElement(original);
  const after = parseElement(replacement);
  if (before.tag !== after.tag || before.tail !== after.tail) throw new Error("The proposal changed the element tag or its children.");
  const frozen = (attrs) => [...attrs.entries()].filter(([name]) => !ALLOWED_ATTRIBUTES.has(name)).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(frozen(before.attributes)) !== JSON.stringify(frozen(after.attributes))) throw new Error("The proposal changed attributes outside alt, aria-label, or title.");
  let changed = false;
  for (const name of ALLOWED_ATTRIBUTES) {
    const old = before.attributes.get(name);
    const value = after.attributes.get(name);
    if (old !== value) {
      if (value == null) throw new Error("The proposal cannot remove an existing accessible-name attribute.");
      if (!value.trim() || value.length > 150 || /[<>]/.test(value)) throw new Error("The proposal contains an invalid accessible-name attribute.");
      changed = true;
    }
  }
  if (!changed) throw new Error("The proposal did not change an accessible-name attribute.");
  return replacement.trim();
}

function buildFixRequest(ruleId, message, element, provider, model) {
  return { consent_to_send_context: true, rule_id: ruleId, message, element, context: "", expected_provider: provider, expected_model: model };
}

function diskSnapshotsEqual(first, second) {
  if (!first || !second || first.length !== second.length) return false;
  for (let i = 0; i < first.length; i += 1) if (first[i] !== second[i]) return false;
  return true;
}

function validateStaleProposalState({ isDirty, documentVersion, expectedVersion, currentText, expectedText, currentRangeText, expectedRangeText, diskSnapshot, diskNow }) {
  if (isDirty) throw new Error("The file became unsaved after the proposal was prepared.");
  if (documentVersion !== expectedVersion) throw new Error("The document version changed after the proposal was prepared.");
  if (currentText !== expectedText) throw new Error("The document text changed after the proposal was prepared.");
  if (currentRangeText !== expectedRangeText) throw new Error("The selected range changed after the proposal was prepared.");
  if (!diskSnapshotsEqual(diskSnapshot, diskNow)) throw new Error("The saved file changed after the proposal was prepared.");
}

module.exports = {
  ALLOWED_ATTRIBUTES,
  validateBackendUrl,
  validateCompleteHtmlElement,
  parseElement,
  validateReplacement,
  buildFixRequest,
  diskSnapshotsEqual,
  validateStaleProposalState,
};
