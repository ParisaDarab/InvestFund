/**
 * Prisma CLI configuration (migrate, generate, studio, seed). Read by the CLI only, never by the
 * running API, which takes `DATABASE_URL` from `core/config`.
 *
 * With a config file present Prisma no longer loads `.env` files itself, so the repository-root
 * `.env` (the one `pnpm dev` uses) is loaded here when it exists. Variables already set in the
 * environment win (`process.loadEnvFile` never overrides them), which keeps CI and tests in control.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'prisma/config';

const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx ../../infra/seed/seed.ts',
  },
});
