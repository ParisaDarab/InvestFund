/**
 * `GET /api/v1/openapi.json`: the OpenAPI 3.1 document generated from the shared Zod schemas
 * (docs/API.md §5), with the `default` rate limit.
 *
 * Exposure is decided in the composition root: `OPENAPI_PUBLIC=true` (local, sandbox) passes no
 * guards; otherwise the route is mounted behind `requireRole('admin')` (401 without a valid
 * token, 403 for other roles).
 */
import { Router, type RequestHandler } from 'express';

import type { OpenApiDocument } from '@investfund/shared/openapi';

export interface OpenApiRouteOptions {
  readonly document: () => OpenApiDocument;
  /** Auth guards to run first (empty when the document is public). */
  readonly guards: readonly RequestHandler[];
  readonly rateLimit: RequestHandler;
}

export function buildOpenApiRoutes(options: OpenApiRouteOptions): Router {
  const router = Router();
  router.get('/openapi.json', ...options.guards, options.rateLimit, (_req, res) => {
    res.set('Cache-Control', 'no-cache').json(options.document());
  });
  return router;
}
