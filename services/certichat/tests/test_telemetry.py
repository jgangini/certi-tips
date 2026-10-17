"""Operational metadata never accepts prompts, audio or arbitrary log text."""

import json
import logging

import pytest
from pydantic import ValidationError

from app.telemetry import BrowserBatch, BrowserEvent, JsonFormatter


def test_browser_event_schema_is_bounded_and_content_free():
    event = {"name": "speech", "at": 1, "native_event": "error", "native_error": "not-allowed"}
    assert BrowserBatch(events=[BrowserEvent(**event)]).events[0].native_error == "not-allowed"
    for extra in ({"transcript": "private words"}, {"audio": "private PCM"}, {"cookie": "secret"}, {"action": "newline\nforged"}, {"page": "/certitips/es/?token=secret"}):
        with pytest.raises(ValidationError):
            BrowserEvent(**(event | extra))
    with pytest.raises(ValidationError):
        BrowserBatch(events=[BrowserEvent(**event)] * 13)
    record = logging.LogRecord("certichat.events", logging.INFO, "", 0, "voice.complete", (), None)
    record.fields = {"trace_id": "a" * 32, "duration_ms": 12}
    result = json.loads(JsonFormatter().format(record))
    assert result["event"] == "voice.complete" and result["trace_id"] == "a" * 32
    assert result["timestamp"].endswith("+00:00") and result["schema_version"] == 1
