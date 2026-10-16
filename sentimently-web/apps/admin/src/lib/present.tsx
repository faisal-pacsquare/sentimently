import { ApiError } from '@sentimently/api';
import type { OrderStatus } from '@sentimently/api';
import { Alert, Badge, ErrorState } from '@sentimently/ui';
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false } } });
}

/** A failed load. Always an error with a retry, never an empty list. */
export function QueryError({ error, onRetry, retrying, what = 'this' }: { error: unknown; onRetry?: () => void; retrying?: boolean; what?: string }) {
  const e = error instanceof ApiError ? error : null;
  if (e?.isNetwork) return <ErrorState title="Cannot reach the server" message="Check the connection, then try again." onRetry={onRetry} retrying={retrying} />;
  if (e?.status === 403) return <Alert tone="error">You do not have permission to see {what}.</Alert>;
  return (
    <ErrorState
      title="Something went wrong"
      message={`Could not load ${what}.`}
      onRetry={onRetry}
      retrying={retrying}
      requestId={e?.requestId}
      temporary={e ? e.isTemporary : true}
    />
  );
}

/** What a staff action was refused for, in the server's words. Network and server failures say so instead. */
export function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  if (!e || e.isTemporary) return <Alert tone="error">That did not go through (the server could not be reached). Nothing was changed; please try again.</Alert>;
  return <Alert tone="error">{e.details[0] ?? e.message}</Alert>;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  placed: 'Placed',
  paid: 'Paid',
  preparing: 'Preparing',
  in_production: 'In production',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  failed_delivery: 'Failed delivery',
  returned: 'Returned',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

const TONE: Partial<Record<OrderStatus, 'offer' | 'digital' | 'warn'>> = {
  awaiting_payment: 'warn', failed_delivery: 'offer', cancelled: 'offer', delivered: 'digital', paid: 'digital',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export const PAYMENT_LABEL = { cod: 'Cash on delivery', bank_transfer: 'Bank transfer', card: 'Card' } as const;
