import type { ProductQuery, Quote, QuoteRequest } from '@sentimently/api';
import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { KindRoute } from './filters';
import { KINDS } from './filters';

/**
 * The API client already retries a failed GET twice, so React Query must not retry again on top of it.
 * The catalogue is cached at the edge for a minute, so a minute of freshness here matches.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false } },
  });
}

export const useStoreSettings = () =>
  useQuery({ queryKey: ['store'], queryFn: ({ signal }) => api.store({ signal }), staleTime: 5 * 60_000 });

export const useTaxonomy = (kind: KindRoute) =>
  useQuery({
    queryKey: ['taxonomy', kind],
    queryFn: ({ signal }) => api.taxonomy(KINDS[kind].api, { signal }),
    select: (items) => (kind === 'categories' ? items.filter((t) => t.slug !== 'digital') : items), // no "Digital gifts" category
    staleTime: 5 * 60_000,
  });

export const useProducts = (q: ProductQuery) =>
  useQuery({
    queryKey: ['products', q],
    queryFn: ({ signal }) => api.products({ ...q, type: 'physical' }, { signal }), // digital gifts are not sold on the shop
    placeholderData: keepPreviousData, // keep showing the last results while the next page loads
  });

export const useProduct = (slug: string) =>
  useQuery({ queryKey: ['product', slug], queryFn: ({ signal }) => api.product(slug, { signal }) });

export const useReviews = (slug: string) =>
  useQuery({ queryKey: ['reviews', slug], queryFn: ({ signal }) => api.reviews(slug, { signal }) });

export const usePersonalisationOptions = () =>
  useQuery({ queryKey: ['options'], queryFn: ({ signal }) => api.options({ signal }), staleTime: 10 * 60_000 });

/** The server prices the gift box. A 400 comes back with a list of plain-language problems in `error.details`. */
export const useQuote = (request: QuoteRequest, enabled: boolean) =>
  useQuery<Quote>({
    queryKey: ['quote', request],
    queryFn: ({ signal }) => api.quote(request, { signal }),
    enabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
