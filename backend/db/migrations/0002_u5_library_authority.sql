-- U5 library authority and private-blob metadata. Forward-only; raw bytes remain outside SQL.
CREATE TABLE authority_generation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE library_projects (
    id VARCHAR(36) PRIMARY KEY,
    owner_account_id VARCHAR(36) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_library_projects_owner_account_id ON library_projects (owner_account_id);

CREATE TABLE project_revisions (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES library_projects(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    title VARCHAR(512) NOT NULL,
    supersedes_revision_id VARCHAR(36) REFERENCES project_revisions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_project_revision UNIQUE (project_id, revision)
);
CREATE INDEX ix_project_revisions_project_id ON project_revisions (project_id);

CREATE TABLE library_documents (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES library_projects(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_library_documents_project_id ON library_documents (project_id);

CREATE TABLE document_revisions (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES library_documents(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    title VARCHAR(512) NOT NULL,
    supersedes_revision_id VARCHAR(36) REFERENCES document_revisions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_document_revision UNIQUE (document_id, revision)
);
CREATE INDEX ix_document_revisions_document_id ON document_revisions (document_id);

CREATE TABLE blob_records (
    digest VARCHAR(64) PRIMARY KEY,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    state VARCHAR(32) NOT NULL CHECK (state IN ('committed', 'missing', 'corrupt')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_blob_records_state ON blob_records (state);

CREATE TABLE admitted_assets (
    id VARCHAR(36) PRIMARY KEY,
    document_revision_id VARCHAR(36) NOT NULL UNIQUE REFERENCES document_revisions(id),
    blob_digest VARCHAR(64) NOT NULL REFERENCES blob_records(digest),
    detected_format VARCHAR(32) NOT NULL CHECK (detected_format IN ('pdf', 'epub', 'docx', 'html', 'markdown', 'text', 'pptx', 'xlsx', 'image')),
    format_tier VARCHAR(32) NOT NULL CHECK (format_tier IN ('first_class', 'structured_secondary', 'extraction_only')),
    media_type VARCHAR(256) NOT NULL,
    admitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_admitted_assets_document_revision_id ON admitted_assets (document_revision_id);
CREATE INDEX ix_admitted_assets_blob_digest ON admitted_assets (blob_digest);

CREATE TABLE bibliographic_records (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES library_documents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_bibliographic_records_document_id ON bibliographic_records (document_id);

CREATE TABLE bibliographic_revisions (
    id VARCHAR(36) PRIMARY KEY,
    bibliographic_record_id VARCHAR(36) NOT NULL REFERENCES bibliographic_records(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    csl_json TEXT NOT NULL,
    supersedes_revision_id VARCHAR(36) REFERENCES bibliographic_revisions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bibliographic_revision UNIQUE (bibliographic_record_id, revision)
);
CREATE INDEX ix_bibliographic_revisions_bibliographic_record_id ON bibliographic_revisions (bibliographic_record_id);

CREATE TABLE provenance_events (
    id VARCHAR(36) PRIMARY KEY,
    subject_type VARCHAR(64) NOT NULL,
    subject_id VARCHAR(36) NOT NULL,
    activity VARCHAR(128) NOT NULL,
    input_digest VARCHAR(64),
    output_digest VARCHAR(64),
    actor VARCHAR(128) NOT NULL,
    details_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_provenance_events_subject_type ON provenance_events (subject_type);
CREATE INDEX ix_provenance_events_subject_id ON provenance_events (subject_id);
