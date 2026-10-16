import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In development the API runs on :3000 and is reached through this proxy, so the browser sees one origin (no CORS).
// In production set VITE_API_URL to the API address, and list this site in the API's CORS_ORIGINS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
