---
name: requirements-to-tasks
description: Supervisor procedure for converting business requirements into technical task cards for Backend, Frontend and Tester agents. Use when a new feature, change request, or phase scope must be decomposed into implementable, testable work.
---

# Requirements → task cards

## Steps

1. **Trace:** find the requirement IDs in `docs/PRD.md` (for example `FR-MATCH-03`). If the requirement is missing or ambiguous, list the questions for the human. Do not guess on business rules.
2. **Slice vertically:** each feature becomes contract, backend, frontend and tests. Prefer thin end-to-end slices over layer-by-layer work.
3. **Contract first:** the first card of every feature is "API contract + shared Zod schemas" (owner Backend, reviewed by Supervisor). Frontend cards depend on it.
4. **Write cards** in `docs/tasks/<phase>/<ID>-<slug>.md` using the template below. IDs follow `P<phase>-<AREA>-<nn>`, for example `P2-API-04`.
5. **Order and parallelise:** add a dependency list and mark which cards can run in parallel.
6. **Return** the card list to the orchestrator for Gate A.

## Task card template

```markdown
# <ID>: <title>
Owner: backend | frontend | tester        Estimate: S | M | L
Requirements: FR-xxx, NFR-xxx
Depends on: <IDs>

## Goal
<one paragraph, user-facing value>

## Scope
- In: ...
- Out: ...

## Contracts / inputs
- Endpoints: <method path> (docs/API.md#anchor)
- Schemas: packages/shared/src/<file>.ts → <SchemaName>
- Tables: <model names>

## Acceptance criteria
1. Given ... When ... Then ...
2. ...

## Test requirements
- Unit: ...
- Integration: ...
- E2E / non-functional: ...

## Notes / risks
```

## Quality bar

- Every acceptance criterion can be tested by machine.
- No card larger than L. Split it if it is larger.
- Security, privacy and approval implications are stated explicitly.
