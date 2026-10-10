import { describe, expect, it } from 'vitest';

import {
  AcceptedMessage,
  CursorPageQuery,
  IsoDate,
  IsoDateTime,
  Job,
  JobAccepted,
  Money,
  ProblemDetails,
  Uuid,
  cursorPage,
} from '../api/common.js';

const UUID_V7 = '01928c4e-7d3a-7b2c-9f1e-3a4b5c6d7e8f';

describe('Uuid', () => {
  it('accepts a UUID v7 and v4', () => {
    expect(Uuid.safeParse(UUID_V7).success).toBe(true);
    expect(Uuid.safeParse('3f1c2b9e-4d5a-4e6f-8a7b-9c0d1e2f3a4b').success).toBe(true);
  });

  it.each(['', 'not-a-uuid', '01928c4e7d3a7b2c9f1e3a4b5c6d7e8f', 42])('rejects %j', (value) => {
    expect(Uuid.safeParse(value).success).toBe(false);
  });
});

describe('IsoDateTime', () => {
  it('accepts UTC timestamps', () => {
    expect(IsoDateTime.safeParse('2026-10-08T09:30:00Z').success).toBe(true);
    expect(IsoDateTime.safeParse('2026-10-08T09:30:00.123Z').success).toBe(true);
  });

  it.each(['2026-10-08', '2026-10-08T09:30:00+01:00', '2026-10-08 09:30:00Z', 'yesterday'])(
    'rejects %j',
    (value) => {
      expect(IsoDateTime.safeParse(value).success).toBe(false);
    },
  );
});

describe('IsoDate', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(IsoDate.safeParse('2026-10-08').success).toBe(true);
  });

  it.each(['2026-13-01', '2026-02-30', '08/10/2026', '2026-10-08T00:00:00Z'])(
    'rejects %j',
    (value) => {
      expect(IsoDate.safeParse(value).success).toBe(false);
    },
  );
});

describe('Money', () => {
  it('parses a GBP amount in minor units', () => {
    expect(Money.parse({ amountMinor: '2500000', currency: 'GBP' })).toEqual({
      amountMinor: '2500000',
      currency: 'GBP',
    });
    expect(Money.safeParse({ amountMinor: '0', currency: 'GBP' }).success).toBe(true);
    expect(Money.safeParse({ amountMinor: '9223372036854775807', currency: 'GBP' }).success).toBe(
      true,
    );
  });

  it.each([
    ['a number', { amountMinor: 25.5, currency: 'GBP' }],
    ['an integer number', { amountMinor: 2500, currency: 'GBP' }],
    ['a negative amount', { amountMinor: '-1', currency: 'GBP' }],
    ['a decimal string', { amountMinor: '25.50', currency: 'GBP' }],
    ['leading zeros', { amountMinor: '007', currency: 'GBP' }],
    ['an empty string', { amountMinor: '', currency: 'GBP' }],
    ['more than BIGINT max', { amountMinor: '9223372036854775808', currency: 'GBP' }],
    ['another currency', { amountMinor: '100', currency: 'USD' }],
    ['a missing currency', { amountMinor: '100' }],
    ['an unknown field', { amountMinor: '100', currency: 'GBP', note: 'x' }],
  ])('rejects %s', (_label, value) => {
    expect(Money.safeParse(value).success).toBe(false);
  });
});

describe('ProblemDetails', () => {
  const minimal = {
    type: 'https://investfund.local/problems/not-found',
    title: 'Not found',
    status: 404,
    requestId: 'req-123',
  };

  it('accepts a minimal problem and a validation problem with errors[]', () => {
    expect(ProblemDetails.safeParse(minimal).success).toBe(true);
    expect(
      ProblemDetails.safeParse({
        ...minimal,
        type: 'https://investfund.local/problems/validation-error',
        title: 'Validation error',
        status: 400,
        detail: 'The request body is invalid.',
        instance: '/api/v1/auth/register',
        errors: [{ path: 'body.email', code: 'invalid_format', message: 'Invalid email' }],
      }).success,
    ).toBe(true);
  });

  it('strips unknown extension members instead of failing (response schema)', () => {
    expect(ProblemDetails.parse({ ...minimal, retryAfter: 30 })).toEqual(minimal);
  });

  it.each([
    ['a missing requestId', { ...minimal, requestId: undefined }],
    ['an empty requestId', { ...minimal, requestId: '' }],
    ['a relative type', { ...minimal, type: 'not-found' }],
    ['a status outside 100-599', { ...minimal, status: 700 }],
    ['a fractional status', { ...minimal, status: 404.5 }],
    ['a malformed field error', { ...minimal, errors: [{ path: 'body.email' }] }],
  ])('rejects %s', (_label, value) => {
    expect(ProblemDetails.safeParse(value).success).toBe(false);
  });
});

