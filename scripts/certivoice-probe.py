"""Prueba acotada del contrato de audio de OpenRouter; no despliega ni cambia topes.

Sin red: py -3 scripts/certivoice-probe.py --self-check
Con autorización de gasto: py -3 scripts/certivoice-probe.py --live \
    --private-env .private/certichat.env --ssh-key .private/probe-ssh-key \
    --ssh-target usuario@servidor --ssh-container api
Cada intento reserva USD 0.20 en el Store remoto; máximo cinco intentos.
Los errores o costes desconocidos conservan su reserva. No hay reintentos.
El informe contiene solo fixture sintético, contrato y costes; nunca claves.
"""
import argparse
import base64
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_CEILING
import io
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
import wave

RESERVE_MICRO = 200000
MAX_ATTEMPTS = 5
API = "https://openrouter.ai/api/v1/chat/completions"
MODELS = ("openai/gpt-audio-mini", "openai/gpt-audio")
PHRASE = "Explícame la red y abre el diagrama."
ANSWER = "Una red conecta dispositivos para intercambiar datos."
SCHEMA = {"type": "object", "additionalProperties": False, "properties": {
    "transcript": {"type": "string"}, "answer": {"type": "string"},
    "citations": {"type": "array", "items": {"type": "string", "enum": ["S1"]}},
    "action": {"type": "string", "enum": ["open_diagram", "none"]}},
    "required": ["transcript", "answer", "citations", "action"]}
ACCOUNTING = '''
import json, os
from decimal import Decimal
from uuid import UUID
from app.store import Store
store = Store(os.environ["CERTICHAT_DATABASE_URL"],
    index_budget_usd=Decimal(os.environ.get("CERTICHAT_INDEX_BUDGET_USD", "10")),
    chat_budget_usd=Decimal(os.environ.get("CERTICHAT_CHAT_BUDGET_USD", "10")))
try:
    store.open()
    if command["operation"] == "reserve":
        if command["micro"] != 200000: raise ValueError("reservation")
        result = {"reservation": str(store.reserve("chat", command["micro"]))}
    elif command["operation"] == "settle":
        reservation = UUID(command["reservation"])
        if not isinstance(command["micro"], int) or command["micro"] < 0: raise ValueError("cost")
        store.settle(reservation, command["micro"])
        with store.pool.connection() as connection:
            row = connection.execute("SELECT charged_micro,settled FROM cc_spend WHERE id=%s", (reservation,)).fetchone()
        if not row or not row["settled"] or row["charged_micro"] != command["micro"]: raise ValueError("settlement")
        result = {"settled": True, "charged_micro": row["charged_micro"]}
    else:
        result = {}
    with store.pool.connection() as connection:
        result.update(chat_spend_micro=store.spending(connection, "chat")["purpose"],
                      chat_limit_micro=store.monthly_limits["chat"])
    print(json.dumps(result))
except (Exception, KeyboardInterrupt) as error:
    print(json.dumps({"error_type": type(error).__name__, "operation": command["operation"]}))
finally:
    store.close()
'''


def ledger(args, operation, **values):
    """Reutiliza Store dentro del contenedor existente; no imprime su entorno."""
    command = json.dumps({"operation": operation, **values})
    code = "command = " + repr(json.loads(command)) + "\n" + ACCOUNTING
    ssh = Path(os.environ.get("WINDIR", "C:/Windows")) / "System32/OpenSSH/ssh.exe"
    result = subprocess.run([str(ssh), "-i", str(args.ssh_key),
        "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10",
        args.ssh_target, f"docker exec -i {args.ssh_container} python -"],
        input=code, text=True, encoding="utf-8", capture_output=True, timeout=25, check=False)
    if result.returncode:
        raise RuntimeError("SSH de contabilidad falló; revisar conexión sin mostrar secretos.")
    try:
        data = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise RuntimeError("La contabilidad no devolvió un resultado JSON válido.") from None
    if "error_type" in data:
        raise RuntimeError("Store bloqueó " + operation + ": " + data["error_type"])
    return data


def read_key(path):
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "OPENROUTER_API_KEY":
            key = value.strip()
            if len(key) >= 2 and key[0] in "\"'" and key[-1] == key[0]:
                key = key[1:-1]
            if key and not any(char.isspace() for char in key):
                return key
    raise ValueError("Falta OPENROUTER_API_KEY válida en el archivo privado indicado.")


