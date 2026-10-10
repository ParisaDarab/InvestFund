/** `GET /health/live` and `GET /health/ready` (docs/API.md §5). Public, no rate limit. */
import { Router } from 'express';

import { HealthLive, HealthReport } from '@investfund/shared';

import { asyncHandler } from '../http/async-handler.js';

import type { ReadinessRegistry } from './health-registry.js';

export function buildHealthRoutes(readiness: ReadinessRegistry): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.set('Cache-Control', 'no-store').json(HealthLive.parse({ status: 'ok' }));
  });

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const report = HealthReport.parse(await readiness.report());
      res
        .status(report.status === 'ok' ? 200 : 503)
        .set('Cache-Control', 'no-store')
        .json(report);
    }),
  );

  return router;
}
