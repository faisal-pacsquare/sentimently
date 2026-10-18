import type { PersonalisationOptions, Product, Quote, QuoteRequest, StoreSettings, TaxonomyItem } from '@sentimently/api';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const BASE = 'http://api.test/api/v1';

const T = '2026-11-01T00:00:00.000Z';

export const makeProduct = (over: Partial<Product> & { slug: string; name: string; price: number }): Product => ({
  id: `id-${over.slug}`, description: `About ${over.name}`, effectivePrice: over.offerPrice ?? over.price, onOffer: over.offerPrice != null && over.offerPrice < over.price,
  type: 'physical', stock: 10, category: 'home', sentiments: [], occasions: [], recipients: [], reviewCount: 0, rating: null, imageUrls: [],
  createdAt: T, updatedAt: T, ...over,
});

export const PRODUCTS: Product[] = [
  makeProduct({ slug: 'photo-mug', name: 'Photo mug', price: 1200, offerPrice: 999, sentiments: ['i-miss-you'], occasions: ['birthday'], reviewCount: 3, rating: 4.7 }),
  makeProduct({ slug: 'name-necklace', name: 'Name necklace', price: 3500, isMadeToOrder: true, leadTimeMinDays: 5, leadTimeMaxDays: 7, stock: 0, category: 'jewellery', sentiments: ['i-miss-you'] }),
  makeProduct({ slug: 'egift-card', name: 'E-gift card', price: 5000, type: 'digital', digitalKind: 'egift', category: 'digital', sentiments: ['thank-you'] }),
  makeProduct({ slug: 'candle', name: 'Scented candle', price: 1500, stock: 2, sentiments: ['im-sorry'], isPerishable: false }),
  makeProduct({ slug: 'sold-out-book', name: 'Photo book', price: 4500, stock: 0, category: 'home' }),
];

const group = (kind: TaxonomyItem['kind'], slug: string, name: string, productCount: number, blurb?: string): TaxonomyItem => ({
  id: `${kind}-${slug}`, kind, slug, name, productCount, blurb, sortOrder: 0,
});

export const TAXONOMY: Record<string, TaxonomyItem[]> = {
  sentiments: [group('sentiment', 'i-miss-you', 'I miss you', 2, 'For someone far away'), group('sentiment', 'thank-you', 'Thank you', 1), group('sentiment', 'im-sorry', "I'm sorry", 1)],
  occasions: [group('occasion', 'birthday', 'Birthday', 1)],
  recipients: [group('recipient', 'friend', 'Friend', 0)],
  categories: [group('category', 'home', 'Home', 2), group('category', 'jewellery', 'Jewellery', 1)],
};

export const SETTINGS: StoreSettings = {
  announcement: 'Free delivery over Rs 5,000',
  banner: null,
  freeDeliveryThreshold: 5000,
  sameDayCutoffHour: 13,
  deliveryRates: {
    Karachi: { fee: 350, minDays: 0, maxDays: 0, sameDay: true },
    Multan: { fee: 550, minDays: 1, maxDays: 2, sameDay: false },
  },
  restOfPakistan: { fee: 650, minDays: 2, maxDays: 4, sameDay: false },
  digitalFee: 0,
  contact: { phone: null, email: 'hello@sentimently.pk' },
  socialLinks: {},
  paymentMethods: ['cod', 'bank_transfer'],
  currency: 'PKR',
};

/** Every request the mocked server received, so tests can check what the app really asked for. */
export const OPTIONS: PersonalisationOptions = {
  relationships: ['Friend', 'Mother', 'Partner'],
  cardDesigns: ['Classic', 'Floral'],
  messageMaxLength: 20,
  starterLines: ['Thinking of you today.'],
  extras: [{ code: 'gift-wrap', name: 'Gift wrap', price: 250 }],
};

export const seen: { method: string; url: URL; body?: unknown }[] = [];

export function filterProducts(url: URL): Product[] {
  const q = url.searchParams;
  return PRODUCTS.filter(
    (p) =>
      (!q.get('sentiment') || p.sentiments?.includes(q.get('sentiment')!)) &&
      (!q.get('occasion') || p.occasions?.includes(q.get('occasion')!)) &&
      (!q.get('category') || p.category === q.get('category')) &&
      (!q.get('type') || p.type === q.get('type')) &&
      (!q.get('minPrice') || p.effectivePrice >= Number(q.get('minPrice'))) &&
      (!q.get('maxPrice') || p.effectivePrice <= Number(q.get('maxPrice'))) &&
      (!q.get('q') || `${p.name} ${p.description}`.toLowerCase().includes(q.get('q')!.toLowerCase())),
  );
}

export const quoteFor = (req: QuoteRequest): Quote => {
  const lines = req.lines.map((l) => {
    const p = PRODUCTS.find((x) => x.id === l.productId)!;
    const itemsTotal = p.effectivePrice * l.quantity;
    return {
      productId: p.id, slug: p.slug, name: p.name, type: p.type, quantity: l.quantity, unitPrice: p.effectivePrice, itemsTotal,
      extras: [], extrasTotal: 0, lineTotal: itemsTotal, personalised: !!l.personalisation,
    };
  });
  const itemsTotal = lines.reduce((s, l) => s + l.itemsTotal, 0);
  const physical = lines.some((l) => l.type === 'physical');
  const fee = physical && itemsTotal <= 5000 ? 350 : 0;
  return {
    lines, itemsTotal, extrasTotal: 0, subtotal: itemsTotal, deliveryFee: fee, discount: 0, total: itemsTotal + fee, currency: 'PKR',
    delivery: physical ? { city: req.delivery?.city ?? '', method: 'address', fee, freeDelivery: fee === 0, sameDay: true, earliestDate: '2026-11-18', estimatedBy: '2026-11-18', requestedDate: null, perishable: false } : null,
    promo: req.promoCode ? { code: req.promoCode.toUpperCase(), applied: false, discount: 0, reason: 'That code is not valid' } : null,
    quotedAt: T,
  };
};

export const handlers = [
  http.get(`${BASE}/personalisation/options`, () => HttpResponse.json(OPTIONS)),
  http.get(`${BASE}/store`, () => HttpResponse.json(SETTINGS)),
  http.get(`${BASE}/taxonomy/:kind`, ({ params }) => HttpResponse.json(TAXONOMY[String(params.kind)] ?? [])),
  http.get(`${BASE}/products`, ({ request }) => {
    const url = new URL(request.url);
    seen.push({ method: 'GET', url });
    const all = filterProducts(url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('pageSize') ?? 24);
    return HttpResponse.json({ data: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length });
  }),
  http.get(`${BASE}/search/suggest`, () => HttpResponse.json({ products: [], groups: [] })),
  http.get(`${BASE}/products/:slug/reviews`, () => HttpResponse.json([])),
  http.get(`${BASE}/products/:slug`, ({ params }) => {
    const p = PRODUCTS.find((x) => x.slug === params.slug);
    return p ? HttpResponse.json(p) : HttpResponse.json({ error: { code: 'not_found', message: 'No such gift', requestId: 'r1' } }, { status: 404 });
  }),
  http.post(`${BASE}/quote`, async ({ request }) => {
    const body = (await request.json()) as QuoteRequest;
    seen.push({ method: 'POST', url: new URL(request.url), body });
    return HttpResponse.json(quoteFor(body));
  }),
];

export const server = setupServer(...handlers);

export const apiError = (status: number, code: string, message = 'Something went wrong', details?: string[]) =>
  HttpResponse.json({ error: { code, message, details, requestId: 'req-test-1' } }, { status });
