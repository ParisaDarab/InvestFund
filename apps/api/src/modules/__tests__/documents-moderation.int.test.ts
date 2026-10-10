/** Document access control, blocking policy, reporting and admin review. */
import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  connect,
  publishStartup,
  startDomainHarness,
  type DomainHarness,
  type TestUser,
} from '../../__tests__/domain-support.js';

const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n'),
  Buffer.alloc(200, 0x20),
  Buffer.from('\n%%EOF\n'),
]);

describe('documents, blocking, reports and admin', { timeout: 60_000 }, () => {
  let h: DomainHarness;
  let founder: TestUser;
  let connected: TestUser;
  let other: TestUser;
  let admin: TestUser;
  let startup: { id: string; slug: string };
  let connectionId: string;
  let conversationId: string;

  beforeAll(async () => {
    h = await startDomainHarness('api_docs_mod');
    founder = await h.createUser({ role: 'founder' });
    connected = await h.createUser({ role: 'supporter' });
    other = await h.createUser({ role: 'supporter' });
    admin = await h.createUser({ role: 'admin' });
    startup = await publishStartup(h, founder);
    ({ connectionId, conversationId } = await connect(h, connected, founder, startup.id));
  }, 120_000);
  afterAll(async () => {
    await h.close();
  }, 60_000);
  beforeEach(() => {
    h.resetRateLimits();
  });

  const upload = (
    user: TestUser,
    body: Buffer,
    type: string,
    fileName: string,
    visibility = 'all_connections',
  ) =>
    request(h.app)
      .post(
        `/api/v1/startups/${startup.id}/documents?fileName=${encodeURIComponent(fileName)}&visibility=${visibility}`,
      )
      .set('Authorization', user.auth)
      .set('Content-Type', type)
      .send(body);

  let docId: string;
  let selectedId: string;

  describe('documents', () => {
    it('validates type, extension and content', async () => {
      expect((await upload(founder, Buffer.from('<script>'), 'text/html', 'x.html')).status).toBe(
        400,
      );
      expect((await upload(founder, PDF, 'application/pdf', 'deck.exe')).status).toBe(400);
      expect(
        (await upload(founder, Buffer.from('not a pdf'), 'application/pdf', 'deck.pdf')).status,
      ).toBe(400);
      expect((await upload(connected, PDF, 'application/pdf', 'deck.pdf')).status).toBe(403);
      const big = Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)]);
      expect((await upload(founder, big, 'application/pdf', 'big.pdf')).status).toBe(413);
    });

    it('stores a sanitised name and lets only authorised users download', async () => {
      const res = await upload(founder, PDF, 'application/pdf', '../../etc/Pitch\u0000 deck.pdf');
      expect(res.status).toBe(201);
      expect(res.body.fileName).toBe('Pitch deck.pdf');
      docId = res.body.id as string;
      const row = await h.prisma.startupDocument.findUniqueOrThrow({ where: { id: docId } });
      expect(row.storageKey).not.toContain('Pitch');

      const ok = await request(h.app)
        .get(`/api/v1/documents/${docId}/download`)
        .set('Authorization', connected.auth);
      expect(ok.status).toBe(200);
      expect(ok.headers['content-type']).toBe('application/pdf');
      expect(ok.headers['content-disposition']).toContain('attachment');
      expect(ok.headers['cache-control']).toBe('private, no-store');

      // Unconnected supporter, anonymous: no access (404, not 403).
      expect(
        (
          await request(h.app)
            .get(`/api/v1/documents/${docId}/download`)
            .set('Authorization', other.auth)
        ).status,
      ).toBe(404);
      expect((await request(h.app).get(`/api/v1/documents/${docId}/download`)).status).toBe(401);
      const list = await request(h.app)
        .get(`/api/v1/startups/${startup.id}/documents`)
        .set('Authorization', other.auth);
      expect(list.body.data).toEqual([]);
      expect(
        await h.prisma.auditEvent.count({
          where: { action: 'document.downloaded', entityId: docId },
        }),
      ).toBe(1);
    });

    it('restricts `selected` documents to granted connections and supports revocation', async () => {
      const res = await upload(
        founder,
        Buffer.from('Budget notes'),
        'text/plain',
        'budget.txt',
        'selected',
      );
      selectedId = res.body.id as string;
      expect(
        (
          await request(h.app)
            .get(`/api/v1/documents/${selectedId}/download`)
            .set('Authorization', connected.auth)
        ).status,
      ).toBe(404);

      const shared = await request(h.app)
        .put(`/api/v1/documents/${selectedId}/sharing`)
        .set('Authorization', founder.auth)
        .send({ visibility: 'selected', connectionIds: [connectionId] });
      expect(shared.body.grantedConnectionIds).toEqual([connectionId]);
      expect(
        (
          await request(h.app)
            .get(`/api/v1/documents/${selectedId}/download`)
            .set('Authorization', connected.auth)
        ).status,
      ).toBe(200);
      const list = await request(h.app)
        .get(`/api/v1/startups/${startup.id}/documents`)
        .set('Authorization', connected.auth);
      expect(list.body.data.map((d: { id: string }) => d.id).sort()).toEqual(
        [docId, selectedId].sort(),
      );
      expect(list.body.data[0]).not.toHaveProperty('grantedConnectionIds');

      await request(h.app)
        .put(`/api/v1/documents/${selectedId}/sharing`)
        .set('Authorization', founder.auth)
        .send({ visibility: 'selected', connectionIds: [] });
      expect(
        (
          await request(h.app)
            .get(`/api/v1/documents/${selectedId}/download`)
            .set('Authorization', connected.auth)
        ).status,
      ).toBe(404);

      const foreign = await request(h.app)
        .put(`/api/v1/documents/${selectedId}/sharing`)
        .set('Authorization', founder.auth)
        .send({ visibility: 'selected', connectionIds: [randomUUID()] });
      expect(foreign.status).toBe(400);
      expect(
        (
          await request(h.app)
            .put(`/api/v1/documents/${selectedId}/sharing`)
            .set('Authorization', connected.auth)
            .send({ visibility: 'all_connections' })
        ).status,
      ).toBe(403);
    });
  });

  describe('blocking', () => {
    it('stops messaging, new offers, requests and document access but keeps history', async () => {
      expect(
        (
          await request(h.app)
            .post('/api/v1/blocks')
            .set('Authorization', founder.auth)
            .send({ userId: founder.id })
        ).status,
      ).toBe(422);
      expect(
        (
          await request(h.app)
            .post('/api/v1/blocks')
            .set('Authorization', founder.auth)
            .send({ userId: connected.id })
        ).status,
      ).toBe(204);

      const message = await request(h.app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', connected.auth)
        .send({ clientMessageId: randomUUID(), body: 'Hello?' });
      expect(message.status).toBe(403);
      const convo = await request(h.app)
        .get(`/api/v1/conversations/${conversationId}`)
        .set('Authorization', connected.auth);
      expect(convo.body.readOnly).toBe(true);

      const offer = await request(h.app)
        .post('/api/v1/deals')
        .set('Authorization', connected.auth)
        .send({
          connectionId,
          terms: { fundingType: 'grant', amountMinor: '100', currency: 'GBP', purpose: 'x' },
        });
      expect(offer.status).toBe(403);
      expect(
        (
          await request(h.app)
            .get(`/api/v1/documents/${docId}/download`)
            .set('Authorization', connected.auth)
        ).status,
      ).toBe(404);

      // The blocked supporter's other requests are closed and new ones refused.
      const rel = await request(h.app)
        .get(`/api/v1/startups/${startup.id}/relationship`)
        .set('Authorization', connected.auth);
      expect(rel.body).toMatchObject({ blocked: true, canRequestConnection: false });
      // Blocked founders' startups disappear from the supporter's search and recommendations.
      const search = await request(h.app)
        .get('/api/v1/startups')
        .set('Authorization', connected.auth);
      expect(search.body.data.map((s: { id: string }) => s.id)).not.toContain(startup.id);
      const recs = await request(h.app)
        .get('/api/v1/recommendations')
        .set('Authorization', connected.auth);
      expect(recs.body.data.map((r: { startup: { id: string } }) => r.startup.id)).not.toContain(
        startup.id,
      );

      const blocks = await request(h.app).get('/api/v1/blocks').set('Authorization', founder.auth);
      expect(blocks.body.data[0].user.id).toBe(connected.id);
      expect(JSON.stringify(blocks.body)).not.toContain('@');

      await request(h.app)
        .delete(`/api/v1/blocks/${connected.id}`)
        .set('Authorization', founder.auth);
      const after = await request(h.app)
        .post(`/api/v1/conversations/${conversationId}/messages`)
        .set('Authorization', connected.auth)
        .send({ clientMessageId: randomUUID(), body: 'Thanks for unblocking' });
      expect(after.status).toBe(201);
    });

    it('closes pending requests when blocking', async () => {
      const req = await request(h.app)
        .post('/api/v1/connections')
        .set('Authorization', other.auth)
        .send({ startupId: startup.id });
      expect(req.status).toBe(201);
      await request(h.app)
        .post('/api/v1/blocks')
        .set('Authorization', other.auth)
        .send({ userId: founder.id });
      const after = await request(h.app)
        .get(`/api/v1/connections/${req.body.id as string}`)
        .set('Authorization', founder.auth);
      expect(after.body.status).toBe('withdrawn');
      const retry = await request(h.app)
        .post('/api/v1/connections')
        .set('Authorization', other.auth)
        .send({ startupId: startup.id });
      expect(retry.status).toBe(403);
    });
  });

  describe('reports and admin review', () => {
    let reportId: string;

    it('accepts a report once and keeps the queue admin-only', async () => {
      const res = await request(h.app)
        .post('/api/v1/reports')
        .set('Authorization', connected.auth)
        .send({
          targetType: 'startup',
          targetId: startup.id,
          category: 'misleading_information',
          details: 'Claims look exaggerated.',
        });
      expect(res.status).toBe(201);
      reportId = res.body.id as string;
      const dup = await request(h.app)
        .post('/api/v1/reports')
        .set('Authorization', connected.auth)
        .send({ targetType: 'startup', targetId: startup.id, category: 'spam' });
      expect(dup.status).toBe(409);
      expect(
        (await request(h.app).get('/api/v1/admin/reports').set('Authorization', founder.auth))
          .status,
      ).toBe(403);
      expect(
        (await request(h.app).get('/api/v1/admin/overview').set('Authorization', connected.auth))
          .status,
      ).toBe(403);
    });

    it('lets an admin review, archive the listing and notify the parties', async () => {
      const queue = await request(h.app)
        .get('/api/v1/admin/reports?status=open')
        .set('Authorization', admin.auth);
      expect(queue.status).toBe(200);
      expect(queue.body.data[0]).toMatchObject({
        id: reportId,
        status: 'open',
        targetType: 'startup',
      });

      const invalid = await request(h.app)
        .post(`/api/v1/admin/reports/${reportId}/resolve`)
        .set('Authorization', admin.auth)
        .send({ status: 'dismissed', action: 'startup_archived' });
      expect(invalid.status).toBe(400);

      const resolved = await request(h.app)
        .post(`/api/v1/admin/reports/${reportId}/resolve`)
        .set('Authorization', admin.auth)
        .send({ status: 'resolved', action: 'startup_archived', note: 'Unverifiable claims' });
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({ status: 'resolved', action: 'startup_archived' });
      expect((await request(h.app).get(`/api/v1/startups/by-slug/${startup.slug}`)).status).toBe(
        404,
      );

      const again = await request(h.app)
        .post(`/api/v1/admin/reports/${reportId}/resolve`)
        .set('Authorization', admin.auth)
        .send({ status: 'dismissed' });
      expect(again.status).toBe(409);

      const founderNotes = await request(h.app)
        .get('/api/v1/notifications')
        .set('Authorization', founder.auth);
      expect(founderNotes.body.data.map((n: { type: string }) => n.type)).toContain(
        'startup_archived_by_admin',
      );
      expect(await h.prisma.auditEvent.count({ where: { action: 'admin.report_resolved' } })).toBe(
        1,
      );
    });

    it('suspends a reported user, revoking their access immediately', async () => {
      const report = await request(h.app)
        .post('/api/v1/reports')
        .set('Authorization', founder.auth)
        .send({ targetType: 'user', targetId: other.id, category: 'harassment' });
      const res = await request(h.app)
        .post(`/api/v1/admin/reports/${report.body.id as string}/resolve`)
        .set('Authorization', admin.auth)
        .send({ status: 'resolved', action: 'user_suspended' });
      expect(res.status).toBe(200);
      expect((await request(h.app).get('/api/v1/me').set('Authorization', other.auth)).status).toBe(
        403,
      );
      const overview = await request(h.app)
        .get('/api/v1/admin/overview')
        .set('Authorization', admin.auth);
      expect(overview.body.users.suspended).toBe(1);
      expect(overview.body.reports.open).toBe(0);

      const reinstate = await request(h.app)
        .post(`/api/v1/admin/users/${other.id}/actions`)
        .set('Authorization', admin.auth)
        .send({ action: 'reinstate' });
      expect(reinstate.status).toBe(204);
      expect((await request(h.app).get('/api/v1/me').set('Authorization', other.auth)).status).toBe(
        200,
      );
      const self = await request(h.app)
        .post(`/api/v1/admin/users/${admin.id}/actions`)
        .set('Authorization', admin.auth)
        .send({ action: 'suspend' });
      expect(self.status).toBe(422);
    });
  });
});
