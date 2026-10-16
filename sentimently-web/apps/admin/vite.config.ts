import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Same arrangement as the storefront: in development /api is proxied to the API so there is no CORS to set up.
// In production set VITE_API_URL, and list this site in the API's CORS_ORIGINS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: { VITE_API_URL: 'http://api.test/api/v1' },
    restoreMocks: true,
  },
});
