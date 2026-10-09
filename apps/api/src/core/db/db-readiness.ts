/**
 * `db` readiness check for `GET /health/ready`: a `SELECT 1` round trip. The registry's per-check
 * timeout bounds the probe when the server does not answer; failure details go to the log only.
 */
import type { PrismaClient } from './prisma.js';
import type { ReadinessCheck } from '../health/health-registry.js';

export const DB_CHECK_NAME = 'db';

export function createDbReadinessCheck(client: Pick<PrismaClient, '$queryRaw'>): ReadinessCheck {
  return {
    name: DB_CHECK_NAME,
    async run() {
      await client.$queryRaw`SELECT 1`;
    },
  };
}
