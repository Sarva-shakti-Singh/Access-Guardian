from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import ROOT, get_settings, load_dotenv

load_dotenv()

from .database.store import get_store  # noqa: E402  (after .env is loaded)
from .routes import findings, remediation, scans  # noqa: E402

app = FastAPI(
    title="Access Guardian API",
    version="0.2.0",
    description="Accessibility scanning API. Automated findings are limited checks and do not "
                "establish WCAG conformance. This API has no authentication.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

FRONTEND_DIST = ROOT / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.on_event("startup")
def _startup() -> None:
    get_store().mark_interrupted()


@app.get("/")
def root():
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return {"service": "access-guardian", "status": "running", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ready")
def ready(response: Response):
    if get_store().ping():
        return {"status": "ready"}
    response.status_code = 503
    return {"status": "database unavailable"}


app.include_router(scans.router)
app.include_router(findings.router)
app.include_router(remediation.router)


@app.get("/{path:path}", include_in_schema=False)
def frontend_route(path: str):
    if path == "api" or path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Not found")
