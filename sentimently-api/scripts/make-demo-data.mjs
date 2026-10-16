// Writes a LARGE synthetic data set to a folder, for load testing only. Not real content.
// usage: node scripts/make-demo-data.mjs <outDir> [products=500] [orders=2000]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [out = './tmp-demo-data', nProducts = '500', nOrders = '2000'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const T = '2026-11-01T00:00:00.000Z';
const base = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
for (const f of ['extras', 'promoCodes', 'storeConfig']) writeFileSync(join(out, `${f}.json`), JSON.stringify(base(f)));

const kinds = { sentiment: 14, occasion: 8, recipient: 6, category: 11 };
const taxonomy = [];
for (const [kind, n] of Object.entries(kinds)) for (let i = 1; i <= n; i++) taxonomy.push({ id: `${kind}-${i}`, kind, slug: `${kind}-${i}`, name: `${kind} ${i}`, sortOrder: i, createdAt: T, updatedAt: T });
writeFileSync(join(out, 'taxonomy.json'), JSON.stringify(taxonomy));

const pick = (kind, n, k) => Array.from({ length: k }, (_, j) => `${kind}-${((n + j * 3) % kinds[kind]) + 1}`);
const products = Array.from({ length: +nProducts }, (_, i) => ({
  id: `p${i}`, slug: `demo-gift-${i}`, name: `Demo gift ${i}`, description: `A demo description for gift number ${i}. `.repeat(8),
  price: 500 + (i % 40) * 150, offerPrice: i % 7 === 0 ? 400 + (i % 40) * 120 : null, type: 'physical', stock: 1_000_000,
  category: `category-${(i % 11) + 1}`, sentiments: pick('sentiment', i, 2), occasions: pick('occasion', i, 2), recipients: pick('recipient', i, 1),
  reviewCount: i % 50, rating: 3 + (i % 20) / 10, isActive: true, imageUrls: [], createdAt: T, updatedAt: T,
}));
writeFileSync(join(out, 'products.json'), JSON.stringify(products));

const orders = Array.from({ length: +nOrders }, (_, i) => ({
  id: `o${i}`, number: `SN-DEMO${String(i).padStart(4, '0')}`, customerId: `c${i % 300}`, contactEmail: `demo${i}@example.pk`, status: 'delivered',
  paymentMethod: 'cod', currency: 'PKR', itemsTotal: 800, extrasTotal: 0, subtotal: 800, deliveryFee: 350, discount: 0, total: 1150,
  city: 'Karachi', deliveryDate: '2026-11-10', lines: [{ productId: `p${i % 500}`, slug: 'x', name: 'x', type: 'physical', quantity: 1, unitPrice: 800, itemsTotal: 800, extras: [], extrasTotal: 0, lineTotal: 800, stockReserved: true }],
  events: [{ at: T, type: 'created', to: 'placed', by: 'x' }], createdAt: T, updatedAt: T,
}));
writeFileSync(join(out, 'orders.json'), JSON.stringify(orders));
console.log(`wrote ${nProducts} products and ${nOrders} orders to ${out}`);
