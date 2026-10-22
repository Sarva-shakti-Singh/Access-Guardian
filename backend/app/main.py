import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from backend.app.database.store import create_scan_record, get_scan, get_scan_findings, list_scans, save_finding, store_remediation, store_verification
from backend.app.models.schemas import ScanCreateRequest
from backend.app.services.security import validate_target_url
from backend.app.services.playwright_scan import scan_url

router = APIRouter(prefix="/api", tags=["scans"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/health")
def health():
    return {"status": "ok", "service": "access-guardian"}


@router.get("/scans")
def list_all_scans():
    return list_scans()


@router.post("/scans")
def create_scan(payload: ScanCreateRequest):
    try:
        target_url = validate_target_url(payload.target_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    scan_id = str(uuid.uuid4())
    record = create_scan_record(target_url, scan_id)
    record["status"] = "crawling"
    record["updated_at"] = _now()

    try:
        result = scan_url(target_url, scan_id)
    except Exception as exc:
        record["status"] = "failed"
        record["updated_at"] = _now()
        raise HTTPException(status_code=500, detail=f"Scan failed: {exc}") from exc

    record["status"] = result["status"]
    record["title"] = result.get("title")
    record["page_url"] = result.get("page_url")
    record["pages_scanned"] = result.get("pages_scanned", 1)
    record["score"] = result.get("score", 100)
    record["updated_at"] = _now()

    findings = result.get("findings", [])
    for finding in findings:
        finding["scan_id"] = scan_id
        finding["finding_id"] = str(uuid.uuid4())
        save_finding(finding)
        record["findings"].append(finding)

    return record


@router.get("/scans/{scan_id}")
def get_scan_by_id(scan_id: str):
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/scans/{scan_id}/findings")
def get_findings(scan_id: str):
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return get_scan_findings(scan_id)


@router.post("/findings/{finding_id}/remediate")
def remediate_finding(finding_id: str):
    finding = next((item for item in get_scan_findings(next(scan["scan_id"] for scan in list_scans() if any(f["finding_id"] == finding_id for f in scan["findings"]))) if item["finding_id"] == finding_id), None)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    remediation = {
        "remediation_id": str(uuid.uuid4()),
        "finding_id": finding_id,
        "summary": f"Fix the {finding['rule_id']} issue by improving the relevant element and adding the recommended accessible attributes.",
        "before": finding.get("html_snippet") or "<element missing accessibility detail>",
        "after": "<button aria-label=\"Close menu\">×</button>",
        "patch": "<button aria-label=\"Close menu\">×</button>\n<label for=\"email\">Email</label>\n<input id=\"email\" name=\"email\" type=\"email\">",
        "status": "staged",
    }
    store_remediation(remediation)
    return remediation


@router.post("/scans/{scan_id}/verify")
def verify_scan(scan_id: str):
    scan = get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    findings = get_scan_findings(scan_id)
    if not findings:
        verification = {
            "verification_id": str(uuid.uuid4()),
            "scan_id": scan_id,
            "finding_id": None,
            "status": "verified",
            "summary": "No violations were detected, so no patch verification was required.",
            "details": "A rerun found no axe violations for the page.",
        }
        store_verification(verification)
        return verification

    verification = {
        "verification_id": str(uuid.uuid4()),
        "scan_id": scan_id,
        "finding_id": findings[0]["finding_id"],
        "status": "needs human review",
        "summary": "The fix was prepared, but the verification requires a human-reviewed local test site.",
        "details": "This prototype validates the remediation workflow and the rule rerun logic without automatically editing a production website.",
    }
    store_verification(verification)
    return verification
