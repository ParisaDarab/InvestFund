# InvestFund: Product Requirements Document (PRD)

Status: **Draft v0.1, awaiting human approval (Gate A)**
Source: the human's project brief (sections 1–4) plus the interview decisions. Sections marked *[Drafted]* were written by Claude from standard practice because the brief was truncated. Please review them.

---

## 1. Vision

An AI-powered, two-sided platform connecting **UK startups seeking investment** with **investors seeking opportunities**. An agentic AI engine understands both sides, ranks matches with explanations, improves founders' readiness, and runs approval-controlled outreach and meeting scheduling through Gmail and Google Calendar.

## 2. Users and roles

| Role | Description |
|---|---|
| Founder | Creates and manages a startup profile and fundraising campaigns. A startup can have several founder users (owner + members). |
| Investor | Angel, VC fund, family office / CVC, syndicate or accelerator. VC funds and other firms can have several team members. |
| Admin | Verifies users, moderates content, manages LLM settings and matching weights, views analytics. |

## 3. Decisions from the interview

| Topic | Decision |
|---|---|
| MVP scope | Profiles and document AI extraction, two-sided AI matching, startup and deck analysis, Gmail outreach and tracking, Calendar scheduling, in-app messaging, notifications, admin panel |
| Investor data | Self-registered investors only (no scraped or imported lists) |
| Contact model | Double opt-in. Contact details and messaging unlock when both sides accept. |
| Startup data privacy | Tiered visibility (§7) |
| AI autonomy | Every email and meeting invite needs explicit user approval |
| Market | UK-focused, GBP, SEIS/EIS, Companies House |
| LLM | OpenAI-compatible, admin-configured Base URL, API key and model name (platform-wide, optional override per task) |
| Auth | Email/password + Google OAuth |
| Storage | Local disk behind a swappable interface |
| UI language | English, i18n-ready |
| Monetisation | None in the MVP (no subscriptions or payments) |

## 4. Startup / founder requirements

### FR-STARTUP-01 Company information
Startup name, description, industry, sub-industry, business model (B2B/B2C/B2B2C/marketplace/SaaS/other), country (default UK), city, target markets, website, company stage, founded date, team size, **Companies House number** (optional, validated format), **SEIS/EIS eligibility** (none / SEIS / EIS / both / advance assurance obtained).

### FR-STARTUP-02 Founding team
For each founder: name, role, biography, previous startup experience, relevant industry experience, LinkedIn URL, expertise tags. Founders can invite co-founders as platform users.

### FR-STARTUP-03 Product
Product description, problem, solution, product category, technology used, competitive advantages, intellectual property, current product status (idea / prototype / MVP / launched / scaling).

### FR-STARTUP-04 MVP and traction
MVP description, MVP URL, demo URL, **demo credentials (encrypted, visible only after an accepted match)**, screenshots, product documentation, current users, paying customers, revenue, MRR, growth rate, retention, other metrics (key/value with period).

### FR-STARTUP-05 Fundraising requirement
Amount required, currency (GBP default), current round (pre-seed / seed / Series A / Series B+ / bridge), minimum acceptable investment (minimum cheque), maximum target, target valuation (pre-money), equity offered %, instrument (equity / SAFE / ASA (Advance Subscription Agreement) / convertible note / other).

### FR-STARTUP-06 Use of funds
Line items: category (product development, hiring, marketing, sales, geographic expansion, infrastructure, R&D, working capital, other), requested amount, allocation %, description, expected outcome. Validation: the allocations total 100% and the amounts total the round target (±1%).

### FR-STARTUP-07 Fundraising timeline *[Drafted]*
Fundraising start date, desired close date, amount already committed or raised in this round, existing investors (name, type, amount; optional), lead investor secured (yes/no), next milestones that the funding unlocks.

### FR-STARTUP-08 Document upload and AI extraction
Upload a pitch deck, business plan, product docs, financial model, market research, technical docs or other files (PDF, PPTX, DOCX, XLSX; at most 25 MB each). The AI extracts structured facts with source references. **The founder reviews and accepts or edits the facts before they update the profile.**

### FR-STARTUP-09 Onboarding UX
A multi-step wizard with autosave, a profile-completeness score, and a publish action. Only published profiles are matched.

## 5. Investor requirements *[Drafted: please review]*

### FR-INV-01 Investor identity
Investor type (angel, VC fund, family office, CVC, syndicate, accelerator/incubator), display name, firm name, role, bio, LinkedIn, website, location, team members (for firms).

### FR-INV-02 Regulatory self-certification
At onboarding the investor self-certifies under the UK financial-promotion regime (certified high-net-worth, certified or self-certified sophisticated investor) or confirms they are an investment professional or firm. The statement text, timestamp and expiry (12 months) are stored. Until an admin verifies them, investors can only see anonymised teasers. *Legal wording must be confirmed by a UK adviser before launch.*

### FR-INV-03 Investment thesis
Preferred stages, sectors/sub-industries, excluded sectors, geographies, business models, cheque size (min/max, GBP), target ownership %, instruments accepted, SEIS/EIS preference, lead/follow preference, traction expectations (for example minimum MRR), free-text thesis (used for semantic matching), ESG/impact preferences.

### FR-INV-04 Capacity and activity
Fund size or annual allocation, number of investments per year, current deployment status (actively investing / selective / paused), typical decision time.

### FR-INV-05 Portfolio
Portfolio companies (name, sector, stage at investment, year), used for matching, conflict checks and credibility.

## 6. AI features

