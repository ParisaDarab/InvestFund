---
name: e2e-testing
description: Tester procedure for Playwright end-to-end tests of complete user journeys (founder, investor, admin) running against the sandbox stack, including axe accessibility checks and visual snapshots. Use when a user-facing flow is completed or at phase end.
---

# E2E testing (Playwright)

## Setup

- Tests live in `apps/web/e2e/`, with page objects in `e2e/pages/` and fixtures in `e2e/fixtures/`.
- Run against the sandbox (`infra/docker-compose.yml` with the `sandbox` profile). The base URL is the web app; the API uses the seeded database.
- Auth fixtures: log in once per role through the API and reuse the `storageState`.
- Use selectors in this order: `getByRole`, then `getByLabel`, then `data-testid`. Never use CSS classes.

## Core journeys (grow per phase)

1. Founder signs up → verifies email (Mailpit) → completes the onboarding wizard → uploads a deck → reviews the AI-extracted facts → publishes the profile.
2. Investor signs up → self-certifies (sophisticated/HNW) → admin verifies → sets the thesis.
3. Matching run → founder sees ranked investors with rationale → expresses interest → investor accepts (double opt-in) → full profile unlocks.
4. Founder generates an outreach draft → edits → **approves** → mock Gmail receives exactly one send → a reply is simulated → status updates.
5. Meeting proposal → mock Calendar free/busy → approve → event created → both get notifications.
6. In-app messaging between matched parties.
7. Admin updates the LLM settings and matching weights.

## Also

- `@axe-core/playwright` scan on every visited page: no serious or critical violations.
- Run in both dark and light themes, at desktop and mobile viewport.
- Negative journeys: an unapproved draft cannot be sent; an investor cannot open a gated profile through a direct URL.
- Traces on failure, attached to the test report.
