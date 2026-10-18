import type { Kind, ProductQuery, Sort } from '@sentimently/api';

/** The browse groups. The URL says "feelings"; the API says "sentiments". */
export const KINDS = {
  feelings: { api: 'sentiments', param: 'sentiment', title: 'Feelings', one: 'feeling', blurb: 'Start from what you want to say.' },
  occasions: { api: 'occasions', param: 'occasion', title: 'Occasions', one: 'occasion', blurb: 'For the days that matter.' },
  recipients: { api: 'recipients', param: 'recipient', title: 'Who it is for', one: 'recipient', blurb: 'Gifts for the people in your life.' },
  categories: { api: 'categories', param: 'category', title: 'Categories', one: 'category', blurb: 'Browse by kind of gift.' },
} as const satisfies Record<string, { api: Kind; param: keyof ProductQuery; title: string; one: string; blurb: string }>;

export type KindRoute = keyof typeof KINDS;
export const isKindRoute = (v: string | undefined): v is KindRoute => !!v && v in KINDS;

export const PAGE_SIZE = 12;

export const SORTS: { value: Sort; label: string }[] = [
  { value: 'popularity', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
];

/** Whole-rupee ranges; both ends are inclusive, like the API. */
export const BUDGETS: { id: string; label: string; min?: number; max?: number }[] = [
  { id: 'u1', label: 'Under Rs 1,000', max: 999 },
  { id: '1-3', label: 'Rs 1,000 to 2,999', min: 1000, max: 2999 },
  { id: '3-5', label: 'Rs 3,000 to 4,999', min: 3000, max: 4999 },
  { id: '5+', label: 'Rs 5,000 and over', min: 5000 },
];

const int = (v: string | null): number | undefined => {
  if (v === null || !/^\d+$/.test(v)) return undefined;
  return Number(v);
};
const text = (v: string | null) => (v && v.trim() ? v.trim() : undefined);

/** The address bar is the source of truth for filters, so results can be shared and the back button works. */
export function readFilters(sp: URLSearchParams): ProductQuery {
  const sort = sp.get('sort');
  const q: ProductQuery = {
    sentiment: text(sp.get('sentiment')),
    occasion: text(sp.get('occasion')),
    recipient: text(sp.get('recipient')),
    category: text(sp.get('category')),
    minPrice: int(sp.get('minPrice')),
    maxPrice: int(sp.get('maxPrice')),
    q: text(sp.get('q')),
    sort: SORTS.some((s) => s.value === sort) ? (sort as Sort) : undefined,
    page: Math.max(1, int(sp.get('page')) ?? 1),
  };
  return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as ProductQuery;
}

export function writeFilters(q: ProductQuery): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === '' || (k === 'page' && v === 1)) continue;
    sp.set(k, String(v));
  }
  return sp;
}

/** Changing any filter goes back to page 1. */
export function withFilter(q: ProductQuery, change: Partial<ProductQuery>): ProductQuery {
  const next = { ...q, ...change };
  if (!('page' in change)) delete next.page;
  return Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== '')) as ProductQuery;
}

export function activeBudget(q: ProductQuery) {
  return BUDGETS.find((b) => b.min === q.minPrice && b.max === q.maxPrice);
}
