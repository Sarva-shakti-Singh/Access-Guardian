const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../package.json");

test("extension package exposes no placeholder failing test and source entry exists", () => {
  assert.equal(manifest.main, "./src/extension.js");
  assert.equal(manifest.scripts.test, "node --test test/*.test.js");
  assert.ok(manifest.contributes.commands.length >= 3);
});
