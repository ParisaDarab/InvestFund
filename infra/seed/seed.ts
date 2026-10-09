/**
 * Database seed entry point (`pnpm seed`, also run by `prisma migrate reset`).
 *
 * P0-DB-01 skeleton: there is no data to seed yet, so it validates the configuration, checks the
 * database is reachable and exits. Later cards add idempotent seed steps here (synthetic data
 * only, never real personal data), each run inside a Unit of Work.
 */
import { ConfigError, loadConfig } from '../../apps/api/src/core/config/config.js';
import { createPrismaClient } from '../../apps/api/src/core/db/prisma.js';
import { createLogger } from '../../apps/api/src/core/logger/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ level: config.log.level, service: 'seed' });
  const prisma = createPrismaClient({ url: config.database.url, logger });
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('seed: database reachable, nothing to seed yet');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // ConfigError messages list variable names only; other errors print their message.
  const message =
    error instanceof ConfigError || !(error instanceof Error) ? String(error) : error.message;
  process.stderr.write(`seed: failed\n${message}\n`);
  process.exit(1);
});
