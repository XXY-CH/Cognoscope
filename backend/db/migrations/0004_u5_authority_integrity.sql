-- U5 authority integrity hardening. Existing numbered migrations are immutable.
INSERT INTO authority_generation (id, generation)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE library_projects
    ADD CONSTRAINT fk_library_projects_owner_account
    FOREIGN KEY (owner_account_id) REFERENCES accounts(id);
