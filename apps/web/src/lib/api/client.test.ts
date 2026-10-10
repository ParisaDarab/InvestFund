import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { HealthReport, problemTypeUri } from '@investfund/shared';

import { setupMswServer } from '../../../test/support/msw';

import {
  apiFetch,
  ApiError,
  buildApiUrl,
  isApiError,
  parseRetryAfter,
  setAccessTokenProvider,
} from './client';
import { fetchHealthReport } from './health';

import {
  healthReadyHandler,
  healthReadyUrl,
  notReadyHealthReport,
  readyHealthReport,
} from '@/mocks/handlers/health';

const server = setupMswServer();

const API = 'http://api.test/api/v1';
const Thing = z.object({ id: z.string(), count: z.number() });

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (isApiError(error)) return error;
    throw error;
  }
  throw new Error('Expected the request to fail');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setAccessTokenProvider(null);
});

describe('buildApiUrl', () => {
  it('prefixes NEXT_PUBLIC_API_URL and /api/v1, or only the base for system endpoints', () => {
    expect(buildApiUrl('/startups')).toBe(`${API}/startups`);
    expect(buildApiUrl('/health/ready', { prefix: false })).toBe('http://api.test/health/ready');
  });

  it('rejects paths that are not root-relative', () => {
    expect(() => buildApiUrl('startups')).toThrow(TypeError);
    expect(() => buildApiUrl('https://evil.example/x')).toThrow(TypeError);
  });
});

