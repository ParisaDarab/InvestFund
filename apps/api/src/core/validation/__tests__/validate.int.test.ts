/** `validate()` through a real app: 400 `validation-error` with `errors[]` (AC4). */
import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CursorPageQuery, Money, ProblemDetails, problemTypeUri } from '@investfund/shared';

import { buildTestApp } from '../../../__tests__/support.js';
import { toFieldErrors, validate } from '../validate.js';

const CreateThing = z.strictObject({
  name: z.string().min(2).max(50),
  email: z.email(),
  budget: Money.optional(),
});

/** Deliberately not strict: `validate` must still reject unknown top-level fields. */
const LooseBody = z.object({ title: z.string() });

const Params = z.strictObject({ thingId: z.uuid() });

function app() {
  const router = Router();
  router.post('/', validate({ body: CreateThing }), (req, res) => {
    res.status(201).json({ received: req.body as unknown });
  });
  router.post('/loose', validate({ body: LooseBody }), (req, res) => {
    res.json({ received: req.body as unknown });
  });
  router.get('/', validate({ query: CursorPageQuery }), (req, res) => {
    res.json({ query: req.query });
  });
  router.get('/:thingId', validate({ params: Params }), (req, res) => {
    res.json({ params: req.params });
  });
  return buildTestApp({ modules: [{ path: '/things', router }] }).app;
}

const VALID = { name: 'Acme', email: 'founder@acme.test' };

describe('validate({ body })', () => {
  it('passes a valid body through as the parsed value', async () => {
    const res = await request(app()).post('/api/v1/things').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: VALID });
  });

  it('returns 400 validation-error with the field path and code (AC4)', async () => {
    const res = await request(app())
      .post('/api/v1/things')
      .send({ name: 'A', email: 'not-an-email', budget: { amountMinor: '-5', currency: 'GBP' } });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    const body = ProblemDetails.parse(res.body);
    expect(body.type).toBe(problemTypeUri('validation-error'));
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'body.name', code: 'too_small' }),
        expect.objectContaining({ path: 'body.email', code: 'invalid_format' }),
        expect.objectContaining({ path: 'body.budget.amountMinor', code: 'invalid_format' }),
      ]),
    );
    expect(res.text).not.toContain('not-an-email');
  });

  it('rejects unknown fields, one entry per field, at any depth (AC4)', async () => {
    const res = await request(app())
      .post('/api/v1/things')
      .send({
        ...VALID,
        role: 'admin',
        isAdmin: true,
        budget: { amountMinor: '1', currency: 'GBP', x: 1 },
      });

    expect(res.status).toBe(400);
    expect(ProblemDetails.parse(res.body).errors).toEqual(
      expect.arrayContaining([
        { path: 'body.role', code: 'unrecognized_keys', message: 'Unknown field.' },
        { path: 'body.isAdmin', code: 'unrecognized_keys', message: 'Unknown field.' },
        { path: 'body.budget.x', code: 'unrecognized_keys', message: 'Unknown field.' },
      ]),
    );
  });

  it('rejects unknown top-level fields even for a non-strict schema', async () => {
    const res = await request(app()).post('/api/v1/things/loose').send({ title: 't', extra: 1 });
    expect(res.status).toBe(400);
    expect(ProblemDetails.parse(res.body).errors).toEqual([
      { path: 'body.extra', code: 'unrecognized_keys', message: 'Unknown field.' },
    ]);
  });

  it('reports a missing body at the body root', async () => {
    const res = await request(app()).post('/api/v1/things');
    expect(res.status).toBe(400);
    expect(ProblemDetails.parse(res.body).errors).toEqual([
      expect.objectContaining({ path: 'body', code: 'invalid_type' }),
    ]);
  });

  it('maps malformed JSON to validation-error without echoing it', async () => {
    const res = await request(app())
      .post('/api/v1/things')
      .set('Content-Type', 'application/json')
      .send('{"name": "secret-json-k9",');
    expect(res.status).toBe(400);
    expect(ProblemDetails.parse(res.body).type).toBe(problemTypeUri('validation-error'));
    expect(res.text).not.toContain('secret-json-k9');
  });

  it('rejects JSON bodies over 1 MB with payload-too-large', async () => {
    const res = await request(app())
      .post('/api/v1/things')
      .send({ ...VALID, name: 'x'.repeat(1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(ProblemDetails.parse(res.body).type).toBe(problemTypeUri('payload-too-large'));
  });
});

describe('validate({ query, params })', () => {
  it('applies coercion and defaults to the query', async () => {
    const defaults = await request(app()).get('/api/v1/things');
    expect(defaults.body).toEqual({ query: { limit: 20 } });
    const explicit = await request(app()).get('/api/v1/things?limit=5');
    expect(explicit.body).toEqual({ query: { limit: 5 } });
  });

  it('rejects invalid and unknown query parameters', async () => {
    const res = await request(app()).get('/api/v1/things?limit=500&sort=name');
    expect(res.status).toBe(400);
    expect(ProblemDetails.parse(res.body).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'query.limit', code: 'too_big' }),
        expect.objectContaining({ path: 'query.sort', code: 'unrecognized_keys' }),
      ]),
    );
  });

  it('validates path parameters', async () => {
    const ok = await request(app()).get('/api/v1/things/01928c4e-7d3a-7b2c-9f1e-3a4b5c6d7e8f');
    expect(ok.status).toBe(200);
    const bad = await request(app()).get('/api/v1/things/not-a-uuid');
    expect(bad.status).toBe(400);
    expect(ProblemDetails.parse(bad.body).errors).toEqual([
      expect.objectContaining({ path: 'params.thingId', code: 'invalid_format' }),
    ]);
  });
});

describe('toFieldErrors', () => {
  it('joins nested and array paths with dots', () => {
    const schema = z.strictObject({ items: z.array(z.strictObject({ qty: z.int().min(1) })) });
    const result = schema.safeParse({ items: [{ qty: 1 }, { qty: 0 }] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toFieldErrors('body', result.error)).toEqual([
      expect.objectContaining({ path: 'body.items.1.qty', code: 'too_small' }),
    ]);
  });
});
