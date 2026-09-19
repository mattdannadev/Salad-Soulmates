import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/postgres.integration.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
