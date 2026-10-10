/** Startup creation, validation, milestones, publication, ownership and public discovery. */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  completeStartupBody,
  MILESTONES,
  startDomainHarness,
  type DomainHarness,
  type TestUser,
} from '../../__tests__/domain-support.js';

describe('startups', { timeout: 60_000 }, () => {
  let h: DomainHarness;
  let founder: TestUser;
  let otherFounder: TestUser;
  let supporter: TestUser;

  beforeAll(async () => {
    h = await startDomainHarness('api_startups');
    founder = await h.createUser({ role: 'founder' });
    otherFounder = await h.createUser({ role: 'founder' });
    supporter = await h.createUser({ role: 'supporter' });
  }, 120_000);

  afterAll(async () => {
    await h.close();
  }, 60_000);

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(h.app).post('/api/v1/startups').set('Authorization', user.auth).send(body);

  it('requires the founder role and a founder profile', async () => {
    expect((await create(supporter, { name: 'X' })).status).toBe(403);
    const noProfile = await h.createUser({ role: 'founder', profile: false });
    const res = await create(noProfile, { name: 'X' });
    expect(res.status).toBe(422);
    expect((await request(h.app).post('/api/v1/startups').send({ name: 'X' })).status).toBe(401);
  });

  it('creates a draft with a slug and reports what blocks publication', async () => {
    const res = await create(founder, { name: 'Draft Co' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.slug).toMatch(/^draft-co-[0-9a-f]{6}$/);
    expect(res.body.currency).toBe('GBP');
    const codes = (res.body.publicationIssues as { path: string }[]).map((i) => i.path);
    expect(codes).toEqual(
      expect.arrayContaining(['tagline', 'sector', 'targetAmountMinor', 'milestones']),
    );
  });

  it('rejects inconsistent funding ranges with field errors', async () => {
    const res = await create(founder, completeStartupBody({ minAmountMinor: '9000000' }));
    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const codes = (res.body.errors as { code: string }[]).map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(['min_exceeds_max', 'target_below_min']));
  });

  it('rejects unknown fields (mass assignment) and client-supplied status or founder', async () => {
    const res = await create(founder, {
      name: 'X',
      status: 'published',
      founderId: otherFounder.id,
    });
    expect(res.status).toBe(400);
    expect((res.body.errors as { path: string }[]).map((e) => e.path).sort()).toEqual([
      'body.founderId',
      'body.status',
    ]);
  });

  it('publishes only when complete, and milestones may not exceed the target', async () => {
    const created = await create(founder, completeStartupBody());
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const early = await request(h.app)
      .post(`/api/v1/startups/${id}/publish`)
      .set('Authorization', founder.auth)
      .send({ version: created.body.version });
    expect(early.status).toBe(422);
    expect((early.body.errors as { code: string }[]).map((e) => e.code)).toContain(
      'milestone_required',
    );

    const tooMuch = await request(h.app)
      .put(`/api/v1/startups/${id}/milestones`)
      .set('Authorization', founder.auth)
      .send({
        version: created.body.version,
        milestones: [
          ...MILESTONES,
          { title: 'Extra', description: 'Too much', targetAmountMinor: '1' },
        ],
      });
    expect(tooMuch.status).toBe(422);
    expect((tooMuch.body.errors as { code: string }[]).map((e) => e.code)).toContain(
      'milestones_exceed_target',
    );

    const withMilestones = await request(h.app)
      .put(`/api/v1/startups/${id}/milestones`)
      .set('Authorization', founder.auth)
      .send({ version: created.body.version, milestones: MILESTONES });
    expect(withMilestones.status).toBe(200);
    expect(withMilestones.body.milestones).toHaveLength(2);
    expect(withMilestones.body.publicationIssues).toEqual([]);

    const stale = await request(h.app)
      .post(`/api/v1/startups/${id}/publish`)
      .set('Authorization', founder.auth)
      .send({ version: created.body.version });
    expect(stale.status).toBe(409);
    expect(stale.body.type).toContain('version-conflict');

    const published = await request(h.app)
      .post(`/api/v1/startups/${id}/publish`)
      .set('Authorization', founder.auth)
      .send({ version: withMilestones.body.version });
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');

    // A published startup must stay complete.
    const broken = await request(h.app)
      .patch(`/api/v1/startups/${id}`)
      .set('Authorization', founder.auth)
      .send({ version: published.body.version, tagline: '' });
    expect(broken.status).toBe(422);

    // Public detail by slug, without authentication, no private fields.
    const pub = await request(h.app).get(
      `/api/v1/startups/by-slug/${published.body.slug as string}`,
    );
    expect(pub.status).toBe(200);
    expect(pub.body.milestones).toHaveLength(2);
    expect(pub.body).not.toHaveProperty('status');
    expect(pub.body).not.toHaveProperty('version');
    expect(pub.body.reportedFundingMinor).toBe('0');
  });

  it('hides drafts from the public and other founders (no existence leak)', async () => {
    const draft = await create(founder, { name: 'Secret Draft' });
    const id = draft.body.id as string;
    expect(
      (await request(h.app).get(`/api/v1/startups/by-slug/${draft.body.slug as string}`)).status,
    ).toBe(404);
    expect(
      (
        await request(h.app)
          .get(`/api/v1/startups/mine/${id}`)
          .set('Authorization', otherFounder.auth)
      ).status,
    ).toBe(404);
    const patch = await request(h.app)
      .patch(`/api/v1/startups/${id}`)
      .set('Authorization', otherFounder.auth)
      .send({ version: 1, name: 'Hijack' });
    expect(patch.status).toBe(404);
  });

  it('searches published startups with filters, range overlap and pagination', async () => {
    for (const [i, sector] of ['fintech', 'healthtech', 'fintech'].entries()) {
      const c = await create(
        otherFounder,
        completeStartupBody({
          name: `Search ${sector} ${String(i)}`,
          sector,
          targetAmountMinor: String(1_000_000 * (i + 1)),
          minAmountMinor: String(500_000 * (i + 1)),
          maxAmountMinor: String(2_000_000 * (i + 1)),
        }),
      );
      const m = await request(h.app)
        .put(`/api/v1/startups/${c.body.id as string}/milestones`)
        .set('Authorization', otherFounder.auth)
        .send({
          version: 1,
          milestones: [{ title: 'M1', description: 'First', targetAmountMinor: '100000' }],
        });
      await request(h.app)
        .post(`/api/v1/startups/${c.body.id as string}/publish`)
        .set('Authorization', otherFounder.auth)
        .send({ version: m.body.version });
    }
    const fintech = await request(h.app).get('/api/v1/startups?sector=fintech');
    expect(fintech.status).toBe(200);
    expect(fintech.body.data).toHaveLength(2);

    const multi = await request(h.app).get('/api/v1/startups?sector=fintech,healthtech&q=search');
    expect(multi.body.data).toHaveLength(3);

    // Acceptable ranges [0.5m,2m], [1m,4m], [1.5m,6m]: only the first two overlap [0, 1.2m].
    const range = await request(h.app).get('/api/v1/startups?q=search&amountMax=1200000');
    expect(range.body.data).toHaveLength(2);

    const page1 = await request(h.app).get('/api/v1/startups?q=search&limit=2&sort=target_asc');
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();
    const page2 = await request(h.app).get(
      `/api/v1/startups?q=search&limit=2&sort=target_asc&cursor=${page1.body.nextCursor as string}`,
    );
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    expect((await request(h.app).get('/api/v1/startups?cursor=!!!')).status).toBe(400);
    expect((await request(h.app).get('/api/v1/startups?sector=nonsense')).status).toBe(400);
  });

  it('lets supporters save and unsave published startups', async () => {
    const list = await request(h.app).get('/api/v1/startups?q=search');
    const id = list.body.data[0].id as string;
    expect(
      (await request(h.app).put(`/api/v1/startups/${id}/save`).set('Authorization', supporter.auth))
        .status,
    ).toBe(204);
    expect(
      (await request(h.app).put(`/api/v1/startups/${id}/save`).set('Authorization', supporter.auth))
        .status,
    ).toBe(204);
    const saved = await request(h.app)
      .get('/api/v1/saved-startups')
      .set('Authorization', supporter.auth);
    expect(saved.body.data.map((s: { id: string }) => s.id)).toEqual([id]);
    const rel = await request(h.app)
      .get(`/api/v1/startups/${id}/relationship`)
      .set('Authorization', supporter.auth);
    expect(rel.body).toMatchObject({ saved: true, canRequestConnection: true, connection: null });
    await request(h.app).delete(`/api/v1/startups/${id}/save`).set('Authorization', supporter.auth);
    const after = await request(h.app)
      .get('/api/v1/saved-startups')
      .set('Authorization', supporter.auth);
    expect(after.body.data).toEqual([]);
  });

  it('archives and restores; archived startups leave discovery', async () => {
    const mine = await request(h.app)
      .get('/api/v1/startups/mine')
      .set('Authorization', otherFounder.auth);
    const target = mine.body.data.find((s: { status: string }) => s.status === 'published');
    const archived = await request(h.app)
      .post(`/api/v1/startups/${target.id as string}/archive`)
      .set('Authorization', otherFounder.auth)
      .send({ version: target.version });
    expect(archived.body.status).toBe('archived');
    expect(
      (await request(h.app).get(`/api/v1/startups/by-slug/${target.slug as string}`)).status,
    ).toBe(404);
    const restored = await request(h.app)
      .post(`/api/v1/startups/${target.id as string}/restore`)
      .set('Authorization', otherFounder.auth)
      .send({ version: archived.body.version });
    expect(restored.body.status).toBe('draft');
  });
});
