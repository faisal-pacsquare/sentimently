import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { CLOCK } from '../src/pricing/pricing.service';
import { setupApp } from '../src/setup';
import { JsonStore } from '../src/storage/json-store.service';
import { MemoryDriver } from '../src/storage/memory.driver';
import { Doc, STORAGE_DRIVER } from '../src/storage/storage.types';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');

const T = '2026-11-01T00:00:00.000Z';
const seed = (file: string) =>
  JSON.parse(
    readFileSync(join(__dirname, '../data', `${file}.json`), 'utf8'),
  ) as Doc[];
const doc = (o: Record<string, unknown>) =>
  ({ createdAt: T, updatedAt: T, ...o }) as Doc;
const T0 = '2026-11-18T05:00:00Z';
const address = {
  city: 'Karachi',
  address: 'House 12, Street 4, DHA Phase 5',
  phone: '03001234567',
};
const PASSWORD = 'password-12345';

describe('Privacy (e2e)', () => {
  let app: INestApplication;
  let now = new Date(T0);
  let staff = '';
  let admin = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const store = () => app.get(JsonStore);

  async function boot(env: Record<string, string> = {}) {
    now = new Date(T0);
    Object.assign(
      process.env,
      {
        RATE_LIMIT_MAX: '100000',
        AUTH_RATE_LIMIT: '100000',
        CHECKOUT_RATE_LIMIT: '100000',
        JWT_SECRET: 'test-secret',
        CRON_SECRET: 'cron-secret-for-tests',
      },
      env,
    );
    const pw = await hashPassword(PASSWORD);
    const [cfg] = seed('storeConfig');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          products: [
            doc({
              id: 'mug',
              slug: 'mug',
              name: 'Mug',
              description: 'd',
              price: 800,
              type: 'physical',
              stock: 50,
              category: 'gifts',
              isActive: true,
            }),
            doc({
              id: 'card',
              slug: 'card',
              name: 'Card',
              description: 'd',
              price: 500,
              type: 'digital',
              digitalKind: 'greeting',
              stock: 50,
              category: 'gifts',
              isActive: true,
            }),
          ],
          extras: seed('extras'),
          promoCodes: seed('promoCodes'),
          storeConfig: [cfg],
          customers: [
            doc({
              id: 'staff',
              email: 'staff@example.pk',
              role: 'staff',
              isGuest: false,
              authProvider: 'email',
              passwordHash: pw,
            }),
            doc({
              id: 'admin',
              email: 'admin@example.pk',
              role: 'admin',
              isGuest: false,
              authProvider: 'email',
              passwordHash: pw,
            }),
          ],
        }),
      )
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    const login = async (email: string) =>
      (
        await request(server())
          .post(api('/auth/login'))
          .send({ email, password: PASSWORD })
          .expect(200)
      ).body.accessToken as string;
    staff = await login('staff@example.pk');
    admin = await login('admin@example.pk');
  }

  beforeEach(() => boot());
  afterEach(async () => {
    await app.close();
    for (const k of [
      'RATE_LIMIT_MAX',
      'AUTH_RATE_LIMIT',
      'CHECKOUT_RATE_LIMIT',
      'CRON_SECRET',
      'RETENTION_DAYS',
    ])
      delete process.env[k];
  });

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const register = async (email: string, name = 'Ayesha Khan') =>
    (
      await request(server())
        .post(api('/auth/register'))
        .send({ email, password: PASSWORD, name })
        .expect(201)
    ).body.accessToken as string;
  const place = async (
    email: string,
    token?: string,
    extra: Record<string, unknown> = {},
  ) => {
    const body = {
      lines: [
        {
          productId: 'mug',
          quantity: 1,
          personalisation: {
            recipientName: 'Maryam',
            relationship: 'friend',
            cardDesign: 'classic',
            message: 'Private words of love',
          },
        },
      ],
      delivery: address,
      contact: token
        ? {}
        : { email, name: 'Guest Person', phone: '03111111111' },
      paymentMethod: 'cod',
      ...extra,
    };
    const r = request(server()).post(api('/checkout')).send(body);
    const res = await (token ? r.set(bearer(token)) : r).expect(201);
    return {
      id: res.body.order.id as string,
      number: res.body.order.number as string,
    };
  };
  const move = (id: string, status: string) =>
    request(server())
      .post(api(`/admin/orders/${id}/status`))
      .set(bearer(staff))
      .send({ status });
  const finish = async (id: string) => {
    for (const s of ['preparing', 'dispatched', 'delivered'])
      await move(id, s).expect(200);
  };
  const adminOrder = async (id: string) =>
    (
      await request(server())
        .get(api(`/admin/orders/${id}`))
        .set(bearer(staff))
        .expect(200)
    ).body;

  it('exports everything held about the person, and no secrets', async () => {
    const token = await register('export@example.pk');
    await place('export@example.pk', token);
    await request(server())
      .put(api('/me/wishlist/mug'))
      .set(bearer(token))
      .expect(204);
    await request(server())
      .post(api('/me/reminders'))
      .set(bearer(token))
      .send({ label: 'Mum', date: '2026-12-01' })
      .expect(201);

    const res = await request(server())
      .get(api('/me/export'))
      .set(bearer(token))
      .expect(200);
    expect(res.body.account).toMatchObject({
      email: 'export@example.pk',
      name: 'Ayesha Khan',
    });
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].delivery.address).toBe(address.address);
    expect(res.body.wishlist).toEqual(['mug']);
    expect(res.body.reminders).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(
      /passwordHash|scrypt|idempotencyKey/,
    );
    await request(server()).get(api('/me/export')).expect(401);
  });

  it('deleting an account needs the password, removes the person, and keeps the books', async () => {
    const token = await register('gone@example.pk');
    const o = await place('gone@example.pk', token);
    await finish(o.id);
    await request(server())
      .post(api('/products/mug/reviews'))
      .set(bearer(token))
      .send({ rating: 4, text: 'Nice mug, my address is ...' })
      .expect(201);
    await request(server())
      .put(api('/me/wishlist/mug'))
      .set(bearer(token))
      .expect(204);

    await request(server())
      .delete(api('/me'))
      .set(bearer(token))
      .send({ password: 'wrong-password' })
      .expect(403);
    await request(server())
      .delete(api('/me'))
      .set(bearer(token))
      .send({})
      .expect(403);
    await request(server())
      .delete(api('/me'))
      .set(bearer(token))
      .send({ password: PASSWORD })
      .expect(204);

    // signed out everywhere, at once
    await request(server()).get(api('/me')).set(bearer(token)).expect(401);
    await request(server())
      .post(api('/auth/login'))
      .send({ email: 'gone@example.pk', password: PASSWORD })
      .expect(401);

    // the order stays for the accounts, but says nothing about who or where
    const kept = (await adminOrder(o.id)).order;
    expect(kept).toMatchObject({
      total: 1150,
      status: 'delivered',
      city: 'Karachi',
      anonymisedAt: expect.any(String),
    });
    expect(JSON.stringify(kept)).not.toMatch(
      /gone@example|Ayesha|House 12|03001234567|Private words|Maryam/,
    );
    await request(server())
      .post(api('/orders/track'))
      .send({ number: o.number, email: 'gone@example.pk' })
      .expect(404);

    // rating stays, the written review and the personal lists go
    const reviews = await request(server())
      .get(api('/products/mug/reviews'))
      .expect(200);
    expect(reviews.body[0]).toMatchObject({ rating: 4, author: 'Customer' });
    expect(reviews.body[0].text).toBeUndefined();
    expect(await store().find('wishlists', () => true)).toEqual([]);

    // the email is free to use again
    await register('gone@example.pk', 'Second Life');
  });

  it('refuses to delete while an order is still on its way', async () => {
    const token = await register('busy@example.pk');
    const o = await place('busy@example.pk', token);
    const res = await request(server())
      .delete(api('/me'))
      .set(bearer(token))
      .send({ password: PASSWORD })
      .expect(409);
    expect(res.body.error.message).toMatch(/still in progress/);
    await move(o.id, 'cancelled').expect(200);
    await request(server())
      .delete(api('/me'))
      .set(bearer(token))
      .send({ password: PASSWORD })
      .expect(204);
  });

  it('erases digital-gift recipients and gift-link recipients too', async () => {
    const token = await register('giver@example.pk');
    const link = await request(server())
      .post(api('/checkout'))
      .set(bearer(token))
      .send({
        lines: [{ productId: 'mug', quantity: 1 }],
        delivery: { city: 'Karachi', method: 'gift_link' },
        contact: {},
        paymentMethod: 'bank_transfer',
      })
      .expect(201);
    const t = link.body.giftLink.url.split('/gift/')[1];
    await request(server())
      .post(api(`/gift-links/${t}/claim`))
      .send({
        address: 'Flat 5, Rose Apartments, Gulshan',
        phone: '03229999999',
        name: 'Recipient',
      })
      .expect(200);
    await move(link.body.order.id, 'cancelled').expect(200);

    const digital = await request(server())
      .post(api('/checkout'))
      .set(bearer(token))
      .send({
        lines: [
          {
            productId: 'card',
            quantity: 1,
            digital: {
              recipientEmail: 'friend@example.pk',
              message: 'Secret note',
            },
          },
        ],
        contact: {},
        paymentMethod: 'bank_transfer',
      })
      .expect(201);
    await move(digital.body.order.id, 'paid').expect(200);

    await request(server())
      .delete(api('/me'))
      .set(bearer(token))
      .send({ password: PASSWORD })
      .expect(204);
    const everything = JSON.stringify([
      await store().all('giftLinks'),
      await store().all('digitalGifts'),
    ]);
    expect(everything).not.toMatch(
      /Rose Apartments|03229999999|Recipient|friend@example|Secret note|giver@example/,
    );
  });

  it('support can erase a guest by email; only an admin can', async () => {
    const o = await place('guest@example.pk');
    await finish(o.id);
    await request(server())
      .post(api('/admin/privacy/erase'))
      .set(bearer(staff))
      .send({ email: 'guest@example.pk' })
      .expect(403);
    expect(
      (
        await request(server())
          .post(api('/admin/privacy/erase'))
          .set(bearer(admin))
          .send({ email: 'nobody@example.pk' })
          .expect(200)
      ).body,
    ).toEqual({ erased: false });
    expect(
      (
        await request(server())
          .post(api('/admin/privacy/erase'))
          .set(bearer(admin))
          .send({ email: 'Guest@Example.pk' })
          .expect(200)
      ).body,
    ).toEqual({ erased: true });
    expect(JSON.stringify(await adminOrder(o.id))).not.toMatch(
      /guest@example|Guest Person|House 12|03111111111/,
    );
  });

  it('retention: finished orders lose personal details after the retention period, recent ones do not', async () => {
    const old = await place('old@example.pk');
    await finish(old.id);
    now = new Date(Date.parse(T0) + 800 * 86_400_000);
    const recent = await place('recent@example.pk');
    await finish(recent.id);

    const run = await request(server())
      .get(api('/internal/scheduler/run'))
      .set('Authorization', 'Bearer cron-secret-for-tests')
      .expect(200);
    expect(run.body.ordersAnonymised).toBe(1);
    expect(JSON.stringify(await adminOrder(old.id))).not.toMatch(
      /old@example|House 12/,
    );
    expect((await adminOrder(recent.id)).order.contactEmail).toBe(
      'recent@example.pk',
    );
    const again = await request(server())
      .get(api('/internal/scheduler/run'))
      .set('Authorization', 'Bearer cron-secret-for-tests')
      .expect(200);
    expect(again.body.ordersAnonymised).toBe(0);
  });

  it('the retention period can be changed, and unfinished orders are never touched', async () => {
    process.env.RETENTION_DAYS = '30';
    const inProgress = await place('waiting@example.pk');
    now = new Date(Date.parse(T0) + 60 * 86_400_000);
    const run = await request(server())
      .get(api('/internal/scheduler/run'))
      .set('Authorization', 'Bearer cron-secret-for-tests')
      .expect(200);
    expect(run.body.ordersAnonymised).toBe(0);
    expect((await adminOrder(inProgress.id)).order.contactEmail).toBe(
      'waiting@example.pk',
    );
  });
});
