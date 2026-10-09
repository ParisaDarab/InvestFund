import { setTimeout as sleep } from 'node:timers/promises';

import { Router } from 'express';
import { describe, expect, it } from 'vitest';

import { buildTestApp, captureLogs } from '../../../__tests__/support.js';
import { createLogger } from '../../logger/logger.js';
import { shutdownGracefully, startHttpServer } from '../lifecycle.js';

function slowApp(delayMs: number) {
  const router = Router();
  router.get('/', async (_req, res) => {
    await sleep(delayMs);
    res.json({ done: true });
  });
  return buildTestApp({ modules: [{ path: '/slow', router }] }).app;
}

const logger = () => createLogger({ level: 'info' }, captureLogs().stream);

describe('shutdownGracefully (AC8)', () => {
  it('lets an in-flight request complete, then closes the server and runs hooks', async () => {
    const { server, port } = await startHttpServer(slowApp(300), '127.0.0.1', 0);
    const inFlight = fetch(`http://127.0.0.1:${String(port)}/api/v1/slow`);
    await sleep(50); // the request is now being handled

    const hookOrder: string[] = [];
    const started = Date.now();
    const result = await shutdownGracefully({
      servers: [server],
      timeoutMs: 5000,
      logger: logger(),
      hooks: [
        () => {
          hookOrder.push('first');
          return Promise.resolve();
        },
        () => Promise.reject(new Error('hook failed')),
        () => {
          hookOrder.push('third');
          return Promise.resolve();
        },
      ],
    });

    const res = await inFlight;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: true });
    expect(result).toEqual({ timedOut: false, hookFailures: 1 });
    expect(hookOrder).toEqual(['first', 'third']);
    expect(server.listening).toBe(false);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('refuses new connections once shutdown has started', async () => {
    const { server, port } = await startHttpServer(slowApp(200), '127.0.0.1', 0);
    const inFlight = fetch(`http://127.0.0.1:${String(port)}/api/v1/slow`);
    await sleep(50);
    const shutdown = shutdownGracefully({ servers: [server], timeoutMs: 5000, logger: logger() });
    await expect(fetch(`http://127.0.0.1:${String(port)}/health/live`)).rejects.toThrow();
    await inFlight;
    await shutdown;
  });

  it('cuts connections that outlive the timeout', async () => {
    const { server, port } = await startHttpServer(slowApp(5000), '127.0.0.1', 0);
    const inFlight = fetch(`http://127.0.0.1:${String(port)}/api/v1/slow`).catch(
      (error: unknown) => error,
    );
    await sleep(50);

    const result = await shutdownGracefully({
      servers: [server],
      timeoutMs: 100,
      logger: logger(),
    });

    expect(result.timedOut).toBe(true);
    expect(await inFlight).toBeInstanceOf(Error);
  });

  it('is a no-op for a server that is not listening', async () => {
    const { server } = await startHttpServer(slowApp(1), '127.0.0.1', 0);
    await shutdownGracefully({ servers: [server], timeoutMs: 1000, logger: logger() });
    expect(
      await shutdownGracefully({ servers: [server], timeoutMs: 1000, logger: logger() }),
    ).toEqual({
      timedOut: false,
      hookFailures: 0,
    });
  });
});

describe('startHttpServer', () => {
  it('rejects when the port is taken', async () => {
    const first = await startHttpServer(slowApp(1), '127.0.0.1', 0);
    await expect(startHttpServer(slowApp(1), '127.0.0.1', first.port)).rejects.toThrow(
      /EADDRINUSE/,
    );
    await shutdownGracefully({ servers: [first.server], timeoutMs: 1000, logger: logger() });
  });
});
