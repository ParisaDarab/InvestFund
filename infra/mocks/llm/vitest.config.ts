import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mock-llm',
    include: ['src/**/*.test.ts'],
  },
});
