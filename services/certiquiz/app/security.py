"""Opaque sessions and canonical client networks; no browser-side secrets."""

import hashlib
import ipaddress
import re
import secrets

HOST_COOKIE = "__Host-cq_host"
ROOM_COOKIE = "__Host-cq_room"
SESSION_SECONDS = 8 * 60 * 60


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str | None) -> str | None:
    if token is None or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return None
    return hashlib.sha256(token.encode()).hexdigest()


def client_network(address: str) -> str:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return "unknown"
    if isinstance(parsed, ipaddress.IPv6Address):
        if parsed.ipv4_mapped:
            return str(parsed.ipv4_mapped)
        return str(ipaddress.ip_network(f"{parsed}/64", strict=False))
    return str(parsed)
