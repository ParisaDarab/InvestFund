/** Test helpers: an isolated app with captured JSON log lines. */
import { createApp, type ApiModule, type AppDeps } from '../app.js';
import { loadConfig, type AppConfig } from '../core/config/config.js';
import { createContainer } from '../core/container.js';

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
} as const;

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

export interface TestApp {
  readonly app: Express;
  readonly logs: LogCapture;
  readonly deps: AppDeps;
}

export function buildTestApp(
  options: { env?: Record<string, string>; modules?: readonly ApiModule[] } = {},
): TestApp {
  const logs = captureLogs();
  const container = createContainer(testConfig(options.env), { logDestination: logs.stream });
  const deps: AppDeps = { ...container.appDeps(), modules: options.modules };
  return { app: createApp(deps), logs, deps };
}
