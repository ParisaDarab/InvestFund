---
name: code-review-standards
description: Supervisor checklist for reviewing a Backend/Frontend/Tester diff against task acceptance criteria, architecture, security, privacy and project standards before a commit is proposed to the human. Use after implementation and testing, before Gate B.
---

# Standards review

Run `git diff main...HEAD` (or the staged diff) and the task's test report, then check:

## Correctness
- [ ] Every acceptance criterion is implemented and has a test
- [ ] Matches `docs/API.md` and the shared Zod schemas exactly
- [ ] Edge cases: empty, large and concurrent inputs; partial failures

## Architecture
- [ ] Layering respected (routes → controller → service → repository; no Prisma in controllers, no HTTP in services)
- [ ] Integrations accessed only through their interfaces
- [ ] No duplication of an existing utility. No dead code.

## Security and privacy
- [ ] Input validated; auth, role and ownership enforced
- [ ] Tiered startup visibility respected
- [ ] No secrets, tokens or PII in logs, errors or the client bundle
- [ ] Side effects gated by an ApprovalRecord
- [ ] LLM output validated, and uploaded-document text treated as untrusted (prompt-injection safe)

## Quality
- [ ] TypeScript strict, lint clean, no unexplained `any`
- [ ] Coverage thresholds met; tests deterministic
- [ ] Frontend: all states handled, a11y checks pass, strings through i18n, tokens only
- [ ] Docs, OpenAPI and ADR updated when needed

## Verdict format

```
Review <task ID>: PASS | CHANGES REQUIRED
Blocking: <file:line → issue → required fix>
Non-blocking: <suggestions>
```
