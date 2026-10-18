import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';
import { MemoryDriver } from '../src/storage/memory.driver';
import { Doc, STORAGE_DRIVER } from '../src/storage/storage.types';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');

const T = '2026-11-01T00:00:00.000Z';
const doc = (o: Record<string, unknown>) =>
  ({ createdAt: T, updatedAt: T, ...o }) as Doc;

describe('Search as you type (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;

  const gift = (
    slug: string,
    name: string,
    description: string,
    extra: Record<string, unknown> = {},
  ) =>
    doc({
      id: `p-${slug}`,
      slug,
      name,
      description,
      price: 1000,
      type: 'physical',
      stock: 5,
      category: 'ribbon',
      sentiments: ['love'],
      occasions: [],
      recipients: [],
      isActive: true,
      imageUrls: [`/images/demo/${slug}.svg`],
      reviewCount: 0,
      ...extra,
    });

  beforeEach(async () => {
    Object.assign(process.env, { RATE_LIMIT_MAX: '100000' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy: [
            doc({
              id: 'c1',
              kind: 'category',
              slug: 'ribbon',
              name: 'Ribbon flower bouquets',
            }),
            doc({
              id: 'c2',
              kind: 'category',
              slug: 'empty',
              name: 'Ribbon empty shelf',
            }),
            doc({
              id: 's1',
              kind: 'sentiment',
              slug: 'love',
              name: 'I love you',
            }),
          ],
          extras: [],
          products: [
            gift(
              'red-rose',
              'Ribbon rose bouquet (10)',
              'Ten red satin roses',
              { offerPrice: 800, reviewCount: 1 },
            ),
            gift(
              'rose-trio',
              'Maroon rose trio',
              'Three satin roses with a ribbon bow',
              { reviewCount: 9 },
            ),
            gift('mug', 'Photo mug', 'A ceramic mug', { category: 'home' }),
            gift('hidden-ribbon', 'Ribbon hidden gift', 'Not on the shop', {
              isActive: false,
            }),
            gift('egift', 'Ribbon e-gift card', 'Sent by email', {
              type: 'digital',
            }),
          ],
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  const suggest = (q: string, extra = '') =>
    request(server()).get(
      api(`/search/suggest?q=${encodeURIComponent(q)}${extra}`),
    );
  const slugs = async (q: string, extra = '') =>
    (
      (await suggest(q, extra).expect(200)).body.products as { slug: string }[]
    ).map((p) => p.slug);

  it('offers nothing for no letters or one letter', async () => {
    expect((await suggest('').expect(200)).body).toEqual({
      products: [],
      groups: [],
    });
    expect((await suggest('r').expect(200)).body).toEqual({
      products: [],
      groups: [],
    });
    expect((await suggest('   ').expect(200)).body).toEqual({
      products: [],
      groups: [],
    });
  });

  it('finds gifts by name or description, ignoring case and extra spaces', async () => {
    expect(await slugs('  MUG ')).toEqual(['mug']);
    expect(await slugs('satin')).toEqual(
      expect.arrayContaining(['red-rose', 'rose-trio']),
    );
    const res = await suggest('photo').expect(200);
    expect(res.body.products[0]).toEqual({
      slug: 'mug',
      name: 'Photo mug',
      price: 1000,
      onOffer: false,
      imageUrl: '/images/demo/mug.svg',
    });
  });

  it('puts names that start with what was typed first, then name matches, then description matches', async () => {
    // Two names start with "ribbon" (the better reviewed first); the trio only mentions a ribbon in its description.
    expect(await slugs('ribbon')).toEqual(['red-rose', 'egift', 'rose-trio']);
  });

  it('matches every word, in any order', async () => {
    expect((await slugs('rose ribbon')).sort()).toEqual([
      'red-rose',
      'rose-trio',
    ]);
    expect(await slugs('rose nonsense')).toEqual([]);
  });

  it('shows the price people pay, and says when it is an offer', async () => {
    const res = await suggest('bouquet').expect(200);
    expect(res.body.products[0]).toMatchObject({
      slug: 'red-rose',
      price: 800,
      onOffer: true,
    });
  });

  it('never offers a gift that is hidden, and can leave out digital gifts', async () => {
    expect(await slugs('ribbon')).not.toContain('hidden-ribbon');
    expect(await slugs('ribbon')).toContain('egift');
    expect(await slugs('ribbon', '&type=physical')).not.toContain('egift');
    expect(await slugs('card', '&type=physical')).toEqual([]);
  });

  it('offers the categories, feelings and other groups whose name matches, but only ones with gifts to show', async () => {
    const res = await suggest('ribbon').expect(200);
    expect(res.body.groups).toEqual([
      {
        kind: 'category',
        slug: 'ribbon',
        name: 'Ribbon flower bouquets',
        gifts: 3,
      },
    ]);
    const love = await suggest('love', '&type=physical').expect(200);
    expect(love.body.groups).toEqual([
      { kind: 'sentiment', slug: 'love', name: 'I love you', gifts: 3 },
    ]);
  });

  it('offers at most 6 gifts, and refuses a silly request', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      gift(`bud-${i}`, `Bud vase ${i}`, 'A vase'),
    );
    await app.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(new MemoryDriver({ taxonomy: [], extras: [], products: many }))
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    expect(await slugs('bud')).toHaveLength(6);
    await suggest('x'.repeat(61)).expect(400);
    await request(server())
      .get(api('/search/suggest?type=banana&q=bud'))
      .expect(400);
  });

  it('is public and may be cached for a short while', async () => {
    const res = await suggest('mug').expect(200);
    expect(res.headers['cache-control']).toMatch(/public, max-age=30/);
  });

  it('the main shop search matches every word in any order too', async () => {
    const res = await request(server())
      .get(api('/products?q=ribbon%20rose'))
      .expect(200);
    expect(res.body.data.map((p: { slug: string }) => p.slug).sort()).toEqual([
      'red-rose',
      'rose-trio',
    ]);
  });
});
