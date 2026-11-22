"""Target validation (SSRF defense-in-depth) and best-effort redaction."""
from __future__ import annotations

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit


class UnsafeTarget(ValueError):
    pass


@dataclass(frozen=True)
class Target:
    url: str
    host: str
    port: int
    ip: str
    scheme: str


def resolve_public(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeTarget("Host could not be resolved") from exc
    ips: list[str] = []
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global:
            raise UnsafeTarget("Target resolves to a non-public address")
        ips.append(str(ip))
    if not ips:
        raise UnsafeTarget("Host has no public address")
    return ips


def validate_target(url: str, allowed_ports: frozenset[int] | set[int]) -> Target:
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError as exc:
        raise UnsafeTarget("Invalid URL") from exc
    if parts.scheme not in ("http", "https"):
        raise UnsafeTarget("Only http and https URLs can be scanned")
    if not parts.hostname:
        raise UnsafeTarget("URL has no host")
    if parts.username or parts.password:
        raise UnsafeTarget("URLs with embedded credentials are not accepted")
    port = port or (443 if parts.scheme == "https" else 80)
    if port not in allowed_ports:
        raise UnsafeTarget(f"Port {port} is not in the allowed scan ports")
    host = parts.hostname.lower()
    ips = resolve_public(host, port)
    netloc = host if ":" not in host else f"[{host}]"
    if parts.port:
        netloc += f":{parts.port}"
    clean = urlunsplit((parts.scheme, netloc, parts.path or "/", "", ""))
    return Target(url=clean, host=host, port=port, ip=ips[0], scheme=parts.scheme)


_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_VALUE_ATTR = re.compile(r'(\bvalue\s*=\s*)(".*?"|\'.*?\')', re.I | re.S)
_LONG_TOKEN = re.compile(r"\b[A-Za-z0-9_\-]{32,}\b")


def redact(text: str | None, limit: int = 600) -> str | None:
    if text is None:
        return None
    text = _VALUE_ATTR.sub(r'\1"[redacted]"', text)
    text = _EMAIL.sub("[email]", text)
    text = _LONG_TOKEN.sub("[token]", text)
    return text[:limit]
