import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { ConsoleMailer, Mail, MAILER } from '../src/mail/mailer';
import { ConsoleMessenger, MESSENGER } from '../src/messaging/messenger';
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
  product('mug', { price: 800, stock: 20 }),
  product('vase', { price: 4000, stock: 20 }),
  product('necklace', {
    price: 3500,
    isMadeToOrder: true,
    leadTimeMinDays: 5,
    leadTimeMaxDays: 5,
    stock: 0,
  }),
  product('greeting', {
    price: 500,
    type: 'digital',
    digitalKind: 'greeting',
    stock: 100,
  }),
];

const T0 = '2026-11-18T05:00:00Z'; // Wednesday 10:00 in Pakistan
const at = (iso: string) => new Date(iso);
const hoursAfter = (iso: string, h: number) =>
  new Date(Date.parse(iso) + h * 3_600_000);
const address = {
  city: 'Karachi',
  address: 'House 12, Street 4, DHA Phase 5',
  phone: '03001234567',
};
const contact = { email: 'zara@example.pk', name: 'Zara' };
const SECRET = 'cron-secret-for-tests';

/** Fails to send to chosen addresses, to test retries. */
class FlakyMailer extends ConsoleMailer {
  failFor = new Set<string>();
  override async send(mail: Mail) {
    if (this.failFor.has(mail.to)) throw new Error('smtp is down');
    return super.send(mail);
  }
}

