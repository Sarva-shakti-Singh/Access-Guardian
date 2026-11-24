# Access Guardian Fix Assistant

This extension sends one developer-selected HTML element to the existing Access Guardian FastAPI backend for a constrained AI remediation proposal.

## Requirements

- VS Code 1.85 or newer
- Access Guardian backend running locally or at an HTTPS endpoint
- AI provider configured on the backend
- No additional VS Code extension npm dependencies

## Install or develop locally

1. Open the Access Guardian repository in VS Code.
2. Run **Tasks: Run Task** and select **Setup (first run)**, or configure the backend manually.
3. Configure the backend URL:
   - Open VS Code Settings.
   - Set `accessGuardian.backendUrl` to `http://127.0.0.1:8000` for local development.
   - For remote backends, use HTTPS.
4. Start the backend:

```bash
.venv/bin/python -m uvicorn backend.app.main:app
```

On Windows, use `.venv\Scripts\python.exe -m uvicorn backend.app.main:app`.

5. Open **Run and Debug**, select **Access Guardian Extension**, and press F5. An Extension Development Host window opens.

## Configure AI

Set these variables in `.env` and restart the backend:

```dotenv
ACCESS_GUARDIAN_AI_BASE_URL=http://127.0.0.1:11434/v1
ACCESS_GUARDIAN_AI_MODEL=qwen2.5-coder:7b
ACCESS_GUARDIAN_AI_API_KEY=
```

The extension never stores or sends API keys. They remain on the backend.

## Commands

### Access Guardian: Prepare AI Fix for Selected HTML

1. Open and save an HTML/source file in the current workspace.
2. Select exactly one complete HTML element.
3. Run the command from the Command Palette.
4. Choose the finding rule and enter the finding description.
5. Review the provider/model and explicitly choose **Send to AI**.
6. Review the native VS Code diff.
7. Choose **Apply Fix**, **Reject Fix**, or **Review Changes**.

### Access Guardian: Apply Reviewed Fix

Applies a waiting proposal only if the original document is still open, saved, unchanged, and its original range still contains the selected element.

### Access Guardian: Reject Reviewed Fix

Discards the waiting proposal without editing the file.

## AI and privacy behavior

- The extension sends only the selected element, rule ID, and finding description.
- It does not read or send the workspace, unrelated files, screenshots, terminal data, or API keys.
- The backend request requires consent and sends the AI request through the configured provider.
- Provider/model changes invalidate a request generated after a consent prompt.
- Remote URLs require HTTPS. HTTP is permitted only for localhost.
- The backend and extension validate proposed HTML and only permit changes to `alt`, `aria-label`, and `title`.
- The proposed change must keep the original tag and children unchanged.

## Review and application

The diff is the complete original document beside the complete proposed document. Applying a proposal:

- Modifies only the exact selected range.
- Leaves the document unsaved.
- Adds a normal VS Code Undo operation.
- Does not save or rescan files.
- Is refused if the document or disk file changed after generation.

## Known limitations

- The extension does not map an externally scanned URL to a local source file.
- It processes one element at a time.
- It does not edit multiple files or run terminal commands.
- It does not search findings or workspace symbols automatically.
- HTML string validation is conservative and may reject unusual markup.
- AI proposals are suggestions; developers must verify semantics and accessibility manually.
- This prototype has no authentication or multi-user isolation.

## Testing

From this directory:

```bash
npm test
```

The tests cover URL validation, HTML element/replacement restrictions, request construction, and stale proposal rules through their pure validation module.
