# Automatic Accessibility Verification Plan

## Existing verification

Access Guardian already provides cautious public-page rescan verification. It compares the same rule and page URL against findings from a one-page rescan. It reports `still_detected`, `not_detected`, or `inconclusive`, and always requires human review.

The VS Code apply workflow is intentionally local and unsaved. It does not automatically save or serve modified source, so an immediate public rescan would compare the deployed public DOM, not the in-editor HTML.

## Safe implementation phases

1. Require the developer to save and serve/deploy the modified source through their existing project workflow.
2. Confirm the original public finding and page URL.
3. Run the existing bounded Playwright and axe-core rescan.
4. Compare the original rule ID and relevant confirmed finding against the rescan.
5. Report unresolved or still-detected findings without claiming WCAG conformance.
6. Never modify source files, execute terminal commands, or open external deployment workflows automatically.

## Acceptance criteria

- Verification only starts after an explicit developer action.
- It uses the existing scan security, origin, port, and SSRF protections.
- It reports inconclusive results when the page cannot be rescanned completely.
- It does not claim that absence of one axe rule means the issue or WCAG compliance is resolved.

## Implementation status

Implemented:

- A POST `/api/agent/verify` endpoint validates the rule and modified element.
- Verification runs local axe-core in an isolated Playwright browser against only the applied element.
- Outcomes are `resolved`, `partially_resolved`, `unresolved`, or `inconclusive`.
- The VS Code extension offers verification after Apply Fix with explicit developer confirmation.
- Verification does not modify source files or send the element to an AI provider.

Remaining limitation:

- Fragment verification cannot certify an entire deployed page or WCAG conformance.
- The live public-page rescan workflow remains available only through the existing remediation verification endpoints.
