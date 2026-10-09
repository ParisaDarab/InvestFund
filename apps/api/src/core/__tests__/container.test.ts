import { describe, expect, it, vi } from 'vitest';

import { captureLogs, testConfig } from '../../__tests__/support.js';
import { createContainer } from '../container.js';

describe('createContainer: database wiring', () => {
  it('registers the db readiness check and a close hook that disconnects Prisma', async () => {
    const container = createContainer(testConfig(), { logDestination: captureLogs().stream });
    expect(container.readiness.names()).toEqual(['db']);

    const disconnect = vi.spyOn(container.prisma, '$disconnect');
    for (const hook of container.closeHooks) await hook();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('builds without connecting, so a down database does not stop the process starting', () => {
    expect(() =>
      createContainer(testConfig({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/none' }), {
        logDestination: captureLogs().stream,
      }),
    ).not.toThrow();
  });
});
