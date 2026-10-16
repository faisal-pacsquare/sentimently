import { ApiError } from '@sentimently/api';
import type { Customer, Session } from '@sentimently/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { adminApi } from './admin-api';
import { session } from './core';

/** out: not signed in. forbidden: signed in, but not studio staff. error: could not check (server or network). */
export type AuthStatus = 'out' | 'loading' | 'staff' | 'forbidden' | 'error';

interface AuthApi {
  status: AuthStatus;
  user?: Customer;
  isAdmin: boolean;
  error?: unknown;
  retry(): void;
  signIn(s: Session): void;
  signOut(): void;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(session.subscribe, session.get, () => null);
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me', token], queryFn: ({ signal }) => adminApi.me({ signal }), enabled: !!token, staleTime: 60_000 });

  const signIn = useCallback((s: Session) => {
    qc.clear();
    qc.setQueryData(['me', s.accessToken], s.customer);
    session.set(s.accessToken);
  }, [qc]);
  const signOut = useCallback(() => {
    session.clear();
    qc.clear();
  }, [qc]);

  const { data, error, refetch } = me;
  const value = useMemo<AuthApi>(() => {
    let status: AuthStatus = 'out';
    if (token) {
      if (data) status = data.role === 'staff' || data.role === 'admin' ? 'staff' : 'forbidden';
      else if (error && !(error instanceof ApiError && error.isUnauthorized)) status = 'error';
      else status = 'loading';
    }
    return { status, user: token ? data : undefined, isAdmin: data?.role === 'admin', error: error ?? undefined, retry: () => void refetch(), signIn, signOut };
  }, [token, data, error, refetch, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