describe('CursorPageQuery', () => {
  it('defaults limit to 20', () => {
    expect(CursorPageQuery.parse({})).toEqual({ limit: 20 });
  });

  it('coerces a query-string limit and keeps the cursor', () => {
    expect(CursorPageQuery.parse({ limit: '50', cursor: 'eyJpZCI6MX0' })).toEqual({
      limit: 50,
      cursor: 'eyJpZCI6MX0',
    });
    expect(CursorPageQuery.parse({ limit: '100' }).limit).toBe(100);
  });

  it.each([
    ['limit above 100', { limit: '500' }],
    ['limit 0', { limit: '0' }],
    ['a fractional limit', { limit: '2.5' }],
    ['a non-numeric limit', { limit: 'ten' }],
    ['an empty cursor', { cursor: '' }],
    ['a cursor with unsafe characters', { cursor: 'a/b?c' }],
    ['an unknown parameter', { sort: 'name' }],
  ])('rejects %s', (_label, value) => {
    expect(CursorPageQuery.safeParse(value).success).toBe(false);
  });
});

describe('cursorPage', () => {
  const Page = cursorPage(Uuid);

  it('accepts a page with a cursor and the last page', () => {
    expect(Page.safeParse({ data: [UUID_V7], nextCursor: 'abc' }).success).toBe(true);
    expect(Page.safeParse({ data: [], nextCursor: null }).success).toBe(true);
  });

  it('validates every item and requires nextCursor', () => {
    expect(Page.safeParse({ data: ['nope'], nextCursor: null }).success).toBe(false);
    expect(Page.safeParse({ data: [] }).success).toBe(false);
  });
});

describe('JobAccepted', () => {
  it('accepts a queued job', () => {
    expect(JobAccepted.safeParse({ jobId: UUID_V7, status: 'queued' }).success).toBe(true);
  });

  it('rejects an unknown status or a non-UUID id', () => {
    expect(JobAccepted.safeParse({ jobId: UUID_V7, status: 'done' }).success).toBe(false);
    expect(JobAccepted.safeParse({ jobId: '42', status: 'queued' }).success).toBe(false);
  });
});

describe('Job', () => {
  const running = {
    id: UUID_V7,
    type: 'document_extraction',
    status: 'running',
    progress: 40,
    createdAt: '2026-10-08T09:30:00Z',
    finishedAt: null,
  };

  it('accepts running, succeeded and failed jobs', () => {
    expect(Job.safeParse(running).success).toBe(true);
    expect(
      Job.safeParse({
        ...running,
        status: 'succeeded',
        progress: 100,
        result: { resourceType: 'document_extraction', resourceId: UUID_V7 },
        finishedAt: '2026-10-08T09:31:00Z',
      }).success,
    ).toBe(true);
    expect(
      Job.safeParse({
        ...running,
        status: 'failed',
        error: { code: 'llm_timeout', message: 'The AI provider timed out.' },
        finishedAt: '2026-10-08T09:31:00Z',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['progress above 100', { ...running, progress: 101 }],
    ['negative progress', { ...running, progress: -1 }],
    ['an empty type', { ...running, type: '' }],
    ['a missing finishedAt', { ...running, finishedAt: undefined }],
    ['a non-UTC createdAt', { ...running, createdAt: '2026-10-08T10:30:00+01:00' }],
    ['a result without resourceId', { ...running, result: { resourceType: 'x' } }],
  ])('rejects %s', (_label, value) => {
    expect(Job.safeParse(value).success).toBe(false);
  });
});

describe('AcceptedMessage', () => {
  it('accepts a message and rejects an empty one', () => {
    expect(AcceptedMessage.safeParse({ message: 'Check your inbox.' }).success).toBe(true);
    expect(AcceptedMessage.safeParse({ message: '' }).success).toBe(false);
    expect(AcceptedMessage.safeParse({}).success).toBe(false);
  });
});
