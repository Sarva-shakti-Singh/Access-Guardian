# Access Guardian Fix Assistant

This extension sends one developer-selected HTML element to the existing Access Guardian FastAPI backend for a constrained AI remediation proposal.

## Requirements

- VS Code 1.85 or newer
- Access Guardian backend running locally or at an HTTPS endpoint
- AI provider configured on the backend
- No additional VS Code extension npm dependencies

## Install or develop locally

1. Open the repository and run **Tasks: Run Task** -> **Setup (first run)**.
2. Set `accessGuardian.backendUrl` to `http://127.0.0.1:8000` for local development, or use HTTPS for remote backends.
3. Start the backend:

```bash
.venv/bin/python -m uvicorn backend.app.main:app
```

On Windows, use `.venv\Scripts\python.exe -m uvicorn backend.app.main:app`.

4. Open **Run and Debug**, select **Access Guardian Extension**, and press F5.

## AI configuration

Set and restart:

```dotenv
ACCESS_GUARDIAN_AI_BASE_URL=http://127.0.0.1:11434/v1
ACCESS_GUARDIAN_AI_MODEL=qwen2.5-coder:7b
ACCESS_GUARDIAN_AI_API_KEY=
```

The extension never receives or stores API keys.

For a remote OpenAI-compatible provider, use the base URL ending in `/v1`; the backend appends `/chat/completions` exactly once:

```dotenv
ACCESS_GUARDIAN_AI_BASE_URL=https://api.openai.com/v1
ACCESS_GUARDIAN_AI_MODEL=gpt-5.4-mini
ACCESS_GUARDIAN_AI_API_KEY=your-provider-key
```

Never commit or place the key in VS Code settings. The status endpoint never returns it.

## Commands

- **Access Guardian: Prepare AI Fix for Selected HTML** — validate a saved workspace document and one complete element, ask for rule/context, confirm provider/model, request a fix, and open a diff.
- **Access Guardian: Apply Reviewed Fix** — apply only to an unchanged open, saved document and exact original range.
- **Access Guardian: Reject Reviewed Fix** — discard the waiting proposal without editing.

## Consent, privacy, and safety

- One selected element and short finding text are sent after a modal consent prompt.
- The workspace, unrelated files, terminal, and credentials are not read or transmitted.
- Provider/model are checked by `GET /api/agent/status` and rechecked during `POST /api/agent/fix` by the backend.
- HTTP is allowed only for local/loopback hosts; remote backend URLs require HTTPS.
- Only `alt`, `aria-label`, and `title` may change. The tag and children must remain unchanged.

## Review and apply behavior

The native VS Code diff shows the complete original and proposed document. Applying is unsaved and leaves normal Undo history. The proposal is refused if the document is dirty, the version/text/range changed, or the on-disk snapshot changed.

## Known limitations

- No automatic public-page-to-source mapping.
- No multi-file edits or terminal commands.
- Conservative HTML validation may reject unusual markup.
- Fragment verification is available after Apply Fix, but it does not verify the complete deployed page or WCAG conformance.
- Runtime behavior in VS Code's Extension Development Host requires manual verification.
- The project has no authentication or tenant isolation.

## Testing

JavaScript pure validation tests:

```bash
cd vscode-extension
npm test
```

Python remediation tests:

```bash
python -m unittest tests/test_fix_validation.py
```

VS Code activation, command, network, consent, diff, apply, reject, and stale-document behavior are not covered by these unit tests and require manual Extension Development Host testing.
