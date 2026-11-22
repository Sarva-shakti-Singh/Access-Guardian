from __future__ import annotations

import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from ..config import get_settings
from ..database.store import ACTIVE, Store, get_store
from ..models.schemas import Finding, ScanCreateRequest, ScanRecord
from ..models.serializers import finding_record, scan_record
from ..services.playwright_scan import run_scan
from ..services.security import UnsafeTarget, validate_target

router = APIRouter(prefix="/api/scans", tags=["scans"])

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="scan")
_recent: deque[float] = deque()
_recent_lock = threading.Lock()
MAX_ACTIVE = 4
MAX_PER_MINUTE = 10


def _rate_limit() -> None:
    now = time.time()
    with _recent_lock:
        while _recent and now - _recent[0] > 60:
            _recent.popleft()
        if len(_recent) >= MAX_PER_MINUTE:
            raise HTTPException(429, "Too many scan requests; try again in a minute")
        _recent.append(now)


def check_scan_capacity(store: Store) -> None:
    _rate_limit()
    if store.count_active() >= MAX_ACTIVE:
        raise HTTPException(429, "Scanner is busy; wait for a running scan to finish")


def submit_scan(scan_id: str, store: Store) -> None:
    _executor.submit(run_scan, scan_id, store)


@router.get("", response_model=list[ScanRecord])
def list_scans(limit: int = Query(100, ge=1, le=500)):
    store = get_store()
    return [scan_record(store, r, include_findings=False) for r in store.list_scans(limit)]


@router.post("", response_model=ScanRecord, status_code=202)
def create_scan(req: ScanCreateRequest):
    store = get_store()
    try:
        target = validate_target(req.target_url, get_settings().allowed_ports)
    except UnsafeTarget as exc:
        raise HTTPException(400, str(exc)) from exc
    check_scan_capacity(store)
    config = req.model_dump()
    config.pop("target_url")
    scan_id = store.create_scan(target.url, config)
    submit_scan(scan_id, store)
    return scan_record(store, store.get_scan(scan_id))


def _get_or_404(scan_id: str) -> dict:
    row = get_store().get_scan(scan_id)
    if not row:
        raise HTTPException(404, "Scan not found")
    return row


@router.get("/{scan_id}", response_model=ScanRecord)
def get_scan(scan_id: str):
    return scan_record(get_store(), _get_or_404(scan_id))


@router.post("/{scan_id}/cancel")
def cancel_scan(scan_id: str):
    row = _get_or_404(scan_id)
    if row["status"] not in ACTIVE:
        raise HTTPException(409, "Scan is no longer cancellable")
    get_store().request_cancel(scan_id)
    return {"scan_id": scan_id, "cancel_requested": True}


@router.get("/{scan_id}/findings", response_model=list[Finding])
def scan_findings(scan_id: str):
    _get_or_404(scan_id)
    return [finding_record(f) for f in get_store().list_findings(scan_id=scan_id, limit=500)]


@router.get("/{scan_id}/pages/{page_index}/screenshot")
def screenshot(scan_id: str, page_index: int):
    _get_or_404(scan_id)
    if page_index < 0:
        raise HTTPException(404, "Screenshot not found")
    path = get_settings().artifacts_dir / "screenshots" / scan_id / f"{page_index}.png"
    if not path.is_file():
        raise HTTPException(404, "Screenshot not found")
    return FileResponse(path, media_type="image/png")


@router.post("/{scan_id}/verify")
def verify(scan_id: str):
    row = _get_or_404(scan_id)
    if row["status"] in ACTIVE:
        raise HTTPException(409, "Scan is not finished")
    store = get_store()
    counts: dict[str, int] = {}
    for f in store.list_findings(scan_id=scan_id, limit=500):
        counts[f["severity"]] = counts.get(f["severity"], 0) + 1
    return {
        "scan_id": scan_id,
        "status": row["status"],
        "findings_by_severity": counts,
        "requires_human_review": True,
        "message": "Automated checks cover only a subset of WCAG. This is not a conformance result; "
                   "a qualified human audit and assistive-technology testing are still required.",
    }
