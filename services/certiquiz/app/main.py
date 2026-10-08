"""Independent HTTP API for the CertiQuiz frontend hosted on GitHub Pages."""

from contextlib import asynccontextmanager
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

from anyio.to_thread import current_default_thread_limiter
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import psycopg
from pydantic import BaseModel, ConfigDict, Field

from . import game
from .catalog import Catalog
from .security import (HOST_COOKIE, ROOM_COOKIE, SESSION_SECONDS, new_token, token_digest,
                       client_network)
from .store import Store


@dataclass(frozen=True)
class Settings:
    database_url: str
    public_origin: str
    allowed_origins: tuple[str, ...]
    secure_cookies: bool = True
    data_dir: Path = Path("/app/data")

    def validate(self):
        if not self.allowed_origins or len(self.allowed_origins) > 8:
            raise ValueError("CERTIQUIZ_ALLOWED_ORIGINS requiere una lista explícita de orígenes.")
        for origin in (self.public_origin, *self.allowed_origins):
            parsed = urlsplit(origin)
            if (parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password
                    or parsed.path or parsed.query or parsed.fragment or "*" in origin):
                raise ValueError("Los orígenes deben ser exactos, sin rutas ni comodines.")
            if self.secure_cookies and parsed.scheme != "https":
                raise ValueError("Las cookies seguras requieren orígenes HTTPS.")
            if not self.secure_cookies and parsed.hostname not in ("localhost", "127.0.0.1", "testserver"):
                raise ValueError("Desactivar cookies seguras solo está permitido en desarrollo local.")
        if not self.database_url.startswith(("postgresql://", "postgres://")):
            raise ValueError("CERTIQUIZ_DATABASE_URL debe configurar PostgreSQL.")

    @classmethod
    def from_env(cls):
        flag = os.environ.get("CERTIQUIZ_SECURE_COOKIES", "true").lower()
        if flag not in ("true", "false"):
            raise ValueError("CERTIQUIZ_SECURE_COOKIES debe ser true o false.")
        return cls(os.environ["CERTIQUIZ_DATABASE_URL"], os.environ["CERTIQUIZ_PUBLIC_ORIGIN"],
                   tuple(origin.strip() for origin in os.environ["CERTIQUIZ_ALLOWED_ORIGINS"].split(",") if origin.strip()),
                   flag == "true", Path(os.environ.get("CERTIQUIZ_DATA_DIR", "/app/data")))


class GuardMiddleware:
    def __init__(self, app):
        self.app = app
        self.cors = None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        settings = scope["app"].state.settings
        headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope["headers"]}
        host = headers.get("host", "").split(":")[0].lower()
        allowed_hosts = {urlsplit(settings.public_origin).hostname, "localhost", "127.0.0.1", "testserver"}
        if host not in allowed_hosts:
            return await JSONResponse({"detail": "Host no permitido."}, 400)(scope, receive, send)
        if self.cors is None:
            self.cors = CORSMiddleware(self.checked_request, allow_origins=list(settings.allowed_origins),
                                       allow_credentials=True, allow_methods=["GET", "POST"],
                                       allow_headers=["Content-Type", "X-CertiQuiz"], max_age=600)
        await self.cors(scope, receive, send)

    async def checked_request(self, scope, receive, send):
        settings = scope["app"].state.settings
        headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope["headers"]}
        body = b""
        if scope["method"] not in ("GET", "HEAD", "OPTIONS"):
            if headers.get("origin") not in settings.allowed_origins or headers.get("x-certiquiz") != "1":
                return await JSONResponse({"detail": "Origen de solicitud no permitido."}, 403)(scope, receive, send)
            if headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
                return await JSONResponse({"detail": "Envía JSON."}, 415)(scope, receive, send)
            try:
                if int(headers.get("content-length", "0")) > 4096:
                    return await JSONResponse({"detail": "Solicitud demasiado grande."}, 413)(scope, receive, send)
            except ValueError:
                return await JSONResponse({"detail": "Longitud no válida."}, 400)(scope, receive, send)
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body += message.get("body", b"")
                if len(body) > 4096:
                    return await JSONResponse({"detail": "Solicitud demasiado grande."}, 413)(scope, receive, send)
                if not message.get("more_body", False):
                    break

        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered and scope["method"] not in ("GET", "HEAD", "OPTIONS"):
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        async def secure_send(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).extend([
                    (b"cache-control", b"no-store"), (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"), (b"referrer-policy", b"no-referrer"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                    (b"content-security-policy", b"default-src 'self'; script-src 'self'; style-src 'self'; "
                     b"img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
                     b"base-uri 'none'; frame-ancestors 'none'; form-action 'self'"),
                ])
            await send(message)

        await self.app(scope, bounded_receive, secure_send)


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RoomBody(StrictBody):
    courseId: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    questionCount: int = Field(ge=1, le=30)
    secondsPerQuestion: int = Field(ge=10, le=120)


