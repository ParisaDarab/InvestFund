/**
 * Workflow state machines (docs/DOMAIN_RULES.md §2-§4).
 *
 * Connection: the supporter (requester) asks, the founder (recipient) answers.
 * Offer: an immutable revision of terms; the recipient accepts, declines or counters; the creator
 * withdraws or revises (a revision supersedes the old terms instead of editing them).
 * Deal: the negotiation and, after acceptance, the reported (never verified) funding outcome.
 */
import type { TransitionTable } from './state-machine.js';

// ── Connections ─────────────────────────────────────────────────────────────

export const CONNECTION_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export const CONNECTION_ACTIONS = ['accept', 'decline', 'withdraw'] as const;
export type ConnectionAction = (typeof CONNECTION_ACTIONS)[number];
export type ConnectionActor = 'requester' | 'recipient';

export const CONNECTION_TRANSITIONS: TransitionTable<
  ConnectionStatus,
  ConnectionAction,
  ConnectionActor
> = {
  pending: {
    accept: { to: 'accepted', actors: ['recipient'] },
    decline: { to: 'declined', actors: ['recipient'] },
    withdraw: { to: 'withdrawn', actors: ['requester'] },
  },
  accepted: {},
  declined: {},
  withdrawn: {},
};

/** Days a supporter must wait after a decline before asking the same startup again. */
export const CONNECTION_RETRY_AFTER_DECLINE_DAYS = 30;

// ── Offers ──────────────────────────────────────────────────────────────────

export const OFFER_STATUSES = [
  'pending',
  'countered',
  'superseded',
  'accepted',
  'declined',
  'withdrawn',
  'expired',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export const OFFER_ACTIONS = [
  'accept',
  'decline',
  'counter',
  'withdraw',
  'revise',
  'expire',
] as const;
export type OfferAction = (typeof OFFER_ACTIONS)[number];
export type OfferActor = 'creator' | 'recipient' | 'system';

export const OFFER_TRANSITIONS: TransitionTable<OfferStatus, OfferAction, OfferActor> = {
  pending: {
    accept: { to: 'accepted', actors: ['recipient'] },
    decline: { to: 'declined', actors: ['recipient'] },
    counter: { to: 'countered', actors: ['recipient'] },
    withdraw: { to: 'withdrawn', actors: ['creator'] },
    revise: { to: 'superseded', actors: ['creator'] },
    expire: { to: 'expired', actors: ['system'] },
  },
  countered: {},
  superseded: {},
  accepted: {},
  declined: {},
  withdrawn: {},
  expired: {},
};

// ── Deals ───────────────────────────────────────────────────────────────────

export const DEAL_STATUSES = [
  'negotiating',
  'declined',
  'withdrawn',
  'expired',
  'accepted',
  'funding_reported',
  'receipt_disputed',
  'cancellation_requested',
  'completed',
  'cancelled',
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** Lifecycle actions after an offer was accepted (negotiation moves are offer actions). */
export const DEAL_ACTIONS = [
  'report_funding',
  'confirm_receipt',
  'dispute_receipt',
  'cancel',
  'request_cancellation',
  'confirm_cancellation',
  'reject_cancellation',
  'withdraw_cancellation',
] as const;
export type DealAction = (typeof DEAL_ACTIONS)[number];
export type DealActor = 'supporter' | 'founder';

const BOTH: readonly DealActor[] = ['supporter', 'founder'];

/**
 * `cancellation_requested` is resolved by the *other* party (confirm/reject) or the requester
 * (withdraw); the service enforces which side that is and restores `cancellationFromStatus`
 * on reject/withdraw (the `to` below is a placeholder for that restore).
 */
export const DEAL_TRANSITIONS: TransitionTable<DealStatus, DealAction, DealActor> = {
  negotiating: {},
  declined: {},
  withdrawn: {},
  expired: {},
  accepted: {
    report_funding: { to: 'funding_reported', actors: ['supporter'] },
    cancel: { to: 'cancelled', actors: BOTH },
  },
  funding_reported: {
    confirm_receipt: { to: 'completed', actors: ['founder'] },
    dispute_receipt: { to: 'receipt_disputed', actors: ['founder'] },
    request_cancellation: { to: 'cancellation_requested', actors: BOTH },
  },
  receipt_disputed: {
    report_funding: { to: 'funding_reported', actors: ['supporter'] },
    request_cancellation: { to: 'cancellation_requested', actors: BOTH },
  },
  cancellation_requested: {
    confirm_cancellation: { to: 'cancelled', actors: BOTH },
    reject_cancellation: { to: 'cancellation_requested', actors: BOTH },
    withdraw_cancellation: { to: 'cancellation_requested', actors: BOTH },
  },
  completed: {},
  cancelled: {},
};

/** Actions that need a written reason. */
export const DEAL_ACTIONS_REQUIRING_REASON: ReadonlySet<DealAction> = new Set([
  'cancel',
  'request_cancellation',
  'dispute_receipt',
]);

/** Deal statuses in which the negotiation is over without agreement. */
export const CLOSED_NEGOTIATION_STATUSES: ReadonlySet<DealStatus> = new Set([
  'declined',
  'withdrawn',
  'expired',
]);

/** Terminal statuses: nothing further can happen. */
export const TERMINAL_DEAL_STATUSES: ReadonlySet<DealStatus> = new Set([
  'declined',
  'withdrawn',
  'expired',
  'completed',
  'cancelled',
]);
