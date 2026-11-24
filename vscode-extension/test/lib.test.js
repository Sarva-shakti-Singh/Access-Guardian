const test = require("node:test");
const assert = require("node:assert/strict");
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
} = require("../lib");

test("accepts complete HTML elements and rejects partial selections", () => {
  assert.equal(parseSelectedElement('<button type="button">Save</button>').tag, "button");
  assert.equal(parseSelectedElement('<img src="x.png" alt="old">').tag, "img");
  assert.throws(() => parseSelectedElement("<button>Save"), /closing tag/);
  assert.throws(() => parseSelectedElement(""), /empty/);
  assert.equal(parseSelectedElement("  <button>Save</button>\n").tag, "button");
  assert.throws(() => parseSelectedElement("<script>alert(1)</script>"), /Executable|embedded/);
});

test("validates workspace-safe replacement restrictions", () => {
  const original = '<button type="button" aria-label="Old">Save</button>';
  assert.equal(validateReplacement(original, '<button type="button" aria-label="Save changes">Save</button>'), '<button type="button" aria-label="Save changes">Save</button>');
  assert.throws(() => validateReplacement(original, '<a aria-label="Save changes">Save</a>'), /tag or its children/);
  assert.throws(() => validateReplacement(original, '<button onclick="run()">Save</button>'), /attributes outside/);
  assert.throws(() => validateReplacement(original, '<button type="submit" aria-label="Save changes">Save</button>'), /attributes outside/);
  assert.throws(() => validateReplacement(original, original), /did not change/);
});

test("validates backend status and response shapes", () => {
  assert.deepEqual(validateApiStatus({ configured: true, provider: "https://provider.example/v1", model: "model-a" }),
    { configured: true, provider: "https://provider.example/v1", model: "model-a" });
  assert.throws(() => validateApiStatus({ configured: false, configuration_error: "ACCESS_GUARDIAN_AI_MODEL is missing" }), /ACCESS_GUARDIAN_AI_MODEL is missing/);
  assert.throws(() => validateApiFixResponse({}), /invalid AI fix response/);
  assert.throws(() => validateApiFixResponse({ replacement: "<img alt=\"A\" />", extra: true }), /invalid AI fix response/);
  assert.deepEqual(validateApiFixResponse({ replacement: "<img alt=\"A\" />" }), { replacement: "<img alt=\"A\" />" });
});

test("constructs the exact backend fix request", () => {
  assert.deepEqual(buildFixRequest({
    ruleId: "image-alt",
    message: "Image has no alt text",
    element: '<img src="photo.png" alt="">',
    expectedProvider: "https://provider.example/v1",
    expectedModel: "model-a",
  }), {
    consent_to_send_context: true,
    rule_id: "image-alt",
    message: "Image has no alt text",
    element: '<img src="photo.png" alt="">',
    context: "",
    expected_provider: "https://provider.example/v1",
    expected_model: "model-a",
  });
});

test("allows local HTTP and remote HTTPS backend URLs only", () => {
  assert.equal(getBackendUrl("http://127.0.0.1:8000", ""), "http://127.0.0.1:8000/");
  assert.equal(getBackendUrl("http://[::1]:8000", ""), "http://[::1]:8000/");
  assert.equal(getBackendUrl("https://guardian.example/base/", ""), "https://guardian.example/base");
  assert.throws(() => getBackendUrl("http://example.com:8000", ""), /Use HTTPS/);
  assert.throws(() => getBackendUrl("ftp://localhost", ""), /Use HTTPS/);
  assert.throws(() => getBackendUrl("not a url", ""), /invalid/);
});

test("builds status and fix API endpoints", () => {
  assert.equal(getApiEndpoint("http://127.0.0.1:8000/", "/api/agent/status").toString(), "http://127.0.0.1:8000/api/agent/status");
  assert.equal(getApiEndpoint(new URL("https://guardian.example/base"), "/api/agent/fix").toString(), "https://guardian.example/base/api/agent/fix");
});

test("package registers prepare, apply, and reject commands", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const commands = new Set(packageJson.contributes.commands.map((command) => command.command));
  assert(commands.has("accessGuardian.prepareFix"));
  assert(commands.has("accessGuardian.applyReviewedFix"));
  assert(commands.has("accessGuardian.rejectReviewedFix"));
  assert.equal(packageJson.contributes.configuration.properties["accessGuardian.backendUrl"].default,
    "http://127.0.0.1:8000");
});

test("rejects closed, dirty, stale, and changed-range pending documents", () => {
  const range = { start: 1, end: 2 };
  const document = {
    isDirty: false,
    version: 4,
    getText(arg) { return arg === range ? "<img alt=\"Old\">" : "<html><img alt=\"Old\"></html>"; },
  };
  assert.doesNotThrow(() => validatePendingDocumentState({
    document,
    isOpen: true,
    range,
    original: '<img alt="Old">',
    documentVersion: 4,
    baseDocumentText: "<html><img alt=\"Old\"></html>",
  }));
  assert.throws(() => validatePendingDocumentState({
    document,
    isOpen: false,
    range,
    original: '<img alt="Old">',
    documentVersion: 4,
    baseDocumentText: "<html><img alt=\"Old\"></html>",
  }), /closed/);
  assert.throws(() => validatePendingDocumentState({
    document: { ...document, isDirty: true },
    isOpen: true,
    range,
    original: '<img alt="Old">',
    documentVersion: 4,
    baseDocumentText: "<html><img alt=\"Old\"></html>",
  }), /unsaved/);
});

test("validates resolved, partial, unresolved, and inconclusive verification responses", () => {
  for (const outcome of ["resolved", "partially_resolved", "unresolved", "inconclusive"]) {
    assert.doesNotThrow(() => validateVerificationResponse({
      status: outcome === "inconclusive" ? "inconclusive" : "complete",
      outcome,
      rule_id: "image-alt",
      message: "Verification result",
      remaining_violations: 0,
      remaining_incomplete: 0,
      human_review_required: true,
    }));
  }
  assert.throws(() => validateVerificationResponse({
    status: "complete",
    outcome: "success",
  }), /invalid verification/);
});