class JoinBody(StrictBody):
    nickname: str = Field(min_length=2, max_length=30)


class AnswerBody(StrictBody):
    questionId: str = Field(min_length=1, max_length=100)
    optionId: str = Field(min_length=1, max_length=40)


def cookie_name(request: Request, name: str) -> str:
    return name if request.app.state.settings.secure_cookies else name.removeprefix("__Host-")


def identities(request: Request) -> tuple[dict | None, dict | None]:
    if hasattr(request.state, "identities"):
        return request.state.identities
    host_hash = token_digest(request.cookies.get(cookie_name(request, HOST_COOKIE)))
    room_hash = token_digest(request.cookies.get(cookie_name(request, ROOM_COOKIE)))
    sessions = request.app.state.store.sessions([value for value in (host_hash, room_hash) if value])
    host, room = sessions.get(host_hash), sessions.get(room_hash)
    host = host if host and host["kind"] == "host" else None
    room = room if room and room["kind"] in ("presenter", "player") else None
    request.state.identities = (host, room)
    return host, room


def require_host(request: Request) -> dict:
    host, _ = identities(request)
    if not host:
        raise HTTPException(401, "Crea una sala para usar los controles de anfitrión.")
    return host


def membership(request: Request, code: str, row: dict) -> tuple[str, str | None]:
    host, session = identities(request)
    if session and session["room_code"] == code and session["kind"] == "player":
        if any(player["id"] == session["player_id"] for player in row["state"]["players"]):
            return "player", session["player_id"]
    if host and host["token_hash"] == row["owner_hash"]:
        return "host", None
    raise HTTPException(403, "No tienes acceso a esta sala. Ingresa con su código.")


def cookie(response: Response, request: Request, name: str, token: str | None):
    name = cookie_name(request, name)
    secure = request.app.state.settings.secure_cookies
    attributes = {"httponly": True, "secure": secure, "samesite": "none" if secure else "strict", "path": "/"}
    if token is None:
        response.delete_cookie(name, **attributes)
    else:
        response.set_cookie(name, token, max_age=SESSION_SECONDS, **attributes)
    if secure:
        # Python 3.12's cookie serializer lacks CHIPS; append the standardized flag to this cookie only.
        header, value = response.raw_headers[-1]
        response.raw_headers[-1] = (header, value + b"; Partitioned")


def throttle(request: Request, action: str, limit: int, seconds: int, subject: str | None = None):
    # Only trust the ASGI client address; Uvicorn must trust the explicit proxy IP, never '*'.
    identity = subject or client_network(request.client.host if request.client else "unknown")
    bucket = action + ":" + hashlib.sha256(identity.encode()).hexdigest()
    if not request.app.state.store.rate_limit(bucket, limit, seconds):
        raise HTTPException(429, "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
                            headers={"Retry-After": str(seconds)})


