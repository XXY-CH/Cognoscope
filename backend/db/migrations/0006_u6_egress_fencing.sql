-- U6 egress starts are lease-bound and single-use. Existing migrations are immutable.
ALTER TABLE external_dispatches ADD COLUMN egress_token_digest VARCHAR(64);
ALTER TABLE external_dispatches ADD COLUMN egress_job_id VARCHAR(36) REFERENCES durable_jobs(id);
ALTER TABLE external_dispatches ADD COLUMN egress_lease_fence INTEGER;
ALTER TABLE external_dispatches ADD COLUMN egress_started_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX ix_external_dispatches_egress_job_id ON external_dispatches (egress_job_id);
