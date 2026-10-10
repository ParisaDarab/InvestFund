/** Google sign-in flow (state, PKCE, cancel), refresh rotation and reuse detection, onboarding. */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startDomainHarness, type DomainHarness } from '../../__tests__/domain-support.js';

const WEB = 'http://localhost:3000';

function cookieValue(setCookie: string[] | string | undefined, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie === undefined ? [] : [setCookie];
  const line = list.find((c) => c.startsWith(`${name}=`));
  return line === undefined
    ? undefined
    : decodeURIComponent(line.split(';')[0]?.slice(name.length + 1) ?? '');
}

describe('auth', { timeout: 60_000 }, () => {
  let h: DomainHarness;

  beforeAll(async () => {
    h = await startDomainHarness('api_auth');
  }, 120_000);
  afterAll(async () => {
    await h.close();
  }, 60_000);
  beforeEach(() => {
    h.resetRateLimits();
  });

  async function signIn(email: string, returnTo?: string) {
    const start = await request(h.app).get(
      `/api/v1/auth/google/start${returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`,
    );
    expect(start.status).toBe(303);
    const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
    const stateCookie = cookieValue(start.headers['set-cookie'], 'if_oauth') ?? '';
    const callback = await request(h.app)
      .get(`/api/v1/auth/google/callback?code=${encodeURIComponent(email)}&state=${state}`)
      .set('Cookie', `if_oauth=${encodeURIComponent(stateCookie)}`);
    return { start, callback, refresh: cookieValue(callback.headers['set-cookie'], 'if_refresh') };
  }

  const refresh = (token: string) =>
    request(h.app)
      .post('/api/v1/auth/refresh')
      .set('Origin', WEB)
      .set('Cookie', `if_refresh=${token}`)
      .send({});

  it('signs a new user in through the OAuth callback and sets an httpOnly refresh cookie', async () => {
    h.identity.add({ email: 'new.user@example.test', name: 'New User' });
    const {
      start,
      callback,
      refresh: token,
    } = await signIn('new.user@example.test', '/app/discover');
    expect(start.headers['set-cookie']?.[0]).toMatch(/if_oauth=.*HttpOnly; SameSite=Lax/);
    expect(h.identity.lastChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe(`${WEB}/auth/complete?returnTo=%2Fapp%2Fdiscover`);
    expect(token).toBeDefined();
    const setCookies = callback.headers['set-cookie'] as unknown as string[];
    expect(setCookies.find((c) => c.startsWith('if_refresh='))).toMatch(
      /Path=\/api\/v1\/auth; .*HttpOnly; SameSite=Lax/,
    );

    const res = await refresh(token ?? '');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'new.user@example.test',
      role: null,
      profileComplete: false,
    });
    expect(res.body.accessToken).toMatch(/^ey/);
  });

  it('rejects a callback without the matching state cookie (CSRF)', async () => {
    h.identity.add({ email: 'csrf@example.test' });
    const res = await request(h.app).get(
      '/api/v1/auth/google/callback?code=csrf@example.test&state=forged',
    );
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${WEB}/login?error=state`);
    expect(await h.prisma.user.count({ where: { email: 'csrf@example.test' } })).toBe(0);
  });

  it('handles a cancelled consent and unverified emails', async () => {
    const start = await request(h.app).get('/api/v1/auth/google/start');
    const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
    const cookie = cookieValue(start.headers['set-cookie'], 'if_oauth') ?? '';
    const cancelled = await request(h.app)
      .get(`/api/v1/auth/google/callback?error=access_denied&state=${state}`)
      .set('Cookie', `if_oauth=${encodeURIComponent(cookie)}`);
    expect(cancelled.headers.location).toBe(`${WEB}/login?error=cancelled`);

    h.identity.add({ email: 'unverified@example.test', emailVerified: false });
    const { callback } = await signIn('unverified@example.test');
    expect(callback.headers.location).toBe(`${WEB}/login?error=email_unverified`);
  });

  it('rejects an open-redirect returnTo', async () => {
    const res = await request(h.app).get('/api/v1/auth/google/start?returnTo=//evil.example');
    expect(res.status).toBe(400);
  });

  it('rotates refresh tokens and revokes the session when an old token is replayed later', async () => {
    h.identity.add({ email: 'rotate@example.test' });
    const { refresh: first } = await signIn('rotate@example.test');
    const r1 = await refresh(first ?? '');
    const second = cookieValue(r1.headers['set-cookie'], 'if_refresh');
    expect(second).toBeDefined();
    expect(second).not.toBe(first);

    // Within the grace window the previous token still mints an access token (two tabs).
    const grace = await refresh(first ?? '');
    expect(grace.status).toBe(200);

    // Outside the window, replay revokes everything.
    await h.prisma.session.updateMany({
      where: { user: { email: 'rotate@example.test' } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    expect((await refresh(first ?? '')).status).toBe(401);
    expect((await refresh(second ?? '')).status).toBe(401);
    expect(await h.prisma.auditEvent.count({ where: { action: 'auth.refresh_token_reuse' } })).toBe(
      1,
    );
  });

  it('refuses refresh without a JSON body or from another origin', async () => {
    h.identity.add({ email: 'origin@example.test' });
    const { refresh: token } = await signIn('origin@example.test');
    const evil = await request(h.app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Cookie', `if_refresh=${token ?? ''}`)
      .send({});
    expect(evil.status).toBe(403);
    const form = await request(h.app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `if_refresh=${token ?? ''}`)
      .type('form')
      .send('a=b');
    expect(form.status).toBe(400);
  });

  it('logs out by revoking the session', async () => {
    h.identity.add({ email: 'logout@example.test' });
    const { refresh: token } = await signIn('logout@example.test');
    const out = await request(h.app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `if_refresh=${token ?? ''}`)
      .send({});
    expect(out.status).toBe(204);
    expect((await refresh(token ?? '')).status).toBe(401);
  });

  it('lets a user choose founder or supporter once, never admin', async () => {
    const user = await h.createUser({ role: null });
    const admin = await request(h.app)
      .post('/api/v1/me/role')
      .set('Authorization', user.auth)
      .send({ role: 'admin' });
    expect(admin.status).toBe(400);
    const ok = await request(h.app)
      .post('/api/v1/me/role')
      .set('Authorization', user.auth)
      .send({ role: 'founder' });
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe('founder');
    const again = await request(h.app)
      .post('/api/v1/me/role')
      .set('Authorization', user.auth)
      .send({ role: 'supporter' });
    expect(again.status).toBe(409);

    // The old token (role null) now acts as a founder: the role is read from the database.
    const profile = await request(h.app)
      .put('/api/v1/me/founder-profile')
      .set('Authorization', user.auth)
      .send({ displayName: 'Ada', linkedinUrl: 'javascript:alert(1)' });
    expect(profile.status).toBe(400);
    const valid = await request(h.app)
      .put('/api/v1/me/founder-profile')
      .set('Authorization', user.auth)
      .send({ displayName: 'Ada', headline: 'Builder', country: 'GB' });
    expect(valid.status).toBe(200);
    const me = await request(h.app).get('/api/v1/me').set('Authorization', user.auth);
    expect(me.body.profileComplete).toBe(true);
  });

  it('validates supporter preferences', async () => {
    const user = await h.createUser({ role: 'supporter', profile: false });
    const bad = await request(h.app)
      .put('/api/v1/me/supporter-profile')
      .set('Authorization', user.auth)
      .send({ displayName: 'Sam', fundingMinMinor: '500', fundingMaxMinor: '100' });
    expect(bad.status).toBe(400);
    const good = await request(h.app)
      .put('/api/v1/me/supporter-profile')
      .set('Authorization', user.auth)
      .send({
        displayName: 'Sam',
        sectors: ['fintech', 'fintech'],
        fundingMinMinor: '100',
        fundingMaxMinor: '500',
      });
    expect(good.status).toBe(200);
    expect(good.body.sectors).toEqual(['fintech']);
  });

  it('blocks suspended users immediately, even with a valid access token', async () => {
    const user = await h.createUser({ role: 'supporter' });
    await h.prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    const res = await request(h.app).get('/api/v1/me').set('Authorization', user.auth);
    expect(res.status).toBe(403);
    expect(res.body.type).toContain('account-suspended');
  });
});
