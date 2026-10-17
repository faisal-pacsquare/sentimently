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

describe('Deleting reviews and orders (e2e)', () => {
  let app: INestApplication;
  let admin = '';
  let staff = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const stock = async (slug: string) =>
    (
      await request(server())
        .get(api(`/products/${slug}`))
        .expect(200)
    ).body.stock as number;

  const order = (
    id: string,
    status: string,
    productId: string,
    extra: Record<string, unknown> = {},
  ) =>
    doc({
      id,
      number: `SN-${id.toUpperCase()}`,
      status,
      customerId: 'c1',
      paymentMethod: 'cod',
      currency: 'PKR',
      total: 2000,
      lines: [
        {
          productId,
          slug: 'x',
          name: 'x',
          type: 'physical',
          quantity: 2,
          unitPrice: 1000,
          stockReserved: true,
        },
      ],
      events: [],
      ...extra,
    });

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
    const gift = (id: string, slug: string) =>
      doc({
        id,
        slug,
        name: slug,
        description: 'A gift',
        price: 1000,
        type: 'physical',
        stock: 10,
        category: 'home',
        isActive: true,
        imageUrls: [],
        rating: 4,
        reviewCount: 2,
      });
    const review = (id: string, productId: string, rating: number) =>
      doc({
        id,
        productId,
        customerId: id,
        rating,
        text: 'ok',
        verified: true,
        status: 'published',
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
          reviews: [
            review('r1', 'p1', 5),
            review('r2', 'p1', 3),
            review('r3', 'p2', 1),
          ],
          orders: [
            order('o1', 'cancelled', 'p1', { giftLinkId: 'gl1' }),
            order('o2', 'delivered', 'p1'),
            order('o3', 'placed', 'p1'),
            order('o4', 'paid', 'p2'),
            order('o5', 'dispatched', 'p2'),
            order('o6', 'in_production', 'p2'),
          ],
          payments: [
            doc({
              id: 'pay1',
              orderId: 'o1',
              method: 'cod',
              status: 'pending',
              amount: 2000,
            }),
            doc({
              id: 'pay4',
              orderId: 'o4',
              method: 'cod',
              status: 'pending',
              amount: 2000,
            }),
          ],
          digitalGifts: [
            doc({ id: 'dg1', orderId: 'o1', status: 'scheduled' }),
            doc({ id: 'dg4', orderId: 'o4', status: 'scheduled' }),
          ],
          giftLinks: [doc({ id: 'gl1', orderId: 'o1', isClaimed: false })],
          returns: [doc({ id: 'ret1', orderId: 'o1', orderNumber: 'SN-O1' })],
          refunds: [doc({ id: 'ref1', orderId: 'o1' })],
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

  describe('reviews', () => {
    const del = (id: string, token = admin) =>
      request(server())
        .delete(api(`/admin/reviews/${id}`))
        .set(auth(token));

    it('is for administrators only; staff can still hide', async () => {
      await request(server()).delete(api('/admin/reviews/r1')).expect(401);
      await del('r1', staff).expect(403);
      await request(server())
        .patch(api('/admin/reviews/r1'))
        .set(auth(staff))
        .send({ status: 'hidden' })
        .expect(200);
    });

    it('removes the review and works out the gift rating again without it', async () => {
      await del('r1').expect(204);
      const all = (
        await request(server())
          .get(api('/admin/reviews'))
          .set(auth(admin))
          .expect(200)
      ).body as { id: string }[];
      expect(all.map((r) => r.id).sort()).toEqual(['r2', 'r3']);
      const mug = (
        await request(server()).get(api('/products/mug')).expect(200)
      ).body;
      expect(mug).toMatchObject({ rating: 3, reviewCount: 1 });
      await del('r2').expect(204);
      const empty = (
        await request(server()).get(api('/products/mug')).expect(200)
      ).body;
      expect(empty.rating ?? null).toBeNull();
      expect(empty.reviewCount).toBe(0);
      await del('r2').expect(404);
    });
  });

  describe('orders', () => {
    const del = (id: string, token = admin) =>
      request(server())
        .delete(api(`/admin/orders/${id}`))
        .set(auth(token));
    const ids = async () => {
      const res = await request(server())
        .get(api('/admin/orders'))
        .query({ pageSize: 100 })
        .set(auth(admin))
        .expect(200);
      return ((res.body.data ?? res.body) as { id: string }[])
        .map((o) => o.id)
        .sort();
    };

    it('is for administrators only', async () => {
      await request(server()).delete(api('/admin/orders/o1')).expect(401);
      await del('o1', staff).expect(403);
      expect(await ids()).toContain('o1');
    });

    it('removes a cancelled order with its payments, returns, refunds, gift link and digital gifts, and nothing of any other order', async () => {
      const res = await del('o1').expect(200);
      expect(res.body).toEqual({
        number: 'SN-O1',
        removed: { payments: 1, digitalGifts: 1, returns: 1, refunds: 1 },
      });
      expect(await ids()).toEqual(['o2', 'o3', 'o4', 'o5', 'o6']);
      await del('o1').expect(404); // already gone
    });

    it.each([
      ['o2', 'delivered'],
      ['o3', 'placed'],
      ['o4', 'paid'],
      ['o5', 'dispatched'],
      ['o6', 'in production'],
    ])(
      'refuses an order that is not cancelled (%s, %s) and changes nothing',
      async (id) => {
        const res = await del(id).expect(409);
        expect(res.body.error.message).toMatch(
          /Only cancelled orders can be deleted/,
        );
        expect(await ids()).toContain(id);
      },
    );

    it('leaves the stock alone: cancelling already put it back', async () => {
      expect(await stock('mug')).toBe(10);
      await del('o1').expect(200);
      expect(await stock('mug')).toBe(10);
    });
  });
});
