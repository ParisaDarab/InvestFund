/** Test helpers: an isolated app with captured JSON log lines. */
import { testDatabaseServerUrl } from '@investfund/test-utils/db';

import { createApp, type ApiModule, type AppDeps } from '../app.js';
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

export const TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'debug',
  JWT_ACCESS_SECRET: 'test-only-access-secret',
  /** TEST_DATABASE_URL, else DATABASE_URL, else the local compose database. Connected lazily. */
  DATABASE_URL: testDatabaseServerUrl(),
};

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

export function buildTestApp(
  options: { env?: Record<string, string>; modules?: readonly ApiModule[] } = {},
): TestApp {
  const logs = captureLogs();
  const container = createContainer(testConfig(options.env), { logDestination: logs.stream });
  openContainers.add(container);
  const deps: AppDeps = { ...container.appDeps(), modules: options.modules };
  return { app: createApp(deps), logs, deps, container, close: () => closeContainer(container) };
}
