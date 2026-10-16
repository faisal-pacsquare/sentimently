import { ApiError } from '@sentimently/api';
import type { Customer, Session } from '@sentimently/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import { session } from './session';

export type AuthStatus = 'out' | 'loading' | 'in' | 'error';

interface AuthApi {
  status: AuthStatus;
  customer?: Customer;
  /** Why the account could not be loaded (not signed out: the server or network failed). */
  error?: unknown;
  retry(): void;
  signIn(s: Session): void;
  signOut(): void;
}

const Ctx = createContext<AuthApi | null>(null);

/** Everything about the signed-in person is cached under this key, so signing out can drop it in one go. */
export const ACCOUNT = 'account';

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(session.subscribe, session.get, () => null);
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: [ACCOUNT, 'me', token],
    queryFn: ({ signal }) => api.me({ signal }),
    enabled: !!token,
    staleTime: 60_000,
  });

  const signIn = useCallback(
    (s: Session) => {
      qc.removeQueries({ queryKey: [ACCOUNT] });
      qc.setQueryData([ACCOUNT, 'me', s.accessToken], s.customer);
      session.set(s.accessToken);
    },
    [qc],
  );
  const signOut = useCallback(() => {
    session.clear();
    qc.removeQueries({ queryKey: [ACCOUNT] });
  }, [qc]);

  const { data, error, refetch } = me;
  const value = useMemo<AuthApi>(() => {
    let status: AuthStatus = 'out';
    if (token) {
      if (data) status = 'in';
      // A refused token is cleared by the API client, which moves us to 'out'. Anything else is a failure to load, not a sign-out.
      else if (error && !(error instanceof ApiError && error.isUnauthorized)) status = 'error';
      else status = 'loading';
    }
    return { status, customer: token ? data : undefined, error: error ?? undefined, retry: () => void refetch(), signIn, signOut };
  }, [token, data, error, refetch, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
