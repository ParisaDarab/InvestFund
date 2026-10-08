---
name: nextjs-feature
description: Frontend procedure for building a feature in apps/web with Next.js App Router - route structure, server vs client components, role-gated layouts, multi-step forms/wizards, file upload, async AI job progress and draft-approval UX. Use for any new page or feature UI.
---

# Next.js feature

## Steps

1. Read the task card, the API contract and the design patterns.
2. Place the route under the correct group: `(marketing)`, `(auth)` or `(app)/<role>/...`. Role layouts check the session and redirect unauthorised users.
3. Use a Server Component for the page shell and Client Components for forms and interactive widgets.
4. Put strings in `messages/en.json` under `<feature>.*`.
5. Implement every state: loading (skeleton), empty (with CTA), error (retry), forbidden.
6. Add `data-testid` on key interactive elements for Playwright.
7. Write component tests for logic-heavy components.

## Forms and wizards

- Use React Hook Form with `zodResolver(SharedSchema)`, reusing the **same** schema as the API.
- Onboarding wizards have steps that match the PRD sections (Company → Team → Product → Traction → Fundraising → Use of funds → Documents → Review). They autosave the draft (`PATCH`) on step change, show a progress indicator, and support resume.
- Money inputs are GBP by default, stored as minor units, and formatted with `Intl.NumberFormat('en-GB')`.

## File upload

A drag-and-drop zone with type and size validation, an upload progress bar, then an "AI is extracting…" job status. The extracted facts are shown for the founder to **review and accept or edit** before they are applied.

## AI job UX

`202` → poll `GET /jobs/{id}` with TanStack Query `refetchInterval` (or SSE). The user can leave the page; a notification arrives when the job is done.

## Draft-approval UX (critical)

Email and meeting drafts appear in a review panel with:
- an editable subject and body, the recipient, the scheduled time and the time zone
- the AI rationale as a collapsed disclosure
- the buttons **Approve & send**, **Save edits** and **Discard**

The approve button calls the approve endpoint. Show a confirmation dialog the first time. Never auto-send.
