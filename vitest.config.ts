import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.next/',
        'coverage/',
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'packages/shared/src'),
      '@server': path.resolve(__dirname, 'packages/server/src'),
      '@client': path.resolve(__dirname, 'packages/client/src'),
    },
  },
});
