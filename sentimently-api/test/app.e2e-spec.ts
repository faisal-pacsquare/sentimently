import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';
import { MemoryDriver } from '../src/storage/memory.driver';
import { Doc, STORAGE_DRIVER } from '../src/storage/storage.types';

const stamp = (n: number) => ({
  id: '',
  createdAt: `2026-11-0${n}T00:00:00.000Z`,
  updatedAt: `2026-11-0${n}T00:00:00.000Z`,
});

const taxonomy = [
  {
    id: 't1',
    kind: 'sentiment',
    slug: 'i-miss-you',
    name: 'I miss you',
    sortOrder: 1,
  },
  {
    id: 't2',
    kind: 'sentiment',
    slug: 'im-sorry',
    name: "I'm sorry",
    sortOrder: 2,
  },
  { id: 't3', kind: 'occasion', slug: 'birthday', name: 'Birthday' },
  { id: 't4', kind: 'category', slug: 'jewellery', name: 'Jewellery' },
  { id: 't5', kind: 'category', slug: 'digital', name: 'Digital' },
].map((t, i) => ({ ...stamp(1), ...t, id: `t${i + 1}` })) as Doc[];

const product = (n: number, over: Record<string, unknown>) =>
  ({
    ...stamp(n),
    id: `p${n}`,
    slug: `gift-${n}`,
    name: `Gift ${n}`,
    description: 'A thoughtful gift',
    type: 'physical',
    stock: 5,
    category: 'jewellery',
    isActive: true,
    ...over,
  }) as Doc;

const products: Doc[] = [
  product(1, {
    name: 'Cursive Name Necklace',
    price: 3500,
    sentiments: ['i-miss-you'],
    occasions: ['birthday'],
    reviewCount: 10,
    rating: 4.5,
  }),
  product(2, {
    name: 'Photo Book',
    price: 6000,
    offerPrice: 4500,
    sentiments: ['i-miss-you', 'im-sorry'],
    reviewCount: 30,
    rating: 4.9,
  }),
  product(3, {
    name: 'E-gift card',
    price: 5000,
    type: 'digital',
    category: 'digital',
    sentiments: ['im-sorry'],
    reviewCount: 2,
    rating: 4.0,
  }),
  product(4, {
    name: 'Hidden gift',
    price: 100,
    isActive: false,
    sentiments: ['i-miss-you'],
  }),
];

describe('API (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();

  async function boot(env: Record<string, string> = {}) {
    Object.assign(process.env, env);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(new MemoryDriver({ taxonomy, products }))
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  }

  afterEach(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_MAX;
  });

  describe('platform', () => {
    beforeEach(() => boot());

    it('E1-1 health reports the store', async () => {
      const res = await request(server()).get('/api/v1/health').expect(200);
      expect(res.body).toEqual({
        status: 'ok',
        store: 'MemoryDriver',
        mail: 'console',
        images: 'local',
      });
    });

    it('E1-1 errors use one shape with a request id', async () => {
      const res = await request(server())
        .get('/api/v1/products/nope')
        .set('x-request-id', 'abc-1')
        .expect(404);
      expect(res.body.error).toMatchObject({
        code: 'not_found',
        requestId: 'abc-1',
      });
      expect(res.headers['x-request-id']).toBe('abc-1');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('E1-1 invalid query gives 400 with details', async () => {
      const res = await request(server())
        .get('/api/v1/products?sort=bogus&page=0')
        .expect(400);
      expect(res.body.error.code).toBe('validation_error');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => boot({ RATE_LIMIT_MAX: '3' }));

    it('E1-2 returns 429 with Retry-After, never a 404', async () => {
      for (let i = 0; i < 3; i++)
        await request(server()).get('/api/v1/products').expect(200);
      const res = await request(server()).get('/api/v1/products').expect(429);
      expect(res.body.error.code).toBe('rate_limited');
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('catalogue', () => {
    beforeEach(() => boot());

    it('E2-1 filters by feeling and ignores inactive gifts', async () => {
      const res = await request(server())
        .get('/api/v1/products?sentiment=i-miss-you')
        .expect(200);
      expect(res.body.data.map((p: Doc) => p.slug).sort()).toEqual([
        'gift-1',
        'gift-2',
      ]);
      expect(res.body.total).toBe(2);
    });

    it('E2-1 combines filters, and an empty match is 200 with an empty list', async () => {
      const both = await request(server())
        .get('/api/v1/products?sentiment=im-sorry&type=digital')
        .expect(200);
      expect(both.body.data.map((p: Doc) => p.slug)).toEqual(['gift-3']);
      const none = await request(server())
        .get('/api/v1/products?occasion=birthday&type=digital')
        .expect(200);
      expect(none.body).toMatchObject({ data: [], total: 0 });
    });

    it('PR-06 budget filter and price sort use the offer price when there is one', async () => {
      const res = await request(server())
        .get('/api/v1/products?maxPrice=4600&sort=price_asc')
        .expect(200);
      expect(res.body.data.map((p: Doc) => p.slug)).toEqual([
        'gift-1',
        'gift-2',
      ]);
      expect(res.body.data[1]).toMatchObject({
        effectivePrice: 4500,
        onOffer: true,
      });
    });

    it('E2-2 searches name and description, and sorts', async () => {
      const q = await request(server())
        .get('/api/v1/products?q=necklace')
        .expect(200);
      expect(q.body.data.map((p: Doc) => p.slug)).toEqual(['gift-1']);
      const pop = await request(server())
        .get('/api/v1/products?sort=popularity')
        .expect(200);
      expect(pop.body.data.map((p: Doc) => p.slug)).toEqual([
        'gift-2',
        'gift-1',
        'gift-3',
      ]);
      const newest = await request(server())
        .get('/api/v1/products?sort=newest')
        .expect(200);
      expect(newest.body.data[0].slug).toBe('gift-3');
    });

    it('E2-1 paginates', async () => {
      const res = await request(server())
        .get('/api/v1/products?pageSize=2&page=2')
        .expect(200);
      expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(res.body.data).toHaveLength(1);
    });

    it('E2-3 returns a product, 404 for an unknown or inactive slug', async () => {
      const ok = await request(server())
        .get('/api/v1/products/gift-2')
        .expect(200);
      expect(ok.body).toMatchObject({
        name: 'Photo Book',
        effectivePrice: 4500,
      });
      await request(server()).get('/api/v1/products/gift-4').expect(404);
    });

    it('E2-4 lists a taxonomy with gift counts, and serves a hub grid', async () => {
      const list = await request(server())
        .get('/api/v1/taxonomy/sentiments')
        .expect(200);
      expect(list.body.map((t: Doc) => [t.slug, t.productCount])).toEqual([
        ['i-miss-you', 2],
        ['im-sorry', 2],
      ]);
      const hub = await request(server())
        .get('/api/v1/taxonomy/sentiments/im-sorry')
        .expect(200);
      expect(hub.body.hub.name).toBe("I'm sorry");
      expect(hub.body.products.total).toBe(2);
      await request(server())
        .get('/api/v1/taxonomy/sentiments/unknown')
        .expect(404);
      await request(server()).get('/api/v1/taxonomy/colours').expect(404);
    });

    it('sets a cache header on catalogue reads', async () => {
      const res = await request(server()).get('/api/v1/products').expect(200);
      expect(res.headers['cache-control']).toContain('max-age=60');
    });
  });
});