def fixture(path):
    """Windows Speech genera una frase sintética, sin API ni grabación humana."""
    script = '''Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $spanish = $voice.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name.StartsWith('es') } | Select-Object -First 1
  if (-not $spanish) { throw 'No hay voz local en español.' }
  $voice.SelectVoice($spanish.VoiceInfo.Name)
  $voice.SetOutputToWaveFile($env:CERTIVOICE_FIXTURE_PATH)
  $voice.Speak($env:CERTIVOICE_FIXTURE_PHRASE)
} finally { $voice.Dispose() }
'''
    environment = dict(os.environ, CERTIVOICE_FIXTURE_PATH=str(path), CERTIVOICE_FIXTURE_PHRASE=PHRASE)
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
        env=environment, capture_output=True, text=True, timeout=20, check=False)
    if result.returncode or not path.is_file():
        raise RuntimeError("No se pudo generar fixture local español.")
    data = path.read_bytes()
    details = audio_details(data, "wav")
    if not 0 < details["seconds"] <= 12 or len(data) > 1500000:
        raise ValueError("Fixture fuera del límite de duración o tamaño.")
    return data, details


def audio_details(data, format_name):
    result = {"bytes": len(data), "format": format_name}
    if format_name == "pcm16":
        if len(data) % 2:
            raise ValueError("PCM incompleto.")
        result.update(seconds=len(data) / 48000, sample_rate=24000, channels=1, sample_width=2)
    else:
        with wave.open(io.BytesIO(data), "rb") as audio:
            result.update(seconds=audio.getnframes() / audio.getframerate(),
                          sample_rate=audio.getframerate(), channels=audio.getnchannels(),
                          sample_width=audio.getsampwidth())
    return result


def payload(model, mode, wav):
    source = "Fuente S1: " + ANSWER
    system = ("Prueba de contrato en español. " + source + " Transcribe al usuario literalmente. "
              "La respuesta debe ser exactamente: " + ANSWER + " La acción pedida es open_diagram. "
              "Si hay herramienta, entrega los cuatro campos mediante ella; no inventes más datos. "
              "Si hay JSON, usa los cuatro campos transcript, answer, citations, action; citations es [\"S1\"]. "
              "Si produces audio, di únicamente la respuesta, nunca JSON ni nombres de campos.")
    content = [{"type": "input_audio", "input_audio": {"data": base64.b64encode(wav).decode(), "format": "wav"}}]
    if mode == "audio_baseline":
        content = "Di exactamente en español: " + ANSWER
    elif mode == "audio_literal":
        system = "Eres un lector de texto en español. Reproduce literalmente y únicamente el texto del usuario. No añadas introducción, confirmación, explicación, despedida ni ninguna palabra. No cambies el texto."
        content = ANSWER
    elif mode == "answer_tool":
        content = PHRASE
    request = {"model": model, "messages": [{"role": "system", "content": system},
        {"role": "user", "content": content}], "max_tokens": 256, "stream": True,
        "provider": {"only": ["openai"], "allow_fallbacks": False, "require_parameters": True,
                     "data_collection": "deny"}}
    if mode not in ("input_tool", "answer_tool"):
        request.update(modalities=["text", "audio"], audio={"voice": "alloy", "format": "pcm16"})
    if mode in ("input_tool", "answer_tool", "audio_tool"):
        request.update(tools=[{"type": "function", "function": {"name": "submit_turn",
            "description": "Entrega transcripción, respuesta validable, citas y acción.",
            "parameters": SCHEMA}}], tool_choice={"type": "function", "function": {"name": "submit_turn"}})
    elif mode == "audio_json":
        request["response_format"] = {"type": "json_schema", "json_schema": {
            "name": "voice_turn", "strict": True, "schema": SCHEMA}}
    if mode == "grounded_tool":
        request["messages"] = [{"role": "system", "content":
            "Eres tutor de CertiTips. Responde exclusivamente desde las fuentes adjuntas usando la función voice_answer. "
            "kind=grounded para una explicación sustentada; citas solo IDs suministrados. No inventes hechos. "
            "No ejecutes acciones. continuity resume tema, objetivo y referencias, sin hechos nuevos. "
            "Respuesta breve en español: " + ANSWER}, {"role": "user", "content": [
                {"type": "text", "text": json.dumps({"question": PHRASE, "continuity": "", "history": [],
                    "fragments": [{"id": "S1", "title": "Redes", "text": ANSWER, "resource_type": "text"}]}, ensure_ascii=False)},
                {"type": "input_audio", "input_audio": {"data": base64.b64encode(wav).decode(), "format": "wav"}}]}]
        schema = {"type": "object", "additionalProperties": False, "properties": {
            "kind": {"type": "string", "enum": ["grounded", "conversation"]}, "answer": {"type": "string"},
            "citations": {"type": "array", "items": {"type": "string"}}, "continuity": {"type": "string"}},
            "required": ["kind", "answer", "citations", "continuity"]}
        request.update(stream=False, modalities=["text"], tools=[{"type": "function", "function": {
            "name": "voice_answer", "description": "Entrega una explicación respaldada y la ficha de continuidad.",
            "parameters": schema}}], tool_choice={"type": "function", "function": {"name": "voice_answer"}})
        request.pop("audio", None)
    return request


