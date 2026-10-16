// Builds the Postman collection and environment from openapi/openapi.v1.json.
//   npm run openapi && npm run postman
// Import postman/Sentimently.postman_collection.json and postman/Sentimently.local.postman_environment.json into Postman.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync(new URL('../openapi/openapi.v1.json', import.meta.url), 'utf8'));
const outDir = new URL('../postman/', import.meta.url);
mkdirSync(outDir, { recursive: true });

// ---------- example bodies ----------
const ref = (r) => r.split('/').slice(1).reduce((o, k) => o[k], spec);
const HINTS = {
  email: 'customer@example.pk', recipientEmail: 'friend@example.pk', password: 'a-long-password-1', name: 'Ayesha Khan', phone: '03001234567',
  address: 'House 12, Street 4, DHA Phase 5', city: 'Karachi', productId: '{{productId}}', number: '{{orderNumber}}', idToken: 'google-id-token',
  code: 'GC-XXXX-XXXX-XXXX-XXXX', token: 'reset-token-from-email', date: '2026-12-01', sendAt: '2026-12-01T09:00:00Z', message: 'Thinking of you',
  recipientName: 'Maryam', relationship: 'friend', cardDesign: 'classic', quantity: 1, rating: 5, paymentMethod: 'cod', kind: 'return',
  subject: 'A question', topic: 'order', reason: 'Not the right colour', status: 'preparing', decision: 'approve', slug: 'sample-photo-mug',
};
function example(schema, key = '', depth = 0) {
  if (!schema || depth > 5) return null;
  if (schema.$ref) return example(ref(schema.$ref), key, depth + 1);
  if (key in HINTS && schema.type !== 'array' && schema.type !== 'object') return HINTS[key];
  if (schema.enum) return schema.enum[0];
  if (schema.example !== undefined) return schema.example;
  switch (schema.type) {
    case 'string': return schema.format === 'date-time' ? '2026-12-01T09:00:00Z' : 'string';
    case 'integer': case 'number': return schema.minimum ?? 1;
    case 'boolean': return true;
    case 'array': return [example(schema.items, key, depth + 1)];
    case 'object': {
      const out = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) {
        if ((schema.required ?? []).includes(k) || depth === 0) out[k] = example(v, k, depth + 1);
      }
      return out;
    }
    default: return null;
  }
}

// Hand-written bodies for the journeys people try first.
const BODIES = {
  'POST /api/v1/quote': { lines: [{ productId: '{{productId}}', quantity: 1, personalisation: { recipientName: 'Maryam', relationship: 'friend', cardDesign: 'classic', message: 'Thinking of you', extras: ['premium_wrap'] } }], delivery: { city: 'Karachi' }, promoCode: 'HELLO10', email: 'customer@example.pk' },
  'POST /api/v1/checkout': { lines: [{ productId: '{{productId}}', quantity: 1 }], delivery: { city: 'Karachi', address: 'House 12, Street 4, DHA Phase 5', phone: '03001234567' }, contact: { email: 'customer@example.pk', name: 'Ayesha Khan' }, paymentMethod: 'cod' },
  'POST /api/v1/orders/track': { number: '{{orderNumber}}', email: 'customer@example.pk' },
  'POST /api/v1/orders/cancel': { number: '{{orderNumber}}', email: 'customer@example.pk' },
  'POST /api/v1/auth/login': { email: 'customer@example.pk', password: 'a-long-password-1' },
  'POST /api/v1/admin/orders/{id}/status': { status: 'preparing', note: 'Started' },
};

