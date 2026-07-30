-- Restore must block worker claims until authority/blob reconciliation completes.
ALTER TABLE authority_generation
    ADD COLUMN recovery_required BOOLEAN NOT NULL DEFAULT FALSE;
