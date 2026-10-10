/** Test helpers: an isolated app with captured JSON log lines, and signed test tokens. */
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SignJWT } from 'jose';

import { testDatabaseServerUrl } from '@investfund/test-utils/db';

import { createApp, type ApiModule, type AppDeps } from '../app.js';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
} from '../core/auth/access-token.js';
import { loadConfig, type AppConfig } from '../core/config/config.js';
import { createContainer, type Container } from '../core/container.js';

import type { Express } from 'express';

export type LogLine = Record<string, unknown> & { level: string; msg?: string };

export interface LogCapture {
  readonly lines: LogLine[];
  readonly stream: { write(chunk: string): void };
  /** Every captured line as raw text (for "never contains" assertions). */
  text(): string;
}

export function captureLogs(): LogCapture {
  const lines: LogLine[] = [];
  const raw: string[] = [];
  return {
    lines,
    stream: {
      write(chunk: string) {
        raw.push(chunk);
        lines.push(JSON.parse(chunk) as LogLine);
      },
    },
    text: () => raw.join(''),
  };
}

/**
 * File-storage root for apps built in this test file (unique per file, created on first use and
 * removed by `removeTestFiles` in `setup.ts`).
 */
export const TEST_FILES_DIR = join(
  tmpdir(),
  `investfund-api-test-files-${String(process.pid)}-${randomBytes(4).toString('hex')}`,
);

/** Synthetic, test-only key material (never used outside tests). */
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
export const TEST_JWT_SECRET = 'test-only-access-secret';

export const TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'debug',
  JWT_ACCESS_SECRET: TEST_JWT_SECRET,
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  IP_HASH_SECRET: 'test-only-ip-hash-secret',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret',
  EMAIL_DISPATCHER_ENABLED: 'false',
  REALTIME_BUS: 'memory',
  STORAGE_DIR: TEST_FILES_DIR,
  /** Unit and app tests count in memory; the Postgres store has its own integration tests. */
  RATE_LIMIT_STORE: 'memory',
  /** TEST_DATABASE_URL, else DATABASE_URL, else the local compose database. Connected lazily. */
  DATABASE_URL: testDatabaseServerUrl(),
};

/** Strong enough for the production checks; synthetic, test-only. */
export const PRODUCTION_TEST_ENV = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'test-only-production-secret-'.padEnd(48, 'x'),
  IP_HASH_SECRET: 'test-only-production-ip-secret-'.padEnd(48, 'y'),
  JWT_REFRESH_SECRET: 'test-only-production-refresh-'.padEnd(48, 'z'),
  WEB_URL: 'https://app.investfund.test',
  RATE_LIMIT_STORE: 'postgres',
};

export async function removeTestFiles(): Promise<void> {
  await rm(TEST_FILES_DIR, { recursive: true, force: true });
}

export interface TestTokenOptions {
  readonly sub?: string;
  /** A `UserRole`, or any other string to test rejection. */
  readonly role?: string;
  readonly secret?: string;
  /** Seconds from now (negative = already expired). Defaults to 900. */
  readonly expiresIn?: number;
  readonly issuer?: string;
  readonly audience?: string;
  readonly algorithm?: string;
}

/** Signs an access token the way P1 will (HS256, issuer/audience, `sub`, `role`, `exp`). */
export async function signTestToken(options: TestTokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(options.secret ?? TEST_JWT_SECRET);
  return new SignJWT({ role: options.role ?? 'founder' })
    .setProtectedHeader({ alg: options.algorithm ?? ACCESS_TOKEN_ALGORITHM, typ: 'JWT' })
    .setSubject(options.sub ?? '01928c4e-7d3a-7b2c-9f1e-3a4b5c6d7e8f')
    .setIssuer(options.issuer ?? ACCESS_TOKEN_ISSUER)
    .setAudience(options.audience ?? ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + (options.expiresIn ?? 900))
    .sign(secret);
}

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

export interface TestApp {
  readonly app: Express;
  readonly logs: LogCapture;
  readonly deps: AppDeps;
  readonly container: Container;
  /** Runs the container's close hooks (disconnects Prisma). Also run by `closeTestApps`. */
  readonly close: () => Promise<void>;
}

const openContainers = new Set<Container>();

async function closeContainer(container: Container): Promise<void> {
  openContainers.delete(container);
  for (const hook of container.closeHooks) await hook();
}

/** Closes every app built by `buildTestApp` (registered in `afterAll` by `setup.ts`). */
export async function closeTestApps(): Promise<void> {
  await Promise.all([...openContainers].map(closeContainer));
}

export interface TestAppOptions {
  readonly env?: Record<string, string>;
  /** Modules to mount, or a function that builds them from the container (guards, limiter). */
  readonly modules?: readonly ApiModule[] | ((container: Container) => readonly ApiModule[]);
}

export function buildTestApp(options: TestAppOptions = {}): TestApp {
  const logs = captureLogs();
  // Token-only guards: these apps test middleware, not users stored in a database.
  const container = createContainer(testConfig(options.env), {
    logDestination: logs.stream,
    loadActor: null,
  });
  openContainers.add(container);
  const modules =
    typeof options.modules === 'function' ? options.modules(container) : options.modules;
  const deps: AppDeps = { ...container.appDeps(), modules };
  return { app: createApp(deps), logs, deps, container, close: () => closeContainer(container) };
}
