/**
 * Express application factory. `createApp` has no side effects (no listening, no connections,
 * no env access), so tests can build as many isolated apps as they need.
 *
 * Middleware order: request ID + request logging → metrics → security headers → CORS → JSON body
 * (1 MB) → routes → 404 → error handler. Rate limits and auth guards are per route.
 */
import express, { type Express, type RequestHandler, type Router } from 'express';

import type { OpenApiDocument } from '@investfund/shared/openapi';

import { createErrorHandler } from './core/errors/error-handler.js';
import { buildHealthRoutes } from './core/health/health.routes.js';
import { createNotFoundHandler } from './core/http/not-found.js';
import { createHttpLogger } from './core/logger/http-logger.js';
import { captureMountPath, type HttpMetrics } from './core/metrics/metrics.js';
import { buildOpenApiRoutes } from './core/openapi/openapi.routes.js';
import { createCors } from './core/security/cors.js';
import { createSecurityHeaders } from './core/security/security-headers.js';

import type { TrustProxySetting } from './core/config/config.js';
import type { ReadinessRegistry } from './core/health/health-registry.js';
import type { Logger } from './core/logger/logger.js';
import type { RateLimiter } from './core/rateLimit/rate-limit.js';

export const API_PREFIX = '/api/v1';

/** Largest accepted JSON request body. Uploads use multipart and the storage limit instead. */
export const JSON_BODY_LIMIT = '1mb';

/** A domain module's router, mounted at `/api/v1<path>` (for example `/startups`). */
export interface ApiModule {
  readonly path: `/${string}`;
  readonly router: Router;
}

export interface AppSecurityOptions {
  /** Exact origins allowed by CORS with credentials. */
  readonly corsOrigins: readonly string[];
  readonly trustProxy: TrustProxySetting;
  /** Send `Strict-Transport-Security`. */
  readonly hsts: boolean;
}

export interface OpenApiExposure {
  readonly document: () => OpenApiDocument;
  /** Empty when public; the admin guard otherwise. */
  readonly guards: readonly RequestHandler[];
}

export interface AppDeps {
  readonly logger: Logger;
  readonly readiness: ReadinessRegistry;
  readonly security: AppSecurityOptions;
  readonly rateLimiter: RateLimiter;
  /** Records request metrics when present (served separately, never on this app). */
  readonly metrics?: HttpMetrics | undefined;
  /** Serves `GET /api/v1/openapi.json` when present. */
  readonly openApi?: OpenApiExposure | undefined;
  /** Domain modules, built in the composition root. */
  readonly modules?: readonly ApiModule[] | undefined;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // An array is copied: Express keeps a reference to the value.
  const { trustProxy } = deps.security;
  app.set('trust proxy', typeof trustProxy === 'object' ? [...trustProxy] : trustProxy);

  app.use(createHttpLogger(deps.logger));
  if (deps.metrics !== undefined) app.use(deps.metrics.middleware);
  app.use(createSecurityHeaders({ hsts: deps.security.hsts }));
  app.use(createCors({ allowedOrigins: deps.security.corsOrigins }));
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

  // `captureMountPath` keeps the metrics route label complete when a mounted route throws.
  app.use('/health', captureMountPath, buildHealthRoutes(deps.readiness));

  const api = express.Router();
  if (deps.openApi !== undefined) {
    api.use(
      captureMountPath,
      buildOpenApiRoutes({
        document: deps.openApi.document,
        guards: deps.openApi.guards,
        rateLimit: deps.rateLimiter.limit('default'),
      }),
    );
  }
  for (const module of deps.modules ?? []) {
    api.use(module.path, captureMountPath, module.router);
  }
  app.use(API_PREFIX, api);

  app.use(createNotFoundHandler());
  app.use(createErrorHandler());
  return app;
}
