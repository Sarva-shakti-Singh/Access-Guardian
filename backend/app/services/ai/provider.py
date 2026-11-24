"""Minimal OpenAI-compatible chat-completions client with strict JSON handling."""
from __future__ import annotations

import ipaddress
import json
import logging
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger("access_guardian.ai")


class AIError(Exception):
    def __init__(self, message: str, status_code: int | None = None, category: str = "provider") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.category = category


def sanitize_provider(base_url: str) -> str | None:
    """Return scheme://host[:port]/path with no credentials, query or fragment."""
    if not base_url:
        return None
    p = urlsplit(base_url)
    if not p.hostname:
        return None
    host = p.hostname if ":" not in p.hostname else f"[{p.hostname}]"
    netloc = host + (f":{p.port}" if p.port else "")
    return f"{p.scheme}://{netloc}{p.path.rstrip('/')}"


def _is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def check_provider_url(base_url: str) -> None:
    p = urlsplit(base_url)
    if p.scheme == "https":
        return
    if p.scheme == "http" and p.hostname and _is_loopback(p.hostname):
        return
    raise AIError("Remote AI providers must use HTTPS")


def chat_json(base_url: str, model: str, api_key: str, messages: list[dict], timeout: float = 35.0) -> dict:
    check_provider_url(base_url)
    base_url = base_url.strip().rstrip("/")
    p = urlsplit(base_url)
    if p.scheme == "https" and not api_key.strip():
        raise AIError("ACCESS_GUARDIAN_AI_API_KEY is missing", category="configuration")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    } if api_key else {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if base_url.endswith("/chat/completions"):
        endpoint = base_url
    else:
        endpoint = base_url + "/chat/completions"
    try:
        r = httpx.post(
            endpoint,
            json={
                "model": model,
                "messages": messages,
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            headers=headers,
            timeout=timeout,
        )
    except httpx.TimeoutException as exc:
        raise AIError("AI provider request timed out", category="timeout") from exc
    except httpx.RequestError as exc:
        raise AIError("Could not connect to the AI provider", category="connection") from exc

    if r.status_code == 400:
        raise AIError("AI provider rejected the request (HTTP 400: invalid request or unsupported model parameter)", r.status_code, "http")
    if r.status_code == 401:
        raise AIError("AI provider authentication failed (HTTP 401)", r.status_code, "http")
    if r.status_code == 403:
        raise AIError("AI provider denied access (HTTP 403)", r.status_code, "http")
    if r.status_code == 404:
        raise AIError("AI provider endpoint or model was not found (HTTP 404)", r.status_code, "http")
    if r.status_code == 429:
        raise AIError("AI provider rate limit or quota exceeded (HTTP 429)", r.status_code, "http")
    if r.status_code in (500, 502, 503, 504):
        raise AIError(f"AI provider service is unavailable (HTTP {r.status_code})", r.status_code, "http")
    if not 200 <= r.status_code < 300:
        raise AIError(f"AI provider returned HTTP {r.status_code}", r.status_code, "http")

    try:
        response = r.json()
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("AI provider returned invalid JSON")
        raise AIError("AI provider returned invalid JSON") from exc

    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        logger.warning("AI provider returned unexpected response structure")
        raise AIError("AI provider returned an unexpected response format")
    if isinstance(content, list):
        content = "".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        )
    if not isinstance(content, str) or not content.strip():
        raise AIError("AI provider returned empty response content")
    try:
        data = json.loads(content.strip())
    except json.JSONDecodeError as exc:
        stripped = content.strip()
        if stripped.startswith("```"):
            lines = stripped.splitlines()
            stripped = "\n".join(lines[1:-1]).strip()
            try:
                data = json.loads(stripped)
            except json.JSONDecodeError:
                raise AIError("AI provider response was not valid JSON") from exc
        else:
            raise AIError("AI provider response was not valid JSON") from exc
    if not isinstance(data, dict):
        raise AIError("AI provider returned an unexpected JSON shape")
    return data
