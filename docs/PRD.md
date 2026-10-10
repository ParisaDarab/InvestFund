# InvestFund: Product Requirements (v2)

Status: **Current.** Source: the human's master brief (2026-10-10). It supersedes PRD v1
(`archive/PRD_v1_equity_ai.md`). Decisions: ADR 0002, ADR 0003.

## 1. Product

InvestFund is a two-sided marketplace that connects **technology founders** who need money to
build, validate or grow their startups with **individual supporters** who want to fund them
through **grants or donations**.

Core journey: Discover → Evaluate → Connect → Accept → Chat → Propose → Counter → Accept →
Report funding → Confirm or cancel.

The platform covers discovery, communication, structured negotiation and **user-reported**
outcomes. **It does not process payments.** Money moves outside the platform. An accepted
proposal or a reported payment does not prove that money moved, and it is not a legally binding
agreement. The UI says this wherever the distinction matters.

## 2. Users and roles

| Role | How obtained | Can |
|---|---|---|
| Founder | Chosen once at onboarding | Create, edit, publish and archive startups with milestones. Answer connection requests. Chat. Negotiate. Confirm receipt. Share confidential documents. |
| Supporter | Chosen once at onboarding | Set preferences. Get recommendations. Search and filter. Save startups. Request connections. Chat. Negotiate. Report funding. |
| Admin | Operator command only | Review the report queue. Archive listings. Suspend and reinstate users. View the operational overview. |

Sign-in is Google only. A verified Google email proves control of that email, not identity. There
is no identity or business verification in the MVP.

## 3. Decisions (fixed by the brief)

Funding types: grants and donations only (no equity). Payments: external. Onboarding: minimal,
with profiles completed later. Publishing: allowed once the required fields and at least one
milestone are valid. Discovery: personalised, deterministic, explained recommendations.
Connections: the founder must accept before chat. Offers: both parties can propose and counter,
and the full history is kept. Messaging: real time, persisted, with unread counts.
Notifications: in-app plus transactional email. Visibility: published summaries and funding
goals are public; drafts and documents are private. Moderation: block, report, admin review.
Monetisation: free. Language: English, i18n-ready. Currency: GBP default, stored explicitly.
Responsive web only.

## 4. Functional requirements (P0)

| ID | Requirement | Where |
|---|---|---|
| FR-AUTH | Google sign-in, sign-out, secure sessions, cancelled and failed sign-in handling, protected routes | `modules/auth`, web `/login`, `/auth/complete` |
| FR-ONB | First-login role choice. Separate founder and supporter onboarding. Non-essential fields optional, with explanations. | `/me/role`, `/onboarding` |
| FR-PROF | Founder profile (display name, headline, bio, country, LinkedIn). Supporter profile and preferences (display name, bio, sectors, stages, funding range and currency, geographies, purposes). | `/me/*-profile` |
| FR-STARTUP | Create, edit, draft, publish, unpublish, archive and restore. The fields in brief §9. Slug. Optimistic concurrency. | `modules/startups` |
| FR-MILESTONE | Ordered milestones (title, description, amount, optional date). At least one is required to publish. Allocations ≤ target. | `PUT /startups/{id}/milestones` |
| FR-DISC | Public search with filters (sector, stage, country, purpose, currency, amount range), sorting and pagination. Public detail by slug. | `GET /startups` |
| FR-MATCH | Personalised recommendations with a score, factor breakdown and explanation, ordered deterministically. Excludes unpublished, archived, suspended and blocked. | `GET /recommendations`, `docs/MATCHING.md` |
| FR-SAVE | Save and unsave startups, and list saved ones. | `/startups/{id}/save`, `/saved-startups` |
| FR-CONN | Request, accept, decline and withdraw. No duplicates or reverse duplicates. Server-validated transitions. A cool-down after a decline. | `modules/connections` |
| FR-CHAT | Conversation list and detail, persisted messages, real-time delivery, unread counts, read state, history paging, idempotent retries, read-only when blocked. | `modules/conversations`, `modules/realtime` |
| FR-OFFER | Structured proposals (type, amount, currency, purpose, conditions, milestones, response deadline, message). Counter, revise, accept, decline, withdraw and expire. Immutable revisions. Concurrency-safe. | `modules/deals` |
| FR-OUTCOME | Accepted → funding reported (supporter) → receipt confirmed (founder) → completed. Dispute receipt. Cancellation with a reason (direct before funding is reported, mutual after). Full audit trail. | `modules/deals` |
| FR-NOTIF | Persisted in-app notifications with unread count and links. Email for the same events, without confidential content. Idempotent, and the user can opt out of email. | `modules/notifications`, `modules/email` |
| FR-DOC | Confidential documents (PDF, PNG, JPEG, TXT, ≤ 10 MB) with private storage and authorised downloads only. Visibility `all_connections` or `selected` (grant and revoke). | `modules/documents` |
| FR-MOD | Block and unblock. Report users and listings (category and details). Admin queue, detail and resolution (dismiss, warning, archive listing, suspend user). Audit log. | `modules/moderation`, `modules/admin` |
| FR-PAGES | Public pages, founder, supporter and admin experiences, and shared components (brief §21). | `apps/web` |

## 5. Non-functional requirements

- **Security:** OWASP Top 10 and API Top 10. Server-side authorisation on every private resource,
  with 404 for resources the caller may not know about. Strict input schemas (no mass assignment).
  Rate limits. CSRF defence on cookie endpoints. Secure cookies in production. No secrets or
  message text in logs.
- **Integrity:** Database constraints for money, ranges and uniqueness. Transactions for every
  multi-row change. Row locks plus versions for concurrent negotiation.
- **Privacy:** Data minimisation. No email addresses are shown to other users. The legal review
  items are in `OPERATIONS.md` §Legal. We make no compliance claims.
- **Accessibility:** WCAG 2.2 AA target.
- **i18n:** All UI copy comes from message catalogues. Amounts and dates are formatted per locale
  from UTC storage.
- **Quality:** Unit tests for domain rules, integration tests against real PostgreSQL, and
  Playwright E2E for the primary journey.

## 6. Out of scope (MVP)

Equity, valuation and share allocation. In-platform payments or escrow. Legal contract execution.
AI matching or due diligence. Native apps. Crowdfunding mechanics. Social feeds. Typing
indicators, calls and chat attachments.

## 7. P1 (after P0 is stable)

Advanced analytics. More matching factors. Search infrastructure if scale requires it.
Fine-grained notification preferences. Richer admin tools. More languages. S3-compatible
document storage. Data export and deletion self-service.
