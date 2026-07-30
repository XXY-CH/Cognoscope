-- U7 normalized extraction snapshots. Append-only run lineage; source bytes remain in the blob store.
CREATE UNIQUE INDEX uq_admitted_asset_extraction_authority ON admitted_assets (id, blob_digest, detected_format, format_tier);
CREATE UNIQUE INDEX uq_durable_job_asset ON durable_jobs (id, admitted_asset_id);

CREATE TABLE extraction_runs (
    id VARCHAR(36) PRIMARY KEY,
    asset_id VARCHAR(36) NOT NULL,
    job_id VARCHAR(36),
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('completed', 'blocked', 'failed')),
    adapter_id VARCHAR(128),
    adapter_version VARCHAR(128),
    adapter_revision VARCHAR(128),
    artifact_digest VARCHAR(64),
    artifact_json TEXT,
    source_blob_digest VARCHAR(64) NOT NULL REFERENCES blob_records(digest),
    detected_format VARCHAR(32) NOT NULL CHECK (detected_format IN ('pdf', 'epub', 'docx', 'html', 'markdown', 'text', 'pptx', 'xlsx', 'image')),
    format_tier VARCHAR(32) NOT NULL CHECK (format_tier IN ('first_class', 'structured_secondary', 'extraction_only')),
    viewable BOOLEAN NOT NULL DEFAULT FALSE,
    annotation_capable BOOLEAN NOT NULL DEFAULT FALSE,
    limitations_json TEXT NOT NULL DEFAULT '[]',
    supersedes_run_id VARCHAR(36) REFERENCES extraction_runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_extraction_run_asset_sequence UNIQUE (asset_id, sequence),
    CONSTRAINT uq_extraction_run_supersession_edge UNIQUE (id, supersedes_run_id),
    CONSTRAINT uq_extraction_run_job UNIQUE (job_id),
    CONSTRAINT fk_extraction_run_job_asset FOREIGN KEY (job_id, asset_id) REFERENCES durable_jobs(id, admitted_asset_id),
    CONSTRAINT fk_extraction_run_admitted_authority FOREIGN KEY (asset_id, source_blob_digest, detected_format, format_tier) REFERENCES admitted_assets(id, blob_digest, detected_format, format_tier),
    CONSTRAINT ck_extraction_run_completed_artifact CHECK (status != 'completed' OR (adapter_id IS NOT NULL AND adapter_version IS NOT NULL AND adapter_revision IS NOT NULL AND artifact_digest IS NOT NULL AND artifact_json IS NOT NULL)),
    CONSTRAINT ck_extraction_run_blocked_artifact CHECK (status != 'blocked' OR (adapter_id IS NULL AND adapter_version IS NULL AND adapter_revision IS NULL AND artifact_digest IS NULL AND artifact_json IS NULL)),
    CONSTRAINT ck_extraction_run_annotation_requires_view CHECK (annotation_capable = FALSE OR viewable = TRUE),
    CONSTRAINT ck_extraction_run_tier_capabilities CHECK (status != 'completed' OR ((format_tier = 'extraction_only' AND viewable = FALSE AND annotation_capable = FALSE) OR (format_tier != 'extraction_only' AND viewable = TRUE AND annotation_capable = TRUE)))
);
CREATE INDEX ix_extraction_runs_asset_id ON extraction_runs (asset_id);
CREATE INDEX ix_extraction_runs_job_id ON extraction_runs (job_id);
CREATE INDEX ix_extraction_runs_status ON extraction_runs (status);
CREATE INDEX ix_extraction_runs_source_blob_digest ON extraction_runs (source_blob_digest);
CREATE INDEX ix_extraction_runs_supersedes_run_id ON extraction_runs (supersedes_run_id);

CREATE TABLE extraction_parts (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    key VARCHAR(256) NOT NULL,
    kind VARCHAR(64) NOT NULL,
    title VARCHAR(1024),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    parent_key VARCHAR(256),
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT uq_extraction_part_run_key UNIQUE (run_id, key),
    CONSTRAINT uq_extraction_part_run_ordinal UNIQUE (run_id, ordinal),
    FOREIGN KEY (run_id, parent_key) REFERENCES extraction_parts(run_id, key)
);
CREATE INDEX ix_extraction_parts_run_id ON extraction_parts (run_id);

CREATE TABLE extraction_pages (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    number INTEGER NOT NULL CHECK (number > 0),
    mode VARCHAR(32) NOT NULL,
    source_text TEXT,
    ocr_text TEXT,
    normalized_text TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    width DOUBLE PRECISION,
    height DOUBLE PRECISION,
    CONSTRAINT uq_extraction_page_run_number UNIQUE (run_id, number)
);
CREATE INDEX ix_extraction_pages_run_id ON extraction_pages (run_id);

