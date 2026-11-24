class AIFixRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    consent_to_send_context: Literal[True]
    rule_id: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=1000)
    element: str = Field(min_length=1, max_length=5000)
    context: str = Field(default="", max_length=2000)
    expected_provider: str = Field(min_length=1, max_length=500)
    expected_model: str = Field(min_length=1, max_length=200)
