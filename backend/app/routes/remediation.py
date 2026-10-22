from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.database.store import get_scan

router = APIRouter(prefix="/api", tags=["findings"])


@router.get("/findings")
def list_findings():
    findings = []
    for scan in [get_scan(scan_id) for scan_id in []]:
        if scan is not None:
            findings.extend(scan.get("findings", []))
    return findings


@router.get("/scans/{scan_id}/findings")
def list_scan_findings(scan_id: str):
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan.get("findings", [])
