# Access Guardian

Access Guardian is an accessibility-scanning research MVP for web applications. It crawls a bounded number of public pages with Playwright, runs axe-core, optionally asks a vision model to review screenshots, and shows everything in a React dashboard. An optional VS Code extension can prepare a constrained AI proposal for a developer-selected HTML element and apply it only after explicit review and approval.

Automated and AI findings are **not** a WCAG conformance result. AI visual findings are potential observations that need human review.

## Quick start in VS Code

Requirements: Python 3.10+ and Node.js 20.19+ (or 22.12+).

1. **File > Open Folder** and choose this folder. Accept the recommended-extensions prompt.
2. `Ctrl+Shift+P` > **Tasks: Run Task** > **Setup (first run)**. This creates `.venv`, installs the Python and npm dependencies, installs Chromium and copies `.env.example` to `.env`.
3. Press `Ctrl+Shift+B` (or run the task **Start all**). Open http://127.0.0.1:5173, paste a public URL into the bar at the bottom and press the arrow.

API docs: http://127.0.0.1:8000/docs. Health: `/api/health`, `/api/ready`.

### Manual commands

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
python -m playwright install chromium
Copy-Item .env.example .env
python -m uvicorn backend.app.main:app
```

macOS/Linux:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python -m playwright install chromium
cp .env.example .env
python -m uvicorn backend.app.main:app
```

Frontend (second terminal):

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the backend on port 8000. Do not use Uvicorn `--reload` on Windows: the scanner uses Playwright's synchronous API. Restart the backend after code changes. `npm install` is required before scanning because the backend loads axe-core from `frontend/node_modules`.

## Workflow

1. **Scan website** (Playwright): bounded same-origin crawl with screenshots and keyboard evidence. Forms are never submitted.
2. **Analyze visually** (Vision AI): optional, opt-in and consent-gated.
3. **Explain problems** (AI + axe-core): findings with WCAG mapping and severity.
4. **Generate fixes** (AI remediation): optional proposals shown as a before/after snippet that you accept or reject. Accepting only records your decision.
5. **Verify manually applied fixes**: after accepting a proposal and applying it yourself, start a one-page rescan. The app reports whether the original axe-core rule is still detected, was not detected, or could not be checked. This is a narrow automated check, not proof of accessibility or WCAG conformance.
6. **Review progress and export**: view an internal weighted metric and severity counts, compare two scans of the same site, and download CSV or print/save a report as PDF. AI fixes can be copied or downloaded as HTML for a developer to review and apply.
7. **Inspect keyboard evidence**: each page records up to 12 Tab stops and whether an outline or box-shadow was present while focused. This limited sample is not a keyboard conformance test; manually check activation, focus order, visibility, and escape from dialogs or widgets.
8. **Prepare a local source fix (VS Code prototype)**: in the Extension Development Host, select one complete HTML element in a saved workspace file and run **Access Guardian: Prepare AI Fix for Selected HTML**. The extension asks before sending the selected element and finding description to the AI, opens a full-file diff, and requires separate approval before editing. The edit stays unsaved and can be undone with VS Code Undo. See [the extension guide](./vscode-extension/README.md).

The tile illustrations and the "Sample accessibility scan" card on the home page are examples. After a scan starts, the card shows the real scan.

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `ACCESS_GUARDIAN_DATABASE` | SQLite file for scan history |
| `ACCESS_GUARDIAN_CORS_ORIGINS` | Allowed browser origins (default: the Vite dev server) |
| `ACCESS_GUARDIAN_ALLOWED_SCAN_PORTS` | Allowed target ports (default 80,443) |
| `ACCESS_GUARDIAN_AXE_PATH` | Local axe-core script |
| `ACCESS_GUARDIAN_AI_BASE_URL`, `_AI_MODEL`, `_AI_API_KEY` | Optional OpenAI-compatible provider for fix proposals; leave blank to disable |
| `ACCESS_GUARDIAN_VISION_BASE_URL`, `_VISION_MODEL`, `_VISION_API_KEY` | Optional image-capable model for screenshot analysis |

