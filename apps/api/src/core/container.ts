/**
 * Composition root. The only place that instantiates concrete implementations and wires them
 * together; everything else receives its dependencies through constructors or `createApp`.
 *
 * Infrastructure built here: the Prisma client (one per process, `db` readiness check, disconnected
 * by a close hook on shutdown). Later cards add Redis, storage and queues the same way, and build
 * each module (repository → service → controller → routes) for `createApp` to mount under `/api/v1`.
 */
import { buildOpenApiDocument, type OpenApiDocument } from '@investfund/shared/openapi';

import { createDbReadinessCheck } from './db/db-readiness.js';
import { createPrismaClient, type PrismaClient } from './db/prisma.js';
import { createUnitOfWork, type UnitOfWork } from './db/unit-of-work.js';
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
  /** The process-wide Prisma client. Repositories receive it (or a transaction client). */
  readonly prisma: PrismaClient;
  readonly unitOfWork: UnitOfWork;
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

  const prisma = createPrismaClient({ url: config.database.url, logger });
  readiness.register(createDbReadinessCheck(prisma));
  const closeHooks: CloseHook[] = [() => prisma.$disconnect()];

  return {
    config,
    logger,
    readiness,
    metrics,
    prisma,
    unitOfWork: createUnitOfWork(prisma),
    closeHooks,
    appDeps: () => ({ logger, readiness, metrics, openApiDocument }),
  };
}
