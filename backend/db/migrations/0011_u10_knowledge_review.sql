-- U10 evidence-backed knowledge proposals, review history, provenance, and auto-admission thresholds.
CREATE TABLE knowledge_items (
    id VARCHAR(36) PRIMARY KEY,
    owner_account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    asset_id VARCHAR(36) NOT NULL REFERENCES admitted_assets(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_knowledge_items_owner_account_id ON knowledge_items (owner_account_id);
CREATE INDEX ix_knowledge_items_asset_id ON knowledge_items (asset_id);

CREATE TABLE knowledge_revisions (
    id VARCHAR(36) PRIMARY KEY,
    knowledge_item_id VARCHAR(36) NOT NULL REFERENCES knowledge_items(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected', 'superseded')),
    kind VARCHAR(32) NOT NULL CHECK (kind IN ('summary', 'concept', 'claim', 'relation', 'finding', 'preference')),
    content_json TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    producer_kind VARCHAR(16) NOT NULL CHECK (producer_kind IN ('user', 'agent')),
    producer_id VARCHAR(256),
    task_type VARCHAR(128) NOT NULL,
    source_run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    supersedes_revision_id VARCHAR(36) REFERENCES knowledge_revisions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_knowledge_revision UNIQUE (knowledge_item_id, revision)
);
CREATE INDEX ix_knowledge_revisions_item_id ON knowledge_revisions (knowledge_item_id);
CREATE INDEX ix_knowledge_revisions_source_run_id ON knowledge_revisions (source_run_id);

CREATE TABLE knowledge_evidence_links (
    id VARCHAR(36) PRIMARY KEY,
    knowledge_revision_id VARCHAR(36) NOT NULL REFERENCES knowledge_revisions(id),
    source_category VARCHAR(32) NOT NULL CHECK (source_category IN ('extraction_run', 'annotation')),
    source_id VARCHAR(36) NOT NULL,
    source_run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    source_version VARCHAR(128) NOT NULL,
    locator TEXT NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('support', 'counter', 'comparison')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_knowledge_evidence_revision_id ON knowledge_evidence_links (knowledge_revision_id);
CREATE INDEX ix_knowledge_evidence_source_run_id ON knowledge_evidence_links (source_run_id);

CREATE TABLE knowledge_review_decisions (
    id VARCHAR(36) PRIMARY KEY,
    knowledge_item_id VARCHAR(36) NOT NULL REFERENCES knowledge_items(id),
    source_revision_id VARCHAR(36) NOT NULL REFERENCES knowledge_revisions(id),
    result_revision_id VARCHAR(36) REFERENCES knowledge_revisions(id),
    action VARCHAR(32) NOT NULL CHECK (action IN ('accept', 'edit_accept', 'reject', 'merge', 'split', 'relink_evidence', 'reverse', 'supersede')),
    actor_account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_knowledge_review_decisions_item_id ON knowledge_review_decisions (knowledge_item_id);

CREATE TABLE knowledge_thresholds (
    id VARCHAR(36) PRIMARY KEY,
    owner_account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    task_type VARCHAR(128) NOT NULL,
    minimum_confidence DOUBLE PRECISION NOT NULL CHECK (minimum_confidence >= 0 AND minimum_confidence <= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_knowledge_threshold_owner_task UNIQUE (owner_account_id, task_type)
);
CREATE INDEX ix_knowledge_thresholds_owner_account_id ON knowledge_thresholds (owner_account_id);