describe('apiFetch success', () => {
  it('parses the body with the response schema (typed result)', async () => {
    server.use(
      http.get(`${API}/things/1`, () => HttpResponse.json({ id: '1', count: 2, extra: true })),
    );
    const thing = await apiFetch('/things/1', { schema: Thing });
    expect(thing).toEqual({ id: '1', count: 2 });
  });

  it('reads GET /health/ready outside /api/v1 and accepts its 503 HealthReport', async () => {
    await expect(fetchHealthReport()).resolves.toEqual(readyHealthReport);
    server.use(healthReadyHandler(notReadyHealthReport));
    await expect(fetchHealthReport()).resolves.toEqual(notReadyHealthReport);
  });

  it('sends JSON, asks for JSON and omits credentials outside /auth', async () => {
    let seen: Request | undefined;
    server.use(
      http.post(`${API}/things`, ({ request }) => {
        seen = request.clone();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(apiFetch('/things', { method: 'POST', body: { name: 'x' } })).resolves.toBe(
      undefined,
    );
    expect(seen?.headers.get('Content-Type')).toBe('application/json');
    expect(seen?.headers.get('Accept')).toContain('application/problem+json');
    expect(seen?.credentials).toBe('omit');
    await expect(seen?.json()).resolves.toEqual({ name: 'x' });
  });

  it('includes credentials for /auth/* only', async () => {
    let credentials: RequestCredentials | undefined;
    server.use(
      http.post(`${API}/auth/refresh`, ({ request }) => {
        credentials = request.credentials;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await apiFetch('/auth/refresh', { method: 'POST' });
    expect(credentials).toBe('include');
  });

  it('never consults the access token provider on the server', async () => {
    const provider = vi.fn(() => 'secret-token');
    setAccessTokenProvider(provider);
    let authorization: string | null = 'unset';
    server.use(
      http.get(`${API}/things/1`, ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ id: '1', count: 1 });
      }),
    );
    await apiFetch('/things/1', { schema: Thing });
    expect(provider).not.toHaveBeenCalled();
    expect(authorization).toBeNull();
  });
});

describe('apiFetch contract violations', () => {
  const sensitive = 'founder@example.com';

  it('throws ApiError kind "contract" with the schema issues', async () => {
    server.use(
      http.get(`${API}/things/1`, () => HttpResponse.json({ id: sensitive, count: 'two' })),
    );
    const error = await captureError(apiFetch('/things/1', { schema: Thing }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('contract');
    expect(error.status).toBe(200);
    expect(error.issues).toEqual([
      expect.objectContaining({ path: 'count', code: 'invalid_type' }),
    ]);
  });

  it('treats a body that is not JSON as a contract violation', async () => {
    server.use(http.get(`${API}/things/1`, () => HttpResponse.text('<html>')));
    const error = await captureError(apiFetch('/things/1', { schema: Thing }));
    expect(error.kind).toBe('contract');
    expect(error.issues[0]?.code).toBe('invalid_json');
  });

  it('is logged in development only, without the response body', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.get(`${API}/things/1`, () => HttpResponse.json({ id: sensitive, count: 'two' })),
    );

    await captureError(apiFetch('/things/1', { schema: Thing }));
    expect(consoleError).not.toHaveBeenCalled();

    vi.stubEnv('NODE_ENV', 'production');
    await captureError(apiFetch('/things/1', { schema: Thing }));
    expect(consoleError).not.toHaveBeenCalled();

    vi.stubEnv('NODE_ENV', 'development');
    await captureError(apiFetch('/things/1?email=x', { schema: Thing }));
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(consoleError.mock.calls[0]);
    expect(logged).toContain('GET /things/1');
    expect(logged).not.toContain(sensitive);
    expect(logged).not.toContain('email=x');
  });
});

describe('apiFetch error responses', () => {
  it('parses problem+json into ApiError kind "problem" with field errors', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        HttpResponse.json(
          {
            type: problemTypeUri('validation-error'),
            title: 'Validation failed',
            status: 400,
            requestId: 'req-1',
            errors: [{ path: 'email', code: 'invalid_format', message: 'Enter a valid email' }],
          },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    const error = await captureError(apiFetch('/auth/register', { method: 'POST', body: {} }));
    expect(error.kind).toBe('problem');
    expect(error.status).toBe(400);
    expect(error.message).toBe('Validation failed');
    expect(error.requestId).toBe('req-1');
    expect(error.problem?.type).toBe(problemTypeUri('validation-error'));
    expect(error.fieldErrors).toEqual([
      { path: 'email', code: 'invalid_format', message: 'Enter a valid email' },
    ]);
  });

  it('reads Retry-After on 429', async () => {
    server.use(
      http.get(`${API}/things/1`, () =>
        HttpResponse.json(
          {
            type: problemTypeUri('rate-limited'),
            title: 'Too many requests',
            status: 429,
            requestId: 'req-2',
          },
          {
            status: 429,
            headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '30' },
          },
        ),
      ),
    );
    const error = await captureError(apiFetch('/things/1', { schema: Thing }));
    expect(error.kind).toBe('problem');
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('falls back to kind "http" when the error body is not a problem document', async () => {
    server.use(
      http.get(`${API}/things/1`, () => HttpResponse.text('Bad gateway', { status: 502 })),
      http.get(`${API}/things/2`, () => HttpResponse.json({ message: 'nope' }, { status: 500 })),
    );
    const plain = await captureError(apiFetch('/things/1', { schema: Thing }));
    expect(plain).toMatchObject({ kind: 'http', status: 502, problem: undefined });
    const json = await captureError(apiFetch('/things/2', { schema: Thing }));
    expect(json).toMatchObject({ kind: 'http', status: 500, problem: undefined });
    expect(json.fieldErrors).toEqual([]);
  });

  it('treats a 503 as an error unless the endpoint accepts it', async () => {
    server.use(
      http.get(healthReadyUrl(), () => HttpResponse.json(notReadyHealthReport, { status: 503 })),
    );
    const error = await captureError(
      apiFetch('/health/ready', { schema: HealthReport, prefix: false }),
    );
    expect(error).toMatchObject({ kind: 'http', status: 503 });
  });
});

describe('apiFetch network failures', () => {
  it('throws ApiError kind "network" when no response arrives', async () => {
    server.use(http.get(`${API}/things/1`, () => HttpResponse.error()));
    const error = await captureError(apiFetch('/things/1', { schema: Thing }));
    expect(error.kind).toBe('network');
    expect(error.status).toBeUndefined();
    expect(error.message).toBe('Network error calling GET /things/1');
  });

  it('rethrows cancellation as-is instead of wrapping it', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = apiFetch('/things/1', { schema: Thing, signal: controller.signal });
    await expect(result).rejects.toSatisfy((error) => !isApiError(error));
  });
});

describe('parseRetryAfter', () => {
  it('reads delta-seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(parseRetryAfter('30')).toBe(30);
    expect(parseRetryAfter('Sat, 10 Oct 2026 12:01:00 GMT', now)).toBe(60);
    expect(parseRetryAfter('Sat, 10 Oct 2026 11:00:00 GMT', now)).toBe(0);
  });

  it('ignores missing or malformed values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter('-5')).toBeUndefined();
  });
});
