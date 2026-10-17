"""Bounded, content-free runtime events; JSON stdout is ready for a log collector."""

from contextvars import ContextVar
from datetime import datetime, timezone
import json
import logging
import re
import secrets
import time
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

_context = ContextVar("certichat_log_context", default={})
logger = logging.getLogger("certichat.events")


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({"schema_version": 1, "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
                          "severity": record.levelname, "service": "certichat-api", "event": record.getMessage(),
                          **getattr(record, "fields", {})}, ensure_ascii=False, separators=(",", ":"))


def configure_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.handlers[:] = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False


def emit(event, **fields):
    level = logging.WARNING if fields.get("error") or fields.get("status", 0) >= 400 or event.endswith("failure") else logging.INFO
    logger.log(level, event, extra={"fields": {**_context.get(), **fields}})


class BrowserEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: Literal["state", "context", "capture", "speech", "api", "action", "navigation"]
    at: int = Field(ge=0, le=9999999999999)
    phase: Literal["off", "connecting", "listening", "thinking", "speaking", "paused"] | None = None
    active: bool | None = None
    muted: bool | None = None
    error: bool | None = None
    context_state: Literal["suspended", "running", "closed", "interrupted"] | None = None
    audio_session: Literal["auto", "playback", "play-and-record", "ambient", "transient", "transient-solo"] | None = None
    track_state: Literal["live", "ended"] | None = None
    track_muted: bool | None = None
    native_event: Literal["request", "start", "end", "error", "timeout"] | None = None
    native_error: Literal["not-allowed", "audio-busy", "audio-hardware", "network", "synthesis-unavailable", "synthesis-failed", "language-unavailable", "voice-unavailable", "text-too-long", "invalid-argument", "canceled", "interrupted", "unknown"] | None = None
    operation: Literal["session", "voice", "conversation"] | None = None
    status: int | None = Field(default=None, ge=100, le=599)
    request_id: str | None = Field(default=None, pattern=r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$")
    action: str | None = Field(default=None, pattern=r"^[a-z_]{1,40}$")
    automatic: bool | None = None
    platform: Literal["ios", "other"] | None = None
    page: str | None = Field(default=None, pattern=r"^/certitips/[A-Za-z0-9_./-]{0,160}$")


class BrowserBatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    events: list[BrowserEvent] = Field(min_length=1, max_length=12)


class EventMiddleware:
    def __init__(self, app):
        self.app = app
        configure_logging()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        parent = headers.get(b"traceparent", b"").decode("latin1")
        match = re.fullmatch(r"00-([0-9a-f]{32})-([0-9a-f]{16})-0[01]", parent)
        trace = match[1] if match and int(match[1], 16) and int(match[2], 16) else secrets.token_hex(16)
        span = secrets.token_hex(8)
        supplied_id = headers.get(b"x-request-id", b"").decode("latin1")
        request_id = supplied_id if re.fullmatch(r"[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}", supplied_id) else str(uuid4())
        token = _context.set({"trace_id": trace, "span_id": span, "request_id": request_id})
        started, status, error = time.monotonic(), 499, None

        async def observed_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", []).extend([(b"x-request-id", request_id.encode()), (b"traceparent", f"00-{trace}-{span}-01".encode())])
            await send(message)

        try:
            await self.app(scope, receive, observed_send)
        except BaseException as failure:
            status, error = 500, type(failure).__name__
            raise
        finally:
            if scope["path"] != "/api/health" or status >= 400:
                route = getattr(scope.get("route"), "path", "unmatched")
                emit("http.request", source="server", route=route, method=scope["method"], status=status,
                     duration_ms=round((time.monotonic() - started) * 1000), error_type=error)
            _context.reset(token)
