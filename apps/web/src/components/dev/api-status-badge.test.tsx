// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setupMswServer } from '../../../test/support/msw';

import { apiStatusOf, ApiStatusBadge } from './api-status-badge';
import { DevApiStatus } from './dev-api-status';

import type { QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import { useHealth } from '@/lib/api/health';
import { createQueryClient } from '@/lib/query-client';
import messages from '@/messages/en-GB.json';
import { healthReadyHandler, healthReadyUrl, notReadyHealthReport } from '@/mocks/handlers/health';

const server = setupMswServer();

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

/** App defaults, minus the retry back-off so retries happen immediately. */
function testQueryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  return client;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en-GB" timeZone="Europe/London" messages={messages}>
      <QueryClientProvider client={testQueryClient()}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe('useHealth', () => {
  it('returns the typed HealthReport', async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.status).toBe('ok');
    expect(result.current.data?.checks.map((check) => check.name)).toContain('db');
  });

  it('surfaces a network failure as ApiError kind "network" after one retry', async () => {
    let calls = 0;
    server.use(
      http.get(healthReadyUrl(), () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    const { result } = renderHook(() => useHealth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ kind: 'network' });
    expect(calls).toBe(2);
  });

  it('does not retry HTTP, problem or contract errors', async () => {
    let calls = 0;
    server.use(
      http.get(healthReadyUrl(), () => {
        calls += 1;
        return HttpResponse.json({ status: 'unknown' });
      }),
    );
    const { result } = renderHook(() => useHealth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toMatchObject({ kind: 'contract' });
    expect(calls).toBe(1);
  });
});

describe('ApiStatusBadge', () => {
  it('shows "ready" in a polite status region when the API is ready', async () => {
    render(<ApiStatusBadge apiHost="api.test" />, { wrapper });
    const badge = screen.getByTestId('api-status-badge');
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.getAttribute('aria-live')).toBe('polite');
    expect(badge.textContent).toContain(messages.devApiStatus.checking);

    await waitFor(() => {
      expect(badge.getAttribute('data-state')).toBe('ready');
    });
    expect(badge.textContent).toContain(messages.devApiStatus.ready);
    expect(badge.textContent).toContain('api.test');
  });

  it('spells out "not ready" when the API answers 503', async () => {
    server.use(healthReadyHandler(notReadyHealthReport));
    render(<ApiStatusBadge apiHost="api.test" />, { wrapper });
    expect(await screen.findByText(messages.devApiStatus.notReady)).toBeTruthy();
  });

  it('spells out "unreachable" when the API cannot be reached', async () => {
    server.use(http.get(healthReadyUrl(), () => HttpResponse.error()));
    render(<ApiStatusBadge apiHost="api.test" />, { wrapper });
    expect(await screen.findByText(messages.devApiStatus.unreachable)).toBeTruthy();
  });
});

describe('apiStatusOf', () => {
  const network = new ApiError({ kind: 'network', method: 'GET', endpoint: '/x', message: 'x' });
  const http500 = new ApiError({ kind: 'http', method: 'GET', endpoint: '/x', message: 'x' });

  it.each([
    [{ data: undefined, error: null }, 'checking'],
    [{ data: { status: 'ok' as const, checks: [] }, error: null }, 'ready'],
    [{ data: notReadyHealthReport, error: null }, 'notReady'],
    [{ data: undefined, error: network }, 'unreachable'],
    [{ data: undefined, error: http500 }, 'error'],
  ])('maps %j to %s', (query, status) => {
    expect(apiStatusOf(query)).toBe(status);
  });
});

describe('DevApiStatus', () => {
  it('is left out of production builds', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(DevApiStatus()).toBeNull();
  });

  it('renders the badge for the configured API host outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const element = DevApiStatus();
    expect(element?.props).toEqual({ apiHost: 'api.test' });
  });
});
