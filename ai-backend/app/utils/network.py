"""Network safety utilities."""
import ipaddress
import socket
from urllib.parse import urlparse


def assert_public_url(url: str) -> None:
    """Raise ValueError if URL resolves to a private/loopback/link-local IP.

    Prevents SSRF attacks against internal services (AWS IMDS, MinIO, Redis, etc.)
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if not host:
        raise ValueError(f"Cannot determine host from URL: {url}")
    try:
        ip_str = socket.gethostbyname(host)
        ip = ipaddress.ip_address(ip_str)
    except (socket.gaierror, ValueError) as exc:
        raise ValueError(f"Unresolvable or invalid host '{host}': {exc}") from exc
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
        raise ValueError(f"SSRF blocked: '{host}' resolves to non-public address {ip}")
