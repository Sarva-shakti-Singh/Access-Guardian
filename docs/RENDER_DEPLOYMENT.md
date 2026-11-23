# Deploy Access Guardian on Render

The root `render.yaml` deploys the React dashboard and FastAPI/Playwright API together as one Docker web service. The Blueprint uses a persistent 1 GB disk for SQLite scan history and a paid Render Starter instance; review the plan and disk charges shown by Render before confirming deployment.

## Deploy

1. In Render, choose **New → Blueprint** and connect this repository.
2. Select the branch containing `render.yaml` (currently `main`) and keep the Blueprint path as `render.yaml`.
3. Review the `access-guardian` web service, its Starter plan, and persistent disk. Confirm the deployment in Render.
4. Wait for the Docker build and health check at `/api/ready` to pass, then open the service's `onrender.com` URL.

The Docker image builds the Vite dashboard, installs Chromium and its Linux dependencies for Playwright, and runs Uvicorn. The dashboard and API share one origin, and the SQLite database is stored under `/var/data`.

## Important security and scope notes

This application currently has **no authentication or tenant isolation**. A public deployment allows anyone who can reach the service to use its scan endpoints. The scanner includes SSRF defenses, but these are not a substitute for network egress controls. Deploy only for a controlled demo until authentication, quotas, and production egress restrictions are added. Do not configure AI-provider secrets unless you intend to use those providers; add any such secrets only in Render's environment settings, never in the repository.

Automated findings are limited checks and do not establish WCAG conformance. AI observations require human review. Review the main README for scanner limitations and privacy considerations.
