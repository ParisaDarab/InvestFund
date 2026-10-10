/**
 * HTTP listener lifecycle: start a server and shut it down gracefully.
 *
 * Shutdown stops accepting connections, closes idle keep-alive sockets, lets in-flight requests
 * finish, then runs the registered close hooks (queues, database...). If draining takes longer
 * than `timeoutMs`, the remaining connections are destroyed and the result is `timedOut`.
 */
import { createServer, type RequestListener, type Server } from 'node:http';

import type { Logger } from '../logger/logger.js';

export interface Listening {
  readonly server: Server;
  /** The bound port (useful when listening on port 0). */
  readonly port: number;
}

export function startHttpServer(
  handler: RequestListener,
  host: string,
  port: number,
): Promise<Listening> {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve({
        server,
        port: typeof address === 'object' && address !== null ? address.port : port,
      });
    });
  });
}

export type CloseHook = () => Promise<void>;

export interface ShutdownOptions {
  readonly servers: readonly Server[];
  readonly timeoutMs: number;
  readonly logger: Logger;
  /** Run after the HTTP servers have drained, in order. */
  readonly hooks?: readonly CloseHook[];
}

export interface ShutdownResult {
  readonly timedOut: boolean;
  readonly hookFailures: number;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => {
      resolve();
    });
    server.closeIdleConnections();
  });
}

export async function shutdownGracefully(options: ShutdownOptions): Promise<ShutdownResult> {
  const { servers, timeoutMs, logger, hooks = [] } = options;
  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;

  const drained = Promise.all(servers.map(closeServer)).then(() => 'drained' as const);
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      resolve('timeout');
    }, timeoutMs);
    timer.unref();
  });

  if ((await Promise.race([drained, deadline])) === 'timeout') {
    timedOut = true;
    logger.warn({ timeoutMs }, 'shutdown timeout reached; closing remaining connections');
    for (const server of servers) server.closeAllConnections();
    await drained;
  }
  clearTimeout(timer);

  let hookFailures = 0;
  for (const hook of hooks) {
    try {
      await hook();
    } catch (err) {
      hookFailures += 1;
      logger.error({ err }, 'shutdown hook failed');
    }
  }
  return { timedOut, hookFailures };
}
