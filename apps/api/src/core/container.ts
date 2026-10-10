/**
 * Composition root. The only place that instantiates concrete implementations and wires them
 * together; everything else receives its dependencies through constructors or `createApp`.
 *
 * Infrastructure built here: the Prisma client (one per process, `db` readiness check, disconnected
 * by a close hook on shutdown), the AES-256-GCM cipher, the local-disk storage provider (`storage`
 * readiness check), the auth guards and the rate limiter (Postgres store). Later cards add Redis
 * and queues the same way, and build each module (repository → service → controller → routes) for
 * `createApp` to mount under `/api/v1`.
 */
import { buildOpenApiDocument, type OpenApiDocument } from '@investfund/shared/openapi';

import { JwtAccessTokenVerifier } from './auth/access-token.js';
import { AuthGuards } from './auth/auth-guards.js';
import { AesGcmCipher, type Cipher } from './crypto/cipher.js';
import { hmacHex, hmacIp } from './crypto/hashing.js';
import { createDbReadinessCheck } from './db/db-readiness.js';
import { createPrismaClient, type PrismaClient } from './db/prisma.js';
import { createUnitOfWork, type UnitOfWork } from './db/unit-of-work.js';
import { LocalDiskStorageProvider } from './file-storage/local-disk-storage.js';
import { createStorageReadinessCheck } from './file-storage/storage-readiness.js';
import { ReadinessRegistry } from './health/health-registry.js';
import { createLogger, type Logger } from './logger/logger.js';
import { createHttpMetrics, type HttpMetrics } from './metrics/metrics.js';
import { MemoryRateLimitStore } from './rateLimit/memory-store.js';
import { PostgresRateLimitStore } from './rateLimit/postgres-store.js';
import { createRateLimiter, type RateLimiter } from './rateLimit/rate-limit.js';

import type { AppDeps } from '../app.js';
import type { AppConfig } from './config/config.js';
import type { StorageProvider } from './file-storage/storage-provider.js';
import type { CloseHook } from './http/lifecycle.js';
import type { RateLimitStore } from './rateLimit/rate-limit-store.js';
import type { DestinationStream } from 'pino';

export interface Container {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly readiness: ReadinessRegistry;
  readonly metrics: HttpMetrics | undefined;
  /** The process-wide Prisma client. Repositories receive it (or a transaction client). */
  readonly prisma: PrismaClient;
  readonly unitOfWork: UnitOfWork;
  /** AES-256-GCM for secrets at rest (key ring from `ENCRYPTION_KEY*`). */
  readonly cipher: Cipher;
  /** `hmacIp` bound to `IP_HASH_SECRET`, for `ip_hash` columns. */
  readonly hashIp: (ip: string) => string;
  readonly storage: StorageProvider;
  readonly authGuards: AuthGuards;
  readonly rateLimitStore: RateLimitStore;
  readonly rateLimiter: RateLimiter;
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

  const prisma = createPrismaClient({ url: config.database.url, logger });
  readiness.register(createDbReadinessCheck(prisma));
  const closeHooks: CloseHook[] = [];

  const cipher = new AesGcmCipher({
    currentKeyVersion: config.crypto.currentKeyVersion,
    keys: config.crypto.keys,
  });
  const { ipHashSecret } = config.crypto;
  const hashSubject = (value: string): string => hmacHex(ipHashSecret, value);

  const storage = new LocalDiskStorageProvider({
    rootDir: config.storage.dir,
    maxBytes: config.storage.maxUploadBytes,
  });
  readiness.register(createStorageReadinessCheck(storage));

  const authGuards = new AuthGuards(new JwtAccessTokenVerifier(config.auth.jwtAccessSecret));

  let rateLimitStore: RateLimitStore;
  if (config.rateLimit.store === 'postgres') {
    const store = new PostgresRateLimitStore({
      client: prisma,
      logger: logger.child({ component: 'rate-limit' }),
    });
    closeHooks.push(() => store.idle());
    rateLimitStore = store;
  } else {
    rateLimitStore = new MemoryRateLimitStore();
  }
  const rateLimiter = createRateLimiter({ store: rateLimitStore, hashSubject });
  closeHooks.push(() => prisma.$disconnect());

  // docs/API.md §5: public only when OPENAPI_PUBLIC (default on outside production), else admin.
  const openApi = {
    document: memoiseOpenApi(),
    guards: config.openApi.public ? [] : [authGuards.requireRole('admin')],
  };
  if (config.isProduction && config.openApi.public) {
    // Names the flag only; it must never be set in a real deployment.
    logger.warn(
      { flag: 'OPENAPI_PUBLIC' },
      'OPENAPI_PUBLIC is enabled in production: /api/v1/openapi.json is served without authentication',
    );
  }

  return {
    config,
    logger,
    readiness,
    metrics,
    prisma,
    unitOfWork: createUnitOfWork(prisma),
    cipher,
    hashIp: (ip) => hmacIp(ip, ipHashSecret),
    storage,
    authGuards,
    rateLimitStore,
    rateLimiter,
    closeHooks,
    appDeps: () => ({
      logger,
      readiness,
      metrics,
      openApi,
      rateLimiter,
      security: config.security,
    }),
  };
}
