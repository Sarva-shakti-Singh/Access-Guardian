from __future__ import annotations

import re
from ipaddress import ip_address
from urllib.parse import urlparse


def validate_target_url(raw_url: str) -> str:
    if not raw_url or not isinstance(raw_url, str):
        raise ValueError("A target URL is required.")

    candidate = raw_url.strip()
    parsed = urlparse(candidate)

    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only public http:// and https:// URLs are allowed.")

    if not parsed.netloc:
        raise ValueError("The URL must include a valid hostname.")

    hostname = parsed.hostname.lower() if parsed.hostname else ""
    if not hostname:
        raise ValueError("The URL must include a valid hostname.")

    blocked_hosts = {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "169.254.169.254",
        "metadata.google.internal",
        "localhost.localdomain",
    }
    if hostname in blocked_hosts:
        raise ValueError("Localhost and metadata targets are not allowed.")

    try:
        ip = ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            raise ValueError("Private or internal network addresses are not allowed.")
    except ValueError:
        pass
    except TypeError:
        raise ValueError("Invalid target URL.")

    if re.search(r"(?:^|\.)(local|internal|intranet)(?:$|\.)", hostname):
        raise ValueError("Internal or private domains are not allowed.")

    return candidate