describe('Fulfilment, scheduler, refunds and reports (e2e)', () => {
  let app: INestApplication;
  let now = at(T0);
  let staff = '';
  let mailer: FlakyMailer;
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const texts = () => app.get<ConsoleMessenger>(MESSENGER).outbox;

  async function boot(env: Record<string, string> = {}) {
    now = at(T0);
    mailer = new FlakyMailer();
    Object.assign(
      process.env,
      {
        RATE_LIMIT_MAX: '1000',
        AUTH_RATE_LIMIT: '1000',
        CHECKOUT_RATE_LIMIT: '1000',
        TRACK_RATE_LIMIT: '1000',
        GIFT_LINK_RATE_LIMIT: '1000',
        JWT_SECRET: 'test-secret',
        CRON_SECRET: SECRET,
        ALERT_EMAIL: 'ops@sentimently.pk',
      },
      env,
    );
    const [cfg] = seed('storeConfig');
    const staffPw = await hashPassword('staff-password-1');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          products,
          extras: seed('extras'),
          promoCodes: seed('promoCodes'),
          storeConfig: [cfg],
          customers: [
            doc({
              id: 'staff1',
              email: 'staff@sentimently.pk',
              role: 'staff',
              isGuest: false,
              authProvider: 'email',
              passwordHash: staffPw,
            }),
            doc({
              id: 'admin1',
              email: 'admin@sentimently.pk',
              role: 'admin',
              isGuest: false,
              authProvider: 'email',
              passwordHash: staffPw,
            }),
          ],
        }),
      )
      .overrideProvider(CLOCK)
      .useValue({ now: () => now })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    staff = await login('staff@sentimently.pk');
  }

  async function login(email: string) {
    return (
      await request(server())
        .post(api('/auth/login'))
        .send({ email, password: 'staff-password-1' })
        .expect(200)
    ).body.accessToken as string;
  }

  afterEach(async () => {
    await app.close();
    for (const k of [
      'RATE_LIMIT_MAX',
      'AUTH_RATE_LIMIT',
      'CHECKOUT_RATE_LIMIT',
      'TRACK_RATE_LIMIT',
      'GIFT_LINK_RATE_LIMIT',
      'CRON_SECRET',
      'ALERT_EMAIL',
    ])
      delete process.env[k];
  });

  // ---------- helpers ----------

  const checkout = (body: Record<string, unknown>, token?: string) => {
    const r = request(server()).post(api('/checkout')).send(body);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };
  const cod = (over: Record<string, unknown> = {}) => ({
    lines: [{ productId: 'mug', quantity: 1 }],
    delivery: address,
    contact,
    paymentMethod: 'cod',
    ...over,
  });
  const bank = (over: Record<string, unknown> = {}) =>
    cod({ paymentMethod: 'bank_transfer', ...over });
  const place = async (
    body: Record<string, unknown> = cod(),
    token?: string,
  ) => {
    const res = await checkout(body, token).expect(201);
    return {
      id: res.body.order.id as string,
      number: res.body.order.number as string,
      body: res.body,
    };
  };
  const move = (
    id: string,
    status: string,
    extra: Record<string, unknown> = {},
    token = staff,
  ) =>
    request(server())
      .post(api(`/admin/orders/${id}/status`))
      .set('Authorization', `Bearer ${token}`)
      .send({ status, ...extra });
  const adminOrder = async (id: string) =>
    (
      await request(server())
        .get(api(`/admin/orders/${id}`))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200)
    ).body;
  const cron = (secret = SECRET) =>
    request(server())
      .get(api('/internal/scheduler/run'))
      .set('Authorization', `Bearer ${secret}`);
  const sentTo = (to: string) => mailer.outbox.filter((m) => m.to === to);
  const deliver = async (id: string) => {
    for (const s of ['preparing', 'dispatched', 'delivered'])
      await move(id, s).expect(200);
  };
  const register = async (email: string) =>
    (
      await request(server())
        .post(api('/auth/register'))
        .send({ email, password: 'password-123' })
        .expect(201)
    ).body.accessToken as string;
  const personalised = (name = 'Maryam') => ({
    recipientName: name,
    relationship: 'friend',
    cardDesign: 'classic',
    message: 'Thinking of you',
  });
  const giftLinkOrder = (over: Record<string, unknown> = {}) =>
    bank({
      lines: [
        { productId: 'mug', quantity: 1, personalisation: personalised() },
      ],
      delivery: { city: 'Karachi', method: 'gift_link' },
      ...over,
    });
  const tokenOf = (body: { giftLink: { url: string } }) =>
    body.giftLink.url.split('/gift/')[1];
  const claimBody = {
    address: 'Flat 5, Rose Apartments, Gulshan Block 3',
    phone: '03111234567',
    name: 'Maryam',
  };

  // =====================================================================
  describe('gift links', () => {
    beforeEach(() => boot());

    it('GL-02 the recipient sees nothing about the sender', async () => {
      const o = await place(giftLinkOrder());
      const res = await request(server())
        .get(api(`/gift-links/${tokenOf(o.body)}`))
        .expect(200);
      expect(res.body).toEqual({
        status: 'ready',
        recipientName: 'Maryam',
        city: 'Karachi',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/zara|SN-|@|total|price/i);
    });

    it('GL-01 a link can be claimed once, even if two people try at the same moment', async () => {
      const token = tokenOf((await place(giftLinkOrder())).body);
      const results = await Promise.all([
        request(server())
          .post(api(`/gift-links/${token}/claim`))
          .send(claimBody),
        request(server())
          .post(api(`/gift-links/${token}/claim`))
          .send({ ...claimBody, phone: '03229999999' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const again = await request(server())
        .post(api(`/gift-links/${token}/claim`))
        .send(claimBody)
        .expect(409);
      expect(again.body.error.message).toBe(
        'This gift has already been claimed',
      );
      expect(
        (
          await request(server())
            .get(api(`/gift-links/${token}`))
            .expect(200)
        ).body.status,
      ).toBe('claimed');
    });

    it('GL-03 the studio gets the recipient address, the sender never does', async () => {
      const sender = await register('sender@example.pk');
      const o = await place(giftLinkOrder({ contact: {} }), sender);
      await request(server())
        .post(api(`/gift-links/${tokenOf(o.body)}/claim`))
        .send(claimBody)
        .expect(200);

      const mine = await request(server())
        .get(api(`/orders/${o.number}`))
        .set('Authorization', `Bearer ${sender}`)
        .expect(200);
      expect(mine.body.delivery).toEqual({
        method: 'gift_link',
        city: 'Karachi',
        claimed: true,
      });
      expect(JSON.stringify(mine.body)).not.toMatch(
        /Rose Apartments|03111234567/,
      );
      expect(
        JSON.stringify(
          mailer.outbox.filter((m) => m.to === 'sender@example.pk'),
        ),
      ).not.toMatch(/Rose Apartments|03111234567/);
      expect(
        sentTo('sender@example.pk').some((m) =>
          m.subject.includes('gift link was used'),
        ),
      ).toBe(true);

      const studio = await adminOrder(o.id);
      expect(studio.order.delivery).toMatchObject({
        address: claimBody.address,
        phone: claimBody.phone,
      });
    });

    it('GL-03 nothing is dispatched until the recipient has added their address', async () => {
      const o = await place(giftLinkOrder());
      await move(o.id, 'paid').expect(200);
      await move(o.id, 'preparing').expect(200);
      const blocked = await move(o.id, 'dispatched').expect(409);
      expect(blocked.body.error.message).toBe(
        'Waiting for the recipient to add their address',
      );
      await request(server())
        .post(api(`/gift-links/${tokenOf(o.body)}/claim`))
        .send(claimBody)
        .expect(200);
      await move(o.id, 'dispatched').expect(200);
    });

    it('GL-04 a link stops working after 30 days, and the sender is told once', async () => {
      const o = await place(giftLinkOrder());
      const token = tokenOf(o.body);
      now = hoursAfter(T0, 24 * 31);
      expect(
        (
          await request(server())
            .get(api(`/gift-links/${token}`))
            .expect(200)
        ).body.status,
      ).toBe('expired');
      await request(server())
        .post(api(`/gift-links/${token}/claim`))
        .send(claimBody)
        .expect(410);

      expect((await cron().expect(200)).body.giftLinksExpired).toBe(1);
      expect((await cron().expect(200)).body.giftLinksExpired).toBe(0);
      expect(
        sentTo('zara@example.pk').filter((m) =>
          m.subject.includes('gift link expired'),
        ),
      ).toHaveLength(1);
      expect(
        sentTo('ops@sentimently.pk').some((m) =>
          m.subject.includes('expired unclaimed'),
        ),
      ).toBe(true);
    });

    it('an unknown link and a link for a cancelled order look the same', async () => {
      const o = await place(giftLinkOrder());
      await request(server())
        .get(api('/gift-links/not-a-real-token'))
        .expect(404);
      await move(o.id, 'cancelled').expect(200);
      await request(server())
        .get(api(`/gift-links/${tokenOf(o.body)}`))
        .expect(404);
      await request(server())
        .post(api(`/gift-links/${tokenOf(o.body)}/claim`))
        .send(claimBody)
        .expect(404);
    });

    it('checks the claim details', async () => {
      const token = tokenOf((await place(giftLinkOrder())).body);
      await request(server())
        .post(api(`/gift-links/${token}/claim`))
        .send({ address: 'short', phone: '1' })
        .expect(400);
    });
  });

  // =====================================================================
  describe('scheduler', () => {
    const greeting = (sendAt?: string, to = 'pal@example.pk') => ({
      lines: [
        {
          productId: 'greeting',
          quantity: 1,
          digital: { recipientEmail: to, ...(sendAt ? { sendAt } : {}) },
        },
      ],
      contact,
      paymentMethod: 'bank_transfer',
    });

    describe('access', () => {
      it('is off without a secret, and refuses a wrong one', async () => {
        await boot();
        delete process.env.CRON_SECRET;
        await cron().expect(503);
        process.env.CRON_SECRET = SECRET;
        await cron('wrong').expect(401);
        await request(server()).get(api('/internal/scheduler/run')).expect(401);
        expect((await cron().expect(200)).body).toMatchObject({
          digitalSent: 0,
          errors: [],
        });
      });

      it('an admin can run it by hand; staff and the public cannot', async () => {
        await boot();
        const admin = await login('admin@sentimently.pk');
        await request(server())
          .post(api('/admin/scheduler/run'))
          .set('Authorization', `Bearer ${admin}`)
          .expect(200);
        await request(server())
          .post(api('/admin/scheduler/run'))
          .set('Authorization', `Bearer ${staff}`)
          .expect(403);
        await request(server()).post(api('/admin/scheduler/run')).expect(401);
      });
    });

    describe('digital gifts', () => {
      beforeEach(() => boot());

      it('SC-02 a gift goes out at its minute, not before, and finishes the order', async () => {
        const o = await place(greeting('2026-11-18T09:00:00Z'));
        await move(o.id, 'paid').expect(200);
        expect((await adminOrder(o.id)).digitalGifts[0].status).toBe(
          'scheduled',
        );

        now = at('2026-11-18T08:59:59Z');
        expect((await cron().expect(200)).body.digitalSent).toBe(0);
        expect(sentTo('pal@example.pk')).toHaveLength(0);

        now = at('2026-11-18T09:00:00Z');
        expect((await cron().expect(200)).body.digitalSent).toBe(1);
        expect(sentTo('pal@example.pk')).toHaveLength(1);
        const after = await adminOrder(o.id);
        expect(after.digitalGifts[0].status).toBe('sent');
        expect(after.order.status).toBe('delivered');
      });

      it('SC-02 two runs at the same moment send a gift once', async () => {
        const o = await place(greeting('2026-11-18T09:00:00Z'));
        await move(o.id, 'paid').expect(200);
        now = at('2026-11-18T09:00:30Z');
        const runs = await Promise.all([cron(), cron()]);
        expect(runs.reduce((n, r) => n + r.body.digitalSent, 0)).toBe(1);
        expect(sentTo('pal@example.pk')).toHaveLength(1);
      });

      it('SC-04 a failing send is retried later and succeeds when email recovers', async () => {
        mailer.failFor.add('pal@example.pk');
        const o = await place(greeting()); // no sendAt: due as soon as it is paid
        const paid = await move(o.id, 'paid').expect(200);
        expect(paid.body.order.status).toBe('paid'); // email trouble does not undo the payment
        expect(paid.body.digitalGifts[0]).toMatchObject({
          status: 'scheduled',
          attempts: 1,
        });

        now = hoursAfter(T0, 0.02); // 1.2 minutes: still inside the 2-minute wait
        expect((await cron().expect(200)).body).toMatchObject({
          digitalSent: 0,
          digitalRetrying: 0,
        });

        mailer.failFor.clear();
        now = hoursAfter(T0, 0.05); // 3 minutes
        expect((await cron().expect(200)).body.digitalSent).toBe(1);
        expect((await adminOrder(o.id)).order.status).toBe('delivered');
      });

      it('SC-04 after five failures it gives up and raises an alert', async () => {
        mailer.failFor.add('pal@example.pk');
        const o = await place(greeting());
        await move(o.id, 'paid').expect(200);
        const results: Record<string, number>[] = [];
        for (let i = 1; i <= 4; i++) {
          now = hoursAfter(T0, i * 0.5); // 30 minutes apart, longer than any wait
          results.push((await cron().expect(200)).body);
        }
        expect(results.map((r) => r.digitalRetrying)).toEqual([1, 1, 1, 0]);
        expect(results[3].digitalFailed).toBe(1);

        const gift = (await adminOrder(o.id)).digitalGifts[0];
        expect(gift).toMatchObject({ status: 'failed', attempts: 5 });
        expect(gift.lastError).toMatch(/smtp is down/);
        const alert = sentTo('ops@sentimently.pk').find((m) =>
          m.subject.includes('digital gift could not be sent'),
        );
        expect(alert?.text).toContain(o.number);

        mailer.failFor.clear();
        now = hoursAfter(T0, 5);
        expect((await cron().expect(200)).body.digitalSent).toBe(0); // given up on: a person decides
      });
    });

    describe('occasion reminders', () => {
      it('E8-1 sends once, in the morning, and again next year', async () => {
        await boot();
        const token = await register('rem@example.pk');
        await request(server())
          .post(api('/me/reminders'))
          .set('Authorization', `Bearer ${token}`)
          .send({
            label: 'Mum birthday',
            date: '2020-11-25',
            recipientName: 'Mum',
            notifyDaysBefore: 7,
          })
          .expect(201);

        now = at('2026-11-18T03:00:00Z'); // 08:00 in Pakistan: too early
        expect((await cron().expect(200)).body.remindersSent).toBe(0);
        now = at('2026-11-18T04:00:00Z'); // 09:00
        expect((await cron().expect(200)).body.remindersSent).toBe(1);
        const reminders = () =>
          sentTo('rem@example.pk').filter((m) =>
            m.subject.startsWith('Coming up'),
          );
        const mail = reminders();
        expect(mail).toHaveLength(1);
        expect(mail[0].subject).toBe('Coming up: Mum birthday');
        expect(mail[0].text).toContain('2026-11-25');

        now = at('2026-11-19T05:00:00Z');
        expect((await cron().expect(200)).body.remindersSent).toBe(0); // not again this year

        now = at('2027-11-18T05:00:00Z');
        expect((await cron().expect(200)).body.remindersSent).toBe(1);
        expect(reminders()).toHaveLength(2);
      });

      it('does not send before the notice period', async () => {
        await boot();
        const token = await register('early@example.pk');
        await request(server())
          .post(api('/me/reminders'))
          .set('Authorization', `Bearer ${token}`)
          .send({ label: 'Later', date: '2020-12-25', notifyDaysBefore: 7 })
          .expect(201);
        expect((await cron().expect(200)).body.remindersSent).toBe(0);
      });

      it('retries a reminder whose email failed', async () => {
        await boot();
        const token = await register('flaky@example.pk');
        await request(server())
          .post(api('/me/reminders'))
          .set('Authorization', `Bearer ${token}`)
          .send({
            label: 'Anniversary',
            date: '2020-11-20',
            notifyDaysBefore: 7,
          })
          .expect(201);
        mailer.failFor.add('flaky@example.pk');
        expect((await cron().expect(200)).body.remindersSent).toBe(0);
        mailer.failFor.clear();
        expect((await cron().expect(200)).body.remindersSent).toBe(1);
      });
    });
  });

  // =====================================================================
  describe('cancellation and refunds', () => {
    beforeEach(() => boot());
    const cancel = (number: string, email = 'zara@example.pk') =>
      request(server()).post(api('/orders/cancel')).send({ number, email });

    it('OR-01 an unpaid order can be cancelled, with nothing to refund', async () => {
      const o = await place(bank());
      const res = await cancel(
        o.number.toLowerCase(),
        'ZARA@example.pk',
      ).expect(200);
      expect(res.body).toEqual({
        number: o.number,
        status: 'cancelled',
        refund: null,
      });
      expect((await adminOrder(o.id)).order.status).toBe('cancelled');
    });

    it('OR-05 a paid order that is cancelled gets a refund due in 3 working days', async () => {
      const o = await place(bank());
      await move(o.id, 'paid').expect(200);
      const res = await cancel(o.number).expect(200);
      expect(res.body.refund).toMatchObject({
        amount: 1150,
        dueBy: '2026-11-21',
        note: expect.stringMatching(/5 to 7 working days/),
      });

      const queue = await request(server())
        .get(api('/admin/refunds?status=pending'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(queue.body).toHaveLength(1);
      expect(queue.body[0]).toMatchObject({
        orderNumber: o.number,
        amount: 1150,
        overdue: false,
      });

      await request(server())
        .post(api(`/admin/refunds/${queue.body[0].id}/process`))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect((await adminOrder(o.id)).order.status).toBe('refunded');
      expect(
        sentTo('zara@example.pk').some((m) => m.subject.includes('refunded')),
      ).toBe(true);
      // processing twice is harmless
      await request(server())
        .post(api(`/admin/refunds/${queue.body[0].id}/process`))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
    });

    it('OR-05 an overdue refund raises one alert', async () => {
      const o = await place(bank());
      await move(o.id, 'paid').expect(200);
      await cancel(o.number).expect(200);
      now = at('2026-11-23T05:00:00Z'); // Monday, after the Saturday deadline
      expect((await cron().expect(200)).body.refundsOverdue).toBe(1);
      expect((await cron().expect(200)).body.refundsOverdue).toBe(0);
      expect(
        sentTo('ops@sentimently.pk').filter((m) =>
          m.subject.includes('refund is overdue'),
        ),
      ).toHaveLength(1);
      const queue = await request(server())
        .get(api('/admin/refunds'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(queue.body[0].overdue).toBe(true);
    });

    it('OR-01 once preparation has started the customer has to contact the studio', async () => {
      const o = await place(bank());
      await move(o.id, 'paid').expect(200);
      await move(o.id, 'preparing').expect(200);
      const res = await cancel(o.number).expect(409);
      expect(res.body.error.message).toMatch(/started preparing/);
    });

    it('OR-02 a personalised item in production cannot be cancelled', async () => {
      const o = await place(
        cod({
          lines: [
            {
              productId: 'necklace',
              quantity: 1,
              personalisation: personalised(),
            },
          ],
          delivery: { ...address, date: '2026-11-26' },
        }),
      );
      await move(o.id, 'preparing').expect(200);
      await move(o.id, 'in_production').expect(200);
      const res = await cancel(o.number).expect(409);
      expect(res.body.error.message).toBe(
        'This order is already in production and can no longer be cancelled',
      );
    });

    it('a wrong email and an unknown order get the same answer, and a cancel cannot be repeated', async () => {
      const o = await place(cod());
      const wrong = await cancel(o.number, 'other@example.pk').expect(404);
      const unknown = await cancel('SN-NOSUCHXX').expect(404);
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
      await cancel(o.number).expect(200);
      await cancel(o.number).expect(409);
    });

    it('staff cancelling a paid order also creates the refund', async () => {
      const o = await place(bank());
      await move(o.id, 'paid').expect(200);
      await move(o.id, 'cancelled').expect(200);
      const queue = await request(server())
        .get(api('/admin/refunds'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(queue.body).toHaveLength(1);
    });

    it('a customer cannot reach the refund queue', async () => {
      const token = await register('c@example.pk');
      await request(server())
        .get(api('/admin/refunds'))
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(server()).get(api('/admin/returns')).expect(401);
    });
  });

  // =====================================================================
  describe('returns and damage claims', () => {
    beforeEach(() => boot());
    const returnBody = (
      number: string,
      over: Record<string, unknown> = {},
    ) => ({
      number,
      email: 'zara@example.pk',
      kind: 'return',
      reason: 'Not the right colour',
      confirmUnused: true,
      ...over,
    });
    const ask = (body: Record<string, unknown>) =>
      request(server()).post(api('/orders/returns')).send(body);
    const decide = (id: string, body: Record<string, unknown>) =>
      request(server())
        .post(api(`/admin/returns/${id}/decision`))
        .set('Authorization', `Bearer ${staff}`)
        .send(body);
    const complete = (id: string, body: Record<string, unknown> = {}) =>
      request(server())
        .post(api(`/admin/returns/${id}/complete`))
        .set('Authorization', `Bearer ${staff}`)
        .send(body);
    const refunds = async () =>
      (
        await request(server())
          .get(api('/admin/refunds'))
          .set('Authorization', `Bearer ${staff}`)
          .expect(200)
      ).body as Doc[];
    const processRefund = (id: string) =>
      request(server())
        .post(api(`/admin/refunds/${id}/process`))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);

    it('OR-04 a return within 7 days refunds the items but not the delivery', async () => {
      const o = await place(cod());
      await deliver(o.id);
      now = hoursAfter(T0, 24 * 6);
      const req = await ask(returnBody(o.number)).expect(201);
      expect(req.body).toMatchObject({
        status: 'requested',
        refundAmount: 800,
      });

      const approved = await decide(req.body.id, {
        decision: 'approve',
      }).expect(200);
      expect(approved.body.status).toBe('approved');
      await complete(req.body.id).expect(200);
      expect((await adminOrder(o.id)).order.status).toBe('returned');

      const [refund] = await refunds();
      expect(refund).toMatchObject({
        amount: 800,
        reason: 'return',
        status: 'pending',
      });
      await processRefund(refund.id);
      expect((await adminOrder(o.id)).order.status).toBe('returned'); // partial: delivery fee kept
    });

    it('OR-04 a faulty return also refunds delivery, which closes the order', async () => {
      const o = await place(cod());
      await deliver(o.id);
      const req = await ask(returnBody(o.number)).expect(201);
      await decide(req.body.id, { decision: 'approve' }).expect(200);
      await complete(req.body.id, { faulty: true }).expect(200);
      const [refund] = await refunds();
      expect(refund.amount).toBe(1150);
      await processRefund(refund.id);
      expect((await adminOrder(o.id)).order.status).toBe('refunded');
    });

    it('OR-04 refuses late requests, missing confirmation, and personalised gifts', async () => {
      const plain = await place(cod());
      await deliver(plain.id);
      await ask(returnBody(plain.number, { confirmUnused: false })).expect(400);
      now = hoursAfter(T0, 24 * 8);
      const late = await ask(returnBody(plain.number)).expect(409);
      expect(late.body.error.message).toMatch(/within 7 days/);

      now = at(T0);
      const custom = await place(
        cod({
          contact: { email: 'p@example.pk' },
          lines: [
            {
              productId: 'necklace',
              quantity: 1,
              personalisation: personalised(),
            },
          ],
          delivery: { ...address, date: '2026-11-26' },
        }),
      );
      await deliver(custom.id);
      const res = await ask(
        returnBody(custom.number, { email: 'p@example.pk' }),
      ).expect(409);
      expect(res.body.error.message).toMatch(
        /Personalised and digital gifts cannot be returned/,
      );
    });

    it('OR-04 only delivered orders, and only one request per order unless it was rejected', async () => {
      const o = await place(cod());
      await ask(returnBody(o.number)).expect(409); // not delivered yet
      await deliver(o.id);
      const first = await ask(returnBody(o.number)).expect(201);
      await ask(returnBody(o.number)).expect(409);
      await decide(first.body.id, { decision: 'reject', note: 'Used' }).expect(
        200,
      );
      expect(
        sentTo('zara@example.pk').some((m) =>
          m.text.includes('could not approve'),
        ),
      ).toBe(true);
      await ask(returnBody(o.number)).expect(201);
    });

    it('OR-03 damage must be reported within 48 hours with a photo, and refunds delivery too', async () => {
      const o = await place(cod());
      await deliver(o.id);
      const damaged = (over: Record<string, unknown> = {}) =>
        ask(
          returnBody(o.number, {
            kind: 'damaged',
            reason: 'Broken',
            photoUrls: ['https://photos.example/broken.jpg'],
            confirmUnused: undefined,
            ...over,
          }),
        );

      await damaged({ photoUrls: [] }).expect(400);
      now = hoursAfter(T0, 49);
      expect((await damaged().expect(409)).body.error.message).toMatch(
        /within 48 hours/,
      );

      now = hoursAfter(T0, 47);
      const req = await damaged().expect(201);
      expect(req.body.refundAmount).toBe(1150);
      await decide(req.body.id, { decision: 'approve' }).expect(400); // damaged goods need a resolution
      await decide(req.body.id, {
        decision: 'approve',
        resolution: 'refund',
      }).expect(200);
      const [refund] = await refunds();
      expect(refund).toMatchObject({ amount: 1150, reason: 'damaged' });
      expect((await adminOrder(o.id)).order.status).toBe('returned');
    });

    it('OR-03 a replacement needs no refund', async () => {
      const o = await place(cod());
      await deliver(o.id);
      const req = await ask(
        returnBody(o.number, {
          kind: 'damaged',
          photoUrls: ['https://photos.example/a.jpg'],
          confirmUnused: undefined,
        }),
      ).expect(201);
      const res = await decide(req.body.id, {
        decision: 'approve',
        resolution: 'replacement',
      }).expect(200);
      expect(res.body.status).toBe('completed');
      expect(await refunds()).toHaveLength(0);
      expect(
        (await adminOrder(o.id)).order.events.some((e: { note?: string }) =>
          e.note?.includes('replacement'),
        ),
      ).toBe(true);
    });

    it('shares an order discount across a partial return', async () => {
      const o = await place(
        cod({
          lines: [
            { productId: 'vase', quantity: 1 },
            { productId: 'mug', quantity: 1 },
          ],
          promoCode: 'HELLO10',
          contact: { email: 'd@example.pk' },
        }),
      );
      expect(o.body.order).toMatchObject({ subtotal: 4800, discount: 480 });
      await deliver(o.id);
      const req = await ask(
        returnBody(o.number, { email: 'd@example.pk', lines: [1] }),
      ).expect(201);
      expect(req.body.refundAmount).toBe(720); // the mug (800) less its 10% share
    });

    it('only staff decide on returns', async () => {
      const o = await place(cod());
      await deliver(o.id);
      const req = await ask(returnBody(o.number)).expect(201);
      const customer = await register('cust@example.pk');
      await request(server())
        .post(api(`/admin/returns/${req.body.id}/decision`))
        .set('Authorization', `Bearer ${customer}`)
        .send({ decision: 'approve' })
        .expect(403);
    });
  });

  // =====================================================================
  describe('failed deliveries', () => {
    beforeEach(() => boot());

    it('OR-06 two failed attempts alert the studio; the first re-delivery is free, the next is charged', async () => {
      const o = await place(cod());
      await move(o.id, 'preparing').expect(200);
      await move(o.id, 'dispatched', {
        courier: 'TCS',
        trackingRef: 'T1',
      }).expect(200);
      expect(
        texts().some(
          (t) => t.to === '03001234567' && /on its way/.test(t.text),
        ),
      ).toBe(true);

      await move(o.id, 'failed_delivery').expect(200);
      expect(sentTo('ops@sentimently.pk')).toHaveLength(0); // one failure is not yet an alert
      await move(o.id, 'dispatched').expect(200);
      expect((await adminOrder(o.id)).order.redeliveryFeeDue).toBeUndefined(); // first re-delivery: free

      await move(o.id, 'failed_delivery').expect(200);
      const alert = sentTo('ops@sentimently.pk').find((m) =>
        m.subject.includes('Delivery failed twice'),
      );
      expect(alert?.text).toContain(o.number);
      expect(
        sentTo('zara@example.pk').some((m) => m.text.includes('tried twice')),
      ).toBe(true);
      expect(
        (await adminOrder(o.id)).order.events.some((e: { note?: string }) =>
          e.note?.includes('contact the sender'),
        ),
      ).toBe(true);

      await move(o.id, 'dispatched').expect(200);
      const final = await move(o.id, 'delivered').expect(200);
      expect(final.body.order).toMatchObject({ redeliveryFeeDue: 350 }); // Karachi rate
      expect(final.body.order.delivery).toMatchObject({
        attempts: 2,
        redeliveries: 2,
      });
    });
  });

  // =====================================================================
  describe('reports and the dispatch rota', () => {
    beforeEach(() => boot());

    it('E8-4 summarises sales, delivery, promo use and refunds', async () => {
      const a = await place(cod()); // delivered the same day it was due
      await deliver(a.id);
      await place(bank({ contact: { email: 'b@example.pk' } })); // unpaid: not a sale
      await place(
        cod({
          lines: [{ productId: 'vase', quantity: 1 }],
          promoCode: 'HELLO10',
          contact: { email: 'c@example.pk' },
        }),
      );
      const d = await place(bank({ contact: { email: 'd@example.pk' } }));
      await move(d.id, 'paid').expect(200);
      await move(d.id, 'cancelled').expect(200); // refund pending

      const res = await request(server())
        .get(api('/admin/reports/summary'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(res.body.sales).toEqual({
        orders: 2,
        revenue: 1150 + 3950,
        averageOrderValue: 2550,
        itemsSold: 2,
      });
      expect(res.body.byStatus).toEqual({
        delivered: 1,
        awaiting_payment: 1,
        placed: 1,
        cancelled: 1,
      });
      expect(res.body.byPaymentMethod).toEqual({
        cod: { orders: 2, revenue: 5100 },
      });
      expect(res.body.promoUse).toEqual({
        HELLO10: { orders: 1, discountTotal: 400 },
      });
      expect(
        res.body.topProducts.map((p: { productId: string }) => p.productId),
      ).toEqual(['vase', 'mug']);
      expect(res.body.delivery).toMatchObject({
        delivered: 1,
        onTimePercent: 100,
        averageDaysToDeliver: 0,
      });
      expect(res.body.refunds.pending).toEqual({ count: 1, amount: 1150 });

      const none = await request(server())
        .get(api('/admin/reports/summary?from=2030-01-01'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(none.body.sales.orders).toBe(0);
    });

    it('lists what is due on a day, by city, with who to call and cash to collect', async () => {
      await place(cod({ contact: { email: 'k1@example.pk' } }));
      await place(
        cod({
          contact: { email: 'k2@example.pk' },
          delivery: { ...address, date: '2026-11-19' },
        }),
      );
      await place(
        cod({
          contact: { email: 'l1@example.pk' },
          delivery: { ...address, city: 'Lahore' },
        }),
      );
      const link = await place(giftLinkOrder());
      await move(link.id, 'paid').expect(200);

      const rota = (
        await request(server())
          .get(api('/admin/dispatch?date=2026-11-18'))
          .set('Authorization', `Bearer ${staff}`)
          .expect(200)
      ).body;
      expect(rota.total).toBe(3);
      expect(rota.cities.map((c: { city: string }) => c.city)).toEqual([
        'Karachi',
        'Lahore',
      ]);
      const karachi = rota.cities[0].orders;
      expect(karachi).toHaveLength(2);
      expect(
        karachi.find(
          (o: { cashToCollect: number }) => o.cashToCollect === 1150,
        ),
      ).toMatchObject({
        address: address.address,
        phone: address.phone,
        sameDay: true,
      });
      expect(
        karachi.find(
          (o: { waitingForRecipientAddress: boolean }) =>
            o.waitingForRecipientAddress,
        ),
      ).toMatchObject({ recipientName: 'Maryam', address: null });

      const lahore = await request(server())
        .get(api('/admin/dispatch?date=2026-11-18&city=lahore'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(lahore.body.total).toBe(1);
      const next = await request(server())
        .get(api('/admin/dispatch?date=2026-11-19'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(next.body.total).toBe(1);
      const empty = await request(server())
        .get(api('/admin/dispatch?date=2030-01-01'))
        .set('Authorization', `Bearer ${staff}`)
        .expect(200);
      expect(empty.body).toEqual({ date: '2030-01-01', total: 0, cities: [] });
    });

    it('keeps reports and the rota staff-only', async () => {
      const customer = await register('cust@example.pk');
      await request(server())
        .get(api('/admin/reports/summary'))
        .set('Authorization', `Bearer ${customer}`)
        .expect(403);
      await request(server()).get(api('/admin/dispatch')).expect(401);
    });
  });
});
