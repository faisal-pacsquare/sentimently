import { ApiError } from '@sentimently/api';
import type { Product } from '@sentimently/api';
import { ErrorState } from '@sentimently/ui';
import type { ProductCardData } from '@sentimently/ui';

export function cardData(p: Product): ProductCardData {
  return {
    name: p.name,
    price: p.price,
    offerPrice: p.offerPrice,
    rating: p.rating,
    reviewCount: p.reviewCount,
    image: p.imageUrls?.[0],
    digital: p.type === 'digital',
    soldOut: !p.isMadeToOrder && p.stock <= 0,
    madeToOrder: p.isMadeToOrder,
  };
}

const asApiError = (e: unknown) => (e instanceof ApiError ? e : null);

/** What to say when a request failed. Always an error, never "not found" unless the server really said 404. */
export function QueryError({ error, onRetry, retrying, what = 'this' }: { error: unknown; onRetry?: () => void; retrying?: boolean; what?: string }) {
  const e = asApiError(error);
  if (e?.isNetwork) {
    return <ErrorState title="We can't reach the shop" message="Check your internet connection, then try again." onRetry={onRetry} retrying={retrying} />;
  }
  if (e?.status === 429) {
    return <ErrorState title="Lots of people are shopping right now" message="Please wait a moment and try again." onRetry={onRetry} retrying={retrying} requestId={e.requestId} />;
  }
  return (
    <ErrorState
      title="Something went wrong"
      message={`We could not load ${what}. It is not your fault; please try again.`}
      onRetry={onRetry}
      retrying={retrying}
      requestId={e?.requestId}
      temporary={e ? e.isTemporary : true}
    />
  );
}
