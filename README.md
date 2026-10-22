# Access Guardian

Access Guardian is an AI-assisted accessibility scanning and remediation platform for web applications. It helps detect accessibility issues, explain their impact, and support safer, code-aware remediation workflows.

The project is designed around a practical goal: identify common barriers for users with disabilities, gather browser-level evidence, and improve accessibility using a combination of automated checks and structured remediation workflows.

## Why this project exists

Many websites still fail basic accessibility expectations, including:

- missing or inadequate alt text
- unlabeled form controls
- poor keyboard navigation
- weak focus styling
- insufficient color contrast
- improper semantic structure
- JavaScript-heavy UI issues that are hard to evaluate manually

Manual audit and remediation are slow and error-prone. Access Guardian aims to reduce that gap by combining automated detection, contextual evidence, and guided remediation.

## Core idea

This repository implements a prototype accessibility engineering workflow:

- scan a target web page or application
- detect accessibility issues
- capture evidence from browser rendering and DOM state
- classify and explain findings
- generate remediation suggestions or code-level fixes
- verify the result after patching

This makes it more than a simple linter: it is intended to support an end-to-end accessibility validation and repair loop.

## Features

- Accessibility scanning for web pages
- Browser-driven evidence collection
- DOM and accessibility tree inspection
- Automated issue detection based on accessibility rules
- Structured findings with contextual reasoning
- Remediation planning and code-level fix support
- Verification and regression-oriented workflow
- Research prototype for AI-assisted accessibility remediation

## Architecture overview

The repository is organized around a hybrid system:

- Frontend: React + TypeScript dashboard
- Backend: Python + FastAPI API service
- Browser automation: Playwright
- Rule validation: axe-core and custom checks
- Remediation layer: structured, auditable fix generation
- Verification: re-scan, compare before/after behavior, check regressions

## Repository structure

```text
Access-Guardian/
├── README.md
├── PROJECT_BLUEPRINT.md
├── api-contract.yaml
├── architecture.mmd
├── dataset-annotation-schema.json
├── evaluation-plan.md
├── mongodb-schema.md
├── timeline.csv
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── database/
│       │   └── store.py
│       ├── models/
│       │   └── schemas.py
│       ├── routes/
│       │   ├── findings.py
│       │   ├── remediation.py
│       │   └── scans.py
│       └── services/
│           ├── playwright_scan.py
│           └── security.py
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── index.css
│       ├── main.tsx
│       └── types.ts
└── .gitignore
```

## Tech stack

- Python
- FastAPI
- React
- TypeScript
- Vite
- Playwright
- Accessibility testing libraries
- MongoDB-oriented data model
- AI/LLM-assisted remediation concepts

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/Sarva-shakti-Singh/Access-Guardian.git
cd Access-Guardian
```

### 2. Start the backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

## API and project documents

This repo includes project planning and contract documents, including:

- `PROJECT_BLUEPRINT.md` — architecture and technical blueprint
- `api-contract.yaml` — API contract definition
- `architecture.mmd` — architecture diagram
- `evaluation-plan.md` — measurement and evaluation strategy

## Current status

Access Guardian is best described as an early-stage prototype and research project. It is not yet a production-ready commercial accessibility platform, but it provides a solid base for exploring:

- automated accessibility detection
- browser-based evidence collection
- remediation planning
- validation and regression checks
- AI-assisted accessibility tooling

## Limitations

- This project is still evolving
- Some components may be architectural or prototype-only
- End-to-end deployment may require additional services and configuration
- AI-assisted remediation should be treated as assistive and reviewed before production use

## License

This repository does not currently specify a license. If you plan to publish or distribute the project publicly, consider adding a license such as MIT or Apache-2.0.

## Related files

- `PROJECT_BLUEPRINT.md`
- `api-contract.yaml`
- `architecture.mmd`
- `evaluation-plan.md`
- `backend/app/routes`
- `frontend/src`
