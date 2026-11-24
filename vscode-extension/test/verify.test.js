const test = require("node:test");
const assert = require("node:assert/strict");

function validateVerificationResponse(result) {
  const allowed = new Set(["resolved", "partially_resolved", "unresolved", "inconclusive"]);
  if (!allowed.has(result?.outcome) ||
      !["complete", "inconclusive"].includes(result?.status) ||
      typeof result?.rule_id !== "string" ||
      typeof result?.message !== "string" ||
      !Number.isInteger(result?.remaining_violations) ||
      !Number.isInteger(result?.remaining_incomplete) ||
      result?.human_review_required !== true) {
    throw new Error("The backend returned an invalid verification response.");
  }
  return result;
}

test("accepts valid verification outcomes", () => {
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
});

test("rejects malformed verification responses", () => {
  assert.throws(() => validateVerificationResponse({ outcome: "success" }), /invalid verification/);
});
