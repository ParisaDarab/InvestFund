import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mock-google',
    include: ['src/**/*.test.ts'],
  },
});
