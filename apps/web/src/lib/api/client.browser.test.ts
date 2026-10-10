// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { setupMswServer } from '../../../test/support/msw';

import { apiFetch, setAccessTokenProvider } from './client';

const server = setupMswServer();
const Thing = z.object({ id: z.string() });

afterEach(() => {
  setAccessTokenProvider(null);
});

describe('apiFetch in the browser', () => {
  it('attaches the bearer token from the registered provider', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('http://api.test/api/v1/things/1', ({ request }) => {
        seen.push(request.headers.get('Authorization'));
        return HttpResponse.json({ id: '1' });
      }),
    );

    await apiFetch('/things/1', { schema: Thing });
    setAccessTokenProvider(() => Promise.resolve('access-token'));
    await apiFetch('/things/1', { schema: Thing });
    setAccessTokenProvider(null);
    await apiFetch('/things/1', { schema: Thing });

    expect(seen).toEqual([null, 'Bearer access-token', null]);
  });
});
