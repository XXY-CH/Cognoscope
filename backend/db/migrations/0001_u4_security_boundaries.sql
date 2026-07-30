-- U4 security and authorization authority. Forward-only; no credentials are stored here.
CREATE TABLE accounts (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(512) NOT NULL,
    is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_accounts_username ON accounts (username);

CREATE TABLE bootstrap_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    account_id VARCHAR(36) NOT NULL UNIQUE REFERENCES accounts(id),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE server_sessions (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    token_digest VARCHAR(64) NOT NULL UNIQUE,
    csrf_digest VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idle_expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX ix_server_sessions_account_id ON server_sessions (account_id);
CREATE INDEX ix_server_sessions_token_digest ON server_sessions (token_digest);
CREATE INDEX ix_server_sessions_idle_expires_at ON server_sessions (idle_expires_at);
CREATE INDEX ix_server_sessions_absolute_expires_at ON server_sessions (absolute_expires_at);
CREATE INDEX ix_server_sessions_revoked_at ON server_sessions (revoked_at);

CREATE TABLE external_policies (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    project_id VARCHAR(128) NOT NULL,
    task_class VARCHAR(128) NOT NULL,
    decision VARCHAR(32) NOT NULL CHECK (decision = 'always_local'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_external_policy_scope UNIQUE (account_id, project_id, task_class)
);
CREATE INDEX ix_external_policies_account_id ON external_policies (account_id);
CREATE INDEX ix_external_policies_project_id ON external_policies (project_id);
CREATE INDEX ix_external_policies_task_class ON external_policies (task_class);

CREATE TABLE external_permits (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    decision VARCHAR(32) NOT NULL CHECK (decision IN ('once', 'project_task')),
    project_id VARCHAR(128) NOT NULL,
    task_class VARCHAR(128) NOT NULL,
    asset_revision_id VARCHAR(128),
    annotation_revision_id VARCHAR(128),
    content_digest VARCHAR(64) NOT NULL,
    byte_start INTEGER NOT NULL CHECK (byte_start >= 0),
    byte_end INTEGER NOT NULL CHECK (byte_end >= byte_start),
    provider_endpoint VARCHAR(512) NOT NULL,
    provider_model VARCHAR(256) NOT NULL,
    purpose VARCHAR(256) NOT NULL,
    credential_ref VARCHAR(512) NOT NULL,
    max_payload_bytes INTEGER NOT NULL CHECK (max_payload_bytes > 0),
    max_dispatches INTEGER NOT NULL CHECK (max_dispatches > 0),
    max_cost_micros INTEGER NOT NULL CHECK (max_cost_micros >= 0),
    uses_consumed INTEGER NOT NULL DEFAULT 0 CHECK (uses_consumed >= 0),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    CHECK (uses_consumed <= max_dispatches)
);
CREATE INDEX ix_external_permits_account_id ON external_permits (account_id);
CREATE INDEX ix_external_permits_project_id ON external_permits (project_id);
CREATE INDEX ix_external_permits_task_class ON external_permits (task_class);
CREATE INDEX ix_external_permits_expires_at ON external_permits (expires_at);
CREATE INDEX ix_external_permits_revoked_at ON external_permits (revoked_at);

CREATE TABLE external_dispatches (
    id VARCHAR(36) PRIMARY KEY,
    permit_id VARCHAR(36) NOT NULL REFERENCES external_permits(id),
    job_idempotency_key VARCHAR(256) NOT NULL,
    payload_digest VARCHAR(64) NOT NULL,
    payload_bytes INTEGER NOT NULL CHECK (payload_bytes >= 0),
    estimated_cost_micros INTEGER NOT NULL CHECK (estimated_cost_micros >= 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('claimed', 'sent', 'failed')),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failure_code TEXT,
    CONSTRAINT uq_external_dispatch_job_key UNIQUE (job_idempotency_key)
);
CREATE INDEX ix_external_dispatches_permit_id ON external_dispatches (permit_id);
