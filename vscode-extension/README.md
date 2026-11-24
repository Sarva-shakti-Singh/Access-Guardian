# Access Guardian Fix Assistant

This extension bridges a developer-selected HTML element to Access Guardian's constrained AI proposal endpoint. It does not search the workspace, map a deployed URL to source, run terminal commands, or grant the AI filesystem access.

## Installation

For local development, clone the repository and open it in VS Code. No npm dependencies or packaging step are required.

To install a packaged VSIX when one is published, use **Extensions: Install from VSIX...** and select the extension package.

## Extension development setup

1. Open the Access Guardian repository in VS Code.
2. Run **Tasks: Run Task > Setup (first run)** once.
3. Start the backend and optional dashboard with **Tasks: Run Task > Start all**.
4. Open the Run and Debug view and start **Access Guardian Extension**. VS Code launches an Extension Development Host.
5. In the Development Host, open a saved HTML or source file inside the workspace.

Configure the backend in VS Code settings:

```json
{
  "accessGuardian.backendUrl": "http://127.0.0.1:8000"
}
```

The default is `http://127.0.0.1:8000`. Remote APIs must use HTTPS. HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1`. `accessGuardian.apiBaseUrl` remains as a deprecated compatibility setting.

Configure the backend AI provider in the repository `.env`, not in VS Code:

```dotenv
ACCESS_GUARDIAN_AI_BASE_URL=http://127.0.0.1:11434/v1
ACCESS_GUARDIAN_AI_MODEL=qwen2.5-coder:7b
ACCESS_GUARDIAN_AI_API_KEY=
```

`ACCESS_GUARDIAN_AI_BASE_URL` and `ACCESS_GUARDIAN_AI_MODEL` are required. API keys remain only in the backend environment. The status endpoint never returns the key. Remote providers must use HTTPS.
`ACCESS_GUARDIAN_AI_API_KEY` is optional for providers that do not require authentication. It is required when the selected provider requires an API key. The provider controls authentication; this project does not add or validate provider-specific credentials.

## Commands

- **Access Guardian: Prepare AI Fix for Selected HTML**: validates the editor, workspace file, saved state, selection, and finding; requests backend status; obtains consent; requests an AI proposal; and opens a full-document diff.
- **Access Guardian: Apply Reviewed Fix**: applies the currently pending proposal only if the document and on-disk snapshot still match the proposal.
- **Access Guardian: Reject Reviewed Fix**: discards the pending proposal without changing the source file.

## Workflow

1. Save the HTML file and select one complete element, including its closing tag (or self-closing/void element syntax).
2. Run **Prepare AI Fix for Selected HTML**.
3. Choose the accessibility rule and enter the finding description.
4. Review the configured provider and model shown in the consent prompt.
5. Explicitly choose **Send to AI**. Only the selected element and short finding details are sent.
6. Review the native VS Code diff.
7. Choose **Apply Fix**, **Reject Fix**, or **Review Changes**. With **Review Changes**, use the apply/reject commands later.
8. The edit is applied only to the open editor buffer and remains unsaved. Save manually or use Undo.

## Safety and scope

- Both sending context to the AI and applying its proposal require separate, explicit approval.
- Only a selected file inside the current workspace can be edited. The AI receives the selected snippet, not the workspace.
- Unsaved documents and files outside the workspace are rejected.
- The extension uses the backend's constrained accessible-name rules and replacement validation.
- The full document is diffed before approval. The extension checks the document version, content, selected range, and on-disk file snapshot again before editing.
- Changes are unsaved and are part of the normal VS Code Undo history. The extension does not save files or run commands.
- A stale proposal is discarded if the editor or saved file changes after proposal generation.
- API credentials stay in the backend `.env`; they are never placed in VS Code settings or sent to the extension.

## Known limitations

- The extension cannot map a public URL or dashboard finding automatically to local source.
- It supports one element at a time and does not edit multiple files or arbitrary project files.
- It is designed for accessible-name attributes (`alt`, `aria-label`, and `title`) and rejects unsafe AI replacements.
- The proposed fix is not automatically verified or saved.
- If the backend is unavailable or provider configuration changes, the command reports an actionable error instead of applying a change.
