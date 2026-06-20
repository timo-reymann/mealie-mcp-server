import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    env: {
      MEALIE_BASE_URL: 'https://mealie.example.com',
      MEALIE_API_KEY: 'test-api-key',
    },
  },
});
