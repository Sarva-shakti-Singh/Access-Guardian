"""Pydantic request/response models matching docs/api-contract.yaml."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ScanCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_url: str = Field(min_length=8, max_length=2048)
    max_pages: int = Field(default=1, ge=1, le=10)
    max_depth: int = Field(default=1, ge=0, le=3)
    timeout_seconds: int = Field(default=20, ge=5, le=60)
    mode: Literal["live"] = "live"
    analyze_with_ai: bool = False
    consent_to_ai_analysis: Optional[bool] = None

    @model_validator(mode="after")
    def _ai_needs_consent(self) -> "ScanCreateRequest":
        if self.analyze_with_ai and self.consent_to_ai_analysis is not True:
            raise ValueError("consent_to_ai_analysis must be true when analyze_with_ai is true")
        return self


class Finding(BaseModel):
    finding_id: str
    scan_id: str
    rule_id: str
    wcag: list[str] = []
    severity: Literal["critical", "serious", "moderate", "minor", "unknown"]
    message: str
    selector: Optional[str] = None
    html_snippet: Optional[str] = None
    page_url: str
    source: str
    confidence: Literal["confirmed", "potential"]
    title: Optional[str] = None
    category: Optional[str] = None
    evidence: dict[str, Any] = {}
    screenshot_available: bool = False
    page_index: int = 0


class ScanRecord(BaseModel):
    scan_id: str
    target_url: str
    status: Literal["queued", "crawling", "analyzing", "complete", "partial", "failed", "cancelled"]
    title: Optional[str] = None
    page_url: Optional[str] = None
    pages_scanned: int = 0
    score: Optional[int] = None  # always null: no conformance score is computed
    ai_analysis_status: Literal["disabled", "pending", "complete", "partial", "unavailable"] = "disabled"
    findings: list[Finding] = []
    finding_count: int = 0
    pages: list[dict[str, Any]] = []
    errors: list[str] = []
    created_at: Optional[float] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None


class AIFixStatus(BaseModel):
    configured: bool
    provider: Optional[str] = None
    model: Optional[str] = None
    configuration_error: Optional[str] = None


class AIFixRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    consent_to_send_context: Literal[True]
    rule_id: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=1000)
    element: str = Field(min_length=1, max_length=5000)
    context: str = Field(default="", max_length=2000)
    expected_provider: str = Field(max_length=500)
    expected_model: str = Field(max_length=200)

    @model_validator(mode="after")
    def _bounded_text_fields(self) -> "AIFixRequest":
        if not self.rule_id.strip():
            raise ValueError("rule_id must not be blank")
        if not self.message.strip():
            raise ValueError("message must not be blank")
        if not self.element.strip():
            raise ValueError("element must not be blank")
        if not self.expected_provider.strip():
            raise ValueError("expected_provider must not be blank")
        if not self.expected_model.strip():
            raise ValueError("expected_model must not be blank")
        return self


class AIFixResponse(BaseModel):
    replacement: str = Field(min_length=1, max_length=5000)


class AIVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule_id: str = Field(min_length=1, max_length=80)
    element: str = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def _not_blank(self) -> "AIVerifyRequest":
        if not self.rule_id.strip() or not self.element.strip():
            raise ValueError("rule_id and element must not be blank")
        return self


class AIVerifyResponse(BaseModel):
    status: Literal["complete", "inconclusive"]
    outcome: Literal["resolved", "partially_resolved", "unresolved", "inconclusive"]
    rule_id: str
    message: str
    remaining_violations: int = Field(ge=0)
    remaining_incomplete: int = Field(ge=0)
    human_review_required: Literal[True] = True


class RemediateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    consent_to_send_context: Literal[True]


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["accept", "reject"]
