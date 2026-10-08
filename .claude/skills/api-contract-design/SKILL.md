---
name: api-contract-design
description: Supervisor procedure for deciding which REST endpoints are needed and specifying their contracts in docs/API.md and packages/shared Zod schemas. Use before any feature implementation begins or when an endpoint must change.
---

# API contract design

## Per endpoint, specify in `docs/API.md`

```markdown
### POST /api/v1/startups/{startupId}/documents
Purpose: upload a supporting document for AI extraction
Auth: founder (owner) | admin
Request: multipart/form-data: file (pdf|pptx|docx|xlsx, ≤25 MB), kind: DocumentKind
Response 202: DocumentResource + extraction job link
Errors: 400 validation, 401, 403 not owner, 413 too large, 415 type, 429
Idempotency: Idempotency-Key header supported
Rate limit: 20/min/user
Shared schemas: UploadDocumentRequest, DocumentResource
Requirement: FR-STARTUP-07
```

## Conventions

- Base path `/api/v1`. Plural nouns, nested resources only one level deep, and kebab-case paths.
- JSON in `camelCase`. Timestamps in ISO 8601 UTC. Money as `{ amountMinor: string, currency: "GBP" }`.
- Cursor pagination: `?cursor=&limit=` → `{ data: [], nextCursor }`.
- Errors use RFC 9457 `application/problem+json` with `type`, `title`, `status`, `detail` and `errors[]`.
- Async work returns `202` plus `Location: /api/v1/jobs/{id}`. Job resources have `status`, `progress` and `result`.
- Side-effecting actions are explicit sub-resources, for example `POST /outreach/drafts/{id}/approve` and `POST /meetings/proposals/{id}/confirm`.
- Role-based visibility: document which fields each role sees, for example the investor teaser vs the full startup view.
- Every endpoint maps to one Zod schema pair in `packages/shared/src/api/<domain>.ts`, and OpenAPI is generated from them.

## Checklist before Gate A

- [ ] Every PRD functional requirement in scope maps to endpoints
- [ ] Auth, role and ownership defined for every endpoint
- [ ] Error cases enumerated
- [ ] No endpoint leaks gated startup data
- [ ] Rate limits on auth, AI and upload endpoints
