import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { ConsoleMailer, Mail, MAILER } from '../src/mail/mailer';
import { PAYMENT_GATEWAY } from '../src/orders/payment-gateway';
import { JsonStore } from '../src/storage/json-store.service';
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
const PASSWORD = 'password-12345';

class FlakyMailer extends ConsoleMailer {
  failFor = new Set<string>();
  override async send(mail: Mail) {
    if (this.failFor.has(mail.to)) throw new Error('smtp is down');
    return super.send(mail);
  }
}

describe('Store settings, promo codes, extras, staff (e2e)', () => {
  let app: INestApplication;
  let mailer: FlakyMailer;
  let staff = '';
  let admin = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeEach(async () => {
    Object.assign(process.env, {
      RATE_LIMIT_MAX: '100000',
      AUTH_RATE_LIMIT: '100000',
      JWT_SECRET: 'test-secret',
    });
    mailer = new FlakyMailer();
    const pw = await hashPassword(PASSWORD);
    const user = (id: string, role: string) =>
      doc({
        id,
        email: `${id}@example.pk`,
        role,
        isGuest: false,
        authProvider: 'email',
        passwordHash: pw,
      });
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
              price: 4000,
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
          storeConfig: [
            {
              ...cfg,
              bankTransferInstructions: 'Secret bank details 0123',
              sameDayCapacity: { Karachi: 5 },
              contactPhone: '+92 300 0000000',
              socialLinks: { instagram: 'https://instagram.com/sentimently' },
            },
          ],
          customers: [user('staff', 'staff'), user('admin', 'admin')],
        }),
      )
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date('2026-11-18T05:00:00Z') })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    const login = async (id: string) =>
      (
        await request(server())
          .post(api('/auth/login'))
          .send({ email: `${id}@example.pk`, password: PASSWORD })
          .expect(200)
      ).body.accessToken as string;
    staff = await login('staff');
    admin = await login('admin');
  });

  afterEach(async () => {
    await app.close();
    delete process.env.FEATURE_CARD_PAYMENTS;
  });

  const quote = (over: Record<string, unknown> = {}) =>
    request(server())
      .post(api('/quote'))
      .send({
        lines: [{ productId: 'mug', quantity: 1 }],
        delivery: { city: 'Karachi' },
        ...over,
      });

  describe('public store settings', () => {
    it('gives the shop what every page needs and nothing private', async () => {
      const res = await request(server()).get(api('/store')).expect(200);
      expect(res.body).toMatchObject({
        freeDeliveryThreshold: 5000,
        sameDayCutoffHour: 13,
        currency: 'PKR',
        paymentMethods: ['cod', 'bank_transfer'],
        contact: { phone: '+92 300 0000000', email: null },
        socialLinks: { instagram: 'https://instagram.com/sentimently' },
      });
      expect(res.body.deliveryRates.Karachi).toEqual({
        fee: 350,
        minDays: 0,
        maxDays: 0,
        sameDay: true,
      });
      expect(res.body.restOfPakistan.fee).toBe(650);
      expect(JSON.stringify(res.body)).not.toMatch(
        /Secret bank|sameDayCapacity/,
      );
      expect(res.headers['cache-control']).toContain('max-age=60');
    });

    it('offers card only when it is switched on and a gateway exists', async () => {
      process.env.FEATURE_CARD_PAYMENTS = 'true';
      expect(
        (await request(server()).get(api('/store')).expect(200)).body
          .paymentMethods,
      ).toEqual(['cod', 'bank_transfer']); // no gateway yet
      Object.defineProperty(app.get(PAYMENT_GATEWAY as never), 'available', {
        value: true,
      });
      expect(
        (await request(server()).get(api('/store')).expect(200)).body
          .paymentMethods,
      ).toEqual(['cod', 'bank_transfer', 'card']);
    });
  });

  describe('changing the settings', () => {
    it('staff can read them, only an admin can change them', async () => {
      const read = await request(server())
        .get(api('/admin/store'))
        .set(bearer(staff))
        .expect(200);
      expect(read.body.bankTransferInstructions).toBe(
        'Secret bank details 0123',
      ); // staff see the private fields
      await request(server())
        .patch(api('/admin/store'))
        .set(bearer(staff))
        .send({ banner: 'x' })
        .expect(403);
      await request(server())
        .patch(api('/admin/store'))
        .send({ banner: 'x' })
        .expect(401);
    });

    it('DL-05 a new Sargodha rate changes quotes at once, without a deploy', async () => {
      const before = await quote({ delivery: { city: 'Sargodha' } }).expect(
        200,
      );
      expect(before.body.delivery).toMatchObject({ fee: 550, sameDay: false });

      const config = (await request(server()).get(api('/store')).expect(200))
        .body;
      const rates = {
        ...config.deliveryRates,
        Sargodha: { fee: 450, minDays: 1, maxDays: 1, sameDay: true },
      };
      await request(server())
        .patch(api('/admin/store'))
        .set(bearer(admin))
        .send({ deliveryRates: rates })
        .expect(200);

      const after = await quote({ delivery: { city: 'Sargodha' } }).expect(200);
      expect(after.body.delivery).toMatchObject({ fee: 450, sameDay: true });
      const shown = await request(server())
        .get(api('/admin/store'))
        .set(bearer(admin))
        .expect(200);
      expect(shown.body.deliveryRates.Sargodha.fee).toBe(450);
    });

    it('changes the free-delivery limit, the same-day cut-off and the banner', async () => {
      await request(server())
        .patch(api('/admin/store'))
        .set(bearer(admin))
        .send({
          freeDeliveryThreshold: 3000,
          sameDayCutoffHour: 11,
          banner: 'Eid orders close on the 8th',
          announcement: 'Free delivery over Rs 3,000',
        })
        .expect(200);
      const q = await quote().expect(200);
      expect(q.body.delivery).toMatchObject({ fee: 0, freeDelivery: true }); // 4000 is over the new limit
      const pub = await request(server()).get(api('/store')).expect(200);
      expect(pub.body).toMatchObject({
        freeDeliveryThreshold: 3000,
        sameDayCutoffHour: 11,
        banner: 'Eid orders close on the 8th',
      });
    });

    it('refuses nonsense and changes nothing', async () => {
      const bad = await request(server())
        .patch(api('/admin/store'))
        .set(bearer(admin))
        .send({
          deliveryRates: {
            Karachi: { fee: -5, minDays: 3, maxDays: 1, sameDay: 'yes' },
            Lahore: 'cheap',
          },
          restOfPakistan: {
            fee: 650.5,
            minDays: 1,
            maxDays: 2,
            sameDay: false,
          },
          sameDayCapacity: { Karachi: 'lots' },
          socialLinks: { instagram: 'not a link' },
        })
        .expect(400);
      const text = JSON.stringify(bad.body.error.details);
      expect(text).toContain(
        'deliveryRates.Karachi: fee must be a whole number',
      );
      expect(text).toContain('minDays is greater than maxDays');
      expect(text).toContain('sameDay must be true or false');
      expect(text).toContain('deliveryRates.Lahore: must be an object');
      expect(text).toContain('restOfPakistan: fee must be a whole number');
      expect(text).toContain('sameDayCapacity.Karachi');
      expect(text).toContain('socialLinks.instagram');
      await request(server())
        .patch(api('/admin/store'))
        .set(bearer(admin))
        .send({ sameDayCutoffHour: 30 })
        .expect(400);
      await request(server())
        .patch(api('/admin/store'))
        .set(bearer(admin))
        .send({ deliveryRates: {} })
        .expect(400);
      expect((await quote().expect(200)).body.delivery.fee).toBe(350); // still the old table
    });

    it('DL-09 the daily same-day capacity is a setting', async () => {
      await request(server())
        .patch(api('/admin/store'))
        .set(bearer(admin))
        .send({ sameDayCapacity: { Karachi: 0 } })
        .expect(200);
      expect((await quote().expect(200)).body.delivery.sameDay).toBe(false);
    });

    it('cannot be used to set fields it does not own', async () => {
      await request(server())
        .patch(api('/admin/store'))
        .set(bearer(admin))
        .send({ id: 'other', createdAt: '1999-01-01', evil: true })
        .expect(200);
      const read = (
        await request(server())
          .get(api('/admin/store'))
          .set(bearer(admin))
          .expect(200)
      ).body;
      expect(read.id).toBe('main');
      expect(read.evil).toBeUndefined();
    });
  });

  describe('promo codes', () => {
    it('lists them to staff; an admin creates and changes them', async () => {
      const list = await request(server())
        .get(api('/admin/promo-codes'))
        .set(bearer(staff))
        .expect(200);
      expect(list.body.map((p: Doc) => p.code)).toEqual(['HELLO10']);
      await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(staff))
        .send({ code: 'EID15', percent: 15 })
        .expect(403);

      const created = await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(admin))
        .send({ code: 'eid15', percent: 15, minOrder: 2000 })
        .expect(201);
      expect(created.body).toMatchObject({
        id: 'EID15',
        code: 'EID15',
        percent: 15,
        minOrder: 2000,
        firstOrderOnly: false,
        isActive: true,
      });
      await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(admin))
        .send({ code: 'EID15', percent: 5 })
        .expect(409);
    });

    it('PR-04 a new code works in quotes straight away, and stops when switched off', async () => {
      await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(admin))
        .send({ code: 'EID15', percent: 15, minOrder: 2000 })
        .expect(201);
      const used = await quote({ promoCode: 'eid15' }).expect(200);
      expect(used.body.promo).toMatchObject({
        applied: true,
        percent: 15,
        discount: 600,
      });
      await request(server())
        .patch(api('/admin/promo-codes/eid15'))
        .set(bearer(admin))
        .send({ isActive: false })
        .expect(200);
      expect(
        (await quote({ promoCode: 'EID15' }).expect(200)).body.promo,
      ).toMatchObject({ applied: false, reason: 'That code is not valid' });
    });

    it('can be limited to a time window, and checks its inputs', async () => {
      await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(admin))
        .send({
          code: 'EARLY',
          percent: 10,
          startsAt: '2026-12-01T00:00:00Z',
          endsAt: '2026-12-31T00:00:00Z',
        })
        .expect(201);
      expect(
        (await quote({ promoCode: 'EARLY' }).expect(200)).body.promo.reason,
      ).toBe('That code is not valid right now');
      await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(admin))
        .send({
          code: 'BACKWARDS',
          percent: 10,
          startsAt: '2026-12-31T00:00:00Z',
          endsAt: '2026-12-01T00:00:00Z',
        })
        .expect(400);
      await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(admin))
        .send({ code: 'x', percent: 10 })
        .expect(400);
      await request(server())
        .post(api('/admin/promo-codes'))
        .set(bearer(admin))
        .send({ code: 'BIG', percent: 150 })
        .expect(400);
      await request(server())
        .patch(api('/admin/promo-codes/NOPE'))
        .set(bearer(admin))
        .send({ percent: 5 })
        .expect(404);
    });
  });

  describe('extras', () => {
    it('a price change reaches quotes at once; classic wrap stays free', async () => {
      const personalised = {
        productId: 'mug',
        quantity: 1,
        personalisation: {
          recipientName: 'A',
          relationship: 'friend',
          cardDesign: 'classic',
          extras: ['premium_wrap'],
        },
      };
      expect(
        (await quote({ lines: [personalised] }).expect(200)).body.extrasTotal,
      ).toBe(350);
      await request(server())
        .patch(api('/admin/extras/premium_wrap'))
        .set(bearer(staff))
        .send({ price: 400 })
        .expect(403);
      await request(server())
        .patch(api('/admin/extras/premium_wrap'))
        .set(bearer(admin))
        .send({ price: 400 })
        .expect(200);
      expect(
        (await quote({ lines: [personalised] }).expect(200)).body.extrasTotal,
      ).toBe(400);

      await request(server())
        .patch(api('/admin/extras/classic_wrap'))
        .set(bearer(admin))
        .send({ price: 100 })
        .expect(400);
      await request(server())
        .patch(api('/admin/extras/premium_wrap'))
        .set(bearer(admin))
        .send({ isActive: false })
        .expect(200);
      await quote({ lines: [personalised] }).expect(400);
      await request(server())
        .patch(api('/admin/extras/nope'))
        .set(bearer(admin))
        .send({ price: 1 })
        .expect(404);
      const list = await request(server())
        .get(api('/admin/extras'))
        .set(bearer(staff))
        .expect(200);
      expect(list.body).toHaveLength(6);
    });
  });

  describe('team accounts', () => {
    it('an admin adds staff, who can then sign in and work; staff cannot manage the team', async () => {
      await request(server())
        .post(api('/admin/staff'))
        .set(bearer(staff))
        .send({
          email: 'new@example.pk',
          password: 'a-long-password-1',
          role: 'staff',
        })
        .expect(403);
      const created = await request(server())
        .post(api('/admin/staff'))
        .set(bearer(admin))
        .send({
          email: 'New@Example.pk',
          name: 'Nida',
          password: 'a-long-password-1',
          role: 'staff',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        email: 'new@example.pk',
        name: 'Nida',
        role: 'staff',
      });
      expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|scrypt/);

      const token = (
        await request(server())
          .post(api('/auth/login'))
          .send({ email: 'new@example.pk', password: 'a-long-password-1' })
          .expect(200)
      ).body.accessToken;
      await request(server())
        .get(api('/admin/orders'))
        .set(bearer(token))
        .expect(200);
      await request(server())
        .get(api('/admin/staff'))
        .set(bearer(token))
        .expect(403);

      const team = await request(server())
        .get(api('/admin/staff'))
        .set(bearer(admin))
        .expect(200);
      expect(team.body.map((p: Doc) => p.email).sort()).toEqual([
        'admin@example.pk',
        'new@example.pk',
        'staff@example.pk',
      ]);
    });

    it('checks the new account', async () => {
      await request(server())
        .post(api('/admin/staff'))
        .set(bearer(admin))
        .send({ email: 'x@example.pk', password: 'short', role: 'staff' })
        .expect(400);
      await request(server())
        .post(api('/admin/staff'))
        .set(bearer(admin))
        .send({
          email: 'x@example.pk',
          password: 'a-long-password-1',
          role: 'superuser',
        })
        .expect(400);
      await request(server())
        .post(api('/admin/staff'))
        .set(bearer(admin))
        .send({
          email: 'staff@example.pk',
          password: 'a-long-password-1',
          role: 'staff',
        })
        .expect(409);
      await request(server())
        .post(api('/auth/register'))
        .send({ email: 'shopper@example.pk', password: 'password-12345' })
        .expect(201);
      await request(server())
        .post(api('/admin/staff'))
        .set(bearer(admin))
        .send({
          email: 'shopper@example.pk',
          password: 'a-long-password-1',
          role: 'staff',
        })
        .expect(409);
    });

    it('removing access takes effect at once, and you cannot remove yourself', async () => {
      await request(server())
        .delete(api('/admin/staff/staff'))
        .set(bearer(admin))
        .expect(200);
      await request(server())
        .get(api('/admin/orders'))
        .set(bearer(staff))
        .expect(403);
      await request(server())
        .delete(api('/admin/staff/admin'))
        .set(bearer(admin))
        .expect(400);
      await request(server())
        .delete(api('/admin/staff/nobody'))
        .set(bearer(admin))
        .expect(404);

      const second = (
        await request(server())
          .post(api('/admin/staff'))
          .set(bearer(admin))
          .send({
            email: 'boss2@example.pk',
            password: 'a-long-password-1',
            role: 'admin',
          })
          .expect(201)
      ).body;
      const token2 = (
        await request(server())
          .post(api('/auth/login'))
          .send({ email: 'boss2@example.pk', password: 'a-long-password-1' })
          .expect(200)
      ).body.accessToken;
      await request(server())
        .delete(api(`/admin/staff/${second.id}`))
        .set(bearer(admin))
        .expect(200);
      await request(server())
        .delete(api('/admin/staff/admin'))
        .set(bearer(token2))
        .expect(403); // the removed admin can do nothing now
    });
  });

  describe('retrying a gift that failed', () => {
    it('staff can send it again once the cause is fixed', async () => {
      mailer.failFor.add('pal@example.pk');
      const placed = await request(server())
        .post(api('/checkout'))
        .send({
          lines: [
            {
              productId: 'card',
              quantity: 1,
              digital: { recipientEmail: 'pal@example.pk' },
            },
          ],
          contact: { email: 'z@example.pk', name: 'Z' },
          paymentMethod: 'bank_transfer',
        })
        .expect(201);
      const id = placed.body.order.id;
      await request(server())
        .post(api(`/admin/orders/${id}/status`))
        .set(bearer(staff))
        .send({ status: 'paid' })
        .expect(200);

      const view = async () =>
        (
          await request(server())
            .get(api(`/admin/orders/${id}`))
            .set(bearer(staff))
            .expect(200)
        ).body;
      const gift = (await view()).digitalGifts[0];
      expect(gift.status).toBe('scheduled'); // not failed yet: nothing to retry
      await request(server())
        .post(api(`/admin/digital-gifts/${gift.id}/retry`))
        .set(bearer(staff))
        .expect(409);

      // simulate five failures having happened
      await app.get(JsonStore).update('digitalGifts', gift.id, {
        status: 'failed',
        attempts: 5,
        lastError: 'smtp is down',
      } as never);
      mailer.failFor.clear();
      const retried = await request(server())
        .post(api(`/admin/digital-gifts/${gift.id}/retry`))
        .set(bearer(staff))
        .expect(200);
      expect(retried.body).toMatchObject({ status: 'sent', attempts: 0 });
      expect(mailer.outbox.some((m) => m.to === 'pal@example.pk')).toBe(true);
      expect((await view()).order.status).toBe('delivered');
      await request(server())
        .post(api(`/admin/digital-gifts/${gift.id}/retry`))
        .set(bearer(staff))
        .expect(409); // already sent
      await request(server())
        .post(api('/admin/digital-gifts/nope/retry'))
        .set(bearer(staff))
        .expect(404);
    });
  });
});
