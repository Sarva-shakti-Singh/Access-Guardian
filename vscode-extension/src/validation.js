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
  const local = hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) || url.username || url.password || url.search || url.hash) {
    throw new Error("Use HTTPS for remote APIs. HTTP is allowed only for localhost; credentials, query strings, and fragments are not allowed.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function apiEndpoint(base, endpoint) {
  const url = new URL(base.href);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
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

function validateStartTag(raw) {
  const startTag = raw.slice(1, -1);
  const match = /^([a-zA-Z][a-zA-Z0-9:-]*)/.exec(startTag);
  if (!match) throw new Error("contains malformed tag name");
  let i = match[0].length;
  const names = new Set();
  while (i < startTag.length) {
    while (/\s/.test(startTag[i] || "")) i += 1;
    if (i >= startTag.length) break;
    if (startTag[i] === "/") {
      if (!/^\/\s*$/.test(startTag.slice(i))) throw new Error("contains malformed self-closing syntax");
      break;
    }
    const attr = /^[^\s=/>]+/.exec(startTag.slice(i));
    if (!attr) throw new Error("contains malformed attribute");
    const name = attr[0].toLowerCase();
    if (names.has(name)) throw new Error("contains a duplicate attribute");
    names.add(name);
    i += attr[0].length;
    while (/\s/.test(startTag[i] || "")) i += 1;
    if (startTag[i] === "=") {
      i += 1;
      while (/\s/.test(startTag[i] || "")) i += 1;
      const quote = startTag[i];
      if (quote === "'" || quote === '"') {
        i += 1;
        const end = startTag.indexOf(quote, i);
        if (end < 0) throw new Error("contains an unterminated attribute value");
        i = end + 1;
      } else {
        const value = /^[^\s>]+/.exec(startTag.slice(i));
        if (!value) throw new Error("contains an empty attribute value");
        i += value[0].length;
      }
    }
  }
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
    if (/^<!|^<\?/i.test(raw)) throw new Error("contains unsupported declarations");
    const closing = /^<\/\s*([a-zA-Z][a-zA-Z0-9:-]*)\s*>$/.exec(raw);
    if (closing) tags.push({ closing: true, tag: closing[1].toLowerCase(), raw });
    else {
      if (!/^<[a-zA-Z]/.test(raw)) throw new Error("contains malformed markup");
      validateStartTag(raw);
      const name = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(raw)[1].toLowerCase();
      const selfClosing = /\/\s*>$/.test(raw);
      if (selfClosing && !VOID_ELEMENTS.has(name)) throw new Error("self-closing non-void elements are not supported");
      tags.push({ closing: false, tag: name, raw, selfClosing });
    }
    i = end + 1;
  }
  return tags;
}

function validateCompleteHtmlElement(element) {
  if (typeof element !== "string" || !element.trim()) throw new Error("Selection is empty");
  const text = element.trim();
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
      if (!stack.length || stack[stack.length - 1] !== item.tag) throw new Error("Selection contains mismatched or unmatched closing tags");
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
  const startTag = text.slice(1, end);
  const tagMatch = /^([a-zA-Z][a-zA-Z0-9:-]*)/.exec(startTag);
  const tag = tagMatch[1].toLowerCase();
  const attributes = new Map();
  let i = tagMatch[0].length;
  while (i < startTag.length) {
    while (/\s/.test(startTag[i] || "")) i += 1;
    if (i >= startTag.length || startTag[i] === "/") break;
    const attr = /^[^\s=/>]+/.exec(startTag.slice(i));
    const name = attr[0].toLowerCase();
    if (attributes.has(name)) throw new Error("Duplicate HTML attribute");
    i += attr[0].length;
    while (/\s/.test(startTag[i] || "")) i += 1;
    let value = null;
    if (startTag[i] === "=") {
      i += 1;
      while (/\s/.test(startTag[i] || "")) i += 1;
      const quote = startTag[i];
      if (quote === "'" || quote === '"') {
        i += 1;
        const valueEnd = startTag.indexOf(quote, i);
        if (valueEnd < 0) throw new Error("Unterminated attribute value");
        value = startTag.slice(i, valueEnd);
        i = valueEnd + 1;
      } else {
        const valueMatch = /^[^\s>]+/.exec(startTag.slice(i));
        value = valueMatch[0];
        i += value.length;
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

module.exports = { ALLOWED_ATTRIBUTES, validateBackendUrl, apiEndpoint, validateCompleteHtmlElement, parseElement, validateReplacement, buildFixRequest, diskSnapshotsEqual, validateStaleProposalState };
