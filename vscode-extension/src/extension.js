const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateReplacement,
  validateCompleteHtmlElement,
  validateBackendUrl,
  buildFixRequest,
} = require("./validation");

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
let pendingFix = null;

function providerUrl() {
  const config = vscode.workspace.getConfiguration("accessGuardian");
  const configured = config.get("backendUrl");
  const legacy = config.get("apiBaseUrl");
  const value = (!configured || (configured === "http://127.0.0.1:8000" && legacy))
    ? (legacy || "http://127.0.0.1:8000") : configured;
  return validateBackendUrl(value);
}

function endpointUrl(base, endpoint) {
  const url = new URL(base.href);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
  return url;
}

function validateWorkspaceDocument(document) {
  if (document.uri.scheme !== "file" || document.isUntitled) {
    throw new Error("Open a saved file inside a VS Code workspace before preparing a fix.");
  }
  if (document.isDirty) {
    throw new Error("Save the selected document before preparing a fix. Unsaved changes may not be transmitted safely.");
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!folder) throw new Error("The selected file is outside the current VS Code workspace.");

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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("The Access Guardian API returned an invalid response.");
    }
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The AI request timed out. Check the provider and try again.");
    if (error instanceof TypeError) throw new Error("Could not reach the Access Guardian API. Start the backend and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function selectionRange(editor) {
  const selection = editor.selection;
  if (selection.isEmpty) throw new Error("Select one complete HTML element in the editor first.");
  const document = editor.document;
  const selected = document.getText(selection);
  const trimmed = selected.trim();
  if (!trimmed) throw new Error("Select one complete HTML element in the editor first.");
  if (trimmed.length > 5000) throw new Error("Select a single HTML element no longer than 5000 characters.");
  try { validateCompleteHtmlElement(trimmed); }
  catch (error) { throw new Error(`The selection must contain exactly one complete HTML element. ${error.message}`); }

  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const start = document.offsetAt(selection.start) + leading;
  const end = document.offsetAt(selection.end) - trailing;
  const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
  return { range, original: document.getText(range) };
}

async function assertSnapshotUnchanged(document, range, original, version, text, diskSnapshot) {
  if (document.isDirty || document.version !== version || document.getText() !== text || document.getText(range) !== original) {
    throw new Error("The file changed after the proposal was prepared. No edit was applied; prepare a new proposal.");
  }
  const now = await vscode.workspace.fs.readFile(document.uri);
  if (!Buffer.from(diskSnapshot).equals(Buffer.from(now))) {
    throw new Error("The saved file changed after the proposal was prepared. No edit was applied; prepare a new proposal.");
  }
  if (document.isDirty || document.version !== version || document.getText() !== text || document.getText(range) !== original) {
    throw new Error("The file changed while the proposal was being checked. No edit was applied; prepare a new proposal.");
  }
}