CREATE TABLE extraction_blocks (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    key VARCHAR(256) NOT NULL,
    kind VARCHAR(64) NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    page_number INTEGER NOT NULL,
    part_key VARCHAR(256) NOT NULL,
    source_text TEXT,
    ocr_text TEXT,
    normalized_text TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    bounding_box_json TEXT,
    CONSTRAINT uq_extraction_block_run_key UNIQUE (run_id, key),
    CONSTRAINT uq_extraction_block_run_ordinal UNIQUE (run_id, ordinal),
    FOREIGN KEY (run_id, page_number) REFERENCES extraction_pages(run_id, number),
    FOREIGN KEY (run_id, part_key) REFERENCES extraction_parts(run_id, key)
);
CREATE INDEX ix_extraction_blocks_run_id ON extraction_blocks (run_id);

CREATE TABLE extraction_spans (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    key VARCHAR(256) NOT NULL,
    block_key VARCHAR(256) NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
    end_offset INTEGER NOT NULL CHECK (end_offset >= start_offset),
    text TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    bounding_boxes_json TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT uq_extraction_span_run_key UNIQUE (run_id, key),
    FOREIGN KEY (run_id, block_key) REFERENCES extraction_blocks(run_id, key)
);
CREATE INDEX ix_extraction_spans_run_id ON extraction_spans (run_id);

CREATE TABLE extraction_bibliographic_candidates (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    key VARCHAR(256) NOT NULL,
    csl_json TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    provenance_json TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT uq_extraction_bibliographic_candidate_run_key UNIQUE (run_id, key)
);
CREATE INDEX ix_extraction_bibliographic_candidates_run_id ON extraction_bibliographic_candidates (run_id);

CREATE TABLE extraction_findings (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    code VARCHAR(256) NOT NULL,
    severity VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    page_number INTEGER,
    block_key VARCHAR(256),
    span_key VARCHAR(256),
    requires_review BOOLEAN NOT NULL DEFAULT FALSE,
    confidence DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_extraction_findings_run_id ON extraction_findings (run_id);
CREATE INDEX ix_extraction_findings_severity ON extraction_findings (severity);
CREATE INDEX ix_extraction_findings_requires_review ON extraction_findings (requires_review);

CREATE TABLE extraction_run_diffs (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    previous_run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    added_span_count INTEGER NOT NULL CHECK (added_span_count >= 0),
    removed_span_count INTEGER NOT NULL CHECK (removed_span_count >= 0),
    changed_block_count INTEGER NOT NULL DEFAULT 0 CHECK (changed_block_count >= 0),
    CONSTRAINT uq_extraction_run_diff_run UNIQUE (run_id),
    CONSTRAINT uq_extraction_run_diff_edge UNIQUE (run_id, previous_run_id),
    CONSTRAINT fk_extraction_run_diff_supersession_edge FOREIGN KEY (run_id, previous_run_id) REFERENCES extraction_runs(id, supersedes_run_id)
);
CREATE INDEX ix_extraction_run_diffs_run_id ON extraction_run_diffs (run_id);
CREATE INDEX ix_extraction_run_diffs_previous_run_id ON extraction_run_diffs (previous_run_id);

CREATE TABLE extraction_repair_candidates (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    previous_run_id VARCHAR(36) NOT NULL,
    old_span_key VARCHAR(256) NOT NULL,
    new_span_key VARCHAR(256) NOT NULL,
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0 AND score <= 1),
    CONSTRAINT uq_extraction_repair_candidate_mapping UNIQUE (run_id, old_span_key, new_span_key),
    CONSTRAINT fk_extraction_repair_diff_edge FOREIGN KEY (run_id, previous_run_id) REFERENCES extraction_run_diffs(run_id, previous_run_id),
    CONSTRAINT fk_extraction_repair_old_span FOREIGN KEY (previous_run_id, old_span_key) REFERENCES extraction_spans(run_id, key),
    FOREIGN KEY (run_id, new_span_key) REFERENCES extraction_spans(run_id, key)
);
CREATE INDEX ix_extraction_repair_candidates_run_id ON extraction_repair_candidates (run_id);
CREATE INDEX ix_extraction_repair_candidates_previous_run_id ON extraction_repair_candidates (previous_run_id);


CREATE TABLE extraction_evidence_summaries (
    id VARCHAR(36) PRIMARY KEY,
    run_id VARCHAR(36) NOT NULL REFERENCES extraction_runs(id),
    key VARCHAR(256) NOT NULL,
    summary TEXT NOT NULL,
    evidence_span_keys_json TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT uq_extraction_evidence_summary_run_key UNIQUE (run_id, key)
);
CREATE INDEX ix_extraction_evidence_summaries_run_id ON extraction_evidence_summaries (run_id);
