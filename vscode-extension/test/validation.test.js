const test = require("node:test");
const assert = require("node:assert/strict");
const { validateBackendUrl, validateCompleteHtmlElement, validateReplacement, buildFixRequest } = require("../src/validation");

test("backend URL policy permits local HTTP and remote HTTPS only", () => {
  assert.equal(validateBackendUrl("http://127.0.0.1:8000").host, "127.0.0.1:8000");
  assert.equal(validateBackendUrl("https://example.com/api/").pathname, "/api");
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com?token=x", "file:///tmp/api"]) {
    assert.throws(() => validateBackendUrl(url));
  }
});

test("complete-element validation rejects empty, sibling, comment-prefixed and unsupported self-closing inputs", () => {
  assert.doesNotThrow(() => validateCompleteHtmlElement('<button class="ok"><span>Save</span></button>'));
  assert.doesNotThrow(() => validateCompleteHtmlElement('<img alt="Logo" src="logo.png">'));
  for (const html of ["", "<button>Save", "<button>Save</button><span>x</span>", "<!-- comment --><button>x</button>", "<section/>"]) {
    assert.throws(() => validateCompleteHtmlElement(html));
  }
});

test("only accessible-name attributes can change; tag, children, and other attributes remain fixed", () => {
  const original = '<button class="ok"><span>Save</span></button>';
  assert.equal(validateReplacement(original, '<button class="ok" aria-label="Save item"><span>Save</span></button>'), '<button class="ok" aria-label="Save item"><span>Save</span></button>');
  for (const proposed of [
    '<button class="changed" aria-label="Save item"><span>Save</span></button>',
    '<a class="ok" aria-label="Save item"><span>Save</span></a>',
    '<button class="ok" aria-label="Save item"><b>Save</b></button>',
    '<button class="ok" aria-label=""><span>Save</span></button>',
  ]) assert.throws(() => validateReplacement(original, proposed));
});

test("request matches backend consent schema and sends only selected element", () => {
  assert.deepEqual(buildFixRequest("button-name", "Button has no name", "<button></button>", "https://ai.example/v1", "model"), {
    consent_to_send_context: true, rule_id: "button-name", message: "Button has no name", element: "<button></button>", context: "", expected_provider: "https://ai.example/v1", expected_model: "model",
  });
});
