"""Convert store rows into API records."""
from __future__ import annotations

from typing import Any

from ..database.store import Store
from .schemas import Finding, ScanRecord


def finding_record(row: dict) -> Finding:
    return Finding(**row)


def scan_record(store: Store, row: dict, include_findings: bool = True) -> ScanRecord:
    findings = [finding_record(f) for f in store.list_findings(scan_id=row["scan_id"], limit=500)] if include_findings else []
    data: dict[str, Any] = {k: row.get(k) for k in (
        "scan_id", "target_url", "status", "title", "page_url", "pages_scanned", "ai_analysis_status",
        "pages", "errors", "created_at", "started_at", "finished_at",
    )}
    data["findings"] = findings
    data["finding_count"] = len(findings) if include_findings else row.get("finding_count", 0)
    data["score"] = None
    return ScanRecord(**data)


def remediation_record(row: dict) -> dict[str, Any]:
    return {
        "remediation_id": row["remediation_id"],
        "finding_id": row["finding_id"],
        "scan_id": row["scan_id"],
        "original": row["original"],
        "replacement": row["replacement"],
        "status": row["status"],
        "decision": row["decision"],
        "verification_scan_id": row.get("verification_scan_id"),
        "model": row["model"],
        "source_modified": False,
        "note": "Proposal only. No source file has been changed; review it and apply it to your source manually if it is correct.",
    }
