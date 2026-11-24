const fs = require("node:fs");
const path = require("node:path");

const MAX_ELEMENT_LENGTH = 5000;
const ALLOWED_NAME_ATTRIBUTES = new Set(["alt", "aria-label", "title"]);

function parseSelectedElement(element) {
  if (typeof element !== "string" || !element.trim() || element.length > MAX_ELEMENT_LENGTH) {
    throw new Error("The selected HTML element is empty or too long.");
  }
  const text = element.trim();
  if (!text.startsWith("<")) throw new Error("The selection must start with an HTML element.");
  if (/^<(script|style|iframe|object|embed)\b/i.test(text)) {
    throw new Error("Executable or embedded HTML elements cannot be remediated.");
  }

  let end = -1;
  let quote = "";
  for (let index = 1; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      end = index;
      break;
    }
  }
  if (end < 0 || quote) throw new Error("The selected HTML start tag is incomplete.");

  const startTag = text.slice(1, end);
  const nameMatch = /^([a-zA-Z][a-zA-Z0-9:-]*)/.exec(startTag);
  if (!nameMatch) throw new Error("The selection must start with an HTML element.");
  const tag = nameMatch[1].toLowerCase();
  if (!/^(?:\s|\/|$)/.test(startTag.slice(nameMatch[0].length))) {
    throw new Error("The HTML element has a malformed tag name.");
  }

  const attributes = new Map();
  let index = nameMatch[0].length;
  while (index < startTag.length) {
    while (/\s/.test(startTag[index] ?? "")) index += 1;
    if (index >= startTag.length) break;
    if (startTag[index] === "/") {
      if (!/^\/\s*$/.test(startTag.slice(index))) throw new Error("The HTML element has malformed closing syntax.");
      break;
    }
    const attributeMatch = /^[^\s=/>]+/.exec(startTag.slice(index));
    if (!attributeMatch) throw new Error("The HTML element contains a malformed attribute.");
    const name = attributeMatch[0].toLowerCase();
    if (attributes.has(name)) throw new Error("The HTML element contains a duplicate attribute.");
    index += attributeMatch[0].length;
    while (/\s/.test(startTag[index] ?? "")) index += 1;
    let value = null;
    if (startTag[index] === "=") {
      index += 1;
      while (/\s/.test(startTag[index] ?? "")) index += 1;
      const delimiter = startTag[index];
      if (delimiter === '"' || delimiter === "'") {
        index += 1;
        const valueEnd = startTag.indexOf(delimiter, index);
        if (valueEnd < 0) throw new Error("The HTML element contains an unterminated attribute value.");
        value = startTag.slice(index, valueEnd);
        index = valueEnd + 1;
      } else {
        const valueMatch = /^[^\s>]+/.exec(startTag.slice(index));
        if (!valueMatch) throw new Error("The HTML element contains an empty unquoted attribute value.");
        value = valueMatch[0];
        if (value.endsWith("/") && index + value.length === startTag.length) {
          value = value.slice(0, -1);
        }
        index += valueMatch[0].length;
      }
    }
    attributes.set(name, value);
  }

  const tail = text.slice(end + 1);
  const selfClosing = /\/\s*$/.test(startTag);
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  if (selfClosing && !voidTags.has(tag)) {
    throw new Error("Select a complete HTML element with matching opening and closing tags.");
  }
  if (!selfClosing && !voidTags.has(tag)) {
    const closingMatch = tail.match(new RegExp(`^([\\s\\S]*)</${tag.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*>$`, "i"));
    if (!closingMatch) throw new Error("Select the complete HTML element, including its matching closing tag.");
  } else if (tail.trim()) {
    throw new Error("The selection must contain only this HTML element.");
  }
  return { tag, attributes, tail };
}

function validateReplacement(original, replacement) {
  if (typeof replacement !== "string" || !replacement.trim() || replacement.length > MAX_ELEMENT_LENGTH) {
    throw new Error("The AI returned an empty or oversized replacement.");
  }
  const before = parseSelectedElement(original);
  const after = parseSelectedElement(replacement);
  if (before.tag !== after.tag || before.tail !== after.tail) {
    throw new Error("The proposal changed the element tag or its children.");
  }
  const frozen = (attributes) =>
    [...attributes.entries()].filter(([name]) => !ALLOWED_NAME_ATTRIBUTES.has(name)).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(frozen(before.attributes)) !== JSON.stringify(frozen(after.attributes))) {
    throw new Error("The proposal changed attributes outside alt, aria-label, or title.");
  }
  let changed = false;
  for (const name of ALLOWED_NAME_ATTRIBUTES) {
    const previous = before.attributes.get(name);
    const value = after.attributes.get(name);
    if (previous !== value) {
      if (typeof value !== "string" || !value.trim() || value.length > 150 || /[<>]/.test(value)) {
        throw new Error("The proposal contains an invalid accessible-name attribute.");
      }
      changed = true;
    }
  }
  if (!changed) throw new Error("The proposal did not change an accessible-name attribute.");
  return replacement;
}

