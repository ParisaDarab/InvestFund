import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from '@/mocks/node';

/**
 * Starts the MSW node server for the current test file. Unhandled requests fail the test, and
 * per-test overrides (`server.use(...)`) are reset after each test.
 */
export function setupMswServer(): typeof server {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}