def consume(events, started):
    """Ensambla SSE por índice; nunca interpreta argumentos parciales."""
    result = {"content": "", "transcript": "", "audio_parts": [], "tools": {}, "usage": None,
              "finish_reasons": [], "events": 0, "audio_keys": [], "first_event_ms": None,
              "first_audio_ms": None, "done": False}
    for data in events:
        if data == "[DONE]":
            result["done"] = True
            break
        event = json.loads(data)
        result["events"] += 1
        if result["first_event_ms"] is None:
            result["first_event_ms"] = round((time.monotonic() - started) * 1000)
        if event.get("id"):
            result["generation_id"] = event["id"]
        if event.get("usage") is not None:
            result["usage"] = event["usage"]
        if event.get("error"):
            result["provider_error"] = event["error"]
        for choice in event.get("choices", []):
            if choice.get("finish_reason"):
                result["finish_reasons"].append(choice["finish_reason"])
            delta = choice.get("delta") or choice.get("message") or {}
            result["content"] += delta.get("content") or ""
            audio = delta.get("audio") or {}
            result["audio_keys"] = sorted(set(result["audio_keys"]) | set(audio))
            result["transcript"] += audio.get("transcript") or ""
            if audio.get("data"):
                if result["first_audio_ms"] is None:
                    result["first_audio_ms"] = round((time.monotonic() - started) * 1000)
                result["audio_parts"].append(audio["data"])
            for tool in delta.get("tool_calls") or []:
                target = result["tools"].setdefault(str(tool.get("index", 0)), {"name": "", "arguments": ""})
                function = tool.get("function") or {}
                target["name"] += function.get("name") or ""
                target["arguments"] += function.get("arguments") or ""
    result["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    return result


def sse_lines(response, started):
    total = 0
    data = []
    while True:
        line = response.readline(2000000)
        if not line:
            break
        total += len(line)
        if total > 8000000 or time.monotonic() - started > 50:
            raise ValueError("Respuesta excedió el límite del probe.")
        text = line.decode("utf-8").rstrip("\r\n")
        if not text:
            if data:
                yield "\n".join(data)
                data = []
        elif text.startswith("data:"):
            data.append(text[5:].lstrip())
    if data:
        yield "\n".join(data)


def request_once(request, key):
    started = time.monotonic()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    outgoing = urllib.request.Request(API, data=json.dumps(request).encode("utf-8"), method="POST",
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                 "HTTP-Referer": "https://jgangini.github.io/certitips/", "X-Title": "CertiVoice bounded contract probe"})
    try:
        with opener.open(outgoing, timeout=45) as response:
            if request["stream"]:
                return consume(sse_lines(response, started), started)
            raw = response.read(1000001)
            if len(raw) > 1000000:
                raise ValueError("JSON de respuesta demasiado grande.")
            return consume([raw.decode("utf-8"), "[DONE]"], started)
    except urllib.error.HTTPError as error:
        # El cuerpo solo puede contener nuestro fixture sintético; nunca encabezados de autorización.
        body = error.read(16000).decode("utf-8", errors="replace").replace(key, "[REDACTED]")
        try:
            failure = json.loads(body)
        except ValueError:
            failure = {"error": "HTTP response was not JSON"}
        return {"http_status": error.code, "provider_error": failure.get("error"),
                "usage": failure.get("usage"), "elapsed_ms": round((time.monotonic() - started) * 1000)}


