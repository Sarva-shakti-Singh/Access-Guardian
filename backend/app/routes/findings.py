from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from backend.app.database.store import get_scan, list_scans

router = APIRouter(prefix="/api", tags=["findings"])


@router.get("/scans/{scan_id}/findings")
def list_findings(scan_id: str):
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan.get("findings", [])


@router.get("/findings")
def all_findings():
    results: List[Dict[str, Any]] = []
    for scan in list_scans():
        results.extend(scan.get("findings", []))
    return results
