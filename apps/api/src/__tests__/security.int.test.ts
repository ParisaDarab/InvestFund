/**
 * Tester-owned security regression tests for P0-API-01: request-ID validation, no echo of
 * stacks/causes/query strings in problem+json, `/metrics` never on the public app, and the
 * `OPENAPI_PUBLIC` gate as wired through the real container.
 */
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { ProblemDetails } from '@investfund/shared';

import { DependencyUnavailableError, NotFoundError } from '../core/errors/domain-errors.js';

import { buildTestApp, PRODUCTION_TEST_ENV, signTestToken } from './support.js';

const PROBLEM_JSON = /^application\/problem\+json/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function appThrowing(error: unknown) {
  const router = Router();
  router.get('/', () => {
    throw error;
  });
  return buildTestApp({ modules: [{ path: '/throw', router }] });
}

describe('request ID validation', () => {
  it.each([
    ['too long (129 chars)', 'a'.repeat(129)],
    ['markup', '<script>alert(1)</script>'],
    ['spaces', 'id with spaces'],
    ['quotes and braces', '"},{"level":"fatal'],
  ])('replaces a %s ID with a UUID and never reflects or logs it', async (_label, malicious) => {
    const { app, logs } = buildTestApp();
    const res = await request(app).get('/api/v1/nope').set('X-Request-Id', malicious);

    const id = res.headers['x-request-id'];
    expect(id).toMatch(UUID);
    expect(ProblemDetails.parse(res.body).requestId).toBe(id);
    expect(res.text).not.toContain(malicious);
    expect(logs.text()).not.toContain(malicious);
    const line = logs.lines.find((entry) => entry.msg === 'request completed');
    expect(line).toMatchObject({ req: { id } });
  });

  it('accepts an ID at the 128-character limit', async () => {
    const { app } = buildTestApp();
    const id = 'A1._:-'.repeat(21).slice(0, 128);
    const res = await request(app).get('/health/live').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it.each(['/health/live', '/health/ready', '/api/v1/openapi.json', '/api/v1/nope'])(
    'echoes a valid ID on %s (AC2: any endpoint)',
    async (path) => {
      const { app, logs } = buildTestApp();
      const res = await request(app).get(path).set('X-Request-Id', 'abc-123');
      expect(res.headers['x-request-id']).toBe('abc-123');
      const line = logs.lines.find((entry) => entry.msg === 'request completed');
      expect(line).toMatchObject({ req: { id: 'abc-123' } });
    },
  );

  it('generates a distinct ID per request', async () => {
    const { app } = buildTestApp();
    const a = await request(app).get('/health/live');
    const b = await request(app).get('/health/live');
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});

describe('problem+json never echoes internals or request data', () => {
  it('does not reflect query strings in 404 problems or logs', async () => {
    const { app, logs } = buildTestApp();
    const res = await request(app).get('/api/v1/nope?token=qs-secret-123&email=a%40b.test');

    expect(res.status).toBe(404);
    const body = ProblemDetails.parse(res.body);
    expect(body.instance).toBe('/api/v1/nope');
    expect(res.text).not.toContain('qs-secret-123');
    expect(res.text).not.toContain('a@b.test');
    expect(logs.text()).not.toContain('qs-secret-123');
  });

  it('does not reflect a request body', async () => {
    const { app, logs } = buildTestApp();
    const res = await request(app)
      .post('/api/v1/nope')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ password: 'body-secret-456' }));

    expect(res.status).toBe(404);
    expect(res.text).not.toContain('body-secret-456');
    expect(logs.text()).not.toContain('body-secret-456');
  });

  it('keeps markup in an unknown path inside a JSON problem body', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/v1/%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
  });

  it('exposes neither the stack, the message nor the cause of an unknown error', async () => {
    const cause = new Error('db password=cause-secret-789');
    const error = Object.assign(new Error('boom at /srv/app/internal.ts:12'), {
      cause,
      apiKey: 'prop-secret-000',
    });
    const { app, logs } = appThrowing(error);
    const res = await request(app).get('/api/v1/throw');

    expect(res.status).toBe(500);
    const raw = res.body as Record<string, unknown>;
    for (const key of ['stack', 'cause', 'message', 'apiKey', 'errors']) {
      expect(raw).not.toHaveProperty(key);
    }
    for (const text of ['boom', '/srv/app', 'cause-secret-789', 'prop-secret-000', '    at ']) {
      expect(res.text).not.toContain(text);
    }
    // The stack reaches the log; sensitive error properties are redacted there.
    const line = logs.lines.find((entry) => entry.level === 'error');
    expect((line?.err as { stack?: string } | undefined)?.stack).toContain('boom');
    expect(logs.text()).not.toContain('prop-secret-000');
  });

  it('keeps the cause of a 5xx domain error out of the response', async () => {
    const error = new DependencyUnavailableError(undefined, {
      cause: new Error('redis://user:cause-pass@10.0.0.5:6379'),
    });
    const res = await request(appThrowing(error).app).get('/api/v1/throw');

    expect(res.status).toBe(503);
    const raw = res.body as Record<string, unknown>;
    expect(raw).not.toHaveProperty('cause');
    expect(raw).not.toHaveProperty('stack');
    expect(res.text).not.toMatch(/cause-pass|10\.0\.0\.5/);
  });

  it('does not attach a stack to 4xx domain problems', async () => {
    const res = await request(appThrowing(new NotFoundError()).app).get('/api/v1/throw');
    expect(res.status).toBe(404);
    expect(res.body as Record<string, unknown>).not.toHaveProperty('stack');
    expect(res.text).not.toContain('    at ');
  });
});

describe('/metrics is not exposed publicly', () => {
  it('is not served by the public app even when metrics are enabled in the container', async () => {
    const { app, deps } = buildTestApp({ env: { METRICS_ENABLED: 'true' } });
    expect(deps.metrics).toBeDefined();

    for (const path of ['/metrics', '/api/v1/metrics', '/health/metrics']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(res.text).not.toContain('http_request_duration_seconds');
      expect(res.text).not.toContain('process_cpu');
    }
  });

  it('builds no metrics registry when METRICS_ENABLED=false', () => {
    const { deps } = buildTestApp({ env: { METRICS_ENABLED: 'false' } });
    expect(deps.metrics).toBeUndefined();
  });
});

describe('OPENAPI_PUBLIC gate (through the container)', () => {
  it('is admin-only by default in production (P0-API-02 AC10)', async () => {
    // The rate limiter is never reached without a valid token, so no database is needed here.
    const { app } = buildTestApp({ env: PRODUCTION_TEST_ENV });
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.text).not.toContain('"openapi"');

    const founder = await signTestToken({
      role: 'founder',
      secret: PRODUCTION_TEST_ENV.JWT_ACCESS_SECRET,
    });
    const forbidden = await request(app)
      .get('/api/v1/openapi.json')
      .set('Authorization', `Bearer ${founder}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.text).not.toContain('"openapi"');
  });

  // Production with OPENAPI_PUBLIC=true needs the Postgres rate-limit store (memory is refused in
  // production), so it is covered with a migrated test database in core-security.int.test.ts.

  it('is on by default outside production', async () => {
    const { app } = buildTestApp({ env: { NODE_ENV: 'development' } });
    expect((await request(app).get('/api/v1/openapi.json')).status).toBe(200);
  });

  it('only serves GET on the document path', async () => {
    const { app } = buildTestApp();
    const res = await request(app).post('/api/v1/openapi.json');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
  });
});
