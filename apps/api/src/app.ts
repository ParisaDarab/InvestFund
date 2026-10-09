/**
 * Express application factory. `createApp` has no side effects (no listening, no connections,
 * no env access), so tests can build as many isolated apps as they need.
 *
 * Middleware order: request ID + request logging → metrics → routes → 404 → error handler.
 * Security middleware, body parsing and rate limits are added by P0-API-02.
 */
import express, { type Express, type Router } from 'express';

import type { OpenApiDocument } from '@investfund/shared/openapi';

import { createErrorHandler } from './core/errors/error-handler.js';
import { buildHealthRoutes } from './core/health/health.routes.js';
import { createNotFoundHandler } from './core/http/not-found.js';
import { createHttpLogger } from './core/logger/http-logger.js';
import { captureMountPath, type HttpMetrics } from './core/metrics/metrics.js';
import { buildOpenApiRoutes } from './core/openapi/openapi.routes.js';

import type { ReadinessRegistry } from './core/health/health-registry.js';
import type { Logger } from './core/logger/logger.js';

export const API_PREFIX = '/api/v1';

/** A domain module's router, mounted at `/api/v1<path>` (for example `/startups`). */
export interface ApiModule {
  readonly path: `/${string}`;
  readonly router: Router;
}

export interface AppDeps {
  readonly logger: Logger;
  readonly readiness: ReadinessRegistry;
  /** Records request metrics when present (served separately, never on this app). */
  readonly metrics?: HttpMetrics | undefined;
  /** Serves `GET /api/v1/openapi.json` when present. */
  readonly openApiDocument?: (() => OpenApiDocument) | undefined;
  /** Domain modules, built in the composition root. */
  readonly modules?: readonly ApiModule[] | undefined;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(createHttpLogger(deps.logger));
  if (deps.metrics !== undefined) app.use(deps.metrics.middleware);

  // `captureMountPath` keeps the metrics route label complete when a mounted route throws.
  app.use('/health', captureMountPath, buildHealthRoutes(deps.readiness));

  const api = express.Router();
  if (deps.openApiDocument !== undefined) {
    api.use(captureMountPath, buildOpenApiRoutes(deps.openApiDocument));
  }
  for (const module of deps.modules ?? []) {
    api.use(module.path, captureMountPath, module.router);
  }
  app.use(API_PREFIX, api);

  app.use(createNotFoundHandler());
  app.use(createErrorHandler());
  return app;
}
