/** Rate-limit middleware with the in-memory store (unit level, through Express). */
import express, { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { ProblemDetails, problemTypeUri, type RateLimitPreset } from '@investfund/shared';

import { buildTestApp, signTestToken } from '../../../__tests__/support.js';
import { createErrorHandler } from '../../errors/error-handler.js';
import { createHttpLogger } from '../../logger/http-logger.js';
import { createLogger } from '../../logger/logger.js';
import { MemoryRateLimitStore } from '../memory-store.js';
import { RATE_LIMIT_POLICIES } from '../presets.js';
import { createRateLimiter } from '../rate-limit.js';

import type { HitInput, RateLimitStore } from '../rate-limit-store.js';

/** An app whose `/api/v1/limited/<preset>` routes use the container's limiter. */
function limitedApp(env: Record<string, string> = {}) {
  return buildTestApp({
    env,
    modules: ({ rateLimiter, authGuards }) => {
      const router = Router();
      router.post('/auth', rateLimiter.limit('auth'), (_req, res) => {
        res.json({ ok: true });
      });
      router.get('/default', rateLimiter.limit('default'), (_req, res) => {
        res.json({ ok: true });
      });
      router.get('/ai', authGuards.requireAuth(), rateLimiter.limit('ai'), (_req, res) => {
        res.json({ ok: true });
      });
      return [{ path: '/limited', router }];
    },
  });
}

describe('presets (docs/API.md §3)', () => {
  it('match the documented limits', () => {
    expect(RATE_LIMIT_POLICIES).toMatchObject({
      auth: { subject: 'ip', ipLimit: 10, windowMs: 60_000 },
      upload: { userLimit: 20 },
      ai: { userLimit: 10 },
      sensitive: { userLimit: 10 },
      default: { userLimit: 120, ipLimit: 60 },
    } satisfies Partial<Record<RateLimitPreset, object>>);
  });
});

describe('auth preset (AC3)', () => {
  it('returns 429 rate-limited with Retry-After on the 11th request in a minute', async () => {
    const { app } = limitedApp();
    for (let i = 1; i <= 10; i += 1) {
      const res = await request(app).post('/api/v1/limited/auth');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe(String(10 - i));
      expect(res.headers['ratelimit-policy']).toBe('10;w=60');
    }
    const res = await request(app).post('/api/v1/limited/auth');
    expect(res.status).toBe(429);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(ProblemDetails.parse(res.body).type).toBe(problemTypeUri('rate-limited'));
    const retryAfter = Number(res.headers['retry-after']);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(res.headers['ratelimit-remaining']).toBe('0');
  });

  it('counts each client IP separately (behind a trusted proxy)', async () => {
    const { app } = limitedApp({ TRUST_PROXY: 'loopback' });
    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/api/v1/limited/auth').set('X-Forwarded-For', '203.0.113.1');
    }
    const blocked = await request(app)
      .post('/api/v1/limited/auth')
      .set('X-Forwarded-For', '203.0.113.1');
    expect(blocked.status).toBe(429);
    const other = await request(app)
      .post('/api/v1/limited/auth')
      .set('X-Forwarded-For', '203.0.113.2');
    expect(other.status).toBe(200);
  });

  it('ignores X-Forwarded-For when no proxy is trusted (no spoofing)', async () => {
    const { app } = limitedApp();
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post('/api/v1/limited/auth')
        .set('X-Forwarded-For', `198.51.100.${String(i)}`);
    }
    const res = await request(app)
      .post('/api/v1/limited/auth')
      .set('X-Forwarded-For', '198.51.100.99');
    expect(res.status).toBe(429);
  });

  it('keeps presets independent', async () => {
    const { app } = limitedApp();
    for (let i = 0; i < 11; i += 1) await request(app).post('/api/v1/limited/auth');
    expect((await request(app).get('/api/v1/limited/default')).status).toBe(200);
  });
});

