import { defineConfig } from 'vitest/config';

// Root Vitest config: every workspace package is its own project.
// A package that later adds its own vitest.config.ts is picked up automatically.
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: ['apps/*', 'packages/*', 'infra/mocks/*'],
  },
});
