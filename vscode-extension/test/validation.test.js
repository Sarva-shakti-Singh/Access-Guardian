const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateBackendUrl,
  validateCompleteHtmlElement,
  validateReplacement,
  buildFixRequest,
} = require("../src/validation");

test("accepts localhost HTTP and rejects remote HTTP", () => {
  assert.equal(validateBackendUrl("http://127.0.0.1:8000").host, "127.0.0.1:8000");
  assert.throws(() => validateBackendUrl("http://example.com"), /HTTPS/);
});

test("accepts HTTPS and rejects credentials or query strings", () => {
  assert.equal(validateBackendUrl("https://example.com/api").pathname, "/api");
  assert.throws(() => validateBackendUrl("https://user:pass@example.com"), /credentials/);
  assert.throws(() => validateBackendUrl("https://example.com?token=x"), /credentials|query/);
});

test("validates one complete nested HTML element", () => {
  assert.doesNotThrow(() => validateCompleteHtmlElement('<button class="ok"><span>Save</span></button>'));
  assert.doesNotThrow(() => validateCompleteHtmlElement('<img alt="Logo" src="logo.png">'));
  assert.throws(() => validateCompleteHtmlElement(""), /empty|Selection/);
  assert.throws(() => validateCompleteHtmlElement("<button>Save"), /unclosed|closing/);
  assert.throws(() => validateCompleteHtmlElement("<button>Save</button><span>x</span>"), /extra|Selection/);
});

test("replacement validation permits only accessible-name changes", () => {
  const original = '<button class="ok"><span>Save</span></button>';
  assert.doesNotThrow(() => validateReplacement(original, '<button class="ok" aria-label="Save item"><span>Save</span></button>'));
  assert.throws(() => validateReplacement(original, '<button class="changed"><span>Save</span></button>'), /attributes/);
  assert.throws(() => validateReplacement(original, '<a class="ok" aria-label="Save item"><span>Save</span></a>'), /tag|element/);
  assert.throws(() => validateReplacement(original, '<button class="ok" aria-label=""><span>Save</span></button>'), /invalid|children|accessible/);
});

test("fix request matches backend consent schema", () => {
  assert.deepEqual(buildFixRequest("button-name", "Button has no name", "<button></button>", "http://127.0.0.1:11434/v1", "qwen"), {
    consent_to_send_context: true,
    rule_id: "button-name",
    message: "Button has no name",
    element: "<button></button>",
    context: "",
    expected_provider: "http://127.0.0.1:11434/v1",
    expected_model: "qwen",
  });
});
