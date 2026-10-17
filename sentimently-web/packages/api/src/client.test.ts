import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, queryString } from './client';
import { createApi } from './endpoints';
import { leadTimeText, rupees, shortDate, todayInPakistan } from './format';

/** Runs a call that is expected to fail and hands back the error. */
const failure = async (p: Promise<unknown>) => (await p.then(() => { throw new Error('expected the call to fail'); }, (e: unknown) => e)) as ApiError;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }, ...init });

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  const sleep = vi.fn(async () => undefined);
  return { c: new ApiClient({ baseUrl: '/api/v1', fetch: fetchImpl, sleep, ...extra }), sleep };
}

describe('ApiClient', () => {
  it('sends the token and idempotency key, and builds the query without empty values', async () => {
    const f = vi.fn(async () => json({ ok: true }));
    const { c } = client(f as never, { getToken: () => 'tok' });
    await c.post('/checkout', { a: 1 }, { idempotencyKey: 'k1', query: { x: 1, y: '', z: undefined } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/checkout?x=1');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Idempotency-Key': 'k1', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('does not send the token when asked not to', async () => {
    const f = vi.fn(async () => json({}));
    const { c } = client(f as never, { getToken: () => 'tok' });
    await c.post('/auth/login', {}, { auth: false });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty('Authorization');
  });

  it('turns the standard error body into an ApiError with details and request id', async () => {
    const f = async () => json({ error: { code: 'validation_error', message: 'The request is not valid.', details: ['Line 1: only 3 left'], requestId: 'r-1' } }, { status: 400 });
    const { c } = client(f as never);
    const e = await failure(c.post('/quote', {}));
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 400, code: 'validation_error', details: ['Line 1: only 3 left'], requestId: 'r-1' });
    expect(e.isTemporary).toBe(false);
  });

  it('a network failure is its own thing, never "not found"', async () => {
    const f = async () => { throw new TypeError('Failed to fetch'); };
    const { c } = client(f as never, { maxRetries: 0 });
    const e = await failure(c.get('/products'));
    expect(e).toMatchObject({ status: 0, code: 'network' });
    expect(e.isNetwork && e.isTemporary && !e.isNotFound).toBe(true);
  });

  it('an HTML error page from a proxy is a server error, not a crash', async () => {
    const f = async () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } });
    const { c } = client(f as never, { maxRetries: 0 });
    const e = await failure(c.get('/products'));
    expect(e).toMatchObject({ status: 502, code: 'internal_error' });
  });

  it('retries a GET after 429, waiting as long as Retry-After says', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 'rate_limited', message: 'slow down' } }, { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(json({ data: [] }));
    const { c, sleep } = client(f as never);
    expect(await c.get('/products')).toEqual({ data: [] });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('retries a GET after a network error with growing waits, then gives up', async () => {
    const f = vi.fn(async () => { throw new TypeError('offline'); });
    const { c, sleep } = client(f as never);
    const e = await failure(c.get('/products'));
    expect(e.isNetwork).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((x) => (x as unknown as number[])[0])).toEqual([300, 600]);
  });

  it('does not wait for an unreasonably long Retry-After', async () => {
    const f = vi.fn(async () => json({ error: { code: 'rate_limited', message: 'x' } }, { status: 429, headers: { 'retry-after': '60' } }));
    const { c } = client(f as never);
    const e = await failure(c.get('/products'));
    expect(e).toMatchObject({ status: 429, retryAfterSeconds: 60 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('never retries a POST: it could place an order twice', async () => {
    const f = vi.fn(async () => json({ error: { code: 'internal_error', message: 'x' } }, { status: 503 }));
    const { c } = client(f as never);
    await c.post('/checkout', {}).catch(() => undefined);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('tells the app when a signed-in request is refused as 401, but not an anonymous one', async () => {
    const onUnauthorized = vi.fn();
    const f = async () => json({ error: { code: 'unauthorized', message: 'Please sign in' } }, { status: 401 });
    const { c } = client(f as never, { getToken: () => 'old', onUnauthorized });
    await c.get('/me').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    const anon = client(f as never, { getToken: () => null, onUnauthorized: vi.fn() });
    await anon.c.get('/me').catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('handles 204 with no body', async () => {
    const f = async () => new Response(null, { status: 204 });
    expect(await client(f as never).c.delete('/me/wishlist/x')).toBeUndefined();
  });

  it('lets a cancelled request go without calling it an error', async () => {
    const ctrl = new AbortController();
    const f = async () => { ctrl.abort(); throw new DOMException('Aborted', 'AbortError'); };
    const { c } = client(f as never);
    const e = await c.get('/products', { signal: ctrl.signal }).catch((x) => x);
    expect(e).not.toBeInstanceOf(ApiError);
  });
});

describe('endpoints', () => {
  it('puts slugs in the path safely and sends filters as a query', async () => {
    const f = vi.fn(async () => json({ data: [], page: 1, pageSize: 24, total: 0 }));
    const api = createApi(client(f as never).c);
    await api.hub('sentiments', 'i-miss/you', { maxPrice: 3000, sort: 'price_asc' });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/taxonomy/sentiments/i-miss%2Fyou?maxPrice=3000&sort=price_asc');
  });
});

describe('format', () => {
  it('formats rupees, dates and lead times', () => {
    expect(rupees(3500)).toBe('Rs 3,500');
    expect(rupees(999)).toBe('Rs 999');
    expect(rupees(1234567)).toBe('Rs 1,234,567');
    expect(shortDate('2026-11-18')).toBe('Wed 18 Nov');
    expect(leadTimeText(5, 7)).toBe('5 to 7 working days');
    expect(leadTimeText(1, 1)).toBe('1 working day');
    expect(leadTimeText(undefined, undefined)).toBeNull();
  });

  it('knows today in Pakistan, even when UTC is still yesterday', () => {
    expect(todayInPakistan(new Date('2026-11-18T20:30:00Z'))).toBe('2026-11-19');
  });

  it('queryString skips empty values', () => {
    expect(queryString({ a: 'x', b: 0, c: '', d: null })).toBe('?a=x&b=0');
    expect(queryString()).toBe('');
  });
});

describe('ApiClient: sending a file', () => {
  it('sends FormData as it is, with no JSON content type, so the browser adds the multipart boundary', async () => {
    const f = vi.fn(async () => json({ url: '/x.jpg' }, { status: 201 }));
    const { c } = client(f as never, { getToken: () => 'tok' });
    const form = new FormData();
    form.append('file', new Blob(['abc'], { type: 'image/jpeg' }), 'a.jpg');
    await c.post('/admin/images', form);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(form);
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
});
