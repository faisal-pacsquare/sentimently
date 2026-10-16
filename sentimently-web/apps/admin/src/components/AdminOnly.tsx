import { ErrorState } from '@sentimently/ui';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';

/** Prices, rates, codes and who has access can be changed by administrators only. The server enforces this too. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <ErrorState title="Administrators only" message="Ask an administrator if you need to change this." temporary={false} />;
  return children;
}
