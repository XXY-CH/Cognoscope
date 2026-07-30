-- U4 durable login-throttle authority. Existing U4 security checks are already in 0001.
CREATE TABLE login_throttles (
    normalized_username VARCHAR(128) NOT NULL,
    peer_key VARCHAR(128) NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    blocked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (normalized_username, peer_key)
);
