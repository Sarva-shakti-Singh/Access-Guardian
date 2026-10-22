from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

SCANS: Dict[str, Dict[str, Any]] = {}
FINDINGS: Dict[str, Dict[str, Any]] = {}
REMEDIATIONS: Dict[str, Dict[str, Any]] = {}
VERIFICATIONS: Dict[str, Dict[str, Any]] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_scan_record(target_url: str, scan_id: str) -> Dict[str, Any]:
    now = now_iso()
    record = {
        "scan_id": scan_id,
        "target_url": target_url,
        "status": "queued",
        "title": None,
        "page_url": target_url,
        "pages_scanned": 0,
        "score": 100,
        "created_at": now,
        "updated_at": now,
        "findings": [],
    }
    SCANS[scan_id] = record
    return record


def get_scan(scan_id: str) -> Dict[str, Any] | None:
    return SCANS.get(scan_id)


def list_scans() -> List[Dict[str, Any]]:
    return sorted(SCANS.values(), key=lambda item: item["created_at"], reverse=True)


def save_finding(finding: Dict[str, Any]) -> Dict[str, Any]:
    FINDINGS[finding["finding_id"]] = finding
    scan = SCANS.get(finding["scan_id"])
    if scan:
        scan["findings"] = [
            existing for existing in scan["findings"] if existing["finding_id"] != finding["finding_id"]
        ]
        scan["findings"].append(finding)
    return finding


def get_scan_findings(scan_id: str) -> List[Dict[str, Any]]:
    scan = SCANS.get(scan_id)
    if not scan:
        return []
    return scan["findings"]


def store_remediation(remediation: Dict[str, Any]) -> Dict[str, Any]:
    REMEDIATIONS[remediation["remediation_id"]] = remediation
    return remediation


def store_verification(verification: Dict[str, Any]) -> Dict[str, Any]:
    VERIFICATIONS[verification["verification_id"]] = verification
    return verification
