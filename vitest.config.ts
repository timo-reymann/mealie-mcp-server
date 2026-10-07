import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
    },
    env: {
      MEALIE_BASE_URL: 'https://mealie.example.com',
      MEALIE_API_KEY: 'test-api-key',
    },
  },
});
