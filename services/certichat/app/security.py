"""Opaque cookies, trusted proxy addresses, bounded requests and CSRF protection."""

import hashlib
import hmac
import ipaddress
import re
import secrets
from urllib.parse import urlsplit

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

COOKIE = "__Host-certichat"
LOCAL_COOKIE = "certichat-local"
SESSION_SECONDS = 30 * 24 * 60 * 60


class ChatError(Exception):
    def __init__(self, detail: str, status: int = 503, retry_after: int = 0, code: str | None = None):
        super().__init__(detail)
        self.status = status
        self.retry_after = retry_after
        self.code = code


def new_token():
    return secrets.token_urlsafe(32)


def token_digest(token):
    if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return None
    return hashlib.sha256(token.encode()).hexdigest()


def network_digest(address, secret):
    try:
        parsed = ipaddress.ip_address(address)
        network = str(parsed.ipv4_mapped or ipaddress.ip_network(f"{parsed}/64", strict=False)) \
            if isinstance(parsed, ipaddress.IPv6Address) else str(parsed)
    except ValueError:
        network = "unknown"
    return hmac.new(secret.encode(), network.encode(), hashlib.sha256).hexdigest()


def cookie_name(settings):
    if settings.local_voice_pilot:
        return "certichat-voice-pilot"
    return LOCAL_COOKIE if settings.mode == "LOCAL" else COOKIE


def set_cookie(response, token, settings):
    local = settings.mode == "LOCAL"
    response.set_cookie(cookie_name(settings), token, max_age=SESSION_SECONDS, httponly=True, secure=not local,
                        samesite="lax" if local else "none", path="/")
    if local:
        return
    # Python 3.12 lacks CHIPS serialization; append the standardized flag to this cookie only.
    header, value = response.raw_headers[-1]
    response.raw_headers[-1] = (header, value + b"; Partitioned")


class GuardMiddleware:
    def __init__(self, app):
        self.app = app
        self.cors = None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        settings = scope["app"].state.settings
        headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope["headers"]}
        try:
            host = urlsplit("//" + headers.get("host", "")).hostname
        except ValueError:
            host = None
        if host not in {urlsplit(settings.public_origin).hostname, "api", "certichat-api", "testserver", "localhost", "127.0.0.1", "::1"}:
            return await JSONResponse({"detail": "Host no permitido."}, 400)(scope, receive, send)
        if self.cors is None:
            self.cors = CORSMiddleware(self.checked_request, allow_origins=list(settings.allowed_origins),
                                      allow_credentials=True, allow_methods=["GET", "POST", "DELETE"],
                                      allow_headers=["Content-Type", "X-CertiChat", "Traceparent", "X-Request-ID"], expose_headers=["Retry-After", "Traceparent", "X-Request-ID"], max_age=600)
        await self.cors(scope, receive, send)

    async def checked_request(self, scope, receive, send):
        settings = scope["app"].state.settings
        headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope["headers"]}
        internal = scope["path"].startswith("/internal/")
        if internal:
            supplied = headers.get("authorization", "")
            purpose = next((purpose for purpose, token in (("chat", settings.chat_internal_token),
                           ("index", settings.index_internal_token))
                           if hmac.compare_digest(supplied, f"Bearer {token}")), None)
            if not purpose or "origin" in headers:
                return await JSONResponse({"detail": "Acceso denegado."}, 403)(scope, receive, send)
            scope["certichat_purpose"] = purpose
        elif scope["path"] != "/api/health":
            if headers.get("origin") not in settings.allowed_origins or headers.get("x-certichat") != "1":
                return await JSONResponse({"detail": "Origen de solicitud no permitido."}, 403)(scope, receive, send)
        body = b""
        if scope["method"] in ("POST", "DELETE", "PUT", "PATCH"):
            if headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
                return await JSONResponse({"detail": "Envía JSON."}, 415)(scope, receive, send)
            limit = 131072 if internal else 1350000 if scope["path"] == "/api/voice" else 16384 if scope["path"] == "/api/chat" else 8192
            try:
                length = int(headers.get("content-length", "0"))
                if length < 0 or length > limit:
                    return await JSONResponse({"detail": "Solicitud demasiado grande."}, 413)(scope, receive, send)
            except ValueError:
                return await JSONResponse({"detail": "Longitud no válida."}, 400)(scope, receive, send)
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body += message.get("body", b"")
                if len(body) > limit:
                    return await JSONResponse({"detail": "Solicitud demasiado grande."}, 413)(scope, receive, send)
                if not message.get("more_body", False):
                    break
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered and scope["method"] in ("POST", "DELETE", "PUT", "PATCH"):
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        async def secure_send(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).extend([
                    (b"cache-control", b"no-store"), (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"), (b"referrer-policy", b"no-referrer"),
                    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
                ])
            await send(message)

        await self.app(scope, bounded_receive, secure_send)
