# Access Guardian

This repository now contains a working prototype of the Access Guardian accessibility scanning platform.

## What is included

- Python FastAPI backend with scan endpoints
- Playwright-based live URL scan service
- axe-core accessibility analysis
- In-memory MongoDB-style storage abstraction for scans and findings
- React + Vite frontend with sample demo/live mode toggle
- Security validation for public HTTP/HTTPS targets

## Quick start

### 1) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2) Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Then open the local Vite URL and use the live scan mode to scan a public website.

## API

- POST /api/scans
- GET /api/scans
- GET /api/scans/{scan_id}
- GET /api/scans/{scan_id}/findings
- POST /api/findings/{finding_id}/remediate
- POST /api/scans/{scan_id}/verify

## Notes

- This is a research-grade prototype, not a production accessibility certification service.
- The live scan path uses a strict allowlist for public URLs and blocks private/localhost addresses.
- The sample mode remains available as a fallback for demos.
