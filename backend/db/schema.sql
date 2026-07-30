-- Simplified schema for single-user xuesen backend (SQLite)
-- Combines annotations, knowledge, library, jobs, and preferences
-- Removes: accounts, sessions, external_policies, external_permits, bootstrap

-- Library projects and documents
CREATE TABLE library_projects (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT NOT NULL DEFAULT 'default-user',
    title TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE library_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES library_projects(id),
    title TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admitted_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES library_projects(id),
    document_id TEXT NOT NULL REFERENCES library_documents(id),
    blob_digest TEXT NOT NULL,
    blob_byte_size INTEGER NOT NULL,
    format TEXT NOT NULL,
    tier TEXT NOT NULL,
    admitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unavailable_at TIMESTAMP
);

CREATE INDEX ix_admitted_assets_project_id ON admitted_assets (project_id);
CREATE INDEX ix_admitted_assets_document_id ON admitted_assets (document_id);

-- Document revisions
CREATE TABLE document_revisions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES library_documents(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    title TEXT NOT NULL,
    supersedes_revision_id TEXT REFERENCES document_revisions(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (document_id, revision)
);

CREATE INDEX ix_document_revisions_document_id ON document_revisions (document_id);

-- Bibliographic records
CREATE TABLE bibliographic_records (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES library_documents(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    csl_json TEXT NOT NULL,
    supersedes_revision_id TEXT REFERENCES bibliographic_records(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (document_id, revision)
);

-- Normalized extraction
CREATE TABLE extraction_runs (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES admitted_assets(id),
    adapter_id TEXT NOT NULL,
    adapter_version TEXT NOT NULL,
    adapter_revision INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_extraction_runs_asset_id ON extraction_runs (asset_id);

CREATE TABLE extraction_repair_candidates (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES admitted_assets(id),
    source_run_id TEXT NOT NULL REFERENCES extraction_runs(id),
    target_run_id TEXT NOT NULL REFERENCES extraction_runs(id),
    old_span_key TEXT NOT NULL,
    new_span_key TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (asset_id, source_run_id, target_run_id, old_span_key)
);

CREATE INDEX ix_extraction_repair_candidates_asset_id ON extraction_repair_candidates (asset_id);

-- Durable jobs
CREATE TABLE durable_jobs (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL DEFAULT 'default-user',
    kind TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
    checkpoint_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    failure_code TEXT,
    lease_token TEXT,
    lease_expires_at TIMESTAMP,
    lease_fence INTEGER NOT NULL DEFAULT 0,
    terminal_at TIMESTAMP,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_durable_jobs_account_id ON durable_jobs (account_id);
CREATE INDEX ix_durable_jobs_state ON durable_jobs (state);

-- Annotations (U9)
CREATE TABLE annotations (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT NOT NULL DEFAULT 'default-user',
    asset_id TEXT NOT NULL REFERENCES admitted_assets(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_annotations_owner_account_id ON annotations (owner_account_id);
CREATE INDEX ix_annotations_asset_id ON annotations (asset_id);

CREATE TABLE annotation_revisions (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL REFERENCES annotations(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    state TEXT NOT NULL CHECK (state IN ('active', 'tombstoned')),
    kind TEXT NOT NULL CHECK (kind IN ('text', 'region')),
    body TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    signals_json TEXT NOT NULL DEFAULT '{}',
    source_run_id TEXT NOT NULL REFERENCES extraction_runs(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (annotation_id, revision)
);

CREATE INDEX ix_annotation_revisions_annotation_id ON annotation_revisions (annotation_id);

CREATE TABLE annotation_selector_bundles (
    revision_id TEXT PRIMARY KEY REFERENCES annotation_revisions(id),
    selectors_json TEXT NOT NULL
);

CREATE TABLE annotation_repair_decisions (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL REFERENCES annotations(id),
    source_revision_id TEXT NOT NULL REFERENCES annotation_revisions(id),
    candidate_id TEXT NOT NULL REFERENCES extraction_repair_candidates(id),
    decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
    accepted_revision_id TEXT REFERENCES annotation_revisions(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (annotation_id, candidate_id),
    CHECK ((decision = 'accepted' AND accepted_revision_id IS NOT NULL) OR (decision = 'rejected' AND accepted_revision_id IS NULL))
);

CREATE INDEX ix_annotation_repair_decisions_annotation_id ON annotation_repair_decisions (annotation_id);

-- Knowledge (U10)
CREATE TABLE knowledge_items (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT NOT NULL DEFAULT 'default-user',
    asset_id TEXT NOT NULL REFERENCES admitted_assets(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_knowledge_items_owner_account_id ON knowledge_items (owner_account_id);
CREATE INDEX ix_knowledge_items_asset_id ON knowledge_items (asset_id);

CREATE TABLE knowledge_revisions (
    id TEXT PRIMARY KEY,
    knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected', 'superseded')),
    kind TEXT NOT NULL CHECK (kind IN ('summary', 'concept', 'claim', 'relation', 'finding', 'preference')),
    content_json TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    producer_kind TEXT NOT NULL,
    producer_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (knowledge_item_id, revision)
);

CREATE INDEX ix_knowledge_revisions_item_id ON knowledge_revisions (knowledge_item_id);

CREATE TABLE knowledge_evidence_links (
    id TEXT PRIMARY KEY,
    knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
    revision INTEGER NOT NULL,
    source_category TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_run_id TEXT,
    source_version TEXT,
    locator TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('support', 'counter', 'comparison', 'context')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (knowledge_item_id, revision) REFERENCES knowledge_revisions (knowledge_item_id, revision)
);

CREATE INDEX ix_knowledge_evidence_links_item_id ON knowledge_evidence_links (knowledge_item_id);

CREATE TABLE knowledge_review_decisions (
    id TEXT PRIMARY KEY,
    knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
    source_revision INTEGER NOT NULL,
    action TEXT NOT NULL,
    resulting_revision INTEGER,
    actor_account_id TEXT NOT NULL DEFAULT 'default-user',
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_knowledge_review_decisions_item_id ON knowledge_review_decisions (knowledge_item_id);

CREATE TABLE knowledge_thresholds (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT NOT NULL DEFAULT 'default-user',
    task_type TEXT NOT NULL,
    minimum_confidence REAL NOT NULL CHECK (minimum_confidence >= 0 AND minimum_confidence <= 1),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_account_id, task_type)
);

CREATE INDEX ix_knowledge_thresholds_owner_account_id ON knowledge_thresholds (owner_account_id);

-- Research preferences (U11)
CREATE TABLE research_preferences (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT NOT NULL DEFAULT 'default-user',
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_account_id, key)
);

CREATE INDEX ix_research_preferences_owner_account_id ON research_preferences (owner_account_id);

-- Authority generation (for optimistic concurrency)
CREATE TABLE authority_generation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    generation INTEGER NOT NULL DEFAULT 0
);

INSERT INTO authority_generation (id, generation) VALUES (1, 0);

-- Provenance events
CREATE TABLE provenance_events (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_provenance_events_subject ON provenance_events (subject_id, subject_type);

-- Outbox events
CREATE TABLE outbox_events (
    id TEXT PRIMARY KEY,
    stream TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    UNIQUE (stream, sequence)
);

CREATE INDEX ix_outbox_events_stream ON outbox_events (stream);

CREATE TABLE event_consumer_receipts (
    consumer_id TEXT PRIMARY KEY,
    stream TEXT NOT NULL,
    last_sequence INTEGER NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);