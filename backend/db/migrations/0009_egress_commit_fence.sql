-- A committed egress prevents revocation from reporting success before its provider attempt finishes.
ALTER TABLE external_dispatches ADD COLUMN egress_committed_at TIMESTAMP WITH TIME ZONE;
