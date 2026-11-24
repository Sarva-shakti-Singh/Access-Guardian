const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateBackendUrl,
  apiEndpoint,
  validateCompleteHtmlElement,
  validateReplacement,
  buildFixRequest,
  validateStaleProposalState,
} = require("../src/validation");

test("manifest declares source entry point and all user commands", () => {
  const manifest = require("../package.json");
  assert.equal(manifest.main, "./src/extension.js");
  const commands = manifest.contributes.commands.map((item) => item.command);
  assert.deepEqual(commands, ["accessGuardian.prepareFix", "accessGuardian.applyReviewedFix", "accessGuardian.rejectReviewedFix"]);
  assert.ok(commands.every((command) => manifest.activationEvents.includes(`onCommand:${command}`)));
});

test("backend URL policy permits local HTTP and remote HTTPS only", () => {
  assert.equal(validateBackendUrl("http://127.0.0.1:8000").host, "127.0.0.1:8000");
  assert.equal(validateBackendUrl("https://example.com/api/").pathname, "/api");
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com?token=x", "file:///tmp/api"]) assert.throws(() => validateBackendUrl(url));
});

test("API endpoint preserves configured base path without duplicating paths", () => {
  const base = validateBackendUrl("https://api.example/service/");
  assert.equal(apiEndpoint(base, "/api/agent/status").href, "https://api.example/service/api/agent/status");
});

test("complete-element validation blocks invalid or ambiguous markup", () => {
  assert.doesNotThrow(() => validateCompleteHtmlElement('<button class="ok"><span>Save</span></button>'));
  assert.doesNotThrow(() => validateCompleteHtmlElement('<img alt="Logo" src="logo.png">'));
  for (const html of ["", "<button>Save", "<button>Save</button><span>x</span>", "<!-- comment --><button>x</button>", "<section/>", "<button / garbage></button>", "<button x=\"1\" x=\"2\"></button>"]) assert.throws(() => validateCompleteHtmlElement(html));
});

test("replacement validator only permits accessible-name change", () => {
  const original = '<button class="ok"><span>Save</span></button>';
  assert.doesNotThrow(() => validateReplacement(original, '<button class="ok" aria-label="Save item"><span>Save</span></button>'));
  for (const proposal of [
    '<button class="changed" aria-label="Save item"><span>Save</span></button>',
    '<a class="ok" aria-label="Save item"><span>Save</span></a>',
    '<button class="ok" aria-label="Save item"><b>Save</b></button>',
    '<button class="ok" aria-label=""><span>Save</span></button>',
  ]) assert.throws(() => validateReplacement(original, proposal));
});

test("fix request matches backend consent schema", () => {
  assert.deepEqual(buildFixRequest("button-name", "Button has no name", "<button></button>", "https://ai.example/v1", "model"), {
    consent_to_send_context: true, rule_id: "button-name", message: "Button has no name", element: "<button></button>", context: "", expected_provider: "https://ai.example/v1", expected_model: "model",
  });
});

test("stale document and disk snapshots are refused", () => {
  const bytes = Uint8Array.from([1, 2, 3]);
  const check = (overrides = {}) => validateStaleProposalState({
    isDirty: false, documentVersion: 4, expectedVersion: 4, currentText: "doc", expectedText: "doc",
    currentRangeText: "<button>x</button>", expectedRangeText: "<button>x</button>", diskSnapshot: bytes, diskNow: Uint8Array.from(bytes), ...overrides,
  });
  assert.doesNotThrow(() => check());
  assert.throws(() => check({ documentVersion: 5 }), /version/);
  assert.throws(() => check({ isDirty: true }), /unsaved/);
  assert.throws(() => check({ diskNow: Uint8Array.from([1, 2, 4]) }), /saved file/);
});
