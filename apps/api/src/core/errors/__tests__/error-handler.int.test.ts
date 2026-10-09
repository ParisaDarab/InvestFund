import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { PROBLEM_TYPE_SLUGS, ProblemDetails, problemTypeUri } from '@investfund/shared';

import { buildTestApp } from '../../../__tests__/support.js';
import {
  BusinessRuleError,
  ConflictError,
  DependencyUnavailableError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  type DomainError,
} from '../domain-errors.js';
import { INTERNAL_PROBLEM_DETAIL, PROBLEM_TITLES } from '../problem.js';

const PROBLEM_JSON = /^application\/problem\+json/;

function appThrowing(error: unknown) {
  const router = Router();
  router.get('/', () => {
    throw error;
  });
  return buildTestApp({ modules: [{ path: '/throw', router }] });
}

const cases: [string, DomainError, number, string][] = [
  [
    'ValidationError',
    new ValidationError('bad', {
      errors: [{ path: 'body.email', code: 'invalid_format', message: 'Invalid email' }],
    }),
    400,
    'validation-error',
  ],
  ['NotFoundError', new NotFoundError(), 404, 'not-found'],
  ['ForbiddenError', new ForbiddenError(), 403, 'forbidden'],
  [
    'ForbiddenError(account-suspended)',
    new ForbiddenError('suspended', { slug: 'account-suspended' }),
    403,
    'account-suspended',
  ],
  ['ConflictError', new ConflictError(), 409, 'conflict'],
  [
    'ConflictError(version-conflict)',
    new ConflictError('stale', { slug: 'version-conflict' }),
    409,
    'version-conflict',
  ],
  ['BusinessRuleError', new BusinessRuleError('rule'), 422, 'business-rule-violation'],
  [
    'BusinessRuleError(quota-exceeded)',
    new BusinessRuleError('quota', { slug: 'quota-exceeded' }),
    422,
    'quota-exceeded',
  ],
  [
    'RateLimitError',
    new RateLimitError(undefined, { retryAfterSeconds: 2.2 }),
    429,
    'rate-limited',
  ],
  ['DependencyUnavailableError', new DependencyUnavailableError(), 503, 'dependency-unavailable'],
];

describe('central error handler', () => {
  it.each(cases)('maps %s to problem+json', async (_name, error, status, slug) => {
    const { app } = appThrowing(error);
    const res = await request(app).get('/api/v1/throw').set('X-Request-Id', 'req-42');

    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    const body = ProblemDetails.parse(res.body);
    expect(body).toMatchObject({
      type: problemTypeUri(slug as (typeof PROBLEM_TYPE_SLUGS)[number]),
      status,
      detail: error.message,
      instance: '/api/v1/throw',
      requestId: 'req-42',
    });
    expect(body.errors).toEqual(error.errors === undefined ? undefined : [...error.errors]);
  });

  it('sets Retry-After for RateLimitError (rounded up)', async () => {
    const { app } = appThrowing(new RateLimitError(undefined, { retryAfterSeconds: 2.2 }));
    const res = await request(app).get('/api/v1/throw');
    expect(res.headers['retry-after']).toBe('3');
  });

  it('has a title for every standard problem type', () => {
    for (const slug of PROBLEM_TYPE_SLUGS) expect(PROBLEM_TITLES[slug]).toEqual(expect.any(String));
  });

  it('turns unknown errors into a generic 500 without a stack, and logs the stack (AC4)', async () => {
    const { app, logs } = appThrowing(new Error('boom'));
    const res = await request(app).get('/api/v1/throw').set('X-Request-Id', 'abc-500');

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    const body = ProblemDetails.parse(res.body);
    expect(body).toEqual({
      type: problemTypeUri('internal-error'),
      title: 'Internal server error',
      status: 500,
      detail: INTERNAL_PROBLEM_DETAIL,
      instance: '/api/v1/throw',
      requestId: 'abc-500',
    });
    expect(res.text).not.toContain('boom');
    expect(res.text).not.toContain('at ');

    const line = logs.lines.find((entry) => entry.level === 'error');
    expect(line).toBeDefined();
    expect(JSON.stringify(line)).toContain('abc-500');
    expect((line?.err as { stack?: string } | undefined)?.stack).toContain('Error: boom');
  });

  it('handles non-Error throwables as 500', async () => {
    const { app } = appThrowing('a string');
    const res = await request(app).get('/api/v1/throw');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('a string');
  });

  it.each([
    [400, 'validation-error'],
    [413, 'payload-too-large'],
    [415, 'unsupported-media-type'],
  ] as const)(
    'maps an exposed http-errors %i to %s with a generic detail',
    async (status, slug) => {
      const error = Object.assign(new Error('Unexpected token s in JSON at "secret-body"'), {
        status,
        expose: true,
      });
      const { app } = appThrowing(error);
      const res = await request(app).get('/api/v1/throw');
      expect(res.status).toBe(status);
      expect(ProblemDetails.parse(res.body).type).toBe(problemTypeUri(slug));
      expect(res.text).not.toContain('secret-body');
    },
  );

  it('treats unexposed or unmapped http errors as 500', async () => {
    for (const error of [
      Object.assign(new Error('x'), { status: 400, expose: false }),
      Object.assign(new Error('x'), { status: 418, expose: true }),
    ]) {
      const res = await request(appThrowing(error).app).get('/api/v1/throw');
      expect(res.status).toBe(500);
    }
  });

  it('logs domain 4xx errors without attaching a stack', async () => {
    const { app, logs } = appThrowing(new NotFoundError());
    await request(app).get('/api/v1/throw');
    const line = logs.lines.find((entry) => entry.msg === 'request completed');
    expect(line).toMatchObject({ level: 'warn', res: { statusCode: 404 } });
    expect(line?.err).toBeUndefined();
  });

  it('logs 5xx domain errors with the error attached', async () => {
    const { app, logs } = appThrowing(new DependencyUnavailableError());
    await request(app).get('/api/v1/throw');
    const line = logs.lines.find((entry) => entry.level === 'error');
    expect(line?.err).toMatchObject({ type: 'DependencyUnavailableError' });
  });

  it('delegates to Express when headers were already sent', async () => {
    const router = Router();
    router.get('/', (_req, res) => {
      res.status(200).write('partial');
      throw new Error('late');
    });
    const { app } = buildTestApp({ modules: [{ path: '/late', router }] });
    const res = await request(app)
      .get('/api/v1/late')
      .catch((error: unknown) => error);
    // Express ends or aborts the response; it must never be rewritten as problem+json.
    if (res instanceof Error) return;
    expect((res as { headers: Record<string, string> }).headers['content-type']).not.toMatch(
      PROBLEM_JSON,
    );
  });
});

describe('domain errors', () => {
  it('keep the cause for logs only', () => {
    const cause = new Error('db down');
    const error = new DependencyUnavailableError(undefined, { cause });
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('DependencyUnavailableError');
    expect(error.status).toBe(503);
  });

  it('omit Retry-After when no delay is given', () => {
    const error = new RateLimitError();
    expect(error.headers).toEqual({});
    expect(error.retryAfterSeconds).toBeUndefined();
  });
});
