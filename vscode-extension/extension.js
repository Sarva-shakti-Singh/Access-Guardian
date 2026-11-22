const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");

const RULES = [
  { id: "image-alt", label: "Image missing alternative text" },
  { id: "input-image-alt", label: "Image input missing accessible name" },
  { id: "role-img-alt", label: "Image role missing accessible name" },
  { id: "svg-img-alt", label: "SVG image missing accessible name" },
  { id: "button-name", label: "Button missing accessible name" },
  { id: "input-button-name", label: "Input button missing accessible name" },
  { id: "link-name", label: "Link missing accessible name" },
  { id: "label", label: "Form control missing label" },
  { id: "select-name", label: "Select control missing accessible name" },
  { id: "aria-input-field-name", label: "ARIA input missing accessible name" },
];

const MAX_ELEMENT_LENGTH = 5000;
let pendingFix = null;

function providerUrl() {
  const configured = vscode.workspace.getConfiguration("accessGuardian").get("apiBaseUrl");
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Access Guardian API URL is invalid. Check the accessGuardian.apiBaseUrl setting.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("Use HTTPS for remote APIs. HTTP is allowed only for localhost; credentials, query strings, and fragments are not allowed in the API URL.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function validateWorkspaceDocument(document) {
  if (document.uri.scheme !== "file" || document.isUntitled) {
    throw new Error("Open a saved file inside a VS Code workspace before preparing a fix.");
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) {
    throw new Error("The selected file is outside the current VS Code workspace.");
  }
  let workspacePath;
  let selectedPath;
  try {
    workspacePath = fs.realpathSync.native(folder.uri.fsPath);
    selectedPath = fs.realpathSync.native(document.uri.fsPath);
  } catch {
    throw new Error("The workspace or selected file could not be resolved on disk.");
  }
  const relative = path.relative(workspacePath, selectedPath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The selected file is outside the current VS Code workspace.");
  }
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, { ...options, redirect: "error", signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : `${response.status} ${response.statusText}`;
      throw new Error(detail);
    }
    return body;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("The AI request timed out. Check the provider and try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the Access Guardian API. Start the backend and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function selectionRange(editor) {
  const selection = editor.selection;
  if (selection.isEmpty) {
    throw new Error("Select one complete HTML element in the editor first.");
  }
  const selected = editor.document.getText(selection);
  if (selected.length > MAX_ELEMENT_LENGTH) {
    throw new Error(`Select a single HTML element no longer than ${MAX_ELEMENT_LENGTH} characters.`);
  }
  if (!/^\s*<[a-zA-Z][^>]*>[\s\S]*$/m.test(selected)) {
    throw new Error("The selection must start with an HTML element. Select the complete element, including its closing tag when present.");
  }
  return { range: new vscode.Range(selection.start, selection.end), original: selected };
}

function parseSelectedElement(element) {
  const text = element.trim();
  if (!text.startsWith("<")) throw new Error("The proposal is not an HTML element.");
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
        index += valueMatch[0].length;
      }
    }
    attributes.set(name, value);
  }
  return { tag, attributes, tail: text.slice(end + 1) };
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
  const allowed = new Set(["alt", "aria-label", "title"]);
  const frozen = (attributes) =>
    [...attributes.entries()].filter(([name]) => !allowed.has(name)).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(frozen(before.attributes)) !== JSON.stringify(frozen(after.attributes))) {
    throw new Error("The proposal changed attributes outside alt, aria-label, or title.");
  }
  let changed = false;
  for (const name of allowed) {
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

async function selectRule() {
  const choice = await vscode.window.showQuickPick(
    RULES.map((rule) => ({ label: rule.label, description: rule.id, ruleId: rule.id })),
    { title: "Choose the detected accessibility rule", placeHolder: "Choose the finding that matches this selected HTML" },
  );
  return choice && choice.ruleId;
}

async function applyPendingFix() {
  if (!pendingFix) {
    vscode.window.showInformationMessage("There is no Access Guardian fix waiting for review.");
    return;
  }
  const proposal = pendingFix;
  const { editor, document, range, original, replacement, documentVersion, baseDocumentText, diskSnapshot } = proposal;
  validateWorkspaceDocument(document);
  if (!vscode.workspace.textDocuments.includes(document) ||
      document.version !== documentVersion ||
      document.getText() !== baseDocumentText ||
      document.getText(range) !== original) {
    pendingFix = null;
    throw new Error("The file changed after the proposal was prepared. No edit was applied; prepare a new proposal.");
  }
  const diskNow = await vscode.workspace.fs.readFile(document.uri);
  if (!Buffer.from(diskSnapshot).equals(Buffer.from(diskNow))) {
    pendingFix = null;
    throw new Error("The saved file changed after the proposal was prepared. No edit was applied; review the new file and prepare another proposal.");
  }
  if (document.version !== documentVersion || document.getText() !== baseDocumentText) {
    pendingFix = null;
    throw new Error("The file changed while the proposal was being checked. No edit was applied; prepare a new proposal.");
  }

  const applied = await editor.edit((builder) => builder.replace(range, replacement));
  if (!applied) {
    throw new Error("VS Code could not apply the edit. The file was not changed.");
  }
  pendingFix = null;
  vscode.window.showInformationMessage("Approved fix applied to the open editor buffer. Save the file when ready; use Undo to revert.");
}

async function prepareFix() {
  if (pendingFix) {
    const action = await vscode.window.showQuickPick(
      [
        { label: "Apply the waiting fix", value: "apply" },
        { label: "Reject the waiting fix", value: "reject" },
        { label: "Cancel", value: "cancel" },
      ],
      { title: "A reviewed Access Guardian fix is still waiting" },
    );
    if (!action || action.value === "cancel") return;
    if (action.value === "apply") {
      await applyPendingFix();
      return;
    }
    await rejectPendingFix();
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("Open a source file and select an HTML element first.");
  }
  validateWorkspaceDocument(editor.document);
  const { range, original } = selectionRange(editor);
  const ruleId = await selectRule();
  if (!ruleId) return;

  const message = await vscode.window.showInputBox({
    title: "Describe the accessibility finding",
    prompt: "Use the finding message from Access Guardian. Do not include unrelated source or secrets.",
    value: RULES.find((rule) => rule.id === ruleId)?.label ?? "",
    ignoreFocusOut: true,
  });
  if (message === undefined) return;
  if (!message.trim() || message.length > 1000) {
    throw new Error("Enter a finding description between 1 and 1000 characters.");
  }

  const api = providerUrl();
  const status = await requestJson(new URL(`${api.href.replace(/\/$/, "")}/api/agent/status`));
  if (!status.configured || !status.provider || !status.model) {
    throw new Error("No AI provider is configured. Configure the provider in the backend .env and restart the API.");
  }

  const consent = await vscode.window.showInformationMessage(
    `Send the selected HTML and finding description to ${status.provider} (${status.model})?`,
    { modal: true, detail: `${original}\n\nOnly this selected element and the finding details will be sent. The AI cannot read workspace files or run commands.` },
    "Send to AI",
  );
  if (consent !== "Send to AI") return;

  const diskSnapshot = await vscode.workspace.fs.readFile(editor.document.uri);
  const documentVersion = editor.document.version;
  const baseDocumentText = editor.document.getText();
  const apiResult = await requestJson(new URL(`${api.href.replace(/\/$/, "")}/api/agent/fix`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consent_to_send_context: true,
      rule_id: ruleId,
      message: message.trim(),
      element: original,
      context: "",
      expected_provider: status.provider,
      expected_model: status.model,
    }),
  });

  const replacement = validateReplacement(original, apiResult.replacement);

  const proposedText =
    baseDocumentText.slice(0, editor.document.offsetAt(range.start)) +
    replacement +
    baseDocumentText.slice(editor.document.offsetAt(range.end));
  const preview = await vscode.workspace.openTextDocument({
    language: editor.document.languageId,
    content: proposedText,
  });
  await vscode.commands.executeCommand(
    "vscode.diff",
    editor.document.uri,
    preview.uri,
    "Access Guardian: Review Proposed Fix",
    { preview: false },
  );

  pendingFix = {
    editor,
    document: editor.document,
    range,
    original,
    replacement,
    documentVersion,
    baseDocumentText,
    diskSnapshot,
  };
  const approval = await vscode.window.showInformationMessage(
    "Review the complete diff before deciding whether to apply this fix.",
    "Apply Fix",
    "Reject Fix",
    "Review Changes",
  );
  if (approval === "Apply Fix") {
    await applyPendingFix();
  } else if (approval === "Reject Fix") {
    pendingFix = null;
    vscode.window.showInformationMessage("Proposed fix rejected. No file was changed.");
  } else if (approval === "Review Changes") {
    vscode.window.showInformationMessage("The proposal is waiting. After reviewing the diff, run Access Guardian: Apply Reviewed Fix or Access Guardian: Reject Reviewed Fix.");
  }
}

async function rejectPendingFix() {
  if (!pendingFix) {
    vscode.window.showInformationMessage("There is no Access Guardian fix waiting for review.");
    return;
  }
  pendingFix = null;
  vscode.window.showInformationMessage("Proposed fix rejected. No file was changed.");
}

function activate(context) {
  const register = (name, action) => vscode.commands.registerCommand(name, async () => {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Access Guardian: ${message}`);
    }
  });
  context.subscriptions.push(
    register("accessGuardian.prepareFix", prepareFix),
    register("accessGuardian.applyReviewedFix", applyPendingFix),
    register("accessGuardian.rejectReviewedFix", rejectPendingFix),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
