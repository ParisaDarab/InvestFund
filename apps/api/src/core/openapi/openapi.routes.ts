/**
 * `GET /api/v1/openapi.json`: the OpenAPI 3.1 document generated from the shared Zod schemas.
 * Public in local and sandbox (`OPENAPI_PUBLIC`); in production it is off until the admin guard
 * exists (docs/API.md §5: admin only in production). The `default` rate limit is added by
 * P0-API-02.
 */
import { Router } from 'express';

import type { OpenApiDocument } from '@investfund/shared/openapi';

export function buildOpenApiRoutes(document: () => OpenApiDocument): Router {
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.set('Cache-Control', 'no-cache').json(document());
  });
  return router;
}
