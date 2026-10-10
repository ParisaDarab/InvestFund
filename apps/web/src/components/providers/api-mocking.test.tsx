import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function renderApiMocking(): Promise<string> {
  vi.resetModules();
  const { ApiMocking } = await import('./api-mocking');
  return renderToStaticMarkup(
    <ApiMocking>
      <p data-testid="app" />
    </ApiMocking>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ApiMocking', () => {
  it('renders the app straight away without the opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_MOCKING', '');
    expect(await renderApiMocking()).toContain('data-testid="app"');
  });

  it('never enables mocking in a production build, even with the flag set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_MOCKING', 'enabled');
    expect(await renderApiMocking()).toContain('data-testid="app"');
  });

  it('holds the app back until the worker has started in next dev with the opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_API_MOCKING', 'enabled');
    expect(await renderApiMocking()).toBe('');
  });
});
