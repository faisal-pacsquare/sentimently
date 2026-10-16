import { ApiClient } from '@sentimently/api';

/** The staff token lives in sessionStorage (gone when the tab closes), separate from the shop's. */
const KEY = 'sentimently.admin.token';
let memory: string | null = null;
const listeners = new Set<() => void>();

export const session = {
  get(): string | null {
    if (memory) return memory;
    try {
      memory = sessionStorage.getItem(KEY);
    } catch {
      /* storage blocked: the in-memory copy still works for this page */
    }
    return memory;
  },
  set(token: string) {
    memory = token;
    try { sessionStorage.setItem(KEY, token); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  },
  clear() {
    memory = null;
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const client = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  getToken: () => session.get(),
  onUnauthorized: () => session.clear(),
});
