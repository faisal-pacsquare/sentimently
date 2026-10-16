import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { session } from '../lib/core';
import { makeQueryClient } from '../lib/present';
import { BASE, server } from './setup';

export const staffUser = { id: 'u1', email: 'staff@studio.pk', name: 'Sana', role: 'staff', authProvider: 'email', emailVerified: true };

/** Renders the console at an address, signed in as the given role (or signed out with null). */
export function renderAdmin(path = '/', role: 'staff' | 'admin' | 'customer' | null = 'staff') {
  if (role) {
    session.set('tok');
    server.use(http.get(`${BASE}/me`, () => HttpResponse.json({ ...staffUser, role })));
  }
  const client = makeQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const apiError = (status: number, code: string, message = 'Something went wrong', details?: string[]) =>
  HttpResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
