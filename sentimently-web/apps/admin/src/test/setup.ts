import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { session } from '../lib/core';

export const BASE = 'http://api.test/api/v1';
export const server = setupServer();

// Fail loudly if a test calls an endpoint nobody mocked.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
// jsdom cannot scroll; a spy lets tests check that pages open at the top
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  session.clear();
});
afterAll(() => server.close());
