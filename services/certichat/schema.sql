CREATE TABLE IF NOT EXISTS cc_sessions (
    token_hash text PRIMARY KEY,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
    verified_until timestamptz NOT NULL DEFAULT now() + interval '8 hours'
);
CREATE TABLE IF NOT EXISTS cc_requests (
    session_hash text NOT NULL REFERENCES cc_sessions(token_hash) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    input_hash text NOT NULL,
    network_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    active_until timestamptz NOT NULL DEFAULT now() + interval '50 seconds',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete','failed')),
    response jsonb,
    PRIMARY KEY (session_hash,request_id)
);
CREATE INDEX IF NOT EXISTS cc_requests_time ON cc_requests(created_at);
CREATE INDEX IF NOT EXISTS cc_requests_network ON cc_requests(network_hash,created_at);
CREATE INDEX IF NOT EXISTS cc_requests_active ON cc_requests(active_until) WHERE status='pending';
CREATE TABLE IF NOT EXISTS cc_history (
    session_hash text NOT NULL REFERENCES cc_sessions(token_hash) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    version text NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    PRIMARY KEY (session_hash,request_id)
);
CREATE TABLE IF NOT EXISTS cc_rate_limits (
    bucket text PRIMARY KEY,
    hits integer NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS cc_spend (
    id uuid PRIMARY KEY,
    purpose text NOT NULL CHECK (purpose IN ('chat','index')),
    created_at timestamptz NOT NULL DEFAULT now(),
    reserved_micro bigint NOT NULL CHECK (reserved_micro > 0),
    charged_micro bigint NOT NULL CHECK (charged_micro >= 0),
    settled boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS cc_spend_time ON cc_spend(created_at);
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'chat' CHECK (channel IN ('chat','voice'));
ALTER TABLE cc_history ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'chat' CHECK (channel IN ('chat','voice'));
ALTER TABLE cc_spend ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'chat' CHECK (channel IN ('chat','voice','index'));
UPDATE cc_spend SET channel='index' WHERE purpose='index' AND channel='chat';
CREATE TABLE IF NOT EXISTS cc_continuity (
    session_hash text PRIMARY KEY REFERENCES cc_sessions(token_hash) ON DELETE CASCADE,
    text text NOT NULL CHECK (length(text) BETWEEN 1 AND 1200),
    since timestamptz NOT NULL
);