async function applyPendingFix() {
  if (!pendingFix) {
    vscode.window.showInformationMessage("There is no Access Guardian fix waiting for review.");
    return;
  }
  const proposal = pendingFix;
  const { editor, document, range, original, replacement, documentVersion, baseDocumentText, diskSnapshot } = proposal;
  try {
    validateWorkspaceDocument(document);
    if (!vscode.workspace.textDocuments.includes(document)) throw new Error("The source document is no longer open. No edit was applied.");
    await assertSnapshotUnchanged(document, range, original, documentVersion, baseDocumentText, diskSnapshot);
    const applied = await editor.edit((builder) => builder.replace(range, replacement));
    if (!applied) throw new Error("VS Code could not apply the edit. The file was not changed.");
    pendingFix = null;
    vscode.window.showInformationMessage("Approved fix applied to the open editor buffer. Save the file when ready; use Undo to revert.");
  } catch (error) {
    pendingFix = null;
    throw error;
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

async function selectRule() {
  const choice = await vscode.window.showQuickPick(
    RULES.map((rule) => ({ label: rule.label, description: rule.id, ruleId: rule.id })),
    { title: "Choose the detected accessibility rule", placeHolder: "Choose the finding that matches this selected HTML" },
  );
  return choice?.ruleId;
}

async function prepareFix() {
  if (pendingFix) {
    const action = await vscode.window.showQuickPick([
      { label: "Apply the waiting fix", value: "apply" },
      { label: "Reject the waiting fix", value: "reject" },
      { label: "Cancel", value: "cancel" },
    ], { title: "A reviewed Access Guardian fix is still waiting" });
    if (!action || action.value === "cancel") return;
    if (action.value === "apply") return applyPendingFix();
    return rejectPendingFix();
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) throw new Error("Open a source file and select an HTML element first.");
  const document = editor.document;
  validateWorkspaceDocument(document);
  const { range, original } = selectionRange(editor);
  const selectedVersion = document.version;
  const selectedText = document.getText();
  const selectedDisk = await vscode.workspace.fs.readFile(document.uri);

  const ruleId = await selectRule();
  if (!ruleId) return;
  const message = await vscode.window.showInputBox({
    title: "Describe the accessibility finding",
    prompt: "Use the finding message from Access Guardian. Do not include unrelated source or secrets.",
    value: RULES.find((rule) => rule.id === ruleId)?.label ?? "",
    ignoreFocusOut: true,
  });
  if (message === undefined) return;
  if (!message.trim() || message.length > 1000) throw new Error("Enter a finding description between 1 and 1000 characters.");

  const api = providerUrl();
  let status;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Access Guardian: checking AI configuration" },
    async () => { status = await requestJson(endpointUrl(api, "/api/agent/status")); },
  );
  if (typeof status.configured !== "boolean" || (status.configured && (!status.provider || !status.model))) {
    throw new Error("The Access Guardian backend returned an invalid AI status response.");
  }
  if (!status.configured) throw new Error("No AI provider is configured. Configure the provider in the backend .env and restart the API.");

  const consent = await vscode.window.showInformationMessage(
    `Send the selected HTML and finding description to ${status.provider} (${status.model})?`,
    { modal: true, detail: `${original}\n\nOnly this selected element and the finding details will be sent. The AI cannot read workspace files or run commands.` },
    "Send to AI",
  );
  if (consent !== "Send to AI") return;

  validateWorkspaceDocument(document);
  await assertSnapshotUnchanged(document, range, original, selectedVersion, selectedText, selectedDisk);
  const requestBody = buildFixRequest(ruleId, message.trim(), original, status.provider, status.model);
  let apiResult;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Access Guardian: generating an accessibility fix" },
    async () => {
      apiResult = await requestJson(endpointUrl(api, "/api/agent/fix"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    },
  );
  if (typeof apiResult.replacement !== "string") throw new Error("The backend returned an invalid AI fix response.");
  const replacement = validateReplacement(original, apiResult.replacement);
  await assertSnapshotUnchanged(document, range, original, selectedVersion, selectedText, selectedDisk);

  const start = document.offsetAt(range.start);
  const end = document.offsetAt(range.end);
  const proposedText = selectedText.slice(0, start) + replacement + selectedText.slice(end);
  const preview = await vscode.workspace.openTextDocument({ language: document.languageId, content: proposedText });
  await vscode.commands.executeCommand("vscode.diff", document.uri, preview.uri,
    "Access Guardian: Review Proposed Fix", { preview: false });

  pendingFix = { editor, document, range, original, replacement,
    documentVersion: selectedVersion, baseDocumentText: selectedText, diskSnapshot: selectedDisk };
  const approval = await vscode.window.showInformationMessage(
    "Review the complete diff before deciding whether to apply this fix.",
    "Apply Fix", "Reject Fix", "Review Changes",
  );
  if (approval === "Apply Fix") await applyPendingFix();
  else if (approval === "Reject Fix") await rejectPendingFix();
  else if (approval === "Review Changes") {
    vscode.window.showInformationMessage("The proposal is waiting. After reviewing the diff, run Access Guardian: Apply Reviewed Fix or Access Guardian: Reject Reviewed Fix.");
  }
}

function activate(context) {
  const register = (name, action) => vscode.commands.registerCommand(name, async () => {
    try { await action(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`Access Guardian: ${message}`);
    }
  });
  context.subscriptions.push(
    register("accessGuardian.prepareFix", prepareFix),
    register("accessGuardian.applyReviewedFix", applyPendingFix),
    register("accessGuardian.rejectReviewedFix", rejectPendingFix),
  );
}

function deactivate() {}
module.exports = { activate, deactivate, providerUrl, validateWorkspaceDocument, selectionRange, applyPendingFix, rejectPendingFix, prepareFix };
