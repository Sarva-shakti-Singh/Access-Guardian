from __future__ import annotations

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings, load_dotenv

load_dotenv()

from .database.store import get_store  # noqa: E402  (after .env is loaded)
from .routes import findings, remediation, scans  # noqa: E402

app = FastAPI(
    title="Access Guardian API",
    version="0.2.0",
    description="Local accessibility scanning API. Automated findings are limited checks and do not "
                "establish WCAG conformance. This API has no authentication.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.on_event("startup")
def _startup() -> None:
    get_store().mark_interrupted()


@app.get("/")
def root():
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
