/**
 * Prisma client factory. The composition root (`core/container.ts`) creates exactly one client per
 * process and closes it on shutdown; nothing else instantiates `PrismaClient`.
 *
 * Logging: at `debug` the SQL text and duration of each query are logged. Parameters are never
 * logged (they carry personal data and secrets), and Prisma's own error formatting is `minimal`
 * so thrown errors do not render the arguments of the failing call.
 */
import { PrismaClient } from '../../../generated/prisma/index.js';

import type { Logger } from '../logger/logger.js';

export { Prisma, PrismaClient } from '../../../generated/prisma/index.js';

export interface DatabaseOptions {
  /** PostgreSQL connection URL (`config.database.url`). */
  readonly url: string;
  readonly logger: Logger;
}

/**
 * Creates a client. Connecting is lazy: the first query opens the pool, so building the container
 * never fails because the database is down (the `db` readiness check reports that instead).
 */
export function createPrismaClient(options: DatabaseOptions): PrismaClient {
  const logger = options.logger.child({ component: 'db' });
  const logQueries = logger.isLevelEnabled('debug');

  const client = new PrismaClient({
    datasourceUrl: options.url,
    errorFormat: 'minimal',
    log: [
      ...(logQueries ? [{ emit: 'event', level: 'query' } as const] : []),
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // `event.params` is deliberately ignored: it holds the bound values.
  client.$on('query', (event) => {
    logger.debug({ query: event.query, durationMs: event.duration }, 'db query');
  });
  client.$on('warn', (event) => {
    logger.warn({ target: event.target }, event.message);
  });
  client.$on('error', (event) => {
    logger.error({ target: event.target }, 'db error');
  });

  return client;
}
