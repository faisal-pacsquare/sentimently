import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

const T = '2026-11-01T00:00:00.000Z';
const doc = (o: Record<string, unknown>) =>
  ({ createdAt: T, updatedAt: T, ...o }) as Doc;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);

describe('Deleting a gift for good (e2e)', () => {
  let app: INestApplication;
  let dir: string;
  let admin = '';
  let staff = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bloomora-e2e-'));
    Object.assign(process.env, {
      UPLOAD_DIR: dir,
      JWT_SECRET: 'test-secret',
      RATE_LIMIT_MAX: '1000',
      AUTH_RATE_LIMIT: '1000',
    });
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
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
    const gift = (id: string, slug: string, imageUrls: string[] = []) =>
      doc({
        id,
        slug,
        name: slug,
        description: 'A gift',
        price: 1000,
        type: 'physical',
        stock: 5,
        category: 'home',
        isActive: true,
        imageUrls,
      });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy: [
            doc({ id: 't1', kind: 'category', slug: 'home', name: 'Home' }),
          ],
          extras: [],
          products: [gift('p1', 'mug'), gift('p2', 'candle')],
          wishlists: [
            doc({ id: 'c1:p1', customerId: 'c1', productId: 'p1' }),
            doc({ id: 'c1:p2', customerId: 'c1', productId: 'p2' }),
          ],
          reviews: [
            doc({ id: 'r1', productId: 'p1', status: 'published' }),
            doc({ id: 'r2', productId: 'p2', status: 'published' }),
          ],
          orders: [
            doc({
              id: 'o1',
              number: 'SN-1',
              status: 'delivered',
              lines: [
                { productId: 'p1', slug: 'mug', name: 'mug', quantity: 1 },
              ],
            }),
          ],
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

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  const del = (id: string, token: string) =>
    request(server())
      .delete(api(`/admin/products/${id}/permanent`))
      .set(auth(token));
  const all = async () =>
    (
      await request(server())
        .get(api('/admin/products'))
        .set(auth(admin))
        .expect(200)
    ).body as { id: string }[];

  it('is for administrators only; staff can still hide', async () => {
    await request(server())
      .delete(api('/admin/products/p1/permanent'))
      .expect(401);
    await del('p1', staff).expect(403);
    expect(await all()).toHaveLength(2);
    await request(server())
      .delete(api('/admin/products/p1'))
      .set(auth(staff))
      .expect(204);
    expect(await all()).toHaveLength(2);
  });

  it('removes the gift, its reviews and wishlist entries, and nothing of any other gift', async () => {
    await del('p1', admin).expect(204);
    expect((await all()).map((p) => p.id)).toEqual(['p2']);
    await request(server()).get(api('/products/mug')).expect(404);
    await request(server()).get(api('/products/candle')).expect(200);
    await del('p1', admin).expect(404); // already gone
  });

  it('leaves past orders exactly as they were', async () => {
    await del('p1', admin).expect(204);
    const order = await request(server())
      .get(api('/admin/orders/o1'))
      .set(auth(admin))
      .expect(200);
    const text = JSON.stringify(order.body);
    expect(text).toContain('SN-1');
    expect(text).toContain('"slug":"mug"');
  });

  it('deletes the photos that were uploaded for it, and keeps linked pictures from elsewhere', async () => {
    const up = await request(server())
      .post(api('/admin/images'))
      .set(auth(admin))
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const mine = up.body.url as string;
    await request(server())
      .patch(api('/admin/products/p2'))
      .set(auth(admin))
      .send({ imageUrls: [mine, 'https://example.com/other.jpg'] })
      .expect(200);
    await request(server()).get(mine).expect(200);
    await del('p2', admin).expect(204);
    await request(server()).get(mine).expect(404);
  });
});