def actual_micro(usage):
    if not isinstance(usage, dict) or "cost" not in usage or isinstance(usage["cost"], bool):
        raise ValueError("usage.cost ausente o inválido; reserva conservada.")
    try:
        cost = Decimal(str(usage["cost"]))
    except InvalidOperation:
        raise ValueError("usage.cost inválido; reserva conservada.") from None
    if not cost.is_finite() or cost < 0:
        raise ValueError("usage.cost fuera de rango; reserva conservada.")
    return int((cost * 1000000).to_integral_value(rounding=ROUND_CEILING))


def inspect_output(result, request, output, name):
    parts = result.pop("audio_parts", [])
    if parts:
        # ponytail: se acumula todo antes de reproducir; streaming audible requiere validación previa separada.
        audio = base64.b64decode("".join(parts), validate=True)
        format_name = request["audio"]["format"]
        path = output / (name + "." + ("pcm" if format_name == "pcm16" else "wav"))
        path.write_bytes(audio)
        result["audio"] = audio_details(audio, format_name)
        result["audio"]["path"] = str(path.resolve())
        result["audio"]["chunks"] = len(parts)
    metadata = []
    for tool in result.get("tools", {}).values():
        metadata.append(json.loads(tool["arguments"]))
    if result.get("content", "").strip().startswith("{"):
        metadata.append(json.loads(result["content"]))
    result["metadata"] = metadata
    result["metadata_valid"] = any(isinstance(value, dict) and set(value) == set(SCHEMA["required"])
        and value.get("answer") == ANSWER and value.get("citations") == ["S1"]
        and value.get("action") == "open_diagram" and isinstance(value.get("transcript"), str)
        and bool(value["transcript"].strip()) for value in metadata)
    if request.get("tools", [{}])[0].get("function", {}).get("name") == "voice_answer":
        result["metadata_valid"] = any(isinstance(value, dict) and set(value) == {"kind", "answer", "citations", "continuity"}
            and value.get("kind") == "grounded" and value.get("answer") == ANSWER and value.get("citations") == ["S1"]
            and isinstance(value.get("continuity"), str) and 0 < len(value["continuity"]) <= 1200 for value in metadata)
    result["audio_transcript_matches_approved"] = result.get("transcript", "").strip() == ANSWER


