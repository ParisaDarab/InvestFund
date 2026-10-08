---
name: google-integrations
description: Backend procedure for Google OAuth sign-in and the Gmail and Google Calendar integrations - scopes, token storage, approved sending, reply tracking, free/busy lookup and event creation. Use for any code touching Google APIs.
---

# Google integrations

## OAuth

- Sign-in uses the scopes `openid email profile`.
- Gmail and Calendar are **incremental consent**, requested only when the user clicks "Connect Gmail" or "Connect Calendar":
  - Gmail: `gmail.send`, `gmail.readonly` (reply tracking). These are restricted scopes, so production needs Google verification; record this as a risk in the phase plan.
  - Calendar: `calendar.events`, `calendar.freebusy`.
- Use the `state` parameter plus PKCE. Store refresh tokens encrypted per user in `oauth_accounts`. Handle revocation gracefully and mark the integration as disconnected.

## Gmail

- **Send only via** `POST /api/v1/outreach/drafts/{id}/approve`. The service verifies the ApprovalRecord, builds an RFC 2822 MIME message from the *approved* payload (the hash must match), sends it with `users.messages.send`, and stores `threadId` and `messageId`.
- Reply tracking: a BullMQ job polls `users.history.list` (push via Pub/Sub can come later), classifies replies (interested, not now, declined, OOO) with the LLM, and updates the campaign status and notifications.
- Follow-ups are always new drafts that need approval.

## Calendar

- `freebusy.query` across both parties' connected calendars (or the founder's only, if the investor is not connected) → propose slots → a `MeetingProposal` draft.
- On approval: `events.insert` with attendees, `conferenceData` (Google Meet) and `sendUpdates: 'all'`. Store `eventId`.
- Respect time zones (default Europe/London) and working hours from user preferences.

## Abstraction and tests

Define the `GmailClient` and `CalendarClient` interfaces in `integrations/google/`. Tests use `infra/mocks/google` (an HTTP mock of the endpoints above) or in-memory fakes. Real Google APIs are never called in CI.
