# Domain rules

The rules below are implemented once in `packages/shared/src/domain` (pure functions and
state-machine tables shared by the web and the API) and enforced by the API services. The web
uses the same tables only to decide which buttons to show; the API is authoritative.

## 1. Money and funding plans

- Amounts are BIGINT **minor units** (pence/cents) carried as digit strings in JSON, always
  next to an explicit ISO 4217 `currency` (`GBP` default; `EUR`, `USD` allowed). No float is used
  anywhere; formatting passes a decimal string to `Intl.NumberFormat`.
- Amounts in different currencies are never compared, summed or converted.

### 1.1 Startup funding plan (`checkFundingPlan`)
1. Every amount is > 0.
2. `minimum ≤ target ≤ maximum` (the target must sit inside the acceptable range).
3. Milestones use the startup currency and are > 0.
4. Σ milestone allocations ≤ target (the remainder is unallocated general funding). Equal is allowed.
5. A deadline must be a real calendar date; at publication it must not be in the past.
6. The currency cannot change once milestones exist or the startup is published.

Drafts may be partial; every rule that *can* be evaluated on the supplied fields is enforced on
every write. Publication (`getPublicationIssues`) additionally requires: name, tagline,
description, sector, stage, country, at least one funding purpose, the three amounts, and at least
one milestone. A published startup must remain publishable after any edit.

### 1.2 Supporter range
Both bounds optional (open-ended); when both are set `min ≤ max`.

## 2. Connections

| From | Action | Actor | To |
|---|---|---|---|
| pending | accept | recipient (founder) | accepted (+ conversation created atomically) |
| pending | decline | recipient | declined |
| pending | withdraw | requester (supporter) | withdrawn |

- Supporters initiate (rule 1 of the brief). The row is keyed by (startup, supporter) whatever the
  direction, and a partial unique index allows only one `pending|accepted` row per pair, so
  duplicates and reverse-direction duplicates are impossible, including under concurrency.
- After a decline the supporter can ask again after 30 days; after a withdrawal at once.
- At most 25 pending requests per supporter (abuse control), plus the `sensitive` rate limit.
- Accepting a connection is not accepting a funding offer.

## 3. Conversations

One conversation per accepted connection (unique `connection_id`). Only the two participants
can read or write (others get 404). Messages are persisted before delivery; `(sender,
clientMessageId)` is unique so retries return the stored message. Unread = messages from the
other party newer than the reader's `last_read_at` (derived, not a counter). A conversation is
read-only when the connection is not accepted, either party is suspended, or either blocked the
other.

## 4. Offers and deals

A **deal** is one negotiation on a connection plus, once agreed, its reported outcome. At most one
`negotiating` deal per connection; later deals may follow on the same connection.

### 4.1 Offer revisions (immutable terms)

| From | Action | Actor | Result |
|---|---|---|---|
| pending | accept | recipient | offer accepted; deal → accepted |
| pending | decline | recipient | offer declined; deal → declined |
| pending | counter | recipient | offer countered; new revision (creator = countering party) |
| pending | revise | creator | offer superseded; new revision by the same creator |
| pending | withdraw | creator | offer withdrawn; deal → withdrawn |
| pending | expire | system | offer expired; deal → expired (lazily on response, and by a minute sweep) |

Rules: terms of a sent revision never change; revisions link by `previous_offer_id` (unique,
linear chain); the active proposal is `deals.current_offer_id`. Responses name the offer they
answer, and a stale id is a 409. Every write locks the deal row (`FOR UPDATE`) and bumps
`deals.version`, so concurrent responses cannot both apply. Offer currency = startup currency;
milestones must belong to the startup; `respondBy` within 90 days. No equity fields exist.

### 4.2 Outcome lifecycle

| From | Action | Actor | To |
|---|---|---|---|
| accepted | report_funding | supporter | funding_reported |
| accepted | cancel (reason) | either | cancelled |
| funding_reported | confirm_receipt | founder | completed |
| funding_reported | dispute_receipt (reason) | founder | receipt_disputed |
| receipt_disputed | report_funding | supporter | funding_reported |
| funding_reported, receipt_disputed | request_cancellation (reason) | either | cancellation_requested |
| cancellation_requested | confirm_cancellation | the other party | cancelled |
| cancellation_requested | reject_cancellation | the other party | previous status |
| cancellation_requested | withdraw_cancellation | the requester | previous status |

Completion requires both confirmations (the supporter's report and the founder's receipt).
Disagreement is preserved as `receipt_disputed` or a rejected cancellation, never overwritten.
Every transition is appended to `deal_events` (actor, from, to, note) and to `audit_events`.
Lifecycle actions carry the deal `version` (409 when stale). "Reported" and "confirmed" are
statements by the parties; the platform verifies nothing.

## 5. Documents

Access = founder of the startup, or a supporter with an **accepted** connection, no block, both
accounts active, and (`all_connections` visibility or an explicit grant for that connection).
Checked per request on list and download; unauthorised → 404. Types: PDF, PNG, JPEG, plain text,
≤ 10 MB; declared type, extension and magic bytes must agree. Names are sanitised for display;
storage keys are random. Downloads are `attachment`, `nosniff`, `no-store`, sandboxed CSP, and
audited. Revoking a grant or blocking takes effect on the next request.

## 6. Blocking and suspension

If A blocks B (either direction): no new connection requests, no accepting their pending request
(pending requests are closed immediately), no messages (conversation read-only), no new offers or
counteroffers/acceptances (withdraw and decline remain so a negotiation can be closed), no
document access, and each disappears from the other's search and recommendations. Existing
history stays visible. Agreed outcomes (report, confirm, cancel) remain possible so they can be
closed honestly. Unblocking restores interaction.

Suspension (admin): sessions revoked, access tokens rejected on the next request (guards read the
status from the database), real-time streams closed, the user's startups disappear from public
discovery, and their conversations become read-only for the other party.

## 7. Notifications

Created in the same transaction as the event, deduplicated by `(user, dedupe_key)`; email queued
in `email_outbox` with its own unique key and the user's email preference. Payloads contain names
and links only, never message text, conditions, amounts in disputes or document content.
Message notifications are sent for the first unread message of a burst only.
