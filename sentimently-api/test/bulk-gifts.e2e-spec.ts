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

describe('Several gifts at once (e2e)', () => {
  let app: INestApplication;
  let admin = '';
  let staff = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    const gift = (id: string) =>
      doc({
        id,
        slug: `gift-${id}`,
        name: `Gift ${id}`,
        description: 'A gift',
        price: 1000,
        type: 'physical',
        stock: 5,
        category: 'home',
        isActive: true,
        imageUrls: [],
      });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy: [
            doc({ id: 't1', kind: 'category', slug: 'home', name: 'Home' }),
          ],
          extras: [],
          products: ['a', 'b', 'c', 'd'].map(gift),
          wishlists: ['a', 'b', 'd'].map((p) =>
            doc({ id: `c1:${p}`, customerId: 'c1', productId: p }),
          ),
          reviews: ['a', 'c'].map((p) =>
            doc({ id: `r-${p}`, productId: p, status: 'published' }),
          ),
          customers: [user('admin', 'admin'), user('staff', 'staff')],
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
    admin = await login('admin');
    staff = await login('staff');
  });

  afterEach(() => app.close());

  const post = (path: string, token: string, body: unknown) =>
    request(server())
      .post(api(path))
      .set(auth(token))
      .send(body as object);
  const ids = async () =>
    (
      (
        await request(server())
          .get(api('/admin/products'))
          .set(auth(admin))
          .expect(200)
      ).body as { id: string }[]
    ).map((p) => p.id);

  it('bulk delete is for administrators only', async () => {
    await request(server())
      .post(api('/admin/products/bulk-delete'))
      .send({ ids: ['a'] })
      .expect(401);
    await post('/admin/products/bulk-delete', staff, { ids: ['a'] }).expect(
      403,
    );
    expect(await ids()).toHaveLength(4);
  });

  it('deletes the picked gifts and what hangs off them, and only those', async () => {
    const res = await post('/admin/products/bulk-delete', admin, {
      ids: ['a', 'b', 'nope'],
    }).expect(200);
    expect(res.body).toEqual({ deleted: 2, notFound: 1 });
    expect(await ids()).toEqual(['c', 'd']);
    await request(server()).get(api('/products/gift-a')).expect(404);
    await request(server()).get(api('/products/gift-c')).expect(200);
    // asking again is harmless
    const again = await post('/admin/products/bulk-delete', admin, {
      ids: ['a', 'b'],
    }).expect(200);
    expect(again.body).toEqual({ deleted: 0, notFound: 2 });
  });

  it('refuses an empty list, too long a list, repeats and non-text ids', async () => {
    await post('/admin/products/bulk-delete', admin, { ids: [] }).expect(400);
    await post('/admin/products/bulk-delete', admin, {
      ids: ['a', 'a'],
    }).expect(400);
    await post('/admin/products/bulk-delete', admin, { ids: [1] }).expect(400);
    await post('/admin/products/bulk-delete', admin, {}).expect(400);
    await post('/admin/products/bulk-delete', admin, {
      ids: Array.from({ length: 201 }, (_, i) => `x${i}`),
    }).expect(400);
    expect(await ids()).toHaveLength(4);
  });

  it('staff can hide and show several gifts at once', async () => {
    const hide = await post('/admin/products/bulk-visibility', staff, {
      ids: ['a', 'b'],
      visible: false,
    }).expect(200);
    expect(hide.body).toEqual({ changed: 2 });
    const shop = await request(server()).get(api('/products')).expect(200);
    expect(shop.body.data.map((p: { slug: string }) => p.slug).sort()).toEqual([
      'gift-c',
      'gift-d',
    ]);
    const show = await post('/admin/products/bulk-visibility', staff, {
      ids: ['a', 'b', 'c'],
      visible: true,
    }).expect(200);
    expect(show.body).toEqual({ changed: 2 }); // c was already showing
    const again = await request(server()).get(api('/products')).expect(200);
    expect(again.body.total).toBe(4);
    await post('/admin/products/bulk-visibility', staff, { ids: ['a'] }).expect(
      400,
    );
  });
});