describe('subjects', () => {
  it('limits anonymous default traffic per IP at 60/min', async () => {
    const { app } = limitedApp();
    const res = await request(app).get('/api/v1/limited/default');
    expect(res.headers['ratelimit-limit']).toBe('60');
  });

  it('limits authenticated traffic per user, not per IP', async () => {
    const { app } = limitedApp();
    const alice = await signTestToken({ sub: '01928c4e-7d3a-7b2c-9f1e-3a4b5c6d7e8a' });
    const bob = await signTestToken({ sub: '01928c4e-7d3a-7b2c-9f1e-3a4b5c6d7e8b' });
    for (let i = 0; i < 10; i += 1) {
      await request(app).get('/api/v1/limited/ai').set('Authorization', `Bearer ${alice}`);
    }
    const aliceBlocked = await request(app)
      .get('/api/v1/limited/ai')
      .set('Authorization', `Bearer ${alice}`);
    expect(aliceBlocked.status).toBe(429);
    const bobOk = await request(app)
      .get('/api/v1/limited/ai')
      .set('Authorization', `Bearer ${bob}`);
    expect(bobOk.status).toBe(200);
    expect(bobOk.headers['ratelimit-limit']).toBe('10');
  });
});

/** A bare app around one limiter, for store-level behaviour. */
function bareApp(store: RateLimitStore, now: () => number = Date.now) {
  const logger = createLogger({ level: 'silent' });
  const limiter = createRateLimiter({ store, hashSubject: (s) => `h(${s})`, now });
  const app = express();
  app.use(createHttpLogger(logger));
  app.get('/x', limiter.limit('auth'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(createErrorHandler());
  return app;
}

describe('store interaction', () => {
  it('passes only the hashed subject to the store, never the raw IP', async () => {
    const inputs: HitInput[] = [];
    const memory = new MemoryRateLimitStore();
    const spy: RateLimitStore = {
      hit: (input) => {
        inputs.push(input);
        return memory.hit(input);
      },
      deleteExpired: () => memory.deleteExpired(),
    };
    await request(bareApp(spy)).get('/x');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ preset: 'auth', windowMs: 60_000 });
    expect(inputs[0]?.keyHash).toMatch(/^h\(ip:(127\.0\.0\.1|::1)\)$/);
  });

  it('fails closed with 503 dependency-unavailable when the store errors, without leaking it', async () => {
    const failing: RateLimitStore = {
      hit: () => Promise.reject(new Error('connect ECONNREFUSED 10.9.9.9:5432 pw=store-secret')),
      deleteExpired: () => Promise.resolve(0),
    };
    const res = await request(bareApp(failing)).get('/x');
    expect(res.status).toBe(503);
    expect(ProblemDetails.parse(res.body).type).toBe(problemTypeUri('dependency-unavailable'));
    expect(res.text).not.toMatch(/ECONNREFUSED|10\.9\.9\.9|store-secret/);
  });

  it('starts a new window after the reset time', async () => {
    let clock = 1_000_000;
    const store = new MemoryRateLimitStore({ now: () => clock });
    const app = bareApp(store, () => clock);
    for (let i = 0; i < 10; i += 1) await request(app).get('/x');
    const blocked = await request(app).get('/x');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('60');

    clock += 30_000;
    const later = await request(app).get('/x');
    expect(later.status).toBe(429);
    expect(later.headers['retry-after']).toBe('30');

    clock += 30_000;
    const reset = await request(app).get('/x');
    expect(reset.status).toBe(200);
    expect(reset.headers['ratelimit-remaining']).toBe('9');
  });
});

describe('MemoryRateLimitStore', () => {
  it('sweeps expired buckets opportunistically and on demand', async () => {
    let clock = 0;
    const store = new MemoryRateLimitStore({ now: () => clock, sweepEvery: 3 });
    await store.hit({ preset: 'auth', keyHash: 'a', windowMs: 1000 });
    await store.hit({ preset: 'auth', keyHash: 'b', windowMs: 1000 });
    expect(store.size).toBe(2);
    clock = 2000;
    await store.hit({ preset: 'auth', keyHash: 'c', windowMs: 1000 }); // third hit: sweep first
    expect(store.size).toBe(1);
    clock = 4000;
    expect(await store.deleteExpired()).toBe(1);
    expect(store.size).toBe(0);
  });
});
