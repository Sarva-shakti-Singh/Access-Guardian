from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..database.store import get_store
from ..models.schemas import Finding
from ..models.serializers import finding_record

router = APIRouter(prefix="/api/findings", tags=["findings"])


@router.get("", response_model=list[Finding])
def search_findings(
    scan_id: Optional[str] = None,
    severity: Optional[str] = Query(None, max_length=20),
    source: Optional[str] = Query(None, max_length=40),
    q: Optional[str] = Query(None, max_length=120),
    limit: int = Query(200, ge=1, le=500),
):
    rows = get_store().list_findings(scan_id=scan_id, severity=severity, source=source, q=q, limit=limit)
    return [finding_record(r) for r in rows]


@router.get("/{finding_id}", response_model=Finding)
def get_finding(finding_id: str):
    row = get_store().get_finding(finding_id)
    if not row:
        raise HTTPException(404, "Finding not found")
    return finding_record(row)
