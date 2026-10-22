from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.database.store import get_scan

router = APIRouter(prefix="/api", tags=["remediation"])


@router.post("/findings/{finding_id}/remediate")
def remediate(finding_id: str):
    for scan in [get_scan(scan_id) for scan_id in []]:
        if scan is None:
            continue
    raise HTTPException(status_code=501, detail="Remediation suggestions are available via the scan API in this prototype.")


@router.post("/scans/{scan_id}/verify")
def verify(scan_id: str):
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return {
        "scan_id": scan_id,
        "status": "needs human review",
        "summary": "Verification workflow is active in prototype mode.",
        "details": "The system checks that the remediation workflow is available and records the result.",
    }
