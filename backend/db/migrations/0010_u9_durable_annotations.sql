-- U9 durable user-owned annotations. Revisions and selector bundles are append-only authority.
CREATE TABLE annotations (
    id VARCHAR(36) PRIMARY KEY,
    owner_account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    asset_id VARCHAR(36) NOT NULL REFERENCES admitted_assets(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_annotations_owner_account_id ON annotations (owner_account_id);
CREATE INDEX ix_annotations_asset_id ON annotations (asset_id);

CREATE TABLE annotation_revisions (
    id VARCHAR(36) PRIMARY KEY,
    annotation_id VARCHAR(36) NOT NULL REFERENCES annotations(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    state VARCHAR(32) NOT NULL CHECK (state IN ('active', 'tombstoned')),
    kind VARCHAR(32) NOT NULL CHECK (kind IN ('text', 'region')),
    body TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    signals_json TEXT NOT NULL DEFAULT '{}',
    source_run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    supersedes_revision_id VARCHAR(36) REFERENCES annotation_revisions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_annotation_revision UNIQUE (annotation_id, revision)
);
CREATE INDEX ix_annotation_revisions_annotation_id ON annotation_revisions (annotation_id);
CREATE INDEX ix_annotation_revisions_source_run_id ON annotation_revisions (source_run_id);

CREATE TABLE annotation_selector_bundles (
    id VARCHAR(36) PRIMARY KEY,
    annotation_revision_id VARCHAR(36) NOT NULL UNIQUE REFERENCES annotation_revisions(id),
    selectors_json TEXT NOT NULL,
    asset_fingerprint VARCHAR(64) NOT NULL,
    source_run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    page_number INTEGER,
    canonical_location TEXT,
    quote_exact TEXT,
    quote_prefix TEXT,
    quote_suffix TEXT,
    text_start INTEGER CHECK (text_start IS NULL OR text_start >= 0),
    text_end INTEGER CHECK (text_end IS NULL OR text_end >= text_start),
    block_key VARCHAR(256),
    span_key VARCHAR(256),
    geometry_json TEXT,
    epub_locator TEXT
);
CREATE INDEX ix_annotation_selector_bundles_source_run_id ON annotation_selector_bundles (source_run_id);

CREATE TABLE annotation_repair_decisions (
    id VARCHAR(36) PRIMARY KEY,
    annotation_id VARCHAR(36) NOT NULL REFERENCES annotations(id),
    source_revision_id VARCHAR(36) NOT NULL REFERENCES annotation_revisions(id),
    candidate_id VARCHAR(36) NOT NULL REFERENCES extraction_repair_candidates(id),
    decision VARCHAR(32) NOT NULL CHECK (decision IN ('accepted', 'rejected')),
    accepted_revision_id VARCHAR(36) REFERENCES annotation_revisions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_annotation_repair_candidate UNIQUE (annotation_id, candidate_id),
    CONSTRAINT ck_annotation_repair_acceptance CHECK ((decision = 'accepted' AND accepted_revision_id IS NOT NULL) OR (decision = 'rejected' AND accepted_revision_id IS NULL))
);
CREATE INDEX ix_annotation_repair_decisions_annotation_id ON annotation_repair_decisions (annotation_id);
