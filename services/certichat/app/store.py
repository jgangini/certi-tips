"""Short PostgreSQL transactions own quotas, idempotency and conservative cost reservations."""

import time
from datetime import datetime, timezone
from uuid import uuid4

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .security import ChatError
from .settings import Settings

class Store:
    def __init__(self, database_url, refresh_hours=6, questions=20, *, index_budget_usd=Settings.index_budget_usd,
                 chat_budget_usd=Settings.chat_budget_usd, voice_pilot_budget_usd=Settings.voice_pilot_budget_usd,
                 local_voice_pilot=Settings.local_voice_pilot):
        self.pool = ConnectionPool(database_url, min_size=1, max_size=8, timeout=3, max_waiting=64,
                                   open=False, name="certichat", kwargs={"connect_timeout": 5,
                                   "row_factory": dict_row, "options": "-c statement_timeout=5000 -c lock_timeout=3000"})
        self.last_cleanup = 0.0
        self.refresh_hours = refresh_hours
        self.questions = questions
        self.monthly_limits = {"index": int(index_budget_usd * 1000000), "chat": int(chat_budget_usd * 1000000)}
        self.voice_pilot_limit = int(voice_pilot_budget_usd * 1000000)
        self.local_voice_pilot = local_voice_pilot

    def open(self):
        self.pool.open(wait=True, timeout=5)

    def close(self):
        self.pool.close()

    def health(self):
        with self.pool.connection() as connection:
            return connection.execute("SELECT 1 AS ok").fetchone()["ok"] == 1

    def cleanup(self):
        if time.monotonic() - self.last_cleanup < 60:
            return
        with self.pool.connection() as connection:
            if connection.execute("SELECT pg_try_advisory_xact_lock(61473300) AS held").fetchone()["held"]:
                connection.execute("DELETE FROM cc_history WHERE created_at<=now()-interval '24 hours'")
                connection.execute("DELETE FROM cc_continuity WHERE since<=now()-interval '24 hours'")
                connection.execute("UPDATE cc_requests SET response=NULL WHERE response IS NOT NULL "
                                   "AND created_at<=now()-interval '24 hours'")
                connection.execute("DELETE FROM cc_sessions WHERE expires_at<=now()")
                connection.execute("DELETE FROM cc_rate_limits WHERE expires_at<=now()")
                connection.execute("DELETE FROM cc_spend WHERE settled AND created_at<now()-interval '90 days' "
                                   "AND (purpose!='chat' OR (%s AND created_at<COALESCE("
                                   "(SELECT min(created_at) FROM cc_spend WHERE channel='voice'),'infinity'::timestamptz)))",
                                   (not self.local_voice_pilot,))
        self.last_cleanup = time.monotonic()

    def session(self, token_hash):
        self.cleanup()
        if not token_hash:
            return None
        with self.pool.connection() as connection:
            return connection.execute("SELECT token_hash,verified_until>now() AS verified FROM cc_sessions "
                                      "WHERE token_hash=%s AND expires_at>now()", (token_hash,)).fetchone()

    def verify_session(self, token_hash):
        with self.pool.connection() as connection:
            connection.execute("INSERT INTO cc_sessions(token_hash) VALUES (%s) ON CONFLICT(token_hash) "
                               "DO UPDATE SET verified_until=now()+interval '8 hours',expires_at=now()+interval '30 days'",
                               (token_hash,))

    def session_attempt(self, network):
        self.cleanup()
        allowed = True
        with self.pool.connection() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(61473301)")
            for label, seconds, limit in (("minute", 60, 60), ("hour", 3600, 300)):
                row = connection.execute(
                    "INSERT INTO cc_rate_limits(bucket,hits,expires_at) VALUES (%s,1,now()+%s*interval '1 second') "
                    "ON CONFLICT(bucket) DO UPDATE SET "
                    "hits=CASE WHEN cc_rate_limits.expires_at<=now() THEN 1 ELSE cc_rate_limits.hits+1 END, "
                    "expires_at=CASE WHEN cc_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE cc_rate_limits.expires_at END "
                    "RETURNING hits", (f"session:{label}:{network}", seconds)).fetchone()
                allowed = allowed and row["hits"] <= limit
            if connection.execute("SELECT count(*) AS n FROM cc_sessions").fetchone()["n"] >= 20000:
                allowed = False
        if not allowed:
            raise ChatError("Demasiados intentos de verificación. Espera un momento.", 429, 60)

    def quota_in(self, connection, token_hash, channel="chat"):
        if channel not in ("chat", "voice"):
            raise ValueError("Invalid conversation channel.")
        minute_limit = 10 if channel == "voice" else 2
        minute = connection.execute("SELECT count(*) AS n,COALESCE(ceil(extract(epoch FROM "
                                    "min(created_at)+interval '1 minute'-now())),0)::int AS retry "
                                    "FROM cc_requests WHERE session_hash=%s AND created_at>now()-interval '1 minute'",
                                    (token_hash,)).fetchone()
        window = connection.execute("SELECT hits,expires_at,ceil(extract(epoch FROM expires_at-now()))::int AS retry "
                                    "FROM cc_rate_limits WHERE bucket=%s AND expires_at>now()",
                                    (f"chat:{token_hash}",)).fetchone()
        remaining = max(0, self.questions - window["hits"]) if window else self.questions
        return {"remaining": remaining, "limit": self.questions, "refreshHours": self.refresh_hours,
                "resetAt": window["expires_at"].astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if window else None,
                "minuteRemaining": max(0, minute_limit-minute["n"]),
                "retryAfter": max(minute["retry"] if minute["n"] >= minute_limit else 0,
                                  window["retry"] if window and remaining == 0 else 0)}

    def quota(self, token_hash, channel="chat"):
        with self.pool.connection() as connection:
            return self.quota_in(connection, token_hash, channel)

    def begin_request(self, token_hash, request_id, input_hash, network, channel="chat"):
        if channel not in ("chat", "voice"):
            raise ValueError("Invalid conversation channel.")
        self.cleanup()
        with self.pool.connection() as connection:
            # ponytail: one short admission lock suits four concurrent chats; use per-subject locks above that ceiling.
            connection.execute("SELECT pg_advisory_xact_lock(61473302)")
            session = connection.execute("SELECT token_hash FROM cc_sessions WHERE token_hash=%s AND expires_at>now() "
                                         "AND verified_until>now() FOR UPDATE", (token_hash,)).fetchone()
            if not session:
                raise ChatError("Verifica tu acceso para continuar.", 401)
            previous = connection.execute("SELECT input_hash,status,response,channel,active_until>now() AS active,"
                                          "created_at>now()-interval '24 hours' AS fresh FROM cc_requests "
                                          "WHERE session_hash=%s AND request_id=%s", (token_hash, request_id)).fetchone()
            if previous:
                if previous["input_hash"] != input_hash or previous["channel"] != channel:
                    raise ChatError("El identificador ya corresponde a otra consulta.", 409, code="request_conflict")
                if not previous["fresh"]:
                    raise ChatError("Esta consulta caducó; envía una nueva si necesitas continuar.", 409, code="request_expired")
                if previous["status"] == "complete" and previous["response"] is not None:
                    return previous["response"]
                code = {"failed": "request_failed", "pending": "request_pending", "complete": "request_expired"}[previous["status"]]
                if previous["status"] == "pending" and not previous["active"]:
                    code = "request_expired"
                raise ChatError("Esta consulta ya fue recibida; envía una nueva si necesitas continuar.", 409, code=code)
            quota = self.quota_in(connection, token_hash, channel)
            if quota["retryAfter"]:
                raise ChatError("Alcanzaste tu límite de consultas. Vuelve más tarde.", 429, quota["retryAfter"])
            for seconds, maximum in ((60, 60), (3600, 600)):
                count = connection.execute("SELECT count(*) AS n FROM cc_requests WHERE network_hash=%s "
                                           "AND created_at>now()-%s*interval '1 second'", (network, seconds)).fetchone()["n"]
                if count >= maximum:
                    raise ChatError("Tu red alcanzó el límite temporal de consultas.", 429, seconds)
            active = connection.execute("SELECT count(*) AS total,count(*) FILTER(WHERE session_hash=%s) AS own "
                                        "FROM cc_requests WHERE status='pending' AND active_until>now()", (token_hash,)).fetchone()
            if active["own"] or active["total"] >= 4:
                raise ChatError("Hay consultas en curso. Espera unos segundos.", 429, 10)
            connection.execute("INSERT INTO cc_requests(session_hash,request_id,input_hash,network_hash,channel,active_until) "
                               "VALUES (%s,%s,%s,%s,%s,now()+%s*interval '1 second')",
                               (token_hash, request_id, input_hash, network, channel, 180 if channel == "voice" else 50))
            connection.execute("INSERT INTO cc_rate_limits(bucket,hits,expires_at) VALUES (%s,1,now()+%s*interval '1 hour') "
                               "ON CONFLICT(bucket) DO UPDATE SET "
                               "hits=CASE WHEN cc_rate_limits.expires_at<=now() THEN 1 ELSE cc_rate_limits.hits+1 END, "
                               "expires_at=CASE WHEN cc_rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE cc_rate_limits.expires_at END",
                               (f"chat:{token_hash}", self.refresh_hours))
        return None

    def finish_request(self, token_hash, request_id, result=None, question=None, channel="chat", continuity=None, continuity_since=None):
        if channel not in ("chat", "voice"):
            raise ValueError("Invalid conversation channel.")
        if continuity_since is not None and (not isinstance(continuity_since, datetime) or continuity_since.tzinfo is None):
            raise ValueError("Continuity provenance requires a timezone-aware timestamp.")
        with self.pool.connection() as connection:
            completed = connection.execute("UPDATE cc_requests SET status=%s,response=%s,active_until=now() "
                               "WHERE session_hash=%s AND request_id=%s AND status='pending' RETURNING request_id,created_at",
                               ("complete" if result else "failed", Jsonb(result) if result else None, token_hash, request_id)).fetchone()
            if result and completed and result.get("educational", True):
                connection.execute("DELETE FROM cc_continuity WHERE session_hash=%s AND since<=now()-interval '24 hours'", (token_hash,))
                if isinstance(continuity, str) and 0 < len(continuity.strip()) <= 1200:
                    # A refresh retains the oldest contributing timestamp; summaries cannot renew expired information.
                    connection.execute("INSERT INTO cc_continuity(session_hash,text,since) "
                        "SELECT %s,%s,anchor FROM (SELECT LEAST(%s::timestamptz,%s::timestamptz,"
                        "(SELECT since FROM cc_continuity WHERE session_hash=%s),"
                        "(SELECT min(created_at) FROM cc_history WHERE session_hash=%s "
                        "AND created_at>now()-interval '24 hours')) AS anchor) AS context "
                        "WHERE anchor>now()-interval '24 hours' "
                        "ON CONFLICT(session_hash) DO UPDATE SET text=EXCLUDED.text,since=EXCLUDED.since",
                        (token_hash, continuity.strip(), completed["created_at"], continuity_since, token_hash, token_hash))
                # Preserve turn order even when the database clock gives consecutive completions the same timestamp.
                connection.execute("INSERT INTO cc_history(session_hash,request_id,version,question,answer,channel,created_at) "
                                   "VALUES (%s,%s,%s,%s,%s,%s,GREATEST(clock_timestamp(),"
                                   "(SELECT max(created_at)+interval '1 microsecond' FROM cc_history WHERE session_hash=%s))) "
                                   "ON CONFLICT DO NOTHING", (token_hash, request_id, result["contentVersion"], question, result["answer"], channel, token_hash))
                connection.execute("DELETE FROM cc_history WHERE session_hash=%s AND request_id NOT IN "
                                   "(SELECT request_id FROM cc_history WHERE session_hash=%s ORDER BY created_at DESC LIMIT 4)",
                                   (token_hash, token_hash))

    def history(self, token_hash, version=None):
        with self.pool.connection() as connection:
            rows = connection.execute("SELECT h.request_id::text AS request_id,h.question,h.answer,h.version,h.created_at,h.channel,"
                                      "COALESCE(r.response->'sources','[]'::jsonb) AS sources "
                                      "FROM cc_history h LEFT JOIN cc_requests r USING(session_hash,request_id) WHERE h.session_hash=%s "
                                      "AND (%s::text IS NULL OR h.version=%s) "
                                      "AND h.created_at>now()-interval '24 hours' ORDER BY h.created_at DESC LIMIT 4",
                                      (token_hash, version, version)).fetchall()
            return list(reversed(rows))

    def request_result(self, token_hash, request_id, educational_only=True):
        with self.pool.connection() as connection:
            row = connection.execute("SELECT response FROM cc_requests WHERE session_hash=%s AND request_id=%s "
                                     "AND channel='voice' AND status='complete' AND created_at>now()-interval '24 hours' "
                                     "AND (NOT %s OR COALESCE(response->>'educational','true')='true')", (token_hash, request_id, educational_only)).fetchone()
            return row["response"] if row else None

    def continuity(self, token_hash):
        with self.pool.connection() as connection:
            return connection.execute("SELECT text,since FROM cc_continuity WHERE session_hash=%s "
                                      "AND since>now()-interval '24 hours'", (token_hash,)).fetchone()

    def clear_history(self, token_hash):
        with self.pool.connection() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(61473302)")
            if connection.execute("SELECT 1 FROM cc_requests WHERE session_hash=%s AND status='pending' "
                                  "AND active_until>now()", (token_hash,)).fetchone():
                raise ChatError("Espera a que termine la consulta para borrar la conversación.", 409)
            # Lock/invalidate request rows before deleting memory so a late completion cannot restore it.
            connection.execute("UPDATE cc_requests SET response=NULL,status=CASE WHEN status='pending' THEN 'failed' ELSE status END "
                               "WHERE session_hash=%s", (token_hash,))
            connection.execute("DELETE FROM cc_history WHERE session_hash=%s", (token_hash,))
            connection.execute("DELETE FROM cc_continuity WHERE session_hash=%s", (token_hash,))

    @staticmethod
    def spending(connection, purpose):
        return connection.execute("SELECT COALESCE(sum(charged_micro),0)::bigint AS purpose "
                                  "FROM cc_spend WHERE purpose=%s AND "
                                  "created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
                                  (purpose,)).fetchone()

    def available(self, channel="chat"):
        if channel not in ("chat", "voice"):
            raise ValueError("Invalid conversation channel.")
        with self.pool.connection() as connection:
            spend = self.spending(connection, "chat")
            pilot = self.pilot_spending(connection)
            return spend["purpose"] < self.monthly_limits["chat"] and (
                (channel != "voice" and not self.local_voice_pilot) or pilot["total"] < self.voice_pilot_limit)

    def reserve(self, purpose, micro, channel="chat"):
        if purpose == "index" and channel == "chat":
            channel = "index"
        if purpose not in ("chat", "index") or type(micro) is not int or micro <= 0 or channel not in ("chat", "voice", "index") or (purpose == "index") != (channel == "index"):
            raise ValueError("Invalid budget reservation.")
        reservation = uuid4()
        with self.pool.connection() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(61473303)")
            spend = self.spending(connection, purpose)
            if spend["purpose"]+micro > self.monthly_limits[purpose]:
                raise ChatError("CertiChat alcanzó su presupuesto de uso. Inténtalo más adelante.", 503, 3600)
            voice_active = purpose == "chat" and connection.execute(
                # The worker can finish bounded retrieval after the public request is cancelled.
                "SELECT EXISTS(SELECT 1 FROM cc_requests WHERE channel='voice' "
                "AND active_until>now()-interval '30 seconds') AS active").fetchone()["active"]
            if channel == "voice" or voice_active or (purpose == "chat" and self.local_voice_pilot):
                pilot = self.pilot_spending(connection)
                if pilot["total"]+micro > self.voice_pilot_limit:
                    raise ChatError("El piloto de voz alcanzó su presupuesto de uso.", 503, code="voice_budget_exhausted")
            connection.execute("INSERT INTO cc_spend(id,purpose,reserved_micro,charged_micro,channel) VALUES (%s,%s,%s,%s,%s)",
                               (reservation, purpose, micro, micro, channel))
        return reservation

    def pilot_spending(self, connection):
        # ponytail: count all runtime in the isolated pilot; shared mode starts with voice because retrieval lacks request correlation.
        return connection.execute("SELECT COALESCE(sum(charged_micro),0)::bigint AS total FROM cc_spend "
                                  "WHERE purpose='chat' AND (%s OR created_at>=(SELECT min(created_at) FROM cc_spend WHERE channel='voice'))",
                                  (self.local_voice_pilot,)).fetchone()

    def spend_breakdown(self):
        with self.pool.connection() as connection:
            rows = connection.execute("SELECT channel,COALESCE(sum(charged_micro),0)::bigint AS total FROM cc_spend "
                "WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' GROUP BY channel").fetchall()
            amounts = {row["channel"]: row["total"] for row in rows}
            pilot = self.pilot_spending(connection)
            return {"runtimeMicro": amounts.get("chat", 0)+amounts.get("voice", 0), "chatMicro": amounts.get("chat", 0),
                    "voiceMicro": amounts.get("voice", 0), "indexMicro": amounts.get("index", 0), "voicePilotMicro": pilot["total"],
                    "runtimeLimitMicro": self.monthly_limits["chat"], "voicePilotLimitMicro": self.voice_pilot_limit}

    def settle(self, reservation, actual_micro):
        if actual_micro < 0:
            raise ValueError("Invalid provider cost.")
        with self.pool.connection() as connection:
            connection.execute("SELECT pg_advisory_xact_lock(61473303)")
            connection.execute("UPDATE cc_spend SET charged_micro=%s,settled=true WHERE id=%s AND NOT settled",
                               (actual_micro, reservation))
