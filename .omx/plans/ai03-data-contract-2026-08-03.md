# AI-03 Data Contract

## Invariants

- Every QA record has a non-empty `fileId`; list order is `createdAt` ascending.
- A file switch invalidates in-flight UI writes, but does not delete the old file's persisted messages.
- An assistant message may be persisted as `streaming` during a network request; cancel/failure transitions it to `error` with an explanatory local message.
- `ResearchDigest.structured` is derived from `markdown`; `ResearchSignal`, `ResearchLead`, `EvidenceRow` and `EvidenceLocator` remain the authoritative provenance records.
- No AI failure mutates annotations or promotes an unresolved locator to verified/citation-ready.

## Migration / rollback

Upgrade v10 -> v11 only creates `qaMessages` and its `by-file`/`by-created` indexes. Rollback is additive: old stores and records remain readable; the feature can be disabled while retaining persisted QA.
