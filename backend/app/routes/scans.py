from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routes.scans import router as scans_router

app = FastAPI(
    title="Access Guardian",
    version="0.1.0",
    description="Prototype accessibility scanning and remediation backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scans_router)


@app.get("/")
def root():
    return {"service": "Access Guardian", "status": "running"}
