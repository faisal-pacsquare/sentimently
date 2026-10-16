import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { ConsoleMailer, MAILER } from '../src/mail/mailer';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
  WebhookEvent,
} from '../src/orders/payment-gateway';
import { SafepayGateway } from '../src/orders/safepay.gateway';
import { CLOCK } from '../src/pricing/pricing.service';
import { setupApp } from '../src/setup';
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
const product = (id: string, over: Record<string, unknown>) =>
  doc({
    id,
    slug: id,
    name: id,
    description: 'd',
    type: 'physical',
    stock: 10,
    category: 'gifts',
    isActive: true,
    ...over,
  });

const products = [
  product('mug', { price: 800, stock: 5 }),
  product('vase', { price: 4000, stock: 5 }),
  product('photo-book', { price: 4500, stock: 1 }),
  product('necklace', {
    price: 3500,
    isMadeToOrder: true,
    leadTimeMinDays: 5,
    leadTimeMaxDays: 5,
    stock: 0,
  }),
  product('egift', {
    price: 5000,
    type: 'digital',
    digitalKind: 'egift',
    stock: 100,
  }),
  product('greeting', {
    price: 500,
    type: 'digital',
    digitalKind: 'greeting',
    stock: 100,
  }),
];

const WED_10AM = '2026-11-18T05:00:00Z'; // 10:00 in Pakistan
const address = {
  city: 'Karachi',
  address: 'House 12, Street 4, DHA Phase 5',
  phone: '03001234567',
};
const contact = { email: 'zara@example.pk', name: 'Zara' };
const cod = (over: Record<string, unknown> = {}) => ({
  lines: [{ productId: 'mug', quantity: 1 }],
  delivery: address,
  contact,
  paymentMethod: 'cod',
  ...over,
});

class FakeGateway implements PaymentGateway {
  available = true;
  constructor(private readonly failToStart = false) {}
  async createCharge(a: { orderNumber: string }) {
    if (this.failToStart) throw new Error('gateway is down');
    return {
      gatewayRef: `ch_${a.orderNumber}`,
      redirectUrl: `https://pay.example/${a.orderNumber}`,
    };
  }
  parseWebhook(headers: Record<string, unknown>, body: unknown): WebhookEvent {
    if (headers['x-signature'] !== 'valid')
      throw new UnauthorizedException('Bad signature');
    return body as WebhookEvent;
  }
}

