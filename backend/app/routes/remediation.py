from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..database.store import ACTIVE, Store, get_store
from ..models.schemas import (
    AIFixRequest,
    AIFixResponse,
    AIFixStatus,
    AIVerifyRequest,
    AIVerifyResponse,
    DecisionRequest,
    RemediateRequest,
)
from ..models.serializers import remediation_record
from ..services.ai import fix
from ..services.ai.provider import AIError, check_provider_url, sanitize_provider
from ..services.ai.verify import VerificationError, verify_element
from ..services.security import UnsafeTarget, validate_target
from .scans import check_scan_capacity, submit_scan

router = APIRouter(tags=["remediation"])


def _provider():
    s = get_settings()
    if not s.ai_base_url.strip():
        raise HTTPException(503, "ACCESS_GUARDIAN_AI_BASE_URL is missing")
    if not s.ai_model.strip():
        raise HTTPException(503, "ACCESS_GUARDIAN_AI_MODEL is missing")
    try:
        check_provider_url(s.ai_base_url)
    except AIError as exc:
        raise HTTPException(503, str(exc)) from exc
    if s.ai_base_url.strip().lower().startswith("https://") and not s.ai_api_key.strip():
        raise HTTPException(503, "ACCESS_GUARDIAN_AI_API_KEY is missing")
    if not s.ai_api_key.strip() and s.ai_base_url.strip().lower().startswith("http://"):
        # Loopback providers may be unauthenticated.
        pass
    return s


@router.get("/api/agent/status", response_model=AIFixStatus)
def agent_status():
    s = get_settings()
    configuration_error = None
    if not s.ai_base_url.strip():
        configuration_error = "ACCESS_GUARDIAN_AI_BASE_URL is missing"
    elif not s.ai_model.strip():
        configuration_error = "ACCESS_GUARDIAN_AI_MODEL is missing"
    else:
        try:
            check_provider_url(s.ai_base_url)
        except AIError as exc:
            configuration_error = str(exc)
        if not configuration_error and s.ai_base_url.strip().lower().startswith("https://") and not s.ai_api_key.strip():
            configuration_error = "ACCESS_GUARDIAN_AI_API_KEY is missing"
    configured = configuration_error is None
    return AIFixStatus(
        configured=configured,
        provider=sanitize_provider(s.ai_base_url) if configured else None,
        model=s.ai_model if configured else None,
        configuration_error=configuration_error,
    )


def _propose(s, rule_id: str, message: str, element: str, context: str) -> str:
    try:
        return fix.propose(s.ai_base_url, s.ai_model, s.ai_api_key, rule_id, message, element, context)
    except AIError as exc:
        if exc.status_code in {400, 404}:
            raise HTTPException(422, str(exc)) from exc
        if exc.category in {"http", "timeout", "connection", "configuration"} or exc.status_code in {401, 403, 429, 500, 502, 503, 504}:
            raise HTTPException(503, str(exc)) from exc
        raise HTTPException(422, str(exc)) from exc


@router.post("/api/agent/fix", response_model=AIFixResponse)
def agent_fix(req: AIFixRequest):
    s = _provider()
    if req.expected_provider != sanitize_provider(s.ai_base_url) or req.expected_model != s.ai_model:
        raise HTTPException(409, "AI provider destination changed after consent was given")
    if req.rule_id not in fix.SUPPORTED_RULES:
        raise HTTPException(422, "Rule is not supported for automated proposals")
    return AIFixResponse(replacement=_propose(s, req.rule_id, req.message, req.element, req.context))


@router.post("/api/agent/verify", response_model=AIVerifyResponse)
def agent_verify(req: AIVerifyRequest):
    try:
        return AIVerifyResponse(**verify_element(req.rule_id, req.element))
    except VerificationError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/api/findings/{finding_id}/remediate")
def remediate(finding_id: str, _req: RemediateRequest):
    store = get_store()
    finding = store.get_finding(finding_id)
    if not finding:
        raise HTTPException(404, "Finding not found")
    s = _provider()
    if finding["rule_id"] not in fix.SUPPORTED_RULES or not finding["html_snippet"]:
        raise HTTPException(422, "This finding is not supported for automated proposals")
    scan = store.get_scan(finding["scan_id"]) or {}
    replacement = _propose(
        s, finding["rule_id"], finding["message"], finding["html_snippet"], f"Page title: {scan.get('title') or ''}"
    )
    return remediation_record(store.create_remediation(finding, replacement, s.ai_model))