// ---------- after-response scripts ----------
const SAVE_TOKEN = [
  "const body = pm.response.json();",
  "if (body.accessToken) { pm.collectionVariables.set('token', body.accessToken); }",
];
const SAVE_ORDER = [
  "const body = pm.response.json();",
  "if (body.order) { pm.collectionVariables.set('orderId', body.order.id); pm.collectionVariables.set('orderNumber', body.order.number); }",
];
const checks = (op) => [
  "pm.test('Responds quickly', () => pm.expect(pm.response.responseTime).to.be.below(2000));",
  "if (pm.response.code >= 400) { pm.test('Error has the standard shape', () => { const e = pm.response.json().error; pm.expect(e).to.have.property('code'); pm.expect(e).to.have.property('message'); pm.expect(e).to.have.property('requestId'); }); }",
  ...(op.path.endsWith('/auth/login') || op.path.endsWith('/auth/register') || op.path.endsWith('/auth/google') ? SAVE_TOKEN : []),
  ...(op.path.endsWith('/checkout') ? SAVE_ORDER : []),
];

// ---------- items ----------
const folders = new Map();
const operations = [];
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) operations.push({ path, method: method.toUpperCase(), op });
}
operations.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

for (const { path, method, op } of operations) {
  const segments = path.replace('/api/v1/', '').split('/');
  const folder = segments[0] === 'admin' ? `admin / ${segments[1] ?? ''}`.trim() : segments[0];
  const isPublic = op['x-access'] === 'public';
  const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name);
  const query = (op.parameters ?? []).filter((p) => p.in === 'query');
  const body = BODIES[`${method} ${path}`] ?? (op.requestBody ? example(op.requestBody.content?.['application/json']?.schema) : undefined);

  const urlPath = segments.map((s) => s.replace(/^\{(\w+)\}$/, ':$1'));
  const item = {
    name: `${method} /${segments.join('/')}`,
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: checks({ path }) } }],
    request: {
      method,
      description: `${op.description ?? ''}\n\nAccess: ${op['x-access']}`.trim(),
      header: [...(body !== undefined ? [{ key: 'Content-Type', value: 'application/json' }] : []), ...(path.endsWith('/checkout') ? [{ key: 'Idempotency-Key', value: '{{$guid}}', description: 'Repeating a checkout with the same key returns the first order' }] : [])],
      url: {
        raw: `{{baseUrl}}/${urlPath.join('/')}${query.length ? '?' + query.map((q) => `${q.name}=`).join('&') : ''}`,
        host: ['{{baseUrl}}'],
        path: urlPath,
        query: query.map((q) => ({ key: q.name, value: '', disabled: true, description: q.description })),
        variable: pathParams.map((n) => ({ key: n, value: n === 'id' ? '{{orderId}}' : n === 'number' ? '{{orderNumber}}' : String(HINTS[n] ?? 'example') })),
      },
      ...(body !== undefined ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
      ...(isPublic ? { auth: { type: 'noauth' } } : {}),
    },
  };
  if (!folders.has(folder)) folders.set(folder, []);
  folders.get(folder).push(item);
}

const collection = {
  info: {
    name: 'Sentimently API v1',
    description: 'Generated from openapi/openapi.v1.json.\n\n1. Run POST /auth/login (or register). The token is saved for you.\n2. Set productId (GET /products).\n3. POST /quote, then POST /checkout. The order id and number are saved for the other requests.\n\nStaff and admin requests need a token from a staff or admin account.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000/api/v1' },
    { key: 'token', value: '' },
    { key: 'productId', value: '' },
    { key: 'orderId', value: '' },
    { key: 'orderNumber', value: '' },
  ],
  item: [...folders.entries()].map(([name, items]) => ({ name, item: items })),
};

const environment = {
  id: 'sentimently-local',
  name: 'Sentimently local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000/api/v1', type: 'default', enabled: true },
    { key: 'token', value: '', type: 'secret', enabled: true },
    { key: 'productId', value: '', type: 'default', enabled: true },
    { key: 'orderId', value: '', type: 'default', enabled: true },
    { key: 'orderNumber', value: '', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

writeFileSync(new URL('Sentimently.postman_collection.json', outDir), JSON.stringify(collection, null, 2) + '\n');
writeFileSync(new URL('Sentimently.local.postman_environment.json', outDir), JSON.stringify(environment, null, 2) + '\n');
console.log(`${operations.length} requests in ${folders.size} folders -> postman/`);
