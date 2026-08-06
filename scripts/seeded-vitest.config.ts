import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['.artifacts/quality-gate-seeds/**/*.test.ts'],
  },
});
