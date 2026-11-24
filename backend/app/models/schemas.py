class AIFixRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    consent_to_send_context: Literal[True]
    rule_id: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=1000)
    element: str = Field(min_length=1, max_length=5000)
    context: str = Field(default="", max_length=2000)
    expected_provider: str = Field(min_length=1, max_length=500)
    expected_model: str = Field(min_length=1, max_length=200)


class AIFixStatus(BaseModel):
    configured: bool
    provider: Optional[str] = None
    model: Optional[str] = None
    configuration_error: Optional[str] = None


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
