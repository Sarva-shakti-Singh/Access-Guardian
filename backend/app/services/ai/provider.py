"""Minimal OpenAI-compatible chat-completions client with strict JSON handling."""
from __future__ import annotations

import ipaddress
import json
from urllib.parse import urlsplit

import httpx


class AIError(Exception):
    pass


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
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        r = httpx.post(
            base_url.rstrip("/") + "/chat/completions",
            json={
                "model": model,
                "messages": messages,
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            headers=headers,
            timeout=timeout,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        data = json.loads(content)
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise AIError("AI provider request failed or returned an invalid response") from exc
    if not isinstance(data, dict):
        raise AIError("AI provider returned an unexpected JSON shape")
    return data
