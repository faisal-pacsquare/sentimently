import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { session } from '../lib/session';
import { server } from './server';

// Fail loudly if a test calls an endpoint nobody mocked: silent real network calls hide bugs.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
  session.clear();
});
afterAll(() => server.close());
