"""PostgreSQL persistence. Room rows serialize simultaneous answers atomically."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import secrets
import threading
import time

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .game import GameError, host_action
from .security import SESSION_SECONDS

WAITING_ROOM_EXPIRED = "(cq_rooms.state->>'status'='lobby' AND cq_rooms.created_at<=now()-interval '15 minutes')"
LIVE_ROOM = f"cq_rooms.expires_at>now() AND NOT {WAITING_ROOM_EXPIRED}"
ROOM_VIEW = f"""
WITH source AS MATERIALIZED (
    SELECT owner_hash,created_at,expires_at,state||'{{}}'::jsonb AS progress,
           (extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms,%s::text AS viewer_id
    FROM cq_rooms WHERE code=%s AND {LIVE_ROOM}
), room AS MATERIALIZED (
    SELECT *,COALESCE((progress->>'version')::bigint=%s::bigint
           AND (progress->>'status'<>'question' OR now_ms<(progress->>'deadline')::bigint),false) AS unchanged,
           CASE WHEN viewer_id IS NULL THEN '[]'::jsonb
                ELSE jsonb_path_query_array(progress,'$.players[*] ? (@.id == $viewer)',
                                           jsonb_build_object('viewer',viewer_id)) END AS viewer_players
    FROM source
)
SELECT owner_hash,created_at,expires_at,now_ms,unchanged,
       CASE WHEN unchanged THEN jsonb_build_object('players',viewer_players)
       ELSE (progress-ARRAY['questions','players','answers','answerPoints']) || jsonb_build_object(
           'currentQuestion',CASE WHEN progress->>'status' IN ('question','reveal')
                THEN progress->'questions'->(progress->>'questionIndex')::int END,
           'questionCount',jsonb_array_length(progress->'questions'),
           'playerCount',jsonb_array_length(progress->'players'),
           'answeredCount',(SELECT count(*) FROM jsonb_object_keys(progress->'answers')),
           'players',CASE WHEN progress->>'status'='question' THEN viewer_players
               ELSE progress->'players' END,
           'answers',CASE WHEN progress->'answers' ? viewer_id
               THEN jsonb_build_object(viewer_id,progress->'answers'->viewer_id) ELSE '{{}}'::jsonb END
       ) END AS state
FROM room
"""


class Store:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool = ConnectionPool(database_url, min_size=2, max_size=20, timeout=3, max_waiting=64,
                                   open=False, name="certiquiz", kwargs={"connect_timeout": 5, "row_factory": dict_row,
                                   "options": "-c statement_timeout=5000 -c lock_timeout=3000"})
        self._cleanup_lock = threading.Lock()
        self._last_cleanup = 0.0

    def open(self) -> None:
        self.pool.open(wait=True, timeout=5)

    def close(self) -> None:
        self.pool.close()

    @contextmanager
    def connection(self):
        # The official pool commits/rolls back before reusing a connection and replaces broken ones.
        with self.pool.connection() as connection:
            yield connection

    def health(self) -> bool:
        with self.connection() as connection:
            return connection.execute("SELECT 1 AS ok").fetchone()["ok"] == 1

    @staticmethod
    def expire_waiting_rooms(connection) -> None:
        connection.execute(f"UPDATE cq_rooms SET expires_at=LEAST(expires_at,created_at+interval '15 minutes') "
                           f"WHERE expires_at>now() AND {WAITING_ROOM_EXPIRED}")
        connection.execute("DELETE FROM cq_sessions WHERE room_code IN (SELECT code FROM cq_rooms WHERE expires_at<=now())")

    @staticmethod
    def lobby_deadline(row) -> int:
        return int((row["created_at"] + timedelta(minutes=15)).timestamp() * 1000)

    def cleanup(self) -> None:
        if time.monotonic() - self._last_cleanup < 60 or not self._cleanup_lock.acquire(blocking=False):
            return
        try:
            with self.connection() as connection:
                if connection.execute("SELECT pg_try_advisory_xact_lock(61473201) AS held").fetchone()["held"]:
                    self.expire_waiting_rooms(connection)
                    connection.execute("DELETE FROM cq_sessions WHERE expires_at <= now()")
                    connection.execute("DELETE FROM cq_rate_limits WHERE expires_at <= now()")
                    connection.execute("DELETE FROM cq_rooms WHERE expires_at <= now() - interval '16 hours'")
            self._last_cleanup = time.monotonic()
        finally:
            self._cleanup_lock.release()

    def rate_limit(self, bucket: str, limit: int, seconds: int) -> bool:
        self.cleanup()
        with self.connection() as connection:
            # Only new buckets need the global cap lock; row-lock existing ones against cleanup.
            connection.execute("SELECT pg_advisory_xact_lock(61473202) WHERE NOT EXISTS "
                               "(SELECT 1 FROM cq_rate_limits WHERE bucket=%s FOR UPDATE)", (bucket,))
            row = connection.execute(
                "INSERT INTO cq_rate_limits (bucket,hits,expires_at) SELECT %s,1,now()+%s*interval '1 second' "
                "WHERE EXISTS (SELECT 1 FROM cq_rate_limits WHERE bucket=%s) "
                "OR (SELECT count(*) FROM cq_rate_limits)<10000 "
                "ON CONFLICT (bucket) DO UPDATE SET "
                "hits=CASE WHEN cq_rate_limits.expires_at<=now() THEN 1 ELSE cq_rate_limits.hits+1 END, "
                "expires_at=CASE WHEN cq_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE cq_rate_limits.expires_at END "
                "RETURNING hits", (bucket, seconds, bucket)).fetchone()
            return row is not None and row["hits"] <= limit

    def sessions(self, token_hashes: list[str]) -> dict:
        self.cleanup()
        if not token_hashes:
            return {}
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT s.token_hash,s.kind,s.room_code,s.player_id FROM cq_sessions s "
                "LEFT JOIN cq_rooms ON cq_rooms.code=s.room_code "
                "WHERE s.token_hash = ANY(%s) AND s.expires_at > now() "
                f"AND (s.room_code IS NULL OR ({LIVE_ROOM}))",
                (token_hashes,)).fetchall()
            return {row["token_hash"]: row for row in rows}

    @staticmethod
    def add_session(connection, token_hash: str, kind: str, room_code=None, player_id=None, expires_at=None):
        expires_at = expires_at or datetime.now(timezone.utc) + timedelta(seconds=SESSION_SECONDS)
        connection.execute(
            "INSERT INTO cq_sessions (token_hash,kind,room_code,player_id,expires_at) VALUES (%s,%s,%s,%s,%s)",
            (token_hash, kind, room_code, player_id, expires_at))

    def owned_active_room(self, owner_hash: str) -> str | None:
        with self.connection() as connection:
            row = connection.execute(f"SELECT code FROM cq_rooms WHERE owner_hash=%s AND {LIVE_ROOM} "
                                     "AND state->>'status'<>'finished' ORDER BY created_at DESC LIMIT 1",
                                     (owner_hash,)).fetchone()
            return row["code"] if row else None

    def logout(self, token_hashes: list[str]) -> None:
        if not token_hashes:
            return
        with self.connection() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(61473203)")
            sessions = connection.execute("SELECT kind,room_code,player_id FROM cq_sessions "
                                          "WHERE token_hash=ANY(%s)", (token_hashes,)).fetchall()
            rows = connection.execute("SELECT code,owner_hash,state FROM cq_rooms "
                                      "WHERE (owner_hash=ANY(%s) OR code=ANY(%s)) AND expires_at>now() "
                                      "ORDER BY code FOR UPDATE",
                                      (token_hashes, [session["room_code"] for session in sessions if session["room_code"]])).fetchall()
            now = connection.execute("SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms").fetchone()["now_ms"]
            for row in rows:
                state = row["state"]
                if row["owner_hash"] in token_hashes:
                    host_action(state, "finish", now)
                elif state["status"] == "lobby":
                    departing = {session["player_id"] for session in sessions if session["room_code"] == row["code"]}
                    state["players"] = [player for player in state["players"] if player["id"] not in departing]
                    state["version"] += 1
                connection.execute("UPDATE cq_rooms SET state=%s WHERE code=%s", (Jsonb(state), row["code"]))
            connection.execute("DELETE FROM cq_sessions WHERE token_hash=ANY(%s)", (token_hashes,))

    def create_room(self, owner_hash: str, owner_ip_hash: str, room: dict, presenter_hash: str,
                    new_host: bool, previous_room_hash: str | None) -> tuple[str, int, int]:
        self.cleanup()
        with self.connection() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(61473203)")
            self.expire_waiting_rooms(connection)
            counts = connection.execute(
                "SELECT count(*) AS total,count(*) FILTER (WHERE owner_hash=%s) AS owned,"
                "count(*) FILTER (WHERE owner_ip_hash=%s) AS network FROM cq_rooms WHERE expires_at>now() "
                "AND state->>'status'<>'finished'", (owner_hash, owner_ip_hash)).fetchone()
            if counts["owned"]:
                raise GameError("Ya tienes una sala activa. Retómala o finalízala antes de crear otra.")
            if counts["network"] >= 3:
                raise GameError("Tu red ya tiene 3 salas activas. Finaliza una antes de crear otra.", 429)
            if counts["total"] >= 10:
                raise GameError("Hay 10 salas activas. Finaliza una para crear otra.", 429)
            if not new_host:
                session = connection.execute("SELECT token_hash FROM cq_sessions WHERE token_hash=%s "
                                             "AND kind='host' AND expires_at>now() FOR UPDATE", (owner_hash,)).fetchone()
                if not session:
                    raise GameError("La sesión terminó. Recarga la página antes de crear otra sala.", 401)
            while True:
                code = str(secrets.randbelow(900000) + 100000)
                if not connection.execute("SELECT 1 FROM cq_rooms WHERE code=%s", (code,)).fetchone():
                    break
            row = connection.execute(
                "INSERT INTO cq_rooms (code,owner_hash,owner_ip_hash,state,expires_at) VALUES (%s,%s,%s,%s,now()+interval '8 hours') "
                "RETURNING created_at, expires_at, (extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms",
                (code, owner_hash, owner_ip_hash, Jsonb(room))).fetchone()
            if new_host:
                self.add_session(connection, owner_hash, "host", expires_at=row["expires_at"])
            else:
                connection.execute("UPDATE cq_sessions SET expires_at=%s WHERE token_hash=%s", (row["expires_at"], owner_hash))
            self.add_session(connection, presenter_hash, "presenter", code, expires_at=row["expires_at"])
            if previous_room_hash:
                connection.execute("DELETE FROM cq_sessions WHERE token_hash=%s", (previous_room_hash,))
            return code, row["now_ms"], self.lobby_deadline(row)

    @contextmanager
    def room(self, code: str, read_only: bool = False, player_id: str | None = None, version: int | None = None):
        pending_error = None
        with self.connection() as connection:
            if read_only:
                # Materialize JSONB once; unchanged polls skip the snapshot but still return the real member.
                row = connection.execute(ROOM_VIEW, (player_id, code, version)).fetchone()
                if row is None:
                    raise GameError("No encontramos una sala activa con ese código.", 404)
                if row["unchanged"] or row["state"]["status"] != "question" or row["now_ms"] < row["state"]["deadline"]:
                    yield connection, row, row["now_ms"]
                    return
                # A deadline needs a transition: re-read state AND clock after acquiring the lock below.
            row = connection.execute(
                f"SELECT owner_hash,state,created_at,expires_at FROM cq_rooms WHERE code=%s AND {LIVE_ROOM} FOR UPDATE",
                (code,)).fetchone()
            if row is None:
                raise GameError("No encontramos una sala activa con ese código.", 404)
            now = connection.execute("SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms").fetchone()["now_ms"]
            old_version = row["state"]["version"]
            try:
                yield connection, row, now
            except GameError as error:
                # A late answer can close the deadline without rolling back that transition.
                pending_error = error
            if row["state"]["version"] != old_version:
                connection.execute("UPDATE cq_rooms SET state=%s WHERE code=%s", (Jsonb(row["state"]), code))
        if pending_error:
            raise pending_error
