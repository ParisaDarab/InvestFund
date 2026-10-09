/**
 * Composition root. The only place that instantiates concrete implementations and wires them
 * together; everything else receives its dependencies through constructors or `createApp`.
 *
 * Later cards add their infrastructure here (Prisma client, Redis, storage, queues), register
 * readiness checks and close hooks, and build each module (repository → service → controller →
 * routes) for `createApp` to mount under `/api/v1`.
 */
import { buildOpenApiDocument, type OpenApiDocument } from '@investfund/shared/openapi';

import { ReadinessRegistry } from './health/health-registry.js';
import { createLogger, type Logger } from './logger/logger.js';
import { createHttpMetrics, type HttpMetrics } from './metrics/metrics.js';

import type { AppDeps } from '../app.js';
import type { AppConfig } from './config/config.js';
import type { CloseHook } from './http/lifecycle.js';
import type { DestinationStream } from 'pino';

export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly readiness: ReadinessRegistry;
  readonly metrics: HttpMetrics | undefined;
  /** Run on shutdown after the HTTP servers have drained, in registration order. */
  readonly closeHooks: CloseHook[];
  /** The dependencies `createApp` needs. */
  appDeps(): AppDeps;
}

export interface ContainerOptions {
  /** Log destination (tests capture logs here). Defaults to stdout. */
  readonly logDestination?: DestinationStream;
}

/** Builds the OpenAPI document once, on first request. */
export function memoiseOpenApi(
  build: () => OpenApiDocument = buildOpenApiDocument,
): () => OpenApiDocument {
  let document: OpenApiDocument | undefined;
  return () => (document ??= build());
}

export function createContainer(config: AppConfig, options: ContainerOptions = {}): Container {
  const logger = createLogger({ level: config.log.level }, options.logDestination);
  const readiness = new ReadinessRegistry(logger);
  const metrics = config.metrics.enabled ? createHttpMetrics() : undefined;
  const openApiDocument = config.openApi.public ? memoiseOpenApi() : undefined;

  return {
    config,
    logger,
    readiness,
    metrics,
    closeHooks: [],
    appDeps: () => ({ logger, readiness, metrics, openApiDocument }),
  };
}
