/**
 * The primary journey at the API level: connect → accept → chat → propose → counter → accept →
 * report funding → confirm receipt, plus concurrency, idempotency and authorisation checks.
 */
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  publishStartup,
  startDomainHarness,
  type DomainHarness,
  type TestUser,
} from '../../__tests__/domain-support.js';

const terms = (overrides: Record<string, unknown> = {}) => ({
  fundingType: 'grant',
  amountMinor: '2500000',
  currency: 'GBP',
  purpose: 'Fund the pilot schools',
  conditions: 'Quarterly progress update',
  milestoneIds: [] as string[],
  ...overrides,
});

describe('connection → chat → negotiation → outcome', { timeout: 60_000 }, () => {
  let h: DomainHarness;
  let founder: TestUser;
  let supporter: TestUser;
  let outsider: TestUser;
  let startup: { id: string; slug: string; milestones: { id: string }[] };

  beforeAll(async () => {
    h = await startDomainHarness('api_journey');
    founder = await h.createUser({ role: 'founder' });
    supporter = await h.createUser({
      role: 'supporter',
      supporterPrefs: { sectors: ['clean_energy'] },
    });
    outsider = await h.createUser({ role: 'supporter' });
    startup = await publishStartup(h, founder);
  }, 120_000);
  afterAll(async () => {
    await h.close();
  }, 60_000);
  beforeEach(() => {
    h.resetRateLimits();
  });

  let connectionId: string;
  let conversationId: string;
  let dealId: string;

  it('recommends the startup to a matching supporter with an explanation', async () => {
    const res = await request(h.app)
      .get('/api/v1/recommendations')
      .set('Authorization', supporter.auth);
    expect(res.status).toBe(200);
    expect(res.body.data[0].startup.id).toBe(startup.id);
    expect(res.body.data[0].explanation).toContain('operates in your preferred sector');
    expect(
      (await request(h.app).get('/api/v1/recommendations').set('Authorization', founder.auth))
        .status,
    ).toBe(403);
  });

  it('creates a pending request, rejects duplicates and notifies the founder', async () => {
    const res = await request(h.app)
      .post('/api/v1/connections')
      .set('Authorization', supporter.auth)
      .send({ startupId: startup.id, message: 'I fund school energy projects.' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'pending',
      viewerRole: 'requester',
      availableActions: ['withdraw'],
      conversationId: null,
    });
    connectionId = res.body.id as string;

    const dup = await request(h.app)
      .post('/api/v1/connections')
      .set('Authorization', supporter.auth)
      .send({ startupId: startup.id });
    expect(dup.status).toBe(409);

    // Founders cannot request; the outsider cannot see the request.
    expect(
      (
        await request(h.app)
          .post('/api/v1/connections')
          .set('Authorization', founder.auth)
          .send({ startupId: startup.id })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(h.app)
          .get(`/api/v1/connections/${connectionId}`)
          .set('Authorization', outsider.auth)
      ).status,
    ).toBe(404);

    const notes = await request(h.app)
      .get('/api/v1/notifications')
      .set('Authorization', founder.auth);
    expect(notes.body.data[0]).toMatchObject({
      type: 'connection_requested',
      link: '/app/connections',
    });
    expect(notes.body.unreadCount).toBe(1);
    expect(await h.prisma.emailOutbox.count({ where: { template: 'connection_requested' } })).toBe(
      1,
    );

    const incoming = await request(h.app)
      .get('/api/v1/connections?direction=incoming')
      .set('Authorization', founder.auth);
    expect(incoming.body.data.map((c: { id: string }) => c.id)).toEqual([connectionId]);
    expect(incoming.body.data[0].availableActions.sort()).toEqual(['accept', 'decline']);
  });

  it('forbids chat before acceptance and the requester cannot accept their own request', async () => {
    expect(
      (await request(h.app).get('/api/v1/conversations').set('Authorization', supporter.auth)).body
        .data,
    ).toEqual([]);
    const self = await request(h.app)
      .post(`/api/v1/connections/${connectionId}/actions`)
      .set('Authorization', supporter.auth)
      .send({ action: 'accept' });
    expect(self.status).toBe(403);
  });

  it('accepts exactly once under concurrent responses and opens one conversation', async () => {
    const results = await Promise.all(
      ['accept', 'accept', 'accept'].map((action) =>
        request(h.app)
          .post(`/api/v1/connections/${connectionId}/actions`)
          .set('Authorization', founder.auth)
          .send({ action }),
      ),
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await h.prisma.conversation.count({ where: { connectionId } })).toBe(1);
    expect(ok[0]?.body.status).toBe('accepted');
    conversationId = ok[0]?.body.conversationId as string;
  });

  it('exchanges persisted messages with idempotent retries and unread counts', async () => {
    const clientMessageId = randomUUID();
    const send = () =>
      request(h.app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', supporter.auth)
        .send({ clientMessageId, body: 'Hi! Could you share your pilot budget?' });
    const [first, retry] = await Promise.all([send(), send()]);
    expect([first.status, retry.status].sort()).toEqual([200, 201]);
    expect(first.body.id).toBe(retry.body.id);
    expect(await h.prisma.message.count({ where: { conversationId } })).toBe(1);

    const unread = await request(h.app).get('/api/v1/me/unread').set('Authorization', founder.auth);
    expect(unread.body.messages).toBe(1);

    const reply = await request(h.app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', founder.auth)
      .send({ clientMessageId: randomUUID(), body: 'Sure — £20k for three schools.' });
    expect(reply.status).toBe(201);

    const page = await request(h.app)
      .get(`/api/v1/conversations/${conversationId}/messages?limit=1`)
      .set('Authorization', supporter.auth);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.data[0].body).toContain('£20k');
    const older = await request(h.app)
      .get(
        `/api/v1/conversations/${conversationId}/messages?limit=1&cursor=${page.body.nextCursor as string}`,
      )
      .set('Authorization', supporter.auth);
    expect(older.body.data[0].body).toContain('pilot budget');
    expect(older.body.nextCursor).toBeNull();

    await request(h.app)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set('Authorization', founder.auth);
    expect(
      (await request(h.app).get('/api/v1/me/unread').set('Authorization', founder.auth)).body
        .messages,
    ).toBe(0);

    // Outsiders can neither read nor post.
    expect(
      (
        await request(h.app)
          .get(`/api/v1/conversations/${conversationId}/messages`)
          .set('Authorization', outsider.auth)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(h.app)
          .post(`/api/v1/conversations/${conversationId}/messages`)
          .set('Authorization', outsider.auth)
          .send({ clientMessageId: randomUUID(), body: 'spam' })
      ).status,
    ).toBe(404);

    // Message text never reaches notifications or emails.
    const outbox = await h.prisma.emailOutbox.findMany();
    expect(JSON.stringify(outbox)).not.toContain('pilot budget');
  });

  it('validates offer terms (currency, milestones, deadline)', async () => {
    const wrongCurrency = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', supporter.auth)
      .send({ connectionId, terms: terms({ currency: 'EUR' }) });
    expect(wrongCurrency.status).toBe(422);
    const foreignMilestone = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', supporter.auth)
      .send({ connectionId, terms: terms({ milestoneIds: [randomUUID()] }) });
    expect(foreignMilestone.status).toBe(422);
    const past = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', supporter.auth)
      .send({ connectionId, terms: terms({ respondBy: '2020-01-01T00:00:00Z' }) });
    expect(past.status).toBe(422);
    const equity = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', supporter.auth)
      .send({ connectionId, terms: { ...terms(), equityPercent: 10 } });
    expect(equity.status).toBe(400);
    const outsiderDeal = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', outsider.auth)
      .send({ connectionId, terms: terms() });
    expect(outsiderDeal.status).toBe(404);
  });

  it('negotiates: proposal → counteroffer → acceptance, with immutable history', async () => {
    const created = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', supporter.auth)
      .send({ connectionId, terms: terms({ milestoneIds: [startup.milestones[0]?.id] }) });
    expect(created.status).toBe(201);
    dealId = created.body.id as string;
    expect(created.body).toMatchObject({
      status: 'negotiating',
      viewerRole: 'supporter',
      availableOfferActions: ['withdraw', 'revise'],
    });
    const firstOfferId = created.body.currentOfferId as string;

    // Only one open negotiation per connection.
    const second = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', founder.auth)
      .send({ connectionId, terms: terms() });
    expect(second.status).toBe(409);

    // The creator cannot accept their own proposal.
    const selfAccept = await request(h.app)
      .post(`/api/v1/deals/${dealId}/offers/${firstOfferId}/respond`)
      .set('Authorization', supporter.auth)
      .send({ action: 'accept' });
    expect(selfAccept.status).toBe(403);

    const countered = await request(h.app)
      .post(`/api/v1/deals/${dealId}/offers/${firstOfferId}/respond`)
      .set('Authorization', founder.auth)
      .send({
        action: 'counter',
        terms: terms({ amountMinor: '3000000', fundingType: 'donation' }),
      });
    expect(countered.status).toBe(200);
    expect(countered.body.offers).toHaveLength(2);
    expect(countered.body.offers[0]).toMatchObject({
      status: 'countered',
      amountMinor: '2500000',
      revision: 1,
    });
    expect(countered.body.offers[1]).toMatchObject({
      status: 'pending',
      amountMinor: '3000000',
      revision: 2,
      previousOfferId: firstOfferId,
    });
    const counterId = countered.body.currentOfferId as string;

    // Acting on stale terms is rejected.
    const stale = await request(h.app)
      .post(`/api/v1/deals/${dealId}/offers/${firstOfferId}/respond`)
      .set('Authorization', supporter.auth)
      .send({ action: 'accept' });
    expect(stale.status).toBe(409);

    // Concurrent responses to the counteroffer: exactly one applies.
    const races = await Promise.all(
      ['accept', 'accept', 'accept'].map((action) =>
        request(h.app)
          .post(`/api/v1/deals/${dealId}/offers/${counterId}/respond`)
          .set('Authorization', supporter.auth)
          .send({ action }),
      ),
    );
    expect(races.filter((r) => r.status === 200)).toHaveLength(1);
    expect(races.filter((r) => r.status === 409)).toHaveLength(2);
    const winner = races.find((r) => r.status === 200);
    expect(winner?.body).toMatchObject({
      status: 'accepted',
      acceptedOfferId: counterId,
      currentOfferId: null,
    });
    expect(winner?.body.availableDealActions.sort()).toEqual(['cancel', 'report_funding']);

    const founderView = await request(h.app)
      .get(`/api/v1/deals/${dealId}`)
      .set('Authorization', founder.auth);
    expect(founderView.body.offers.map((o: { status: string }) => o.status)).toEqual([
      'countered',
      'accepted',
    ]);
    expect(founderView.body.events.map((e: { type: string }) => e.type)).toEqual([
      'offer_created',
      'offer_countered',
      'offer_accepted',
    ]);
    expect(
      (await request(h.app).get(`/api/v1/deals/${dealId}`).set('Authorization', outsider.auth))
        .status,
    ).toBe(404);
  });

  it('tracks the reported outcome: report → dispute → re-report → confirm → completed', async () => {
    const view = async (user: TestUser) =>
      (await request(h.app).get(`/api/v1/deals/${dealId}`).set('Authorization', user.auth))
        .body as {
        version: number;
        status: string;
      };
    const act = (user: TestUser, action: string, version: number, reason?: string) =>
      request(h.app)
        .post(`/api/v1/deals/${dealId}/actions`)
        .set('Authorization', user.auth)
        .send({ action, version, ...(reason === undefined ? {} : { reason }) });

    // The founder cannot report funding; the supporter can.
    expect((await act(founder, 'report_funding', (await view(founder)).version)).status).toBe(403);
    const reported = await act(supporter, 'report_funding', (await view(supporter)).version);
    expect(reported.body.status).toBe('funding_reported');

    expect((await act(founder, 'dispute_receipt', reported.body.version as number)).status).toBe(
      400,
    );
    const disputed = await act(
      founder,
      'dispute_receipt',
      reported.body.version as number,
      'Not in our account yet',
    );
    expect(disputed.body.status).toBe('receipt_disputed');

    const rereported = await act(supporter, 'report_funding', disputed.body.version as number);
    expect(rereported.body.status).toBe('funding_reported');
    // Stale version.
    expect((await act(founder, 'confirm_receipt', disputed.body.version as number)).status).toBe(
      409,
    );
    const completed = await act(founder, 'confirm_receipt', rereported.body.version as number);
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ status: 'completed', availableDealActions: [] });
    expect(completed.body.completedAt).not.toBeNull();

    // Both parties see the same status; reported funding shows on the public listing.
    expect((await view(supporter)).status).toBe('completed');
    const pub = await request(h.app).get(`/api/v1/startups/by-slug/${startup.slug}`);
    expect(pub.body.reportedFundingMinor).toBe('3000000');

    expect(await h.prisma.auditEvent.count({ where: { entityId: dealId } })).toBeGreaterThanOrEqual(
      6,
    );
  });

  it('negotiates again on the same connection and cancels with mutual agreement', async () => {
    const created = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', founder.auth)
      .send({ connectionId, terms: terms() });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const accepted = await request(h.app)
      .post(`/api/v1/deals/${id}/offers/${created.body.currentOfferId as string}/respond`)
      .set('Authorization', supporter.auth)
      .send({ action: 'accept' });
    const reported = await request(h.app)
      .post(`/api/v1/deals/${id}/actions`)
      .set('Authorization', supporter.auth)
      .send({ action: 'report_funding', version: accepted.body.version });
    // After funding is reported, cancellation needs both parties.
    const direct = await request(h.app)
      .post(`/api/v1/deals/${id}/actions`)
      .set('Authorization', founder.auth)
      .send({ action: 'cancel', version: reported.body.version, reason: 'x' });
    expect(direct.status).toBe(409);
    const requested = await request(h.app)
      .post(`/api/v1/deals/${id}/actions`)
      .set('Authorization', founder.auth)
      .send({
        action: 'request_cancellation',
        version: reported.body.version,
        reason: 'Project paused',
      });
    expect(requested.body).toMatchObject({
      status: 'cancellation_requested',
      availableDealActions: ['withdraw_cancellation'],
    });
    const selfConfirm = await request(h.app)
      .post(`/api/v1/deals/${id}/actions`)
      .set('Authorization', founder.auth)
      .send({ action: 'confirm_cancellation', version: requested.body.version });
    expect(selfConfirm.status).toBe(403);
    const rejected = await request(h.app)
      .post(`/api/v1/deals/${id}/actions`)
      .set('Authorization', supporter.auth)
      .send({ action: 'reject_cancellation', version: requested.body.version });
    expect(rejected.body.status).toBe('funding_reported');
    const again = await request(h.app)
      .post(`/api/v1/deals/${id}/actions`)
      .set('Authorization', founder.auth)
      .send({
        action: 'request_cancellation',
        version: rejected.body.version,
        reason: 'Project paused',
      });
    const confirmed = await request(h.app)
      .post(`/api/v1/deals/${id}/actions`)
      .set('Authorization', supporter.auth)
      .send({ action: 'confirm_cancellation', version: again.body.version });
    expect(confirmed.body.status).toBe('cancelled');
    expect(confirmed.body.events.map((e: { type: string }) => e.type)).toContain(
      'reject_cancellation',
    );
  });

  it('expires offers past their response deadline', async () => {
    const created = await request(h.app)
      .post('/api/v1/deals')
      .set('Authorization', supporter.auth)
      .send({
        connectionId,
        terms: terms({ respondBy: new Date(Date.now() + 60_000).toISOString() }),
      });
    expect(created.status).toBe(201);
    await h.prisma.offer.update({
      where: { id: created.body.currentOfferId as string },
      data: { respondBy: new Date(Date.now() - 1000) },
    });
    // Lazily on response…
    const late = await request(h.app)
      .post(
        `/api/v1/deals/${created.body.id as string}/offers/${created.body.currentOfferId as string}/respond`,
      )
      .set('Authorization', founder.auth)
      .send({ action: 'accept' });
    expect(late.status).toBe(409);
    const after = await request(h.app)
      .get(`/api/v1/deals/${created.body.id as string}`)
      .set('Authorization', founder.auth);
    expect(after.body.status).toBe('expired');
    expect(after.body.offers[0].status).toBe('expired');
  });

  it('lists deals by open/closed status', async () => {
    const closed = await request(h.app)
      .get('/api/v1/deals?status=closed')
      .set('Authorization', supporter.auth);
    expect(closed.body.data.length).toBeGreaterThanOrEqual(3);
    const open = await request(h.app)
      .get('/api/v1/deals?status=open')
      .set('Authorization', supporter.auth);
    expect(open.body.data).toEqual([]);
  });

  it('delivers queued email through the outbox exactly once per notification', async () => {
    const pending = await h.prisma.emailOutbox.count({ where: { status: 'pending' } });
    expect(pending).toBeGreaterThan(0);
    h.emails.failNext = 1;
    let handled = 0;
    for (let i = 0; i < 20; i += 1) handled += await h.container.emailDispatcher.tick();
    // One failure is retried later (backoff); everything else is sent.
    const failedOnce = await h.prisma.emailOutbox.findFirst({
      where: { status: 'pending', attempts: 1 },
    });
    expect(failedOnce?.lastError).toBe('Error');
    expect(h.emails.sent.length).toBe(pending - 1);
    expect(handled).toBe(pending);
    expect(h.emails.sent.every((m) => !m.text.includes('pilot budget'))).toBe(true);
    expect(h.emails.sent[0]?.text).toContain('http://localhost:3000/app');
  });
});
