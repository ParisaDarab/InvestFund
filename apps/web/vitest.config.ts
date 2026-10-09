import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Web unit tests. A DOM environment (jsdom) and Testing Library are added by P0-TEST-01 once
// approved; until then component tests render on the server with react-dom/server.
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
  },
});
