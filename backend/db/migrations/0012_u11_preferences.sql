-- U11 owner-scoped annotation preferences for bounded ranking and highlighting only.
CREATE TABLE research_preferences (
    id VARCHAR(36) PRIMARY KEY,
    owner_account_id VARCHAR(36) NOT NULL REFERENCES accounts(id),
    annotation_id VARCHAR(36) NOT NULL REFERENCES annotations(id),
    annotation_weight DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (annotation_weight >= -1 AND annotation_weight <= 1),
    highlight BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_research_preference_owner_annotation UNIQUE (owner_account_id, annotation_id)
);
CREATE INDEX ix_research_preferences_owner_account_id ON research_preferences (owner_account_id);
CREATE INDEX ix_research_preferences_annotation_id ON research_preferences (annotation_id);
