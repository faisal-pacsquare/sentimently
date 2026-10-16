// Load test. Starts the BUILT server (run `npm run build` first) on synthetic data and measures the main journeys.
// usage: node scripts/load-test.mjs [--seconds 8] [--connections 20] [--products 500] [--orders 2000] [--check]
// --check makes it exit with an error if a latency or error budget is missed (used by CI).
import autocannon from 'autocannon';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const seconds = Number(arg('seconds', 8));
const connections = Number(arg('connections', 20));
const products = arg('products', '500');
const orders = arg('orders', '2000');
const check = process.argv.includes('--check');
const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}/api/v1`;

// Budgets for --check. Loose on purpose: shared machines vary 2-3x between runs, so these catch a collapse
// (for example a read that starts copying whole collections again), not a small slowdown.
const BUDGET_P99_MS = { catalogue: 600, quote: 800, checkout: 1500 };

const dataDir = mkdtempSync(join(tmpdir(), 'sentimently-load-'));
const made = spawnSync(process.execPath, ['scripts/make-demo-data.mjs', dataDir, products, orders], { encoding: 'utf8' });
if (made.status !== 0) throw new Error(made.stderr);
console.log(made.stdout.trim());

const server = spawn(process.execPath, ['dist/main.js'], {
  env: {
    ...process.env, PORT: String(port), DATA_DIR: dataDir, JWT_SECRET: 'load-test-secret-that-is-long-enough-123456', NODE_ENV: 'production',
    RATE_LIMIT_MAX: '1000000', CHECKOUT_RATE_LIMIT: '1000000', CRON_SECRET: '', LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = () => server.kill();
process.on('exit', stop);

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('server did not start');
}

const json = { 'content-type': 'application/json' };
const scenarios = [
  { name: 'catalogue', label: 'List gifts (page 1)', url: `${base}/products?pageSize=24` },
  { name: 'catalogue', label: 'Filter + budget + sort', url: `${base}/products?sentiment=sentiment-3&maxPrice=4000&sort=price_asc` },
  { name: 'catalogue', label: 'Search by keyword', url: `${base}/products?q=gift%20number%2042` },
  { name: 'catalogue', label: 'One gift', url: `${base}/products/demo-gift-10` },
  {
    name: 'quote', label: 'Price a personalised basket', method: 'POST', headers: json, url: `${base}/quote`,
    body: JSON.stringify({
      lines: [
        { productId: 'p10', quantity: 1, personalisation: { recipientName: 'Ayesha', relationship: 'friend', cardDesign: 'classic', message: 'Thinking of you', extras: ['premium_wrap'] } },
        { productId: 'p20', quantity: 2 },
      ],
      delivery: { city: 'Karachi' }, promoCode: 'HELLO10', email: 'load@example.pk',
    }),
  },
  {
    name: 'checkout', label: 'Place a cash-on-delivery order', method: 'POST', headers: json, url: `${base}/checkout`,
    // a different customer every time, as real traffic would be
    requests: [{
      method: 'POST', path: '/api/v1/checkout', headers: json,
      setupRequest: (req) => {
        const n = Math.random().toString(36).slice(2);
        req.body = JSON.stringify({
          lines: [{ productId: 'p5', quantity: 1 }], paymentMethod: 'cod', contact: { email: `load-${n}@example.pk`, name: 'Load' },
          delivery: { city: 'Karachi', address: 'House 1, Street 2, Block 3', phone: '03001234567' },
        });
        return req;
      },
    }],
  },
];

const rows = [];
let failed = false;
try {
  await waitUp();
  for (const s of scenarios) {
    const { label, name, ...opts } = s;
    const result = await autocannon({ connections, duration: seconds, ...opts });
    const non2xx = result.non2xx ?? 0;
    const row = {
      scenario: label, 'req/s': Math.round(result.requests.average), 'p50 ms': result.latency.p50,
      'p97.5 ms': result.latency.p97_5, 'p99 ms': result.latency.p99, errors: result.errors + non2xx + result.timeouts,
    };
    rows.push(row);
    if (check && (row['p99 ms'] > BUDGET_P99_MS[name] || row.errors > 0)) failed = true;
  }

  // The rate limit should answer 429 with Retry-After, never a crash or a 404.
  server.kill();
  await sleep(500);
  const limited = spawn(process.execPath, ['dist/main.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, JWT_SECRET: 'x'.repeat(40), NODE_ENV: 'production', RATE_LIMIT_MAX: '60', LOG_LEVEL: 'error' },
    stdio: 'ignore',
  });
  process.on('exit', () => limited.kill());
  await waitUp();
  const codes = {};
  let retryAfter = null;
  for (let i = 0; i < 150; i++) {
    const res = await fetch(`${base}/products`);
    codes[res.status] = (codes[res.status] ?? 0) + 1;
    if (res.status === 429) retryAfter ??= res.headers.get('retry-after');
  }
  limited.kill();
  console.log('\nRate limit (limit 60 a minute, 150 requests):', codes, 'Retry-After:', retryAfter);
  if (check && !(codes[200] === 60 && codes[429] === 90 && retryAfter)) failed = true;
} finally {
  stop();
}

console.table(rows);
console.log(`(${connections} connections, ${seconds}s each, ${products} gifts, ${orders} existing orders, one process, in-memory store)`);
if (failed) {
  console.error('LOAD CHECK FAILED: a latency or error budget was missed');
  process.exit(1);
}