| ID | Feature | Notes |
|---|---|---|
| FR-AI-01 | Document extraction | §4 FR-STARTUP-08 |
| FR-AI-02 | **Two-sided matching** | Hard filters (stage, sector, cheque size vs round, geography, instrument, SEIS/EIS) → semantic similarity (startup profile vs thesis embeddings) → weighted score → LLM rationale (why it fits, concerns) for the top N. Founders see ranked investors; investors see a ranked deal flow. Matching weights have defaults and are admin-adjustable. |
| FR-AI-03 | Startup analyzer | Scores 6 areas (team, market, product, traction, business model, fundraising readiness) from 0 to 100, benchmarked by stage, with prioritised fixes. Limited to N runs a month per startup (configurable). |
| FR-AI-04 | Pitch deck coach | Deck score 0–100, slide-by-slide feedback (story, clarity, data, design hierarchy), missing standard slides. |
| FR-AI-05 | Outreach drafting | Personalised first emails and follow-ups grounded in both profiles. Always saved as drafts. |
| FR-AI-06 | Reply classification | Classifies incoming replies (interested / needs info / not now / declined / out of office) and suggests next actions. |
| FR-AI-07 | Meeting proposal | Proposes slots from free/busy data in Europe/London time and produces a meeting draft. |
| FR-AI-08 | Agent assistant | A chat assistant per user that can search matches, summarise profiles and create drafts using read-only and draft-only tools. |

## 7. Visibility and contact rules

| Data | Investor before acceptance | After double opt-in |
|---|---|---|
| Teaser: sector, stage, location, round size, instrument, one-line pitch, traction band, SEIS/EIS | ✓ (verified investors only) | ✓ |
| Company name, website, team | ✗ (founder may choose "public name") | ✓ |
| Full profile, metrics, documents | ✗ | ✓ |
| Demo credentials | ✗ | ✓ (with audit log) |
| Contact email, messaging, meetings | ✗ | ✓ |

**Flow:** a match is shown → either side clicks "Interested" → the other side gets a notification → they accept or decline → on acceptance the match is **Connected** and the data unlocks. Founders may also start Gmail outreach to a **connected** investor. *(Decision needed: should founders be able to email unconnected investors? The current assumption is no.)*

## 8. Outreach and meetings

- FR-OUT-01 Campaigns group the outreach for one fundraising round, with a pipeline view (Matched → Interested → Connected → Contacted → Replied → Meeting → Due diligence → Committed / Passed).
- FR-OUT-02 Gmail connection with incremental OAuth consent. Emails are sent from the user's own Gmail **only after approval** of each draft.
- FR-OUT-03 Reply tracking and follow-up reminders. Follow-ups are new drafts that need approval.
- FR-MEET-01 Google Calendar connection. Meeting proposals use free/busy; approving creates the event with a Google Meet link and invites.
- FR-MSG-01 In-app messaging between connected parties, with attachments (same storage rules).
- FR-NOTIF-01 In-app plus email notifications: new match, interest received, connection accepted, reply received, meeting booked, AI job done. Per-type preferences.

## 9. Admin

FR-ADM-01 User management and investor verification queue · FR-ADM-02 Content moderation and flags · FR-ADM-03 LLM settings (Base URL, API key, model per task, test-connection button) · FR-ADM-04 Matching weights and filters · FR-ADM-05 Analytics (users, matches, connections, emails sent, meetings, LLM usage and cost) · FR-ADM-06 Audit log viewer.

## 10. Marketing site

Landing page (benchmark-style), How it works, For founders, For investors, Pricing placeholder ("Free during beta"), FAQ, Privacy policy, Terms, Cookie banner (decline non-essential by default).

## 11. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-SEC-01 | OWASP Top 10 / API Top 10. RBAC and ownership on every resource. Rate limits. Encryption at rest for secrets and tokens. TLS in production. |
| NFR-PRIV-01 | UK GDPR: consent records, data export, account deletion, retention policy, DPA (Data Processing Agreement) with the LLM provider noted in the docs. Startup documents are never used for model training. |
| NFR-AI-01 | Every side effect needs a human approval record. Prompt-injection defences. LLM output is schema-validated. |
| NFR-PERF-01 | p95 latency per `docs/TEST_STRATEGY.md`. Landing LCP < 2.5s. |
| NFR-REL-01 | AI and Google calls retried with backoff. Jobs are idempotent; no duplicate sends. |
| NFR-A11Y-01 | WCAG 2.2 AA. |
| NFR-OBS-01 | Structured logs, request IDs, health checks, metrics endpoint. |
| NFR-MAINT-01 | TypeScript strict, coverage ≥ 80% (API) and ≥ 70% (web), CI green on every PR. |
| NFR-I18N-01 | All UI copy goes through next-intl. Currency and date formatting are locale-aware (en-GB). |

## 12. Out of scope for the MVP (later phases)

Payments and subscriptions · imported or scraped investor databases · managed fundraising service · data room with NDA e-signature · mobile apps · Pub/Sub Gmail push · S3 storage · multiple languages.

## 13. Open questions for the human

1. Should founders be able to email investors *before* a double opt-in connection? (Assumption: no.)
2. Confirm the investor fields in §5 and the timeline fields in FR-STARTUP-07.
3. Brand name "InvestFund" and the proposed accent colour (see `DESIGN_SYSTEM.md`).
4. Should matching weights be admin-adjustable in the MVP? (Assumption: yes, with defaults.)
5. Google Cloud project: who owns the OAuth client? It needs restricted Gmail scopes verification before public launch.
