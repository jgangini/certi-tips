"""Literal multilingual TTS through OpenRouter; one reviewed female speaker."""

import base64
from decimal import Decimal, InvalidOperation, ROUND_CEILING
import re
import time

import anyio
import httpx
import psycopg

from .security import ChatError
from .telemetry import emit

MODEL = "fish-audio/drama-3"
# Fish Official: https://fish.audio/m/f3a2b90078d54a65af4b95f63bc7798e/
VOICE = "f3a2b90078d54a65af4b95f63bc7798e"  # Sheila, female; kept across all languages.
SPEECH = {"model": MODEL, "voice": VOICE, "name": "Sheila"}


async def synthesize(settings, store, client, text):
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= 5000 or any(ord(c) < 32 and c not in "\n\t" for c in text):
        raise ChatError("La narración no es válida.", 422)
    # Keep spelling, numbers and punctuation; formatting and Fish control tags are not spoken.
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]*>|[\[\]*_`#]", "", text).strip()
    if not text:
        raise ChatError("La narración está vacía.", 422)
    # ponytail: reserve the reviewed non-promotional $10/M UTF-8 bytes; higher billing rejects this audio for review.
    reserved = len(text.encode("utf-8")) * 10
    reservation = await anyio.to_thread.run_sync(store.reserve, "chat", reserved, "voice")
    headers = {"Authorization": f"Bearer {settings.openrouter_api_key}", "HTTP-Referer": settings.site_url,
               "X-Title": "CertiTips narration"}
    started = time.monotonic()
    phase, generation = "synthesis", ""
    try:
        with anyio.fail_after(50):
            content = bytearray()
            async with client.stream("POST", "https://openrouter.ai/api/v1/audio/speech", headers=headers,
                                     json={"model": MODEL, "voice": VOICE, "input": text, "response_format": "mp3",
                                           "provider": {"data_collection": "deny"}}, timeout=40) as response:
                response.raise_for_status()
                generation = response.headers.get("x-generation-id", "")
                if not re.fullmatch(r"gen-[A-Za-z0-9_-]{1,180}", generation):
                    raise ValueError("Missing generation identity")
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > 8000000:
                        raise ValueError("Speech exceeds byte limit")
                valid_audio = (response.headers.get("content-type", "").split(";")[0].strip().lower() == "audio/mpeg"
                               and len(content) > 3 and (content[:3] == b"ID3" or content[0] == 255 and content[1] & 224 == 224))
            if not valid_audio:
                raise ValueError("Invalid MP3")
    except (httpx.HTTPError, ValueError, InvalidOperation, TimeoutError, KeyError, TypeError, AttributeError) as error:
        emit("speech.failure", source="server", model=MODEL, voice=VOICE, phase=phase,
             generation_id=generation if re.fullmatch(r"gen-[A-Za-z0-9_-]{1,180}", generation) else None,
             status=error.response.status_code if isinstance(error, httpx.HTTPStatusError) else None,
             error=type(error).__name__)
        # An uncertain bill stays reserved; no silent switch to another model or voice.
        raise ChatError("La respuesta está disponible como texto. El audio no está disponible.", 502, code="voice_speech") from None
    emit("speech.complete", source="server", model=MODEL, voice=VOICE, generation_id=generation,
         reserved_micro=reserved, duration_ms=round((time.monotonic()-started)*1000))
    return ({"format": "mp3", "data": base64.b64encode(content).decode(), **SPEECH},
            (generation, reservation, reserved))


async def settle_speech(settings, store, client, generation, reservation, reserved):
    """Usage is eventually consistent: retain the reservation while audio already plays."""
    try:
        with anyio.fail_after(60):
            for delay in (0, 1, 2, 4, 8, 8, 8):
                await anyio.sleep(delay)
                usage = await client.get("https://openrouter.ai/api/v1/generation", params={"id": generation},
                                         headers={"Authorization": f"Bearer {settings.openrouter_api_key}"}, timeout=5)
                if usage.status_code == 404:
                    continue
                usage.raise_for_status()
                data = usage.json()["data"]
                if data.get("id") != generation or data.get("model") not in (MODEL, "fish-audio/drama-3-20261013"):
                    raise ValueError("Usage identity mismatch")
                charged = Decimal(str(data.get("total_cost")))
                if not charged.is_finite() or charged < 0:
                    raise ValueError("Unverified cost")
                actual = int((charged * 1000000).to_integral_value(rounding=ROUND_CEILING))
                await anyio.to_thread.run_sync(store.settle, reservation, actual)
                emit("speech.usage", source="server", model=MODEL, voice=VOICE, generation_id=generation,
                     charged_micro=actual, error=actual > reserved)
                return actual <= reserved
    except (httpx.HTTPError, ValueError, InvalidOperation, TimeoutError, KeyError, TypeError, AttributeError, psycopg.Error):
        pass
    # ponytail: no retry queue/database migration; unknown bills remain fully reserved after shutdown/timeout.
    emit("speech.usage_pending", source="server", model=MODEL, generation_id=generation, reserved_micro=reserved)
    return None
