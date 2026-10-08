---
name: nonfunctional-testing
description: Tester procedure for non-functional testing - performance/load (k6), security (OWASP API Top 10, authz, upload abuse, prompt injection), accessibility, reliability and privacy checks against budgets in docs/TEST_STRATEGY.md. Use at phase end or when endpoints with performance/security impact change.
---

# Non-functional testing

## Performance (k6, `infra/perf/`)

| Endpoint class | Budget (sandbox, p95) |
|---|---|
| CRUD reads | < 200 ms |
| CRUD writes | < 400 ms |
| Match list (precomputed) | < 300 ms |
| Async job enqueue (AI) | < 300 ms to `202` |
| Landing page LCP | < 2.5 s (Lighthouse CI) |

Profiles: smoke (1 VU), load (50 VUs, 5 min), spike. Report p50, p95 and p99, plus the error rate.

## Security

- AuthN: JWT tampering, expired or reused refresh tokens, brute force → rate limit.
- AuthZ: an IDOR matrix (every role × every resource × not owner), and gated startup fields never leaked in list or search endpoints.
- Input: injection through every field, oversized payloads, file uploads (wrong MIME, polyglot, zip bomb, macro docs).
- AI: prompt injection through uploaded documents, profile text and incoming emails. Assert that no unauthorised tool calls happen and no data from other users leaks.
- Headers: Helmet defaults, CORS allowlist, cookie flags (`HttpOnly`, `Secure`, `SameSite`).
- Dependencies: `pnpm audit` with no high or critical findings.

## Accessibility

axe scans (see `e2e-testing`), keyboard-only walkthroughs of the onboarding and approval flows, and contrast checks in both themes.

## Reliability

LLM and Google failure injection (see `sandbox-simulation`). Restarting jobs is idempotent, and there are no duplicate sends after a retry.

## Privacy (UK GDPR)

The data export endpoint returns all of a user's data, deletion removes or anonymises it, and logs contain no PII (grep the log output in tests).