def valid_code(code: str):
    if not re.fullmatch(r"[0-9]{6}", code):
        raise HTTPException(404, "No encontramos una sala activa con ese código.")


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application):
        configured = settings or Settings.from_env()
        configured.validate()
        application.state.settings = configured
        application.state.store = Store(configured.database_url)
        limiter = current_default_thread_limiter()
        previous_limit = limiter.total_tokens
        limiter.total_tokens = 12
        try:
            application.state.store.open()
            application.state.catalog = Catalog(configured.data_dir)
            application.state.store.health()
            application.state.store.cleanup()
            yield
        finally:
            limiter.total_tokens = previous_limit
            application.state.store.close()

    application = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    application.add_middleware(GuardMiddleware)

    @application.exception_handler(game.GameError)
    async def game_error(_request, error):
        headers = {"Retry-After": "60"} if error.status == 429 else None
        return JSONResponse({"detail": str(error)}, status_code=error.status, headers=headers)

    @application.exception_handler(RequestValidationError)
    async def validation_error(_request, _error):
        # Do not echo submitted credentials or untrusted payloads in validation errors.
        return JSONResponse({"detail": "Revisa los datos enviados. Hay un campo no válido."}, status_code=422)

    @application.exception_handler(psycopg.Error)
    async def database_error(_request, _error):
        return JSONResponse({"detail": "El servicio está ocupado. Vuelve a intentarlo."}, status_code=503)

    @application.get("/api/health")
    def health(request: Request):
        return {"ok": request.app.state.store.health()}

    @application.get("/api/catalog")
    def catalog(request: Request):
        return {"courses": [{"id": course["id"], "title": course["title"], "questionCount": len(course["questions"])}
                            for course in request.app.state.catalog.get().values()], "limits": game.LIMITS}

    @application.get("/api/session")
    def session(request: Request):
        host, room = identities(request)
        room_code = room["room_code"] if room else None
        if not room_code and host:
            room_code = request.app.state.store.owned_active_room(host["token_hash"])
        return {"host": host is not None, "roomCode": room_code}

    @application.post("/api/logout")
    def logout(body: StrictBody, request: Request, response: Response):
        hashes = [token_digest(request.cookies.get(cookie_name(request, name))) for name in (HOST_COOKIE, ROOM_COOKIE)]
        request.app.state.store.logout([value for value in hashes if value])
        for name in (HOST_COOKIE, ROOM_COOKIE):
            cookie(response, request, name, None)
        return {"ok": True}

    @application.post("/api/rooms", status_code=201)
    def create_room(body: RoomBody, request: Request, response: Response):
        throttle(request, "create-ip-minute", 2, 60)
        throttle(request, "create-ip-hour", 10, 3600)
        host, _ = identities(request)
        host_token = request.cookies.get(cookie_name(request, HOST_COOKIE)) if host else new_token()
        host_hash = token_digest(host_token)
        throttle(request, "create-host", 6, 3600, host_hash)
        throttle(request, "create-total", 60, 3600, "global")
        course = request.app.state.catalog.get().get(body.courseId)
        if course is None:
            raise HTTPException(422, "El curso no está disponible.")
        state = game.new_room(course, body.questionCount, body.secondsPerQuestion)
        token = new_token()
        old_hash = token_digest(request.cookies.get(cookie_name(request, ROOM_COOKIE)))
        network = client_network(request.client.host if request.client else "unknown")
        ip_hash = hashlib.sha256(network.encode()).hexdigest()
        code, now = request.app.state.store.create_room(host_hash, ip_hash, state, token_digest(token),
                                                       host is None, old_hash)
        cookie(response, request, HOST_COOKIE, host_token)
        cookie(response, request, ROOM_COOKIE, token)
        return game.snapshot(code, state, "host", None, now)

    @application.post("/api/rooms/{code}/join")
    def join(code: str, body: JoinBody, request: Request, response: Response):
        valid_code(code)
        # Allow one full room behind the same NAT plus one retry per participant.
        throttle(request, "join-ip", game.LIMITS["maxPlayers"] * 2, 60)
        throttle(request, "join-room", game.LIMITS["maxPlayers"] * 2, 60, code)
        _, existing = identities(request)
        store = request.app.state.store
        with store.room(code) as (connection, row, now):
            if existing and existing["room_code"] == code:
                role, player_id = membership(request, code, row)
            else:
                player_id = game.join_room(row["state"], body.nickname)
                token = new_token()
                store.add_session(connection, token_digest(token), "player", code, player_id, row["expires_at"])
                if existing:
                    connection.execute("DELETE FROM cq_sessions WHERE token_hash=%s", (existing["token_hash"],))
                cookie(response, request, ROOM_COOKIE, token)
                role = "player"
            result = game.snapshot(code, row["state"], role, player_id, now)
        return result

    @application.get("/api/rooms/{code}")
    def room(code: str, request: Request, version: int | None = Query(default=None, ge=0, le=2147483647)):
        valid_code(code)
        host, room_session = identities(request)
        if not host and (not room_session or room_session["room_code"] != code):
            # An unauthenticated GET must not become an unlimited PIN-existence oracle.
            raise HTTPException(403, "No tienes acceso a esta sala. Ingresa con su código.")
        viewer_id = room_session["player_id"] if room_session and room_session["room_code"] == code else None
        with request.app.state.store.room(code, read_only=True, player_id=viewer_id, version=version) as (_connection, row, now):
            role, player_id = membership(request, code, row)
            if row.get("unchanged"):
                return Response(status_code=204)
            result = game.snapshot(code, row["state"], role, player_id, now)
        return JSONResponse(result)

    @application.post("/api/rooms/{code}/answers")
    def answer(code: str, body: AnswerBody, request: Request):
        valid_code(code)
        _, room_session = identities(request)
        if not room_session or room_session["kind"] != "player" or room_session["room_code"] != code:
            raise HTTPException(403, "Ingresa como participante de esta sala.")
        throttle(request, "answer", 20, 60, room_session["token_hash"])
        with request.app.state.store.room(code) as (_connection, row, now):
            role, player_id = membership(request, code, row)
            game.answer_question(row["state"], player_id, body.questionId, body.optionId, now)
            result = game.snapshot(code, row["state"], role, player_id, now)
        return JSONResponse(result)

    @application.post("/api/rooms/{code}/{action}")
    def control(code: str, action: str, body: StrictBody, request: Request):
        valid_code(code)
        if action not in ("start", "next", "finish"):
            raise HTTPException(404, "Acción desconocida.")
        host = require_host(request)
        throttle(request, "control", 120, 60, host["token_hash"])
        with request.app.state.store.room(code) as (_connection, row, now):
            role, _ = membership(request, code, row)
            if role != "host":
                raise HTTPException(403, "Solo el anfitrión de esta sala puede continuar.")
            game.host_action(row["state"], action, now)
            result = game.snapshot(code, row["state"], "host", None, now)
        return JSONResponse(result)

    return application


app = create_app()
