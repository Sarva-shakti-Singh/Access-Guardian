from pydantic import BaseModel, Field
from typing import List, Literal, Optional

ScanStatus = Literal["queued", "crawling", "analyzing", "complete", "failed"]
FindingSeverity = Literal["critical", "serious", "moderate", "minor"]


class ScanCreateRequest(BaseModel):
    target_url: str = Field(..., min_length=8, description="Public http/https URL to scan")
    max_pages: int = Field(1, ge=1, le=10)
    mode: str = "live"


class ScanStatusResponse(BaseModel):
    scan_id: str
    target_url: str
    status: ScanStatus
    title: Optional[str] = None
    pages_scanned: int = 0
    score: int = 100
    created_at: str
    updated_at: str


class FindingRecord(BaseModel):
    finding_id: str
    scan_id: str
    rule_id: str
    wcag: List[str] = []
    severity: FindingSeverity
    message: str
    selector: Optional[str] = None
    html_snippet: Optional[str] = None
    help_url: Optional[str] = None
    screenshot_path: Optional[str] = None
    page_url: str
    status: str = "open"
    source: str = "axe-core"


class RemediationSuggestion(BaseModel):
    remediation_id: str
    finding_id: str
    summary: str
    before: str
    after: str
    patch: Optional[str] = None
    status: str = "staged"


class VerificationResult(BaseModel):
    verification_id: str
    scan_id: str
    finding_id: str
    status: Literal["verified", "failed verification", "needs human review"]
    summary: str
    details: str


class ScanRecord(BaseModel):
    scan_id: str
    target_url: str
    status: ScanStatus
    title: Optional[str] = None
    page_url: Optional[str] = None
    pages_scanned: int = 0
    score: int = 100
    created_at: str
    updated_at: str
    findings: List[FindingRecord] = []
