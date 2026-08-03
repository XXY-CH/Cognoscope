# AI-03 Architecture Contract

- `qaMessages` is a new additive object store (schema v11). Existing v10 records are untouched.
- `QaMessage` keeps `id`, `fileId`, role/content/quote/page/status; a persisted `updatedAt` is optional for old records and new writes use `createdAt` as the stable ordering key.
- `ResearchDigest.structured` is nullable/backward-compatible. Its sections are a projection of the Markdown response, not a second evidence source.
- Digest generation remains a post-session action. `useReadingSession` still owns session finalization; `ReaderPage` passes the ended session id and reads persisted QA before invoking artifact creation.
- Abort and file-switch guards are request-local and nonce-based; no store imports another Zustand store.
- Hard deletion of a file deletes QA messages with the other file-owned data. Soft delete keeps them navigable only while the source file remains available.
