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

const T = '2026-11-01T00:00:00.000Z';
const doc = (o: Record<string, unknown>) =>
  ({ createdAt: T, updatedAt: T, ...o }) as Doc;

const TAXONOMY = [
  'kind,slug,name,blurb,image,sortOrder',
  'category,home,Home,,,1',
  'category,ribbon,Ribbon flowers,,,2',
  'occasion,eid,Eid,,,1',
].join('\n');
const HEAD =
  'slug,name,description,price,offerPrice,type,digitalKind,stock,category,sentiments,occasions,recipients,allowedExtras,isMadeToOrder,leadTimeMinDays,leadTimeMaxDays,isPerishable,isActive,imageUrls';
const row = (slug: string, name: string, category: string) =>
  `${slug},${name},"A lovely, hand-made gift.",1200,,physical,,5,${category},,eid,,,no,,,no,yes,/images/demo/${slug}.svg`;

describe('Add gifts from a spreadsheet (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  let staff = '';
  let buyer = '';

  beforeEach(async () => {
    Object.assign(process.env, {
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_MAX: '1000',
      AUTH_RATE_LIMIT: '1000',
    });
    const pw = await hashPassword('staff-password-1');
    const user = (id: string, role: string) =>
      doc({
        id,
        email: `${id}@x.pk`,
        role,
        authProvider: 'email',
        isGuest: false,
        passwordHash: pw,
        emailVerified: true,
      });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy: [
            doc({
              id: 't1',
              kind: 'category',
              slug: 'home',
              name: 'Home',
              sortOrder: 1,
            }),
            doc({
              id: 't2',
              kind: 'occasion',
              slug: 'eid',
              name: 'Eid',
              sortOrder: 1,
            }),
          ],
          extras: [],
          products: [
            doc({
              id: 'p1',
              slug: 'mug',
              name: 'Photo mug (edited by the studio)',
              description: 'A mug',
              price: 999,
              type: 'physical',
              stock: 5,
              category: 'home',
              isActive: true,
              imageUrls: [
                'https://abc.public.blob.vercel-storage.com/gifts/mine.jpg',
              ],
            }),
          ],
          customers: [user('staff', 'staff'), user('buyer', 'customer')],
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    const login = async (id: string) =>
      (
        await request(server())
          .post(api('/auth/login'))
          .send({ email: `${id}@x.pk`, password: 'staff-password-1' })
          .expect(200)
      ).body.accessToken as string;
    staff = await login('staff');
    buyer = await login('buyer');
  });

  afterEach(() => app.close());

  const send = (body: Record<string, unknown>, token = staff) =>
    request(server())
      .post(api('/admin/catalogue/import'))
      .set({ Authorization: `Bearer ${token}` })
      .send(body);
  const files = (...rows: string[]) => ({
    taxonomyCsv: TAXONOMY,
    productsCsv: [HEAD, ...rows].join('\n'),
  });

  it('is for studio staff only', async () => {
    await request(server())
      .post(api('/admin/catalogue/import'))
      .send(files())
      .expect(401);
    await send(files(row('rose-1', 'Rose', 'ribbon')), buyer).expect(403);
  });

  it('adds new gifts and a new group, and the shop serves them', async () => {
    const res = await send(
      files(row('rose-1', 'Ribbon rose', 'ribbon')),
    ).expect(200);
    expect(res.body).toMatchObject({
      saved: true,
      addedGifts: ['Ribbon rose'],
      skippedGifts: [],
      addedGroups: ['category: Ribbon flowers'],
    });
    const list = await request(server()).get(api('/products')).expect(200);
    const slugs = list.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual(expect.arrayContaining(['mug', 'rose-1']));
    const cats = await request(server())
      .get(api('/taxonomy/categories'))
      .expect(200);
    expect(cats.body.map((c: { slug: string }) => c.slug)).toEqual([
      'home',
      'ribbon',
    ]);
  });

  it('never overwrites a gift that is already in the shop, and adding the same files twice changes nothing', async () => {
    const rows = [
      row('mug', 'Mug from the file', 'home'),
      row('rose-1', 'Ribbon rose', 'ribbon'),
    ];
    const first = await send(files(...rows)).expect(200);
    expect(first.body.skippedGifts).toEqual(['Mug from the file']);
    const mug = await request(server()).get(api('/products/mug')).expect(200);
    expect(mug.body).toMatchObject({
      name: 'Photo mug (edited by the studio)',
      price: 999,
    });
    expect(mug.body.imageUrls).toEqual([
      'https://abc.public.blob.vercel-storage.com/gifts/mine.jpg',
    ]);
    const again = await send(files(...rows)).expect(200);
    expect(again.body).toMatchObject({ addedGifts: [], addedGroups: [] });
    const all = await request(server())
      .get(api('/admin/products'))
      .set({ Authorization: `Bearer ${staff}` })
      .expect(200);
    expect(all.body).toHaveLength(2);
  });

  it('a check-only run saves nothing', async () => {
    const res = await send({
      ...files(row('rose-1', 'Ribbon rose', 'ribbon')),
      dryRun: true,
    }).expect(200);
    expect(res.body).toMatchObject({
      saved: false,
      addedGifts: ['Ribbon rose'],
    });
    const all = await request(server())
      .get(api('/admin/products'))
      .set({ Authorization: `Bearer ${staff}` })
      .expect(200);
    expect(all.body).toHaveLength(1);
  });

  it('saves nothing at all if any row is wrong, and says which', async () => {
    const res = await send(
      files(
        row('rose-1', 'Ribbon rose', 'ribbon'),
        row('bad-one', 'Bad', 'no-such-category'),
      ),
    ).expect(400);
    expect(res.body.error.details.join(' ')).toMatch(
      /line 3.*no-such-category/,
    );
    const all = await request(server())
      .get(api('/admin/products'))
      .set({ Authorization: `Bearer ${staff}` })
      .expect(200);
    expect(all.body).toHaveLength(1);
  });

  it('works with only a products file when the groups already exist', async () => {
    const res = await send({
      productsCsv: [HEAD, row('rose-2', 'Another rose', 'home')].join('\n'),
    }).expect(200);
    expect(res.body.addedGifts).toEqual(['Another rose']);
  });

  it('refuses a request without a products file', async () => {
    await send({ taxonomyCsv: TAXONOMY }).expect(400);
  });
});
