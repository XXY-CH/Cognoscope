-- U6 durable ingestion commands and transactional outbox. Existing migrations are immutable.
CREATE TABLE durable_jobs (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    admitted_asset_id VARCHAR(36) NOT NULL REFERENCES admitted_assets(id),
    kind VARCHAR(64) NOT NULL DEFAULT 'ingestion',
    request_idempotency_key VARCHAR(256) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'resource_wait', 'partial', 'failed', 'cancelled', 'completed', 'recovery_pending')),
    checkpoint INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint >= 0),
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    resource_profile VARCHAR(128),
    wait_reason TEXT,
    lease_token VARCHAR(36),
    lease_fence INTEGER NOT NULL DEFAULT 0 CHECK (lease_fence >= 0),
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    result_json TEXT,
    failure_code VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    terminal_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_durable_job_account_request UNIQUE (account_id, request_idempotency_key)
);
CREATE INDEX ix_durable_jobs_state ON durable_jobs (state);
CREATE INDEX ix_durable_jobs_lease_expires_at ON durable_jobs (lease_expires_at);

CREATE TABLE outbox_events (
    id VARCHAR(36) PRIMARY KEY,
    aggregate_id VARCHAR(36) NOT NULL REFERENCES durable_jobs(id),
    event_type VARCHAR(128) NOT NULL,
    payload_json TEXT NOT NULL,
    deduplication_key VARCHAR(256) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'leased', 'delivered', 'poison')),
    available_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    lease_token VARCHAR(36),
    lease_fence INTEGER NOT NULL DEFAULT 0 CHECK (lease_fence >= 0),
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_outbox_event_deduplication UNIQUE (deduplication_key)
);
CREATE INDEX ix_outbox_events_available ON outbox_events (status, available_at);
CREATE INDEX ix_outbox_events_lease_expires_at ON outbox_events (lease_expires_at);

CREATE TABLE event_consumer_receipts (
    id VARCHAR(36) PRIMARY KEY,
    consumer_name VARCHAR(128) NOT NULL,
    event_id VARCHAR(36) NOT NULL REFERENCES outbox_events(id),
    consumed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_event_consumer_receipt UNIQUE (consumer_name, event_id)
);
