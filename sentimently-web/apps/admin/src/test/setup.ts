import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { session } from '../lib/core';

export const BASE = 'http://api.test/api/v1';
export const server = setupServer();

// Fail loudly if a test calls an endpoint nobody mocked.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  session.clear();
});
afterAll(() => server.close());