describe('Orders, payments and digital gifts (e2e)', () => {
  let app: INestApplication;
  let now = new Date(WED_10AM);
  let staff = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const mail = () => app.get<ConsoleMailer>(MAILER).outbox;

  async function boot(
    opts: {
      config?: Record<string, unknown>;
      env?: Record<string, string>;
      gateway?: PaymentGateway;
    } = {},
  ) {
    now = new Date(WED_10AM);
    Object.assign(
      process.env,
      {
        RATE_LIMIT_MAX: '1000',
        AUTH_RATE_LIMIT: '1000',
        CHECKOUT_RATE_LIMIT: '1000',
        JWT_SECRET: 'test-secret',
      },
      opts.env,
    );
    const [cfg] = seed('storeConfig');
    const staffPw = await hashPassword('staff-password-1');
    const builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          products,
          extras: seed('extras'),
          promoCodes: seed('promoCodes'),
          storeConfig: [
            {
              ...cfg,
              bankTransferInstructions: 'Bank X, account 0123',
              ...opts.config,
            },
          ],
          customers: [
            doc({
              id: 'staff1',
              email: 'staff@sentimently.pk',
              role: 'staff',
              isGuest: false,
              authProvider: 'email',
              passwordHash: staffPw,
            }),
          ],
        }),
      )
      .overrideProvider(CLOCK)
      .useValue({ now: () => now });
    if (opts.gateway)
      builder.overrideProvider(PAYMENT_GATEWAY).useValue(opts.gateway);
    app = (await builder.compile()).createNestApplication({ rawBody: true });
    setupApp(app);
    await app.init();
    staff = (
      await request(server())
        .post(api('/auth/login'))
        .send({ email: 'staff@sentimently.pk', password: 'staff-password-1' })
        .expect(200)
    ).body.accessToken;
  }

  afterEach(async () => {
    await app.close();
    for (const k of [
      'RATE_LIMIT_MAX',
      'AUTH_RATE_LIMIT',
      'CHECKOUT_RATE_LIMIT',
      'FEATURE_CARD_PAYMENTS',
      'TRACK_RATE_LIMIT',
      'CODE_CHECK_RATE_LIMIT',
    ])
      delete process.env[k];
  });

  const checkout = (
    body: Record<string, unknown>,
    key?: string,
    token?: string,
  ) => {
    let r = request(server()).post(api('/checkout')).send(body);
    if (key) r = r.set('Idempotency-Key', key);
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    return r;
  };
  const move = (
    id: string,
    status: string,
    extra: Record<string, unknown> = {},
    token?: string,
  ) =>
    request(server())
      .post(api(`/admin/orders/${id}/status`))
      .set('Authorization', `Bearer ${token ?? staff}`)
      .send({ status, ...extra });
  const last = <T>(items: T[]) => items[items.length - 1];
  const stockOf = async (slug: string) =>
    (
      await request(server())
        .get(api(`/products/${slug}`))
        .expect(200)
    ).body.stock as number;
  const adminOrder = async (id: string) =>
    (
      await request(server())
        .get(api(`/admin/orders/${id}`))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200)
    ).body;

  describe('checkout with cash on delivery', () => {
    beforeEach(() => boot());

    it('E5-1 / E5-2 places a guest order, takes stock, emails a confirmation', async () => {
      const res = await checkout(cod()).expect(201);
      expect(res.body.order).toMatchObject({
        status: 'placed',
        paymentMethod: 'cod',
        total: 1150,
        city: 'Karachi',
        sameDay: true,
        deliveryDate: '2026-11-18',
      });
      expect(res.body.order.number).toMatch(/^SN-[A-Z2-9]{8}$/);
      expect(JSON.stringify(res.body)).not.toMatch(/idempotency|tokenHash/);
      expect(await stockOf('mug')).toBe(4);
      const sent = mail().find((m) => m.to === 'zara@example.pk');
      expect(sent?.subject).toContain(res.body.order.number);
      expect(sent?.text).toMatch(/cash on delivery/i);
    });

    it('E5-6 reuses the guest account for a second order by the same email', async () => {
      const a = await checkout(cod()).expect(201);
      const b = await checkout(
        cod({ contact: { ...contact, email: 'ZARA@example.pk' } }),
      ).expect(201);
      expect(a.body.order.customerId).toBe(b.body.order.customerId);
    });

    it('E5-2 needs an address and a phone number for a physical gift', async () => {
      const res = await checkout(cod({ delivery: { city: 'Karachi' } })).expect(
        400,
      );
      expect(res.body.error.details).toEqual([
        'Enter the delivery address',
        'Enter a phone number for the courier',
      ]);
    });

    it('needs an email address', async () => {
      await checkout(cod({ contact: {} })).expect(400);
    });

    it('PY-03 only one of two simultaneous orders for the last item succeeds', async () => {
      const body = cod({ lines: [{ productId: 'photo-book', quantity: 1 }] });
      const results = await Promise.all([
        checkout(body),
        checkout({ ...body, contact: { email: 'other@example.pk' } }),
      ]);
      // The loser is stopped either while pricing (400, "only 0 left") or at the stock step (409, "just sold out"), depending on timing.
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      const lost = results.find((r) => r.status !== 201)!;
      expect([400, 409]).toContain(lost.status);
      expect(JSON.stringify(lost.body.error)).toMatch(
        /just sold out|only 0 of/,
      );
      expect(await stockOf('photo-book')).toBe(0);
    });

    it('a repeated submit with the same Idempotency-Key returns the first order', async () => {
      const first = await checkout(cod(), 'key-1').expect(201);
      const second = await checkout(cod(), 'key-1').expect(201);
      expect(second.body.order.number).toBe(first.body.order.number);
      expect(second.body.replayed).toBe(true);
      expect(await stockOf('mug')).toBe(4); // taken once
      expect(mail().filter((m) => m.to === 'zara@example.pk')).toHaveLength(1);
    });

    it('failed checks do not take stock', async () => {
      await checkout(cod({ delivery: { city: 'Karachi' } })).expect(400);
      expect(await stockOf('mug')).toBe(5);
    });

    it('COD is refused for digital gifts and gift links', async () => {
      const digital = await checkout({
        lines: [
          {
            productId: 'egift',
            quantity: 1,
            digital: { recipientEmail: 'f@example.pk' },
          },
        ],
        contact,
        paymentMethod: 'cod',
      }).expect(400);
      expect(digital.body.error.details).toContain(
        'Cash on delivery is only for gifts delivered to a known address',
      );
      await checkout(
        cod({ delivery: { city: 'Karachi', method: 'gift_link' } }),
      ).expect(400);
    });

    it('PR-05 a first-gift code is used once per customer', async () => {
      const first = await checkout(
        cod({
          lines: [{ productId: 'vase', quantity: 1 }],
          promoCode: 'HELLO10',
        }),
      ).expect(201);
      expect(first.body.order).toMatchObject({
        discount: 400,
        promoCode: 'HELLO10',
        total: 4000 + 350 - 400,
      });
      const second = await checkout(
        cod({
          lines: [{ productId: 'vase', quantity: 1 }],
          promoCode: 'HELLO10',
        }),
      ).expect(201);
      expect(second.body.order).toMatchObject({ discount: 0, total: 4350 });
    });

    it('DL-09 a same-day slot used by an order counts against the daily capacity', async () => {
      await app.close();
      await boot({ config: { sameDayCapacity: { Karachi: 1 } } });
      const first = await checkout(cod()).expect(201);
      expect(first.body.order.sameDay).toBe(true);
      const quote = await request(server())
        .post(api('/quote'))
        .send({
          lines: [{ productId: 'mug', quantity: 1 }],
          delivery: { city: 'Karachi' },
        })
        .expect(200);
      expect(quote.body.delivery.sameDay).toBe(false);
    });
  });

  describe('bank transfer and the order lifecycle', () => {
    beforeEach(() => boot());
    const bank = () =>
      checkout(cod({ paymentMethod: 'bank_transfer' })).expect(201);

    it('E5-3 waits for payment, shows the bank details, and staff confirm it', async () => {
      const res = await bank();
      expect(res.body.order.status).toBe('awaiting_payment');
      expect(res.body.payment.instructions).toBe('Bank X, account 0123');
      expect(mail()[0].text).toContain(res.body.order.number);

      const paid = await move(res.body.order.id, 'paid', {
        note: 'Slip checked',
      }).expect(200);
      expect(paid.body.order.status).toBe('paid');
      expect(paid.body.payments[0].status).toBe('confirmed');
      expect(mail().some((m) => m.subject.includes('payment received'))).toBe(
        true,
      );
    });

    it('E5-7 moves an order through the studio to delivery, with tracking details and emails', async () => {
      const o = (await bank()).body.order;
      await move(o.id, 'paid').expect(200);
      await move(o.id, 'preparing').expect(200);
      await move(o.id, 'dispatched', {
        courier: 'TCS',
        trackingRef: 'T123',
      }).expect(200);
      expect(
        mail().find((m) => m.subject.includes('on its way'))?.text,
      ).toContain('T123');
      await move(o.id, 'failed_delivery').expect(200);
      await move(o.id, 'dispatched').expect(200);
      const done = await move(o.id, 'delivered').expect(200);
      expect(done.body.order.delivery).toMatchObject({
        courier: 'TCS',
        trackingRef: 'T123',
        attempts: 1,
      });
      expect(done.body.order.events.map((e: Doc) => e.to)).toEqual([
        'awaiting_payment',
        'paid',
        'preparing',
        'dispatched',
        'failed_delivery',
        'dispatched',
        'delivered',
      ]);
    });

    it('refuses a move the state machine does not allow', async () => {
      const o = (await bank()).body.order;
      const res = await move(o.id, 'dispatched').expect(409);
      expect(res.body.error.message).toBe(
        'An order that is "awaiting_payment" cannot move to "dispatched"',
      );
    });

    it('OR-01 cancelling before production puts the stock back and cannot be repeated', async () => {
      const o = (await checkout(cod()).expect(201)).body.order;
      expect(await stockOf('mug')).toBe(4);
      await move(o.id, 'cancelled').expect(200);
      expect(await stockOf('mug')).toBe(5);
      await move(o.id, 'cancelled').expect(409);
      expect(await stockOf('mug')).toBe(5);
      expect((await adminOrder(o.id)).payments[0].status).toBe('cancelled');
    });

    it('OR-02 an order in production cannot be cancelled, and the stock stays taken', async () => {
      const personalised = {
        productId: 'necklace',
        quantity: 1,
        personalisation: {
          recipientName: 'Ayesha',
          relationship: 'friend',
          cardDesign: 'classic',
          message: 'Always',
        },
      };
      const o = (
        await checkout(
          cod({
            lines: [personalised],
            delivery: { ...address, date: '2026-11-26' },
          }),
        ).expect(201)
      ).body.order;
      await move(o.id, 'preparing').expect(200);
      await move(o.id, 'in_production').expect(200);
      const res = await move(o.id, 'cancelled').expect(409);
      expect(res.body.error.message).toBe(
        'This order is already in production and can no longer be cancelled',
      );

      const board = await request(server())
        .get(api('/admin/production'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(board.body.inProduction[0].lines[0].personalisation).toMatchObject(
        { recipientName: 'Ayesha', message: 'Always' },
      );
      expect(board.body.preparing).toEqual([]);
    });

    it('cash on delivery counts as paid once delivered', async () => {
      const o = (await checkout(cod()).expect(201)).body.order;
      for (const s of ['preparing', 'dispatched', 'delivered'])
        await move(o.id, s).expect(200);
      expect((await adminOrder(o.id)).payments[0].status).toBe('confirmed');
    });

    it('E5-7 lists and filters the order queue, and keeps it staff-only', async () => {
      const a = (await bank()).body.order;
      await checkout(
        cod({ contact: { email: 'other@example.pk', name: 'Other' } }),
      ).expect(201);
      await move(a.id, 'paid').expect(200);
      const all = await request(server())
        .get(api('/admin/orders'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(all.body.total).toBe(2);
      const paid = await request(server())
        .get(api('/admin/orders?status=paid,placed&q=zara'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(paid.body.data.map((r: Doc) => r.number)).toEqual([a.number]);
      await request(server()).get(api('/admin/orders')).expect(401);
      const customer = (
        await request(server())
          .post(api('/auth/register'))
          .send({ email: 'c@example.pk', password: 'password-123' })
          .expect(201)
      ).body.accessToken;
      await request(server())
        .get(api('/admin/orders'))
        .set('Authorization', `Bearer ${customer}`)
        .expect(403);
      await move(a.id, 'preparing', {}, customer).expect(403);
    });
  });

  describe('tracking and my orders', () => {
    beforeEach(() => boot());

    it('E5-5 / OR-07 shows status and dates, never the address or contact details', async () => {
      const o = (await checkout(cod()).expect(201)).body.order;
      const res = await request(server())
        .post(api('/orders/track'))
        .send({ number: o.number.toLowerCase(), email: 'ZARA@example.pk' })
        .expect(200);
      expect(res.body).toMatchObject({
        number: o.number,
        status: 'placed',
        statusLabel: 'Order received',
        deliveryDate: '2026-11-18',
      });
      expect(res.body.timeline).toHaveLength(1);
      expect(JSON.stringify(res.body)).not.toMatch(
        /House 12|03001234567|zara@|Zara|address|phone|email/i,
      );
    });

    it('E5-5 a wrong email and an unknown number get the same answer', async () => {
      const o = (await checkout(cod()).expect(201)).body.order;
      const wrongEmail = await request(server())
        .post(api('/orders/track'))
        .send({ number: o.number, email: 'someone@else.pk' })
        .expect(404);
      const unknown = await request(server())
        .post(api('/orders/track'))
        .send({ number: 'SN-NOSUCHXX', email: 'zara@example.pk' })
        .expect(404);
      expect(wrongEmail.body.error.message).toBe(unknown.body.error.message);
      expect(wrongEmail.body.error.code).toBe(unknown.body.error.code);
    });

    it('tracking is rate limited', async () => {
      await app.close();
      await boot({ env: { TRACK_RATE_LIMIT: '2' } });
      for (let i = 0; i < 2; i++)
        await request(server())
          .post(api('/orders/track'))
          .send({ number: 'SN-AAAAAAAA', email: 'a@b.pk' })
          .expect(404);
      await request(server())
        .post(api('/orders/track'))
        .send({ number: 'SN-AAAAAAAA', email: 'a@b.pk' })
        .expect(429);
    });

    it('a signed-in customer sees only their own orders', async () => {
      const reg = async (email: string) =>
        (
          await request(server())
            .post(api('/auth/register'))
            .send({ email, password: 'password-123' })
            .expect(201)
        ).body.accessToken as string;
      const mine = await reg('mine@example.pk');
      const theirs = await reg('theirs@example.pk');
      const o = (
        await checkout(cod({ contact: {} }), undefined, mine).expect(201)
      ).body.order;
      const list = await request(server())
        .get(api('/orders'))
        .set('Authorization', `Bearer ${mine}`)
        .expect(200);
      expect(list.body.map((x: Doc) => x.number)).toEqual([o.number]);
      expect(list.body[0].statusLabel).toBe('Order received');
      await request(server())
        .get(api(`/orders/${o.number}`))
        .set('Authorization', `Bearer ${mine}`)
        .expect(200);
      await request(server())
        .get(api(`/orders/${o.number}`))
        .set('Authorization', `Bearer ${theirs}`)
        .expect(404);
      await request(server()).get(api('/orders')).expect(401);
    });

    it('a guest checkout never lands in an account registered by someone else, even one registered with that address', async () => {
      // a stranger registers the address first
      const stranger = (
        await request(server())
          .post(api('/auth/register'))
          .send({ email: 'zara@example.pk', password: 'stranger-pass-1' })
          .expect(201)
      ).body.accessToken as string;
      // the real Zara, not signed in, places an order
      const o = {
        number: (await checkout(cod()).expect(201)).body.order.number as string,
      };
      expect(
        (
          await request(server())
            .get(api('/orders'))
            .set('Authorization', `Bearer ${stranger}`)
            .expect(200)
        ).body,
      ).toEqual([]);
      await request(server())
        .get(api(`/orders/${o.number}`))
        .set('Authorization', `Bearer ${stranger}`)
        .expect(404);
      await request(server())
        .post(api('/me/claim-order'))
        .set('Authorization', `Bearer ${stranger}`)
        .send({ number: o.number, email: 'wrong@example.pk' })
        .expect(404);

      // she can still follow it with her order number and email, and add it to her own account
      await request(server())
        .post(api('/orders/track'))
        .send({ number: o.number, email: 'zara@example.pk' })
        .expect(200);
      const real = (
        await request(server())
          .post(api('/auth/register'))
          .send({ email: 'zara@example.pk', password: 'zaras-own-pass-1' })
          .expect(201)
      ).body.accessToken as string;
      await request(server())
        .post(api('/me/claim-order'))
        .set('Authorization', `Bearer ${real}`)
        .send({ number: o.number, email: 'zara@example.pk' })
        .expect(200);
      expect(
        (
          await request(server())
            .get(api('/orders'))
            .set('Authorization', `Bearer ${real}`)
            .expect(200)
        ).body.map((x: Doc) => x.number),
      ).toEqual([o.number]);
    });

    it('a first-gift code is spent by an earlier guest order, however the person signs up later', async () => {
      await checkout(
        cod({
          lines: [{ productId: 'vase', quantity: 1 }],
          promoCode: 'HELLO10',
          contact: { email: 'first@example.pk', name: 'F' },
        }),
      ).expect(201);
      const token = (
        await request(server())
          .post(api('/auth/register'))
          .send({ email: 'first@example.pk', password: 'first-pass-12345' })
          .expect(201)
      ).body.accessToken as string;
      const q = await request(server())
        .post(api('/quote'))
        .set('Authorization', `Bearer ${token}`)
        .send({
          lines: [{ productId: 'vase', quantity: 1 }],
          delivery: { city: 'Karachi' },
          promoCode: 'HELLO10',
        })
        .expect(200);
      expect(q.body.promo).toMatchObject({
        applied: false,
        reason: 'This code is for a first gift only',
      });
    });

    it('E3-5 a buyer review becomes verified once the order is paid', async () => {
      const token = (
        await request(server())
          .post(api('/auth/register'))
          .send({
            email: 'buyer@example.pk',
            password: 'password-123',
            name: 'Bina Buyer',
          })
          .expect(201)
      ).body.accessToken as string;
      const o = (
        await checkout(cod({ contact: {} }), undefined, token).expect(201)
      ).body.order;
      await move(o.id, 'preparing').expect(200);
      const review = await request(server())
        .post(api('/products/mug/reviews'))
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5 })
        .expect(201);
      expect(review.body.verified).toBe(true);
    });
  });

  describe('gift links', () => {
    beforeEach(() => boot());

    it('GL-02 creates a private link without needing the recipient address, and keeps only its hash', async () => {
      const res = await checkout({
        lines: [{ productId: 'mug', quantity: 1 }],
        delivery: { city: 'Karachi', method: 'gift_link' },
        contact,
        paymentMethod: 'bank_transfer',
      }).expect(201);
      expect(res.body.giftLink.url).toMatch(/\/gift\/[a-f0-9]{64}$/);
      expect(mail()[0].text).toContain(res.body.giftLink.url);
      const admin = await adminOrder(res.body.order.id);
      expect(admin.giftLink).toMatchObject({ isClaimed: false });
      expect(JSON.stringify(admin)).not.toContain(
        res.body.giftLink.url.split('/gift/')[1],
      );
    });
  });

  describe('digital gifts', () => {
    beforeEach(() => boot());
    const egift = (over: Record<string, unknown> = {}) => ({
      lines: [
        {
          productId: 'egift',
          quantity: 1,
          digital: {
            recipientEmail: 'Friend@Example.pk',
            message: 'Eid Mubarak',
            ...over,
          },
        },
      ],
      contact,
      paymentMethod: 'bank_transfer',
    });

    it('E6-1 sends the e-gift card by email once paid, and the order completes', async () => {
      const o = (await checkout(egift()).expect(201)).body.order;
      expect(o).toMatchObject({
        status: 'awaiting_payment',
        deliveryFee: 0,
        total: 5000,
      });
      expect(mail().some((m) => m.to === 'friend@example.pk')).toBe(false); // nothing before payment

      const paid = await move(o.id, 'paid').expect(200);
      const gift = mail().find((m) => m.to === 'friend@example.pk')!;
      expect(gift.text).toMatch(/GC-[A-Z2-9]{4}(-[A-Z2-9]{4}){3}/);
      expect(gift.text).toMatch(/Zara sent you/);
      expect(gift.text).toMatch(/5,000/);
      expect(gift.text).toContain('Eid Mubarak');
      expect(paid.body.order.status).toBe('delivered'); // digital-only orders finish by themselves
      expect(paid.body.digitalGifts[0]).toMatchObject({
        kind: 'egift',
        status: 'sent',
        recipientEmail: 'friend@example.pk',
      });
      expect(JSON.stringify(paid.body.digitalGifts)).not.toMatch(
        /GC-[A-Z2-9]{4}-/,
      ); // the full code is not shown to staff
    });

    it('SC-03 a code works for 12 months and is refused after that', async () => {
      const o = (await checkout(egift()).expect(201)).body.order;
      await move(o.id, 'paid').expect(200);
      const code = /GC-[A-Z2-9]{4}(-[A-Z2-9]{4}){3}/.exec(
        mail().find((m) => m.to === 'friend@example.pk')!.text,
      )![0];

      const ok = await request(server())
        .post(api('/gift-cards/check'))
        .send({ code: code.toLowerCase() })
        .expect(200);
      expect(ok.body).toMatchObject({
        valid: true,
        kind: 'egift',
        amount: 5000,
        expiresAt: '2027-11-18T05:00:00.000Z',
      });
      now = new Date('2027-11-17T12:00:00Z');
      expect(
        (
          await request(server())
            .post(api('/gift-cards/check'))
            .send({ code })
            .expect(200)
        ).body.valid,
      ).toBe(true);
      now = new Date('2027-11-19T12:00:00Z');
      expect(
        (
          await request(server())
            .post(api('/gift-cards/check'))
            .send({ code })
            .expect(200)
        ).body,
      ).toMatchObject({ valid: false, reason: 'expired' });
      expect(
        (
          await request(server())
            .post(api('/gift-cards/check'))
            .send({ code: 'GC-AAAA-AAAA-AAAA-AAAA' })
            .expect(200)
        ).body,
      ).toMatchObject({ valid: false, reason: 'not_found' });
    });

    it('E6-2 sends a greeting card, which does not expire', async () => {
      const body = {
        lines: [
          {
            productId: 'greeting',
            quantity: 1,
            digital: { recipientEmail: 'pal@example.pk' },
          },
        ],
        contact,
        paymentMethod: 'bank_transfer',
      };
      const o = (await checkout(body).expect(201)).body.order;
      await move(o.id, 'paid').expect(200);
      expect(mail().find((m) => m.to === 'pal@example.pk')?.text).toMatch(
        /greeting card/,
      );
      const code = /GC-[A-Z2-9-]+/.exec(
        mail().find((m) => m.to === 'pal@example.pk')!.text,
      )![0];
      now = new Date('2030-01-01T00:00:00Z');
      expect(
        (
          await request(server())
            .post(api('/gift-cards/check'))
            .send({ code })
            .expect(200)
        ).body,
      ).toMatchObject({ valid: true, expiresAt: null });
    });

    it('E6-3 a gift set for later is held, not sent, and the order waits', async () => {
      const o = (
        await checkout(egift({ sendAt: '2026-12-01T09:00:00Z' })).expect(201)
      ).body.order;
      const paid = await move(o.id, 'paid').expect(200);
      expect(mail().some((m) => m.to === 'friend@example.pk')).toBe(false);
      expect(paid.body.digitalGifts[0].status).toBe('scheduled');
      expect(paid.body.order.status).toBe('paid');
    });

    it('checks the recipient, the quantity and the send time', async () => {
      const noRecipient = await checkout({
        lines: [{ productId: 'egift', quantity: 1 }],
        contact,
        paymentMethod: 'bank_transfer',
      }).expect(400);
      expect(noRecipient.body.error.details[0]).toMatch(/recipient's email/);
      await checkout({
        lines: [
          {
            productId: 'egift',
            quantity: 2,
            digital: { recipientEmail: 'f@example.pk' },
          },
        ],
        contact,
        paymentMethod: 'bank_transfer',
      }).expect(400);
      await checkout(egift({ sendAt: '2026-11-01T09:00:00Z' })).expect(400);
      await checkout(egift({ recipientEmail: 'not-an-email' })).expect(400);
      await checkout(
        cod({
          lines: [
            {
              productId: 'mug',
              quantity: 1,
              digital: { recipientEmail: 'f@example.pk' },
            },
          ],
        }),
      ).expect(400);
    });

    it('cancelling an unpaid digital order stops the gift', async () => {
      const o = (await checkout(egift()).expect(201)).body.order;
      await move(o.id, 'cancelled').expect(200);
      expect((await adminOrder(o.id)).digitalGifts[0].status).toBe('cancelled');
    });

    it('limits how fast codes can be tried', async () => {
      await app.close();
      await boot({ env: { CODE_CHECK_RATE_LIMIT: '2' } });
      for (let i = 0; i < 2; i++)
        await request(server())
          .post(api('/gift-cards/check'))
          .send({ code: 'GC-X' })
          .expect(200);
      await request(server())
        .post(api('/gift-cards/check'))
        .send({ code: 'GC-X' })
        .expect(429);
    });
  });

  describe('card payments', () => {
    const card = (over: Record<string, unknown> = {}) =>
      cod({ paymentMethod: 'card', ...over });
    const event = (
      number: string,
      over: Partial<WebhookEvent> = {},
    ): WebhookEvent => ({
      eventId: 'evt_1',
      gatewayRef: `ch_${number}`,
      orderNumber: number,
      status: 'succeeded',
      amount: 1150,
      ...over,
    });
    const send = (ev: WebhookEvent, signature = 'valid') =>
      request(server())
        .post(api('/payments/webhook'))
        .set('x-signature', signature)
        .send(ev);

    it('PY-01 card is not offered until a gateway is configured and the flag is on', async () => {
      await boot();
      const res = await checkout(card()).expect(400);
      expect(res.body.error.details).toEqual([
        'Card payments are not available yet',
      ]);
      await app.close();
      await boot({ env: { FEATURE_CARD_PAYMENTS: 'true' } }); // flag on, but still the null gateway
      await checkout(card()).expect(400);
    });

    it('E5-4 starts a payment with the gateway and marks the order paid when it succeeds', async () => {
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new FakeGateway(),
      });
      const res = await checkout(card()).expect(201);
      expect(res.body.order.status).toBe('awaiting_payment');
      expect(res.body.payment.redirectUrl).toBe(
        `https://pay.example/${res.body.order.number}`,
      );

      await send(event(res.body.order.number), 'forged').expect(401);
      expect((await adminOrder(res.body.order.id)).order.status).toBe(
        'awaiting_payment',
      );

      const ok = await send(event(res.body.order.number)).expect(200);
      expect(ok.body.result).toBe('confirmed');
      const after = await adminOrder(res.body.order.id);
      expect(after.order.status).toBe('paid');
      expect(after.payments[0].status).toBe('confirmed');
    });

    it('PY-02 a repeated gateway event changes nothing', async () => {
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new FakeGateway(),
      });
      const res = await checkout(card()).expect(201);
      const ev = event(res.body.order.number);
      await send(ev).expect(200);
      const again = await send(ev).expect(200);
      expect(again.body.result).toBe('duplicate');
      const after = await adminOrder(res.body.order.id);
      expect(
        after.order.events.filter((e: Doc) => e.to === 'paid'),
      ).toHaveLength(1);
      expect(
        mail().filter((m) => m.subject.includes('payment received')),
      ).toHaveLength(1);
    });

    it('PY-02 a payment for the wrong amount is flagged, not accepted', async () => {
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new FakeGateway(),
      });
      const res = await checkout(card()).expect(201);
      expect(
        (await send(event(res.body.order.number, { amount: 100 })).expect(200))
          .body.result,
      ).toBe('mismatch');
      const after = await adminOrder(res.body.order.id);
      expect(after.order.status).toBe('awaiting_payment');
      expect(last(after.order.events as { note: string }[]).note).toMatch(
        /check before confirming/,
      );
    });

    it('Safepay: a signed callback marks the order paid only after Safepay confirms it; a forged one does nothing', async () => {
      let state = 'TRACKER_ENDED';
      let order = '';
      const fakeFetch = (async (url: string) => {
        const path = new URL(url).pathname;
        const answer = path.startsWith('/order/payments')
          ? { data: { tracker: { token: 'track_e2e1' } } }
          : path.startsWith('/client/passport')
            ? { data: 'tbt' }
            : {
                data: {
                  tracker: { state, metadata: { order_id: order } },
                  purchase_totals: { quote_amount: { amount: 115000 } },
                },
              };
        return new Response(JSON.stringify(answer), { status: 200 });
      }) as unknown as typeof fetch;
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new SafepayGateway(
          {
            environment: 'sandbox',
            apiKey: 'k',
            secretKey: 's',
            webhookSecret: 'w',
            webBaseUrl: 'https://shop.example.pk',
          },
          fakeFetch,
        ),
      });
      const res = await checkout(card()).expect(201);
      order = res.body.order.number;
      expect(res.body.payment.redirectUrl).toContain('/embedded/?');

      const raw = JSON.stringify({
        type: 'payment.succeeded',
        token: 'evt_a',
        data: { tracker: 'track_e2e1' },
      });
      const post = (sig: string) =>
        request(server())
          .post(api('/payments/webhook'))
          .set('content-type', 'application/json')
          .set('x-sfpy-signature', sig)
          .send(raw);
      const good = createHmac('sha512', 'w').update(raw).digest('hex');

      await post(
        createHmac('sha512', 'wrong').update(raw).digest('hex'),
      ).expect(401);
      expect((await adminOrder(res.body.order.id)).order.status).toBe(
        'awaiting_payment',
      );

      state = 'TRACKER_STARTED'; // callback arrives, but Safepay says the payment is not finished
      await post(good).expect(503);
      expect((await adminOrder(res.body.order.id)).order.status).toBe(
        'awaiting_payment',
      );

      state = 'TRACKER_ENDED';
      expect((await post(good).expect(200)).body.result).toBe('confirmed');
      expect((await adminOrder(res.body.order.id)).order.status).toBe('paid');
      expect((await post(good).expect(200)).body.result).toBe('duplicate');
    });

    it('a failed card payment leaves the order unpaid', async () => {
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new FakeGateway(),
      });
      const res = await checkout(card()).expect(201);
      expect(
        (
          await send(event(res.body.order.number, { status: 'failed' })).expect(
            200,
          )
        ).body.result,
      ).toBe('failed');
      expect((await adminOrder(res.body.order.id)).payments[0].status).toBe(
        'failed',
      );
    });

    it('a payment that arrives after the order was cancelled is flagged for a refund', async () => {
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new FakeGateway(),
      });
      const res = await checkout(card()).expect(201);
      await move(res.body.order.id, 'cancelled').expect(200);
      await send(event(res.body.order.number, { eventId: 'late' })).expect(200);
      const after = await adminOrder(res.body.order.id);
      expect(after.order.status).toBe('cancelled');
      expect(last(after.order.events as { note: string }[]).note).toMatch(
        /refund needed/,
      );
    });

    it('an unknown order number is acknowledged and ignored', async () => {
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new FakeGateway(),
      });
      expect((await send(event('SN-NOSUCHXX')).expect(200)).body.result).toBe(
        'ignored',
      );
    });

    it('if the gateway cannot start the payment, the order is cancelled and the stock returns', async () => {
      await boot({
        env: { FEATURE_CARD_PAYMENTS: 'true' },
        gateway: new FakeGateway(true),
      });
      await checkout(card()).expect(503);
      expect(await stockOf('mug')).toBe(5);
      const list = await request(server())
        .get(api('/admin/orders'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(list.body.data.map((r: Doc) => r.status)).toEqual(['cancelled']);
    });
  });
});
