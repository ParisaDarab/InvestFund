/** `requireAuth()` / `requireRole()` with tokens signed in the test (AC9). */
import { Router } from 'express';
import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { ProblemDetails, problemTypeUri } from '@investfund/shared';

import { buildTestApp, signTestToken, TEST_JWT_SECRET } from '../../../__tests__/support.js';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  InvalidAccessTokenError,
  JwtAccessTokenVerifier,
} from '../access-token.js';

const USER_ID = '01928c4e-7d3a-7b2c-9f1e-3a4b5c6d7e8f';

function testApp() {
  return buildTestApp({
    modules: ({ authGuards }) => {
      const router = Router();
      router.get('/admin', authGuards.requireRole('admin'), (req, res) => {
        res.json({ user: req.user });
      });
      router.get('/any', authGuards.requireAuth(), (req, res) => {
        res.json({ user: req.user });
      });
      router.get(
        '/stacked',
        authGuards.requireAuth(),
        authGuards.requireRole('founder', 'supporter'),
        (req, res) => {
          res.json({ user: req.user });
        },
      );
      return [{ path: '/guarded', router }];
    },
  });
}

async function call(path: string, authorization?: string) {
  const { app, logs } = testApp();
  const req = request(app).get(`/api/v1/guarded${path}`);
  const res =
    authorization === undefined ? await req : await req.set('Authorization', authorization);
  return { res, logs };
}

function expectProblem(res: request.Response, slug: 'unauthenticated' | 'forbidden') {
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(ProblemDetails.parse(res.body).type).toBe(problemTypeUri(slug));
}

describe('requireRole("admin") (AC9)', () => {
  it('returns 401 unauthenticated without a token', async () => {
    const { res } = await call('/admin');
    expect(res.status).toBe(401);
    expectProblem(res, 'unauthenticated');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('returns 401 for an expired token', async () => {
    const token = await signTestToken({ role: 'admin', expiresIn: -60 });
    const { res } = await call('/admin', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expectProblem(res, 'unauthenticated');
    expect(ProblemDetails.parse(res.body).detail).toBe('The access token has expired.');
    expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
  });

  it('returns 401 for a token signed with another secret', async () => {
    const token = await signTestToken({ role: 'admin', secret: 'some-other-secret-value' });
    const { res } = await call('/admin', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expectProblem(res, 'unauthenticated');
  });

  it('returns 403 forbidden for a valid founder token', async () => {
    const token = await signTestToken({ role: 'founder' });
    const { res } = await call('/admin', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expectProblem(res, 'forbidden');
  });

  it('passes a valid admin token and attaches req.user', async () => {
    const token = await signTestToken({ role: 'admin', sub: USER_ID });
    const { res } = await call('/admin', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: USER_ID, role: 'admin' } });
  });

  it('accepts a lower-case bearer scheme', async () => {
    const token = await signTestToken({ role: 'admin' });
    expect((await call('/admin', `bearer ${token}`)).res.status).toBe(200);
  });
});

describe('rejected tokens', () => {
  const now = () => Math.floor(Date.now() / 1000);

  it.each([
    ['a wrong issuer', () => signTestToken({ role: 'admin', issuer: 'someone-else' })],
    ['a wrong audience', () => signTestToken({ role: 'admin', audience: 'another-app' })],
    ['an unknown role', () => signTestToken({ role: 'superuser' })],
    ['a non-UUID subject', () => signTestToken({ role: 'admin', sub: 'user-1' })],
    ['HS512 instead of HS256', () => signTestToken({ role: 'admin', algorithm: 'HS512' })],
    [
      'alg "none"',
      () =>
        Promise.resolve(
          new UnsecuredJWT({ role: 'admin' })
            .setSubject(USER_ID)
            .setIssuer(ACCESS_TOKEN_ISSUER)
            .setAudience(ACCESS_TOKEN_AUDIENCE)
            .setExpirationTime(now() + 600)
            .encode(),
        ),
    ],
    [
      'no expiry',
      () =>
        new SignJWT({ role: 'admin' })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(USER_ID)
          .setIssuer(ACCESS_TOKEN_ISSUER)
          .setAudience(ACCESS_TOKEN_AUDIENCE)
          .sign(new TextEncoder().encode(TEST_JWT_SECRET)),
    ],
  ])('returns 401 for %s', async (_label, token) => {
    const { res } = await call('/admin', `Bearer ${await token()}`);
    expect(res.status).toBe(401);
    expectProblem(res, 'unauthenticated');
  });

  it.each(['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer not-a-jwt', 'Token a.b.c', 'Bearer a.b.c d'])(
    'returns 401 for the header %j',
    async (header) => {
      const { res } = await call('/any', header);
      expect(res.status).toBe(401);
      expectProblem(res, 'unauthenticated');
    },
  );

  it('rejects a tampered payload', async () => {
    const token = await signTestToken({ role: 'founder' });
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        role: 'admin',
        sub: USER_ID,
        iss: ACCESS_TOKEN_ISSUER,
        aud: ACCESS_TOKEN_AUDIENCE,
        exp: now() + 600,
      }),
    ).toString('base64url');
    const { res } = await call('/admin', `Bearer ${String(header)}.${forged}.${String(signature)}`);
    expect(res.status).toBe(401);
  });

  it('never logs or echoes the token', async () => {
    const token = await signTestToken({ role: 'founder', secret: 'wrong-secret-for-this-test' });
    const { res, logs } = await call('/admin', `Bearer ${token}`);
    expect(res.status).toBe(401);
    const signature = token.split('.')[2] ?? '';
    expect(res.text).not.toContain(signature);
    expect(logs.text()).not.toContain(signature);
  });
});

describe('requireAuth()', () => {
  it('allows any role and stacks with requireRole without re-verifying', async () => {
    const token = await signTestToken({ role: 'supporter', sub: USER_ID });
    expect((await call('/any', `Bearer ${token}`)).res.body).toEqual({
      user: { id: USER_ID, role: 'supporter' },
    });
    expect((await call('/stacked', `Bearer ${token}`)).res.status).toBe(200);
    const admin = await signTestToken({ role: 'admin' });
    expect((await call('/stacked', `Bearer ${admin}`)).res.status).toBe(403);
  });
});

describe('JwtAccessTokenVerifier', () => {
  it('reports expiry separately from other failures', async () => {
    const verifier = new JwtAccessTokenVerifier(TEST_JWT_SECRET);
    const expired = await signTestToken({ expiresIn: -60 });
    await expect(verifier.verify(expired)).rejects.toMatchObject({ reason: 'expired' });
    await expect(verifier.verify('a.b.c')).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verifier.verify('a.b.c')).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('tolerates a few seconds of clock skew', async () => {
    const verifier = new JwtAccessTokenVerifier(TEST_JWT_SECRET);
    const justExpired = await signTestToken({ role: 'admin', sub: USER_ID, expiresIn: -2 });
    await expect(verifier.verify(justExpired)).resolves.toEqual({ id: USER_ID, role: 'admin' });
  });

  it('refuses an empty secret', () => {
    expect(() => new JwtAccessTokenVerifier('')).toThrow();
  });
});