def _rem_or_404(rid: str) -> dict:
    row = get_store().get_remediation(rid)
    if not row:
        raise HTTPException(404, "Remediation not found")
    return row


@router.get("/api/remediations/{remediation_id}")
def get_remediation(remediation_id: str):
    return remediation_record(_rem_or_404(remediation_id))


@router.get("/api/scans/{scan_id}/remediations")
def list_scan_remediations(scan_id: str):
    store = get_store()
    if not store.get_scan(scan_id):
        raise HTTPException(404, "Scan not found")
    return [remediation_record(row) for row in store.list_remediations(scan_id)]


@router.post("/api/remediations/{remediation_id}/decision")
def decide(remediation_id: str, req: DecisionRequest):
    _rem_or_404(remediation_id)
    return remediation_record(get_store().set_decision(remediation_id, req.decision))  # type: ignore[arg-type]


@router.get("/api/remediations/{remediation_id}/verification")
def get_verification(remediation_id: str):
    store = get_store()
    rem = _rem_or_404(remediation_id)
    if not rem.get("verification_scan_id"):
        raise HTTPException(404, "No verification scan has been started")
    scan = store.get_scan(rem["verification_scan_id"])
    if not scan:
        raise HTTPException(404, "Verification scan not found")
    return _verification_result(store, rem, scan)


@router.post("/api/remediations/{remediation_id}/verification")
def create_verification(remediation_id: str):
    store = get_store()
    rem = _rem_or_404(remediation_id)
    if rem["decision"] != "accept":
        raise HTTPException(409, "Accept the proposal for review before starting a verification scan")
    original_scan = store.get_scan(rem["scan_id"])
    finding = store.get_finding(rem["finding_id"])
    if not original_scan or not finding:
        raise HTTPException(404, "Original scan or finding not found")

    scan_id = rem.get("verification_scan_id")
    created = False
    if not scan_id:
        settings = get_settings()
        try:
            original_target = validate_target(original_scan["target_url"], settings.allowed_ports)
            page_target = validate_target(finding["page_url"], settings.allowed_ports)
        except UnsafeTarget as exc:
            raise HTTPException(400, str(exc)) from exc
        if (original_target.scheme, original_target.host, original_target.port) != (
            page_target.scheme, page_target.host, page_target.port
        ):
            raise HTTPException(400, "Finding page is outside the original scan's origin")

        check_scan_capacity(store)
        config = {
            "max_pages": 1,
            "max_depth": 0,
            "timeout_seconds": original_scan["config"].get("timeout_seconds", 20),
            "mode": "live",
            "analyze_with_ai": False,
            "consent_to_ai_analysis": None,
        }
        scan_id, created = store.create_verification_scan(
            remediation_id, page_target.url, config
        )
        if not scan_id:
            raise HTTPException(404, "Remediation not found")
    scan = store.get_scan(scan_id)
    if not scan:
        raise HTTPException(404, "Verification scan not found")
    if created:
        submit_scan(scan_id, store)
    return _verification_result(store, rem, scan)


def _verification_result(store: Store, rem: dict, scan: dict) -> dict:
    finding = store.get_finding(rem["finding_id"])
    if not finding:
        raise HTTPException(404, "Original finding not found")
    matching = [
        item for item in store.list_findings(scan_id=scan["scan_id"], limit=500)
        if item["rule_id"] == finding["rule_id"] and item["page_url"] == finding["page_url"]
    ]

    result = None
    if scan["status"] not in ACTIVE:
        page_scanned = any(
            page.get("url") == finding["page_url"] and page.get("status") == "complete"
            for page in scan["pages"]
        )
        if scan["status"] in ("failed", "cancelled") or not page_scanned:
            outcome = "inconclusive"
            message = "The original page could not be fully rescanned; the finding's status is unknown."
        elif matching:
            outcome = "still_detected"
            message = "The same axe-core rule is still reported on the rescanned page."
        else:
            outcome = "not_detected"
            message = "The rule was not reported on the rescanned page. This is not proof of accessibility or WCAG conformance."
        result = {
            "outcome": outcome,
            "rule_id": finding["rule_id"],
            "page_url": finding["page_url"],
            "remaining_count": len(matching),
            "human_review_required": True,
            "message": message,
        }

    return {
        "remediation_id": rem["remediation_id"],
        "scan_id": scan["scan_id"],
        "status": scan["status"],
        "result": result,
    }
