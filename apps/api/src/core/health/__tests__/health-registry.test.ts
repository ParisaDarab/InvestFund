import { describe, expect, it } from 'vitest';

import { captureLogs } from '../../../__tests__/support.js';
import { createLogger } from '../../logger/logger.js';
import { ReadinessRegistry } from '../health-registry.js';

function registry(timeoutMs?: number) {
  const logs = captureLogs();
  return {
    logs,
    readiness: new ReadinessRegistry(createLogger({ level: 'info' }, logs.stream), timeoutMs),
  };
}

describe('ReadinessRegistry', () => {
  it('is ok with no checks registered', async () => {
    expect(await registry().readiness.report()).toEqual({ status: 'ok', checks: [] });
  });

  it('reports each check and fails when any check fails', async () => {
    const { readiness, logs } = registry();
    readiness.register({ name: 'db', run: () => Promise.resolve() }).register({
      name: 'redis',
      run: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:6379')),
    });

    expect(readiness.names()).toEqual(['db', 'redis']);
    expect(await readiness.report()).toEqual({
      status: 'fail',
      checks: [
        { name: 'db', status: 'ok' },
        { name: 'redis', status: 'fail' },
      ],
    });
    expect(logs.lines[0]).toMatchObject({
      level: 'warn',
      check: 'redis',
      msg: 'readiness check failed',
    });
  });

  it('fails a check that exceeds the timeout and aborts its signal', async () => {
    const { readiness } = registry(20);
    let aborted = false;
    readiness.register({
      name: 'slow',
      run: (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
    });
    expect(await readiness.report()).toEqual({
      status: 'fail',
      checks: [{ name: 'slow', status: 'fail' }],
    });
    expect(aborted).toBe(true);
  });

  it('rejects duplicate names', () => {
    const { readiness } = registry();
    readiness.register({ name: 'db', run: () => Promise.resolve() });
    expect(() => readiness.register({ name: 'db', run: () => Promise.resolve() })).toThrow(
      /already registered/,
    );
  });
});