function validateApiStatus(status) {
  if (!status || typeof status !== "object" ||
      status.configured !== true ||
      typeof status.provider !== "string" || !status.provider ||
      typeof status.model !== "string" || !status.model) {
    const detail = typeof status?.configuration_error === "string" && status.configuration_error
      ? ` ${status.configuration_error}.`
      : "";
    throw new Error(`No usable AI provider is configured.${detail} Set ACCESS_GUARDIAN_AI_BASE_URL and ACCESS_GUARDIAN_AI_MODEL in the backend .env and restart the API.`);
  }
  if (status.provider.length > 500 || status.model.length > 200) {
    throw new Error("The backend returned invalid AI configuration metadata.");
  }
  return status;
}

function validateApiFixResponse(response) {
  if (!response || typeof response !== "object" ||
      typeof response.replacement !== "string" ||
      !response.replacement.trim() ||
      response.replacement.length > MAX_ELEMENT_LENGTH ||
      Object.keys(response).some((key) => key !== "replacement")) {
    throw new Error("The backend returned an invalid AI fix response.");
  }
  return response;
}

function validateVerificationResponse(response) {
  if (!response || typeof response !== "object") {
    throw new Error("The backend returned an invalid verification response.");
  }
  if (!["resolved", "partially_resolved", "unresolved", "inconclusive"].includes(response.outcome) ||
      !["complete", "inconclusive"].includes(response.status) ||
      typeof response.rule_id !== "string" ||
      typeof response.message !== "string" ||
      !Number.isInteger(response.remaining_violations) ||
      response.remaining_violations < 0 ||
      !Number.isInteger(response.remaining_incomplete) ||
      response.remaining_incomplete < 0 ||
      response.human_review_required !== true) {
    throw new Error("The backend returned an invalid verification response.");
  }
  return response;
}

function buildFixRequest({ ruleId, message, element, context = "", expectedProvider, expectedModel }) {
  if (typeof ruleId !== "string" || !ruleId.trim() || ruleId.length > 80) throw new Error("Invalid accessibility rule ID.");
  if (typeof message !== "string" || !message.trim() || message.length > 1000) throw new Error("Invalid finding description.");
  if (typeof element !== "string" || !element.trim() || element.length > 5000) throw new Error("Invalid selected HTML.");
  if (typeof context !== "string" || context.length > 2000) throw new Error("Invalid request context.");
  if (typeof expectedProvider !== "string" || !expectedProvider || expectedProvider.length > 500) throw new Error("Invalid provider metadata.");
  if (typeof expectedModel !== "string" || !expectedModel || expectedModel.length > 200) throw new Error("Invalid model metadata.");
  return {
    consent_to_send_context: true,
    rule_id: ruleId,
    message: message.trim(),
    element,
    context,
    expected_provider: expectedProvider,
    expected_model: expectedModel,
  };
}

function getBackendUrl(primary, legacy) {
  const configured = typeof primary === "string" && primary.trim()
    ? primary
    : (typeof legacy === "string" && legacy.trim() ? legacy : "http://127.0.0.1:8000");
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Access Guardian API URL is invalid. Check the accessGuardian.backendUrl setting.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("Use HTTPS for remote APIs. HTTP is allowed only for localhost; credentials, query strings, and fragments are not allowed in the API URL.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function getApiEndpoint(baseUrl, apiPath) {
  const base = typeof baseUrl === "string" ? baseUrl : baseUrl.toString();
  const normalized = base.replace(/\/+$/, "");
  return new URL(`${normalized}${apiPath}`);
}

function validateWorkspaceSnapshot(document, proposal, fsRealpath = fs.realpathSync.native, fsRelative = path.relative) {
  if (!document || document.isDirty) throw new Error("The document is unsaved.");
  if (!proposal || !proposal.documentVersion || document.version !== proposal.documentVersion) {
    throw new Error("The document changed after the proposal was prepared.");
  }
  return true;
}

function validatePendingDocumentState({
  document,
  isOpen,
  range,
  original,
  documentVersion,
  baseDocumentText,
}) {
  if (!document || !isOpen) {
    throw new Error("The original document was closed after the proposal was prepared.");
  }
  if (document.isDirty) {
    throw new Error("The file became unsaved after the proposal was prepared.");
  }
  if (document.version !== documentVersion) {
    throw new Error("The document version changed after the proposal was prepared.");
  }
  if (document.getText() !== baseDocumentText) {
    throw new Error("The document content changed after the proposal was prepared.");
  }
  if (!range || document.getText(range) !== original) {
    throw new Error("The selected HTML range changed after the proposal was prepared.");
  }
  return true;
}

module.exports = {
  MAX_ELEMENT_LENGTH,
  parseSelectedElement,
  validateReplacement,
  validateApiStatus,
  validateApiFixResponse,
  validateVerificationResponse,
  buildFixRequest,
  getBackendUrl,
  getApiEndpoint,
  validateWorkspaceSnapshot,
  validatePendingDocumentState,
};