Example for local Ollama:

```dotenv
ACCESS_GUARDIAN_AI_BASE_URL=http://127.0.0.1:11434/v1
ACCESS_GUARDIAN_AI_MODEL=qwen2.5-coder:7b
```

When the AI settings are blank, fix proposals default to local Ollama at `http://127.0.0.1:11434/v1` with `qwen2.5-coder:7b`. Install and start Ollama, then run `ollama pull qwen2.5-coder:7b`. Checking the consent box for a fix proposal sends that element and short context to the configured provider and starts generation; proposals are never applied automatically.

Remote providers require HTTPS. The dashboard asks for explicit consent before sending any element, screenshot or page evidence to a provider. API keys stay on the backend. Screenshot analysis remains separately configured and opt-in; the text model above does not enable vision analysis.

## Project layout

```text
Access-Guardian/
├── backend/            FastAPI + Playwright + SQLite
│   └── app/            main.py, config.py, routes/, services/, models/, database/
├── frontend/           React + TypeScript + Vite dashboard (src/)
├── vscode-extension/   Approval-gated VS Code source-fix prototype
├── docs/               Planning and research documents (API contract, blueprint,
│                       evaluation plan, architecture diagram, MongoDB plan, timeline,
│                       annotation schema). These describe planned scope and are not
│                       evidence that roadmap items are implemented.
├── .vscode/            Tasks, launch configuration and recommended extensions
├── .env.example
└── README.md
```

## Limitations

- **Local tool only.** No authentication or tenant isolation; rate limits are in memory. Do not expose it publicly without authentication, an egress firewall and quotas.
- **SSRF protection** resolves and checks target addresses and blocks cross-origin requests, but it is defense in depth, not a substitute for network egress controls.
- **Scanner coverage:** same-origin links only, at most 10 pages and depth 3. No login, CAPTCHA bypass, interactions, contrast adjudication, focus-visibility verdicts or full keyboard conformance checks. Partial scans can omit checks and cross-origin blocking can make pages render incompletely.
- **Privacy:** query strings are not stored. Screenshots and snippets are best-effort redacted only; treat the SQLite file and screenshots as sensitive.
- **AI:** vision analysis covers at most three pages per scan and depends on your provider. Fix proposals cover accessible-name attributes only and are never applied or verified automatically.
- **Internal metric:** the displayed score is `max(0, 100 - 10×critical - 5×serious - 2×moderate - minor)` over confirmed findings. It is an internal prioritization aid, not a WCAG score or compliance claim; potential observations are excluded. Comparison uses page/rule pairs, so a change in reported elements is an observation rather than proof of a fix.
- **Exports and dashboard fix suggestions:** CSV contains recorded finding details; Print / Save as PDF uses the browser's print dialog. A downloaded dashboard fix is only the proposed HTML element, not a source-aware patch. The dashboard/backend alone never edits source files; see the VS Code prototype limitation below.
- **VS Code fix assistant:** the extension is developer-assisted, not an autonomous agent. The scanner cannot map a public URL to a local source file; the developer selects that source element. Only selected code is sent to the configured provider, and only after consent. Applying a change requires a separate approval after a complete diff review. The edit is limited to the selected range in a file under the open workspace, remains unsaved, and is guarded against intervening file changes. No AI-generated commands are executed.
- **Keyboard evidence:** only a short Tab traversal is collected. The tool does not activate controls, detect all focus indicators, or certify focus order or freedom from keyboard traps.
- **Not implemented:** automatic public-page-to-source mapping, multi-file agent edits, GitHub integration, MongoDB/Redis, benchmarks, automated tests. No evaluation results are claimed.

No license is specified. Add one (for example MIT or Apache-2.0) before publishing.
