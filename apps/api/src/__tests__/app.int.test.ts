import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { HealthLive, HealthReport, ProblemDetails, problemTypeUri } from '@investfund/shared';

import { NotFoundError } from '../core/errors/domain-errors.js';

import { buildTestApp } from './support.js';

const PROBLEM_JSON = /^application\/problem\+json/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('GET /health/live (AC1)', () => {
  it('returns 200 { status: "ok" } with a generated X-Request-Id', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health/live');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(HealthLive.parse(res.body)).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('request IDs (AC2)', () => {
  it('echoes X-Request-Id and writes it on the request log line', async () => {
    const { app, logs } = buildTestApp();
    const res = await request(app)
      .get('/health/live?token=should-not-be-logged')
      .set('X-Request-Id', 'abc-123');

    expect(res.headers['x-request-id']).toBe('abc-123');
    const line = logs.lines.find((entry) => entry.msg === 'request completed');
    expect(line).toMatchObject({
      level: 'info',
      req: { id: 'abc-123', method: 'GET', path: '/health/live' },
      res: { statusCode: 200 },
    });
    expect(logs.text()).not.toContain('should-not-be-logged');
  });

  it('echoes the ID on error responses too', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/v1/nope').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(ProblemDetails.parse(res.body).requestId).toBe('abc-123');
  });

  it('replaces a malformed incoming ID', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health/live').set('X-Request-Id', 'bad id with spaces');
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('does not log request headers such as Authorization or Cookie', async () => {
    const { app, logs } = buildTestApp();
    await request(app)
      .get('/health/live')
      .set('Authorization', 'Bearer super-secret-token')
      .set('Cookie', 'if_rt=refresh-secret');
    expect(logs.text()).not.toContain('super-secret-token');
    expect(logs.text()).not.toContain('refresh-secret');
  });
});

describe('NotFoundError from a route (AC3)', () => {
  it('returns 404 problem+json that parses with ProblemDetails and has a requestId', async () => {
    const router = Router();
    router.get('/:id', () => {
      throw new NotFoundError('Startup not found.');
    });
    const { app } = buildTestApp({ modules: [{ path: '/things', router }] });

    const res = await request(app).get('/api/v1/things/42');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    const body = ProblemDetails.parse(res.body);
    expect(body).toMatchObject({
      type: problemTypeUri('not-found'),
      title: 'Not found',
      status: 404,
      detail: 'Startup not found.',
      instance: '/api/v1/things/42',
    });
    expect(body.requestId).toBe(res.headers['x-request-id']);
  });

  it('also handles rejected async handlers', async () => {
    const router = Router();
    router.get('/', async () => {
      await Promise.resolve();
      throw new NotFoundError();
    });
    const { app } = buildTestApp({ modules: [{ path: '/async', router }] });
    expect((await request(app).get('/api/v1/async')).status).toBe(404);
  });
});

describe('unknown paths (AC7)', () => {
  it.each(['/api/v1/nope', '/nope', '/api/v2/anything'])(
    '%s returns 404 problem+json',
    async (path) => {
      const { app } = buildTestApp();
      const res = await request(app).post(path);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(ProblemDetails.parse(res.body)).toMatchObject({
        type: problemTypeUri('not-found'),
        status: 404,
        instance: path,
      });
    },
  );
});

describe('GET /health/ready (AC9)', () => {
  it('returns 200 when every check passes', async () => {
    const { app, deps } = buildTestApp();
    deps.readiness.register({ name: 'db', run: () => Promise.resolve() });
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(HealthReport.parse(res.body)).toEqual({
      status: 'ok',
      checks: [{ name: 'db', status: 'ok' }],
    });
  });

  it('returns 503 naming the failing check without internal details', async () => {
    const { app, deps, logs } = buildTestApp();
    deps.readiness.register({ name: 'db', run: () => Promise.resolve() }).register({
      name: 'redis',
      run: () => Promise.reject(new Error('connect ECONNREFUSED 10.1.2.3:6379 password=hunter2')),
    });

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(HealthReport.parse(res.body)).toEqual({
      status: 'fail',
      checks: [
        { name: 'db', status: 'ok' },
        { name: 'redis', status: 'fail' },
      ],
    });
    expect(res.text).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|hunter2/);
    expect(logs.text()).toContain('readiness check failed');
  });
});

describe('GET /api/v1/openapi.json', () => {
  it('serves the generated OpenAPI 3.1 document when public', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    const doc = res.body as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/health/live', '/health/ready', '/api/v1/openapi.json']),
    );
    expect(doc.components.schemas).toHaveProperty('ProblemDetails');
  });

  it('is not served when OPENAPI_PUBLIC is off', async () => {
    const { app } = buildTestApp({ env: { OPENAPI_PUBLIC: 'false' } });
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
  });
});
