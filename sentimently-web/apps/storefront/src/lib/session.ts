/**
 * The sign-in token. Kept in sessionStorage (gone when the tab closes), never in a URL.
 * Storage can be blocked (private windows, strict settings), so every access is wrapped and the app works without it.
 */
const KEY = 'sentimently.token';
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
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  clear() {
    memory = null;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
