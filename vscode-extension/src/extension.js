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
  const configured = config.get("backendUrl") || config.get("apiBaseUrl") || "http://127.0.0.1:8000";
  try {
    return validateBackendUrl(configured);
  } catch (error) {
    throw new Error(error.message);
  }
}

function validateWorkspaceDocument(document) {
  if (document.uri.scheme !== "file" || document.isUntitled) {
    throw new Error("Open a saved file inside a VS Code workspace before preparing a fix.");
  }
  if (document.isDirty) {
    throw new Error("Save the selected document before preparing a fix. Unsaved changes may not be transmitted safely.");
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
    if (!body || typeof body !== "object") throw new Error("The Access Guardian API returned an invalid response.");
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
  if (selection.isEmpty) throw new Error("Select one complete HTML element in the editor first.");

  const document = editor.document;
  const selected = document.getText(selection);
  const trimmed = selected.trim();
  if (!trimmed) throw new Error("Select one complete HTML element in the editor first.");
  if (trimmed.length > 5000) throw new Error("Select a single HTML element no longer than 5000 characters.");

  try {
    validateCompleteHtmlElement(trimmed);
  } catch (error) {
    throw new Error(`The selection must contain exactly one complete HTML element. ${error.message}`);
  }

  const leading = selected.length - selected.trimStart().length;
  const trailing = selected.length - selected.trimEnd().length;
  const absoluteStart = document.offsetAt(selection.start) + leading;
  const absoluteEnd = document.offsetAt(selection.end) - trailing;
  const range = new vscode.Range(document.positionAt(absoluteStart), document.positionAt(absoluteEnd));
  return { range, original: document.getText(range) };
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
    throw new Error("The saved file changed after the proposal was prepared. No edit was applied; prepare a new proposal.");
  }

  if (document.isDirty) {
    pendingFix = null;
    throw new Error("Save the document and prepare a new proposal before applying this fix.");
  }

  if (document.version !== documentVersion || document.getText() !== baseDocumentText) {
    pendingFix = null;
    throw new Error("The file changed while the proposal was being checked. No edit was applied; prepare a new proposal.");
  }

  const applied = await editor.edit((builder) => builder.replace(range, replacement));
  if (!applied) throw new Error("VS Code could not apply the edit. The file was not changed.");

  pendingFix = null;
  vscode.window.showInformationMessage("Approved fix applied to the open editor buffer. Save the file when ready; use Undo to revert.");
}

async function rejectPendingFix() {
  if (!pendingFix) {
    vscode.window.showInformationMessage("There is no Access Guardian fix waiting for review.");
    return;
  }
  pendingFix = null;
  vscode.window.showInformationMessage("Proposed fix rejected. No file was changed.");
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
  if (!message.trim() || message.length > 1000) throw new Error("Enter a finding description between 1 and 1000 characters.");

  const api = providerUrl();
  let status;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Access Guardian: checking AI configuration" },
    async () => { status = await requestJson(new URL("/api/agent/status", api)); },
  );

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
  const requestBody = buildFixRequest(ruleId, message.trim(), original, status.provider, status.model);

  let apiResult;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Access Guardian: generating an accessibility fix" },
    async () => {
      apiResult = await requestJson(new URL("/api/agent/fix", api), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    },
  );

  if (!apiResult || typeof apiResult.replacement !== "string") {
    throw new Error("The backend returned an invalid AI fix response.");
  }
  const replacement = validateReplacement(original, apiResult.replacement);

  const proposedText =
    baseDocumentText.slice(0, editor.document.offsetAt(range.start)) +
    replacement +
    baseDocumentText.slice(editor.document.offsetAt(range.end));

  const preview = await vscode.workspace.openTextDocument({ language: editor.document.languageId, content: proposedText });
  await vscode.commands.executeCommand("vscode.diff", editor.document.uri, preview.uri,
    "Access Guardian: Review Proposed Fix", { preview: false });

  pendingFix = { editor, document: editor.document, range, original, replacement,
    documentVersion, baseDocumentText, diskSnapshot };

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
    try {
      await action();
    } catch (error) {
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

module.exports = {
  activate,
  deactivate,
  providerUrl,
  validateWorkspaceDocument,
  selectionRange,
  applyPendingFix,
  rejectPendingFix,
  prepareFix,
};
