/**
 * End-to-end tests (Playwright). They drive the real web app, API and PostgreSQL, with
 * infra/mocks/google as the OAuth identity provider (the production OAuth code path runs).
 *
 * Locally: start Postgres, then `pnpm --filter @investfund/web test:e2e`. Existing servers on
 * :3000, :4000 and :4020 are reused; otherwise they are started with the env below. Each run
 * creates fresh, uniquely named users, so no database reset is needed.
 */
import { defineConfig, devices } from '@playwright/test';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://investfund:investfund@localhost:5432/investfund';

const apiEnv = {
  NODE_ENV: 'development',
  DATABASE_URL,
  JWT_ACCESS_SECRET: 'e2e-only-access-secret',
  JWT_REFRESH_SECRET: 'e2e-only-refresh-secret',
  IP_HASH_SECRET: 'e2e-only-ip-secret',
  ENCRYPTION_KEY: 'ZGV2LW9ubHkta2V5LW5vdC1mb3ItcHJvZHVjdGlvbiE=',
  WEB_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'e2e-client',
  GOOGLE_CLIENT_SECRET: 'e2e-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/v1/auth/google/callback',
  GOOGLE_AUTH_BASE_URL: 'http://localhost:4020',
  GOOGLE_OAUTH2_BASE_URL: 'http://localhost:4020',
  GOOGLE_API_BASE_URL: 'http://localhost:4020',
  // E2E signs many users in from one IP; the memory store keeps limits per process.
  RATE_LIMIT_STORE: 'memory',
  RATE_LIMIT_AUTH_PER_MINUTE: '200',
  METRICS_ENABLED: 'false',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @investfund/mock-google exec tsx src/server.ts',
      url: 'http://localhost:4020/health',
      reuseExistingServer: true,
      cwd: '../..',
    },
    {
      command: 'pnpm --filter @investfund/api exec tsx src/server.ts',
      url: 'http://localhost:4000/health/live',
      reuseExistingServer: true,
      cwd: '../..',
      env: apiEnv,
    },
    {
      command: 'pnpm exec next dev --port 3000',
      url: 'http://localhost:3000/en-GB',
      reuseExistingServer: true,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: 'http://localhost:4000', NEXT_PUBLIC_AUTH_DEV_HINTS: 'true' },
    },
  ],
});
