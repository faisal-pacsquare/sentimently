import type { Product } from '@sentimently/api';
import { EmptyState, ProductCard, ProductCardSkeleton } from '@sentimently/ui';
import { Link } from 'react-router-dom';
import { cardData, QueryError } from '../lib/present';

interface Props {
  products?: Product[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  /** Shown when the request worked and nothing matched. */
  empty?: { title: string; message: string; action?: React.ReactNode };
  skeletons?: number;
}

/**
 * The three honest outcomes of fetching gifts: loading, failed (with retry), or really empty.
 * A failure is never shown as an empty list.
 */
export function ProductGrid({ products, loading, error, onRetry, retrying, empty, skeletons = 8 }: Props) {
  if (error && !products) return <QueryError error={error} onRetry={onRetry} retrying={retrying} what="the gifts" />;
  if (loading && !products) {
    return (
      <div className="grid" aria-busy="true" aria-label="Loading gifts">
        {Array.from({ length: skeletons }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (!products?.length) {
    return (
      <EmptyState title={empty?.title ?? 'No gifts here yet'} message={empty?.message ?? 'Try a different filter.'}>
        {empty?.action}
      </EmptyState>
    );
  }
  return (
    <ul className="grid" role="list">
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={cardData(p)} linkAs={Link} linkProps={{ to: `/gifts/${p.slug}` }} />
        </li>
      ))}
    </ul>
  );
}
