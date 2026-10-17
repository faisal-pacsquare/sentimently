import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { setupApp } from '../src/setup';
import { MemoryDriver } from '../src/storage/memory.driver';
import { Doc, STORAGE_DRIVER } from '../src/storage/storage.types';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');

const read = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8');
const seed = (file: string) =>
  JSON.parse(read('data', `${file}.json`)) as (Doc & Record<string, string>)[];

const NEW_CATEGORIES = [
  'ribbon-flower-bouquets',
  'gajray-and-floral-jewellery',
  'chocolate-bouquets',
];
const NEW_OCCASIONS = ['mehndi', 'engagement'];

/**
 * The ribbon flower, gajray and chocolate bouquet gifts ship as a seed and as two spreadsheets for a shop that is already live.
 * This takes the seed without them (what a live shop has today), uploads the spreadsheets as the studio would, and checks the result.
 */
describe('The new gifts spreadsheets (e2e)', () => {
  let app: INestApplication;
  let staff = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const auth = () => ({ Authorization: `Bearer ${staff}` });

  beforeEach(async () => {
    Object.assign(process.env, {
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT: '1000',
    });
    const pw = await hashPassword('staff-password-1');
    const liveToday = {
      taxonomy: seed('taxonomy').filter(
        (t) =>
          !(t.kind === 'category' && NEW_CATEGORIES.includes(t.slug)) &&
          !(t.kind === 'occasion' && NEW_OCCASIONS.includes(t.slug)) &&
          // this shop has no "just because" feeling (deleted or renamed): the import must cope
          !(t.kind === 'sentiment' && t.slug === 'just-because'),
      ),
      products: seed('products').filter(
        (p) => !NEW_CATEGORIES.includes(p.category),
      ),
      extras: seed('extras'),
      customers: [
        {
          id: 's1',
          email: 'staff@x.pk',
          role: 'staff',
          authProvider: 'email',
          isGuest: false,
          passwordHash: pw,
          emailVerified: true,
          createdAt: 'x',
          updatedAt: 'x',
        } as unknown as Doc,
      ],
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(new MemoryDriver(liveToday))
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    staff = (
      await request(server())
        .post(api('/auth/login'))
        .send({ email: 'staff@x.pk', password: 'staff-password-1' })
        .expect(200)
    ).body.accessToken as string;
  });

  afterEach(() => app.close());

  it('adds 26 gifts in 3 new categories and 2 new occasions, and they are bought like any other gift', async () => {
    const files = {
      taxonomyCsv: read('samples', 'new-gifts', 'new-groups.csv'),
      productsCsv: read('samples', 'new-gifts', 'new-gifts.csv'),
    };
    const before = (
      await request(server())
        .get(api('/admin/products'))
        .set(auth())
        .expect(200)
    ).body.length;

    const check = await request(server())
      .post(api('/admin/catalogue/import'))
      .set(auth())
      .send({ ...files, dryRun: true })
      .expect(200);
    expect(check.body.addedGifts).toHaveLength(26);
    expect(check.body.addedGroups).toHaveLength(5);
    expect(check.body.warnings).toEqual([
      expect.stringMatching(
        /sentiment "just-because" is not in your shop, so \d+ gifts were added without it/,
      ),
    ]);

    await request(server())
      .post(api('/admin/catalogue/import'))
      .set(auth())
      .send(files)
      .expect(200);
    const after = (
      await request(server())
        .get(api('/admin/products'))
        .set(auth())
        .expect(200)
    ).body;
    expect(after).toHaveLength(before + 26);

    const cats = (
      await request(server()).get(api('/taxonomy/categories')).expect(200)
    ).body;
    expect(cats.map((c: { slug: string }) => c.slug)).toEqual(
      expect.arrayContaining(NEW_CATEGORIES),
    );
    const bouquets = await request(server())
      .get(api('/products'))
      .query({ category: 'ribbon-flower-bouquets', pageSize: 50 })
      .expect(200);
    expect(bouquets.body.total).toBe(15);
    expect(
      bouquets.body.data.every((p: { imageUrls: string[] }) =>
        p.imageUrls[0]?.startsWith('/images/demo/'),
      ),
    ).toBe(true);

    // And a second upload of the same files adds nothing.
    const again = await request(server())
      .post(api('/admin/catalogue/import'))
      .set(auth())
      .send(files)
      .expect(200);
    expect(again.body).toMatchObject({ addedGifts: [], addedGroups: [] });
    expect(again.body.skippedGifts).toHaveLength(26);
  });
});
