import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client/src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@server': path.resolve(__dirname, 'src/server'),
    },
  },
});
