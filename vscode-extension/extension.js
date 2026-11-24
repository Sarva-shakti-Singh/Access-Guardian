const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const {
  parseSelectedElement,
  validateReplacement,
  validateApiStatus,
  validateApiFixResponse,
  buildFixRequest,
  getBackendUrl,
  getApiEndpoint,
  validatePendingDocumentState,
  validateVerificationResponse,
} = require("./lib");

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
  const config = vscode.workspace.getConfiguration("accessGuardian");
  const backend = config.inspect("backendUrl");
  const legacy = config.inspect("apiBaseUrl");
  const backendValue = backend
    ? (backend.workspaceFolderValue ?? backend.workspaceValue ?? backend.globalValue)
    : undefined;
  const legacyValue = legacy
    ? (legacy.workspaceFolderValue ?? legacy.workspaceValue ?? legacy.globalValue)
    : undefined;
  const configured = getBackendUrl(
    backendValue,
    legacyValue,
  );
  return new URL(configured);
}

function validateWorkspaceDocument(document) {
  if (document.uri.scheme !== "file" || document.isUntitled) {
    throw new Error("Open a saved file inside a VS Code workspace before preparing a fix.");
  }
  if (document.isDirty) {
    throw new Error("Save the document before preparing a fix. Unsaved changes are not sent or edited.");
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
  parseSelectedElement(selected);
  return { range: new vscode.Range(selection.start, selection.end), original: selected };
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
  const { editor, document, range, original, replacement, documentVersion, baseDocumentText, diskSnapshot, ruleId } = proposal;
  try {
    validateWorkspaceDocument(document);
    validatePendingDocumentState({
      document,
      isOpen: vscode.workspace.textDocuments.includes(document),
      range,
      original,
      documentVersion,
      baseDocumentText,
    });
  } catch (error) {
    pendingFix = null;
    throw new Error(`${error instanceof Error ? error.message : String(error)} No edit was applied; prepare a new proposal.`);
  }
  let diskNow;
  try {
    diskNow = await vscode.workspace.fs.readFile(document.uri);
  } catch {
    pendingFix = null;
    throw new Error("The saved file could not be read or was deleted after the proposal was prepared. No edit was applied.");
  }
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
  const verify = await vscode.window.showInformationMessage(
    "Run local axe-core verification for the applied HTML element?",
    { modal: true, detail: "Verification checks only the applied element in an isolated local browser. It does not inspect or modify other workspace files." },
    "Verify Fix",
  );
  if (verify === "Verify Fix") {
    await verifyAppliedFix(replacement, ruleId);
  }
}

async function verifyAppliedFix(element, ruleId) {
  const api = providerUrl();
  const result = await requestJson(getApiEndpoint(api, "/api/agent/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule_id: ruleId, element }),
  });
  validateVerificationResponse(result);
  const labels = {
    resolved: "Resolved",
    partially_resolved: "Partially resolved",
    unresolved: "Unresolved",
    inconclusive: "Inconclusive",
  };
  vscode.window.showInformationMessage(
    `Access Guardian verification: ${labels[result.outcome]}. ${result.message} Violations: ${result.remaining_violations}; incomplete checks: ${result.remaining_incomplete}.`,
  );
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
  const status = await requestJson(getApiEndpoint(api, "/api/agent/status"));
  validateApiStatus(status);

  const consent = await vscode.window.showInformationMessage(
    `Send the selected HTML and finding description to ${status.provider} (${status.model})?`,
    { modal: true, detail: `${original}\n\nOnly this selected element and the finding details will be sent. The AI cannot read workspace files or run commands.` },
    "Send to AI",
  );
  if (consent !== "Send to AI") return;

  const diskSnapshot = await vscode.workspace.fs.readFile(editor.document.uri);
  const documentVersion = editor.document.version;
  const baseDocumentText = editor.document.getText();
  const apiResult = await requestJson(getApiEndpoint(api, "/api/agent/fix"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildFixRequest({
      ruleId,
      message: message.trim(),
      element: original,
      expectedProvider: status.provider,
      expectedModel: status.model,
    })),
  });
  validateApiFixResponse(apiResult);
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
    ruleId,
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
