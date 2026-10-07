-- Run with the dedicated migration role, never with the API runtime role.
CREATE TABLE IF NOT EXISTS cq_rooms (
    code text PRIMARY KEY CHECK (code ~ '^[0-9]{6}$'),
    owner_hash text NOT NULL,
    state jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cq_rooms_expiry ON cq_rooms (expires_at);
-- Nullable for rooms created before public room creation was introduced.
ALTER TABLE cq_rooms ADD COLUMN IF NOT EXISTS owner_ip_hash text;
CREATE INDEX IF NOT EXISTS cq_rooms_owner_ip ON cq_rooms (owner_ip_hash);

CREATE TABLE IF NOT EXISTS cq_sessions (
    token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
    kind text NOT NULL CHECK (kind IN ('host', 'presenter', 'player')),
    room_code text REFERENCES cq_rooms(code) ON DELETE CASCADE,
    player_id text,
    expires_at timestamptz NOT NULL,
    CHECK ((kind = 'host' AND room_code IS NULL AND player_id IS NULL)
        OR (kind = 'presenter' AND room_code IS NOT NULL AND player_id IS NULL)
        OR (kind = 'player' AND room_code IS NOT NULL AND player_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cq_sessions_expiry ON cq_sessions (expires_at);

CREATE TABLE IF NOT EXISTS cq_rate_limits (
    bucket text PRIMARY KEY,
    hits integer NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cq_rate_limits_expiry ON cq_rate_limits (expires_at);
