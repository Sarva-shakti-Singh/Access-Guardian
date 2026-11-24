# Public Finding to Local Source Mapping

## Status

Automatic mapping is not implemented. Public DOM output cannot be assumed to represent local source templates, components, server-rendered fragments, or generated HTML safely.

## Safe manual workflow

1. The developer receives the public finding, including rule ID, page URL, CSS/axe selector, and redacted HTML snippet.
2. The developer opens the relevant local workspace file and selects the corresponding complete HTML element.
3. The extension validates that the file is saved and inside the workspace.
4. The developer confirms that the selected element corresponds to the public finding.
5. The developer chooses the rule and finding message.
6. The extension starts status and consent as it does for the existing single-element workflow.
7. The existing `/api/agent/fix` request is sent only after confirmation.
8. No source mapping or workspace search happens automatically.

## Future implementation boundaries

A future mapper should require an explicit developer mapping record containing:

- Finding ID and public page URL.
- Local file URI.
- Human-confirmed source range.
- Axe rule ID and message.
- The source element snapshot.
- Confirmation timestamp.

It should never infer source locations from selectors alone or search or modify unrelated files. A reliable implementation would require project-specific route/template/component metadata that is not currently available.
