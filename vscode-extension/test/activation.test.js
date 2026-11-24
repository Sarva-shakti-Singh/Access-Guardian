const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("activation registers every contributed command", () => {
  const registrations = [];
  const mockVscode = {
    commands: {
      registerCommand(name, action) {
        registrations.push({ name, action });
        return { dispose() {} };
      },
      executeCommand() {},
    },
    window: {
      activeTextEditor: undefined,
      showInformationMessage() {},
      showErrorMessage() {},
      showQuickPick() {},
      showInputBox() {},
    },
    workspace: {
      getConfiguration() {
        return { get() { return undefined; } };
      },
      getWorkspaceFolder() { return undefined; },
      fs: { readFile() {} },
    },
  };

  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === "vscode") return mockVscode;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const extension = require("../extension");
    const context = { subscriptions: [] };
    extension.activate(context);
  } finally {
    Module._load = originalLoad;
  }

  assert.deepEqual(
    registrations.map((item) => item.name).sort(),
    [
      "accessGuardian.applyReviewedFix",
      "accessGuardian.prepareFix",
      "accessGuardian.rejectReviewedFix",
    ],
  );
  assert.equal(typeof registrations.find((item) => item.name === "accessGuardian.prepareFix").action, "function");
});
