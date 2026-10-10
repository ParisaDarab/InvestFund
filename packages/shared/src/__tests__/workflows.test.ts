import { describe, expect, it } from 'vitest';

import {
  CONNECTION_TRANSITIONS,
  DEAL_STATUSES,
  DEAL_TRANSITIONS,
  OFFER_STATUSES,
  OFFER_TRANSITIONS,
  TERMINAL_DEAL_STATUSES,
  availableActions,
  transition,
} from '../domain/index.js';

describe('connection state machine', () => {
  it('lets the recipient accept or decline a pending request', () => {
    expect(transition(CONNECTION_TRANSITIONS, 'pending', 'accept', 'recipient')).toEqual({
      ok: true,
      to: 'accepted',
    });
    expect(transition(CONNECTION_TRANSITIONS, 'pending', 'decline', 'recipient')).toEqual({
      ok: true,
      to: 'declined',
    });
  });

  it('lets only the requester withdraw', () => {
    expect(transition(CONNECTION_TRANSITIONS, 'pending', 'withdraw', 'requester').ok).toBe(true);
    expect(transition(CONNECTION_TRANSITIONS, 'pending', 'withdraw', 'recipient')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(transition(CONNECTION_TRANSITIONS, 'pending', 'accept', 'requester')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it.each(['accepted', 'declined', 'withdrawn'] as const)('%s is final', (status) => {
    for (const action of ['accept', 'decline', 'withdraw'] as const) {
      expect(transition(CONNECTION_TRANSITIONS, status, action, 'recipient')).toEqual({
        ok: false,
        reason: 'invalid_transition',
      });
    }
  });
});

describe('offer state machine', () => {
  it('gives the recipient accept, decline and counter', () => {
    expect(availableActions(OFFER_TRANSITIONS, 'pending', 'recipient').sort()).toEqual([
      'accept',
      'counter',
      'decline',
    ]);
  });

  it('gives the creator withdraw and revise only', () => {
    expect(availableActions(OFFER_TRANSITIONS, 'pending', 'creator').sort()).toEqual([
      'revise',
      'withdraw',
    ]);
  });

  it('never lets anyone accept their own offer', () => {
    expect(transition(OFFER_TRANSITIONS, 'pending', 'accept', 'creator').ok).toBe(false);
  });

  it('only the system expires offers', () => {
    expect(transition(OFFER_TRANSITIONS, 'pending', 'expire', 'system')).toEqual({
      ok: true,
      to: 'expired',
    });
    expect(transition(OFFER_TRANSITIONS, 'pending', 'expire', 'recipient').ok).toBe(false);
  });

  it('every non-pending status is immutable', () => {
    for (const status of OFFER_STATUSES.filter((s) => s !== 'pending')) {
      expect(availableActions(OFFER_TRANSITIONS, status, 'recipient')).toEqual([]);
      expect(availableActions(OFFER_TRANSITIONS, status, 'creator')).toEqual([]);
    }
  });
});

describe('deal state machine', () => {
  it('follows the happy path: accepted → funding_reported → completed', () => {
    const reported = transition(DEAL_TRANSITIONS, 'accepted', 'report_funding', 'supporter');
    expect(reported).toEqual({ ok: true, to: 'funding_reported' });
    expect(transition(DEAL_TRANSITIONS, 'funding_reported', 'confirm_receipt', 'founder')).toEqual({
      ok: true,
      to: 'completed',
    });
  });

  it('only the supporter reports funding and only the founder confirms receipt', () => {
    expect(transition(DEAL_TRANSITIONS, 'accepted', 'report_funding', 'founder').ok).toBe(false);
    expect(
      transition(DEAL_TRANSITIONS, 'funding_reported', 'confirm_receipt', 'supporter').ok,
    ).toBe(false);
  });

  it('models disagreement: a disputed receipt can be re-reported', () => {
    expect(transition(DEAL_TRANSITIONS, 'funding_reported', 'dispute_receipt', 'founder')).toEqual({
      ok: true,
      to: 'receipt_disputed',
    });
    expect(transition(DEAL_TRANSITIONS, 'receipt_disputed', 'report_funding', 'supporter')).toEqual(
      {
        ok: true,
        to: 'funding_reported',
      },
    );
  });

  it('allows direct cancellation only before funding is reported', () => {
    expect(transition(DEAL_TRANSITIONS, 'accepted', 'cancel', 'founder').ok).toBe(true);
    expect(transition(DEAL_TRANSITIONS, 'funding_reported', 'cancel', 'founder').ok).toBe(false);
    expect(
      transition(DEAL_TRANSITIONS, 'funding_reported', 'request_cancellation', 'founder'),
    ).toEqual({ ok: true, to: 'cancellation_requested' });
  });

  it('has no lifecycle actions in terminal or negotiating states', () => {
    for (const status of DEAL_STATUSES) {
      if (TERMINAL_DEAL_STATUSES.has(status) || status === 'negotiating') {
        expect(availableActions(DEAL_TRANSITIONS, status, 'supporter')).toEqual([]);
        expect(availableActions(DEAL_TRANSITIONS, status, 'founder')).toEqual([]);
      }
    }
  });
});
