import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Web unit tests. They run in Node by default; component tests that need a DOM opt in per file
// with a `// @vitest-environment jsdom` comment and render with Testing Library. Server-rendering
// tests use react-dom/server.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'web',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    // The API client builds URLs from the public env; MSW handlers use the same base.
    env: { NEXT_PUBLIC_API_URL: 'http://api.test' },
  },
});
