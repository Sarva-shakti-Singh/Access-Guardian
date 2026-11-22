# Access Guardian Fix Assistant (VS Code prototype)

This extension bridges a developer-selected HTML element to Access Guardian's constrained AI proposal endpoint. It does not search the workspace, map a deployed URL to source, run terminal commands, or grant the AI filesystem access.

## Run from this repository

1. Open the Access Guardian repository in VS Code.
2. Configure and start the FastAPI backend. Set `ACCESS_GUARDIAN_AI_BASE_URL`, `ACCESS_GUARDIAN_AI_MODEL`, and `ACCESS_GUARDIAN_AI_API_KEY` in the backend `.env`. Use a real API key locally; never commit it or paste it into chat.
3. Open the Run and Debug view and start **Access Guardian Extension**. VS Code launches an Extension Development Host window.
4. In that window, open a saved HTML/source file inside the workspace and select one complete HTML element.
5. Run **Access Guardian: Prepare AI Fix for Selected HTML** from the Command Palette.
6. Choose the matching rule and enter its finding description. Confirm the provider consent prompt to send only the selected element and finding description.
7. Review the complete before/after diff. Choose **Apply Fix** to edit the selected range or **Reject Fix** to leave the file unchanged. Choose **Review Changes** to leave the diff open, then use **Access Guardian: Apply Reviewed Fix** or **Access Guardian: Reject Reviewed Fix** from the Command Palette.
8. The approved edit stays unsaved in the editor. Save it yourself, or use VS Code Undo to revert it. Rescan manually in the dashboard.

Configure `accessGuardian.apiBaseUrl` in VS Code settings to point to a different Access Guardian API. Remote API URLs must use HTTPS; HTTP is accepted only for localhost.

## Safety and scope

- Both sending context to the AI and applying its proposal require separate, explicit approval.
- Only a selected file inside the current workspace can be edited. The AI receives the selected snippet, not the workspace.
- The extension uses the backend's constrained accessible-name rules and replacement validation.
- The full document is diffed before approval. The extension checks the document version, content, selected range, and on-disk file snapshot again before editing.
- Changes are unsaved and are part of the normal VS Code Undo history. The extension does not save files or run commands.
- This is a developer-assisted prototype. A public-site finding must be mapped to source by the developer. It is not yet a multi-file agent or an automatic verification loop.

No separate npm dependencies are required; VS Code provides the extension API.
