"""Opt-in screenshot analysis. Output is always a *potential* observation for human review."""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

from ...config import Settings
from .provider import AIError, chat_json

SEVERITIES = {"critical", "serious", "moderate", "minor"}
SC = re.compile(r"^\d\.\d\.\d{1,2}$")

SYSTEM_PROMPT = (
    "You review a web page screenshot plus a small evidence summary for POTENTIAL accessibility barriers "
    "(for example low contrast, text over busy images, tiny targets, missing visible focus, unclear icons). "
    "You cannot confirm violations. Return JSON: {\"observations\": [{\"message\": str, \"wcag\": [\"1.4.3\"], "
    "\"severity\": \"critical|serious|moderate|minor\", \"selector\": str|null}]} with at most 5 items."
)


def configured(s: Settings) -> bool:
    return bool(s.vision_base_url and s.vision_model)


def analyze(s: Settings, screenshot: Path, evidence: dict) -> list[dict]:
    if not configured(s):
        raise AIError("Vision provider is not configured")
    raw = screenshot.read_bytes()
    if len(raw) > s.vision_max_image_bytes:
        raise AIError("Screenshot exceeds the configured image size limit")
    b64 = base64.b64encode(raw).decode()
    data = chat_json(
        s.vision_base_url, s.vision_model, s.vision_api_key,
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": json.dumps(evidence)[:4000]},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
            ]},
        ],
        timeout=s.vision_timeout,
    )
    out = []
    for item in (data.get("observations") or [])[:5]:
        if not isinstance(item, dict) or not isinstance(item.get("message"), str):
            continue
        sev = item.get("severity") if item.get("severity") in SEVERITIES else "unknown"
        wcag = [w for w in (item.get("wcag") or []) if isinstance(w, str) and SC.match(w)]
        sel = item.get("selector") if isinstance(item.get("selector"), str) else None
        out.append({"message": item["message"][:500], "severity": sev, "wcag": wcag, "selector": sel[:200] if sel else None})
    return out