def self_check():
    events = [json.dumps({"id": "test", "choices": [{"delta": {"tool_calls": [{"index": 0,
        "function": {"name": "submit_turn", "arguments": "{\"action\":"}}]}}]}),
        json.dumps({"choices": [{"delta": {"tool_calls": [{"index": 0,
        "function": {"arguments": "\"none\"}"}}], "audio": {"data": "YQ==", "transcript": "a"}}}]}),
        json.dumps({"choices": [{"delta": {}, "finish_reason": "tool_calls"}],
        "usage": {"cost": 0.0000001}}), "[DONE]"]
    result = consume(events, time.monotonic())
    assert result["done"] and result["transcript"] == "a" and result["usage"]["cost"] == 0.0000001
    assert json.loads(result["tools"]["0"]["arguments"]) == {"action": "none"}
    assert actual_micro(result["usage"]) == 1
    for bad in ({}, {"cost": None}, {"cost": True}, {"cost": -1}, {"cost": "NaN"}):
        try:
            actual_micro(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("Coste inválido aceptado")
    assert audio_details(bytes(48000), "pcm16")["seconds"] == 1
    assert list(sse_lines(io.BytesIO(b': ping\ndata: {"a":1}\n\ndata: [DONE]\n\n'), time.monotonic())) == ['{"a":1}', '[DONE]']
    assert "Authorization" not in json.dumps(payload(MODELS[0], "input_tool", b"synthetic"))
    from unittest.mock import patch
    args = argparse.Namespace(ssh_key=Path("fixture-key"), ssh_target="tester@fixture.invalid", ssh_container="fixture-api")
    with patch("subprocess.run", return_value=subprocess.CompletedProcess([], 0, stdout="{}")) as run:
        assert ledger(args, "status") == {}
        command = run.call_args.args[0]
        assert command[1:3] == ["-i", "fixture-key"]
        assert command[-2:] == [args.ssh_target, "docker exec -i fixture-api python -"]
    print("Self-check: PASS (SSE fragmentado, tools, usage final no vacío, costes, PCM y SSH explícito simulado).")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--live", action="store_true", help="Requiere autorización humana de gasto previa.")
    parser.add_argument("--private-env", type=Path)
    parser.add_argument("--ssh-key", type=Path, help="Ruta explícita de la identidad SSH para el ledger.")
    parser.add_argument("--ssh-target", help="Destino SSH explícito, por ejemplo usuario@servidor.")
    parser.add_argument("--ssh-container", help="Nombre explícito del contenedor que contiene Store.")
    parser.add_argument("--output-dir", type=Path, default=Path("output/certivoice-probe"))
    parser.add_argument("--case", action="append", choices=("mini_audio_literal", "mini_grounded_tool", "full_grounded_tool", "full_input_tool", "full_answer_tool", "full_audio_literal"))
    parser.add_argument("--max-attempts", type=int, choices=range(1, MAX_ATTEMPTS + 1), default=MAX_ATTEMPTS)
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    if not args.live or args.private_env is None:
        parser.error("Usa --self-check, o --live con --private-env después de autorizar el gasto.")
    if args.ssh_key is None or not args.ssh_key.is_file():
        parser.error("Indica un archivo existente mediante --ssh-key.")
    if not args.ssh_target or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.@-]{0,254}", args.ssh_target):
        parser.error("Indica un destino SSH válido mediante --ssh-target.")
    if not args.ssh_container or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", args.ssh_container):
        parser.error("Indica un nombre de contenedor válido mediante --ssh-container.")
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    report_path = output / "report.json"
    if report_path.exists():
        parser.error("El directorio ya tiene informe: indica uno nuevo para evitar duplicar intentos.")
    key = read_key(args.private_env)
    wav, details = fixture(output / "fixture-es.wav")
    report = {"started_at": datetime.now(timezone.utc).isoformat(), "max_exposure_usd": str(Decimal(RESERVE_MICRO * min(args.max_attempts, len(args.case) if args.case else MAX_ATTEMPTS)) / 1000000),
              "reservation_per_attempt_usd": "0.20", "human_audio_quality": "not evaluated",
              "fixture": {"phrase": PHRASE, **details}, "attempts": []}
    def save():
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    save()
    cases = [(MODELS[0], "audio_baseline"), (MODELS[0], "input_tool"),
             (MODELS[0], "audio_tool"), (MODELS[0], "audio_json"), (MODELS[1], "audio_json")]
    if args.case:
        cases = [(MODELS[0] if case.startswith("mini_") else MODELS[1], case.split("_", 1)[1]) for case in args.case]
    try:
        report["initial_ledger"] = ledger(args, "status")
        save()
        for number, (model, mode) in enumerate(cases[:args.max_attempts], 1):
            request = payload(model, mode, wav)
            item = {"number": number, "model": model, "mode": mode, "max_tokens": 256,
                    "reserved_micro": RESERVE_MICRO, "settled": False}
            report["attempts"].append(item)
            save()
            reservation = ledger(args, "reserve", micro=RESERVE_MICRO)
            item.update(reservation=reservation["reservation"], ledger_after_reserve=reservation)
            save()
            result = request_once(request, key)
            item["result"] = result
            # Persistir usage antes de cualquier validación de audio/metadatos.
            audio_parts = result.pop("audio_parts", [])
            save()
            micro = actual_micro(result.get("usage"))
            ledger(args, "settle", reservation=item["reservation"], micro=micro)
            item.update(settled=True, charged_micro=micro)
            if micro > RESERVE_MICRO:
                raise ValueError("Coste superior a la reserva; detener pruebas.")
            result["audio_parts"] = audio_parts
            try:
                inspect_output(result, request, output, f"{number}-{mode}")
            except (ValueError, wave.Error) as error:
                result.pop("audio_parts", None)
                result["validation_error"] = type(error).__name__
            save()
            print(json.dumps({"attempt": number, "model": model, "mode": mode,
                "charged_usd": str(Decimal(micro) / 1000000), "elapsed_ms": result.get("elapsed_ms"),
                "audio_bytes": result.get("audio", {}).get("bytes", 0),
                "metadata_valid": result.get("metadata_valid", False)}, ensure_ascii=False), flush=True)
        report["status"] = "completed"
    except (Exception, KeyboardInterrupt) as error:
        report.update(status="stopped", stop_reason=str(error).replace(key, "[REDACTED]")[:500],
                      stop_type=type(error).__name__)
    finally:
        report["accounted_micro"] = sum(item.get("charged_micro", RESERVE_MICRO if item.get("reservation") else 0)
            for item in report["attempts"])
        save()
    print(json.dumps({"status": report["status"], "report": str(report_path),
        "accounted_usd": str(Decimal(report["accounted_micro"]) / 1000000),
        "stop_reason": report.get("stop_reason")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
