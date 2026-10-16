import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
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
  product('mug', { price: 800 }),
  product('photo-book', {
    price: 6000,
    offerPrice: 4500,
    stock: 3,
    allowedExtras: ['premium_wrap', 'keepsake_box'],
  }),
  product('necklace', {
    price: 3500,
    isMadeToOrder: true,
    leadTimeMinDays: 5,
    leadTimeMaxDays: 5,
    stock: 0,
  }),
  product('flowers', { price: 2000, isPerishable: true }),
  product('egift', { price: 5000, type: 'digital', stock: 100 }),
  product('plain-3000', { price: 3000 }),
  product('plain-3001', { price: 3001 }),
  product('plain-4000', { price: 4000 }),
  product('plain-5000', { price: 5000 }),
  product('plain-5001', { price: 5001 }),
];

const WED_10AM = '2026-11-18T05:00:00Z'; // 10:00 in Pakistan
const WED_1PM = '2026-11-18T08:00:00Z'; // 13:00 in Pakistan

const person = (over: Record<string, unknown> = {}) => ({
  recipientName: 'Ayesha',
  relationship: 'friend',
  cardDesign: 'classic',
  message: 'Thinking of you',
  ...over,
});
const line = (
  productId: string,
  quantity = 1,
  personalisation?: Record<string, unknown>,
) => ({ productId, quantity, personalisation });
const karachi = { city: 'Karachi' };

describe('Pricing and personalisation (e2e)', () => {
  let app: INestApplication;
  let now = new Date(WED_10AM);
  const server = () => app.getHttpServer();
  const quote = (body: Record<string, unknown>, token?: string) => {
    const r = request(server()).post('/api/v1/quote').send(body);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  async function boot(
    opts: {
      config?: Record<string, unknown>;
      orders?: Doc[];
      at?: string;
    } = {},
  ) {
    now = new Date(opts.at ?? WED_10AM);
    Object.assign(process.env, {
      RATE_LIMIT_MAX: '1000',
      AUTH_RATE_LIMIT: '1000',
      JWT_SECRET: 'test-secret',
    });
    const [cfg] = seed('storeConfig');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          products,
          extras: seed('extras'),
          promoCodes: seed('promoCodes'),
          storeConfig: [{ ...cfg, ...opts.config }],
          orders: opts.orders ?? [],
          customers: [
            doc({
              id: 'c1',
              email: 'repeat@example.pk',
              role: 'customer',
              isGuest: false,
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
  }

  afterEach(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_MAX;
  });

  describe('prices and extras', () => {
    beforeEach(() => boot());

    it('PR-01 / PR-02 adds paid extras to the item price, classic wrap is free', async () => {
      const res = await quote({
        lines: [
          line(
            'mug',
            1,
            person({
              extras: ['classic_wrap', 'premium_wrap', 'chocolate_box'],
            }),
          ),
        ],
        delivery: karachi,
      }).expect(200);
      expect(res.body).toMatchObject({
        itemsTotal: 800,
        extrasTotal: 1550,
        subtotal: 2350,
        deliveryFee: 350,
        total: 2700,
      });
      expect(res.body.lines[0].extras.map((e: Doc) => e.code)).toEqual([
        'premium_wrap',
        'chocolate_box',
      ]);
    });

    it('PR-02 prices all five paid extras', async () => {
      const res = await quote({
        lines: [
          line(
            'mug',
            1,
            person({
              extras: [
                'premium_wrap',
                'keepsake_box',
                'chocolate_box',
                'dried_flower_posy',
                'express_same_day',
              ],
            }),
          ),
        ],
        delivery: karachi,
      }).expect(200);
      expect(res.body.extrasTotal).toBe(350 + 750 + 1200 + 900 + 600);
    });

    it('PR-06 uses the offer price when there is one', async () => {
      const res = await quote({
        lines: [line('photo-book')],
        delivery: karachi,
      }).expect(200);
      expect(res.body.lines[0]).toMatchObject({
        unitPrice: 4500,
        itemsTotal: 4500,
      });
    });

    it('PR-07 ignores any price or total the client sends', async () => {
      const res = await quote({
        lines: [
          {
            productId: 'mug',
            quantity: 2,
            unitPrice: 1,
            price: 1,
            lineTotal: 1,
          },
        ],
        delivery: karachi,
        total: 1,
        deliveryFee: 0,
        discount: 9999,
      }).expect(200);
      expect(res.body).toMatchObject({
        itemsTotal: 1600,
        deliveryFee: 350,
        discount: 0,
        total: 1950,
      });
    });

    it('PR-03 a product with its own list allows only those extras', async () => {
      const bad = await quote({
        lines: [line('photo-book', 1, person({ extras: ['chocolate_box'] }))],
        delivery: karachi,
      }).expect(400);
      expect(bad.body.error.details).toEqual([
        'Line 1: "Chocolate box" is not available for "photo-book"',
      ]);
      const ok = await quote({
        lines: [line('photo-book', 1, person({ extras: ['keepsake_box'] }))],
        delivery: karachi,
      }).expect(200);
      expect(ok.body.extrasTotal).toBe(750);
    });

    it('PR-03 express same-day is refused on made-to-order gifts but allowed on others', async () => {
      await quote({
        lines: [line('necklace', 1, person({ extras: ['express_same_day'] }))],
        delivery: karachi,
      }).expect(400);
      const ok = await quote({
        lines: [line('mug', 1, person({ extras: ['express_same_day'] }))],
        delivery: karachi,
      }).expect(200);
      expect(ok.body.extrasTotal).toBe(600);
    });

    it('rejects an unknown extra and reports every problem at once', async () => {
      const res = await quote({
        lines: [
          line('mug', 1, person({ extras: ['gold_plating'] })),
          line('nope'),
        ],
        delivery: karachi,
      }).expect(400);
      expect(res.body.error.details).toEqual([
        'Line 1: "gold_plating" is not a known extra',
        'Line 2: that gift is not available',
      ]);
    });

    it('checks stock, but not for made-to-order gifts', async () => {
      const res = await quote({
        lines: [line('photo-book', 4)],
        delivery: karachi,
      }).expect(400);
      expect(res.body.error.details[0]).toBe(
        'Line 1: only 3 of "photo-book" left',
      );
      await quote({ lines: [line('necklace', 2)], delivery: karachi }).expect(
        200,
      );
    });
  });

  describe('personalisation rules', () => {
    beforeEach(() => boot());
    const withPerson = (p: Record<string, unknown>) =>
      quote({ lines: [line('mug', 1, p)], delivery: karachi });

    it('PZ-01 the recipient name is required, and spaces do not count', async () => {
      await withPerson(person({ recipientName: '' })).expect(400);
      await withPerson(person({ recipientName: '   ' })).expect(400);
      await withPerson({
        relationship: 'friend',
        cardDesign: 'classic',
      }).expect(400);
      await withPerson(person({ recipientName: '  Ayesha  ' })).expect(200);
    });

    it('PZ-02 the relationship must be one of the 8 options', async () => {
      await withPerson(person({ relationship: 'neighbour' })).expect(400);
      await withPerson(person({ relationship: 'colleague' })).expect(200);
    });

    it('PZ-03 a message may have 900 characters, not 901 (emoji count as one)', async () => {
      await withPerson(person({ message: 'a'.repeat(900) })).expect(200);
      const over = await withPerson(
        person({ message: 'a'.repeat(901) }),
      ).expect(400);
      expect(over.body.error.details[0]).toMatch(
        /901 characters; the limit is 900/,
      );
      await withPerson(person({ message: '💌'.repeat(900) })).expect(200);
      await withPerson(person({ message: '💌'.repeat(901) })).expect(400);
    });

    it('PZ-05 the card design must be one of the 4 options', async () => {
      await withPerson(person({ cardDesign: 'neon' })).expect(400);
      await withPerson(person({ cardDesign: 'festive' })).expect(200);
    });

    it('a personalised gift is one per line, and digital gifts have no studio personalisation', async () => {
      await quote({
        lines: [line('mug', 2, person())],
        delivery: karachi,
      }).expect(400);
      await quote({ lines: [line('egift', 1, person())] }).expect(400);
    });

    it('serves the studio options', async () => {
      const res = await request(server())
        .get('/api/v1/personalisation/options')
        .expect(200);
      expect(res.body.relationships).toHaveLength(8);
      expect(res.body.cardDesigns).toHaveLength(4);
      expect(res.body.starterLines).toHaveLength(8);
      expect(res.body.messageMaxLength).toBe(900);
      expect(res.body.extras.map((e: Doc) => e.code)).toContain(
        'express_same_day',
      );
    });
  });

  describe('delivery', () => {
    beforeEach(() => boot());

    it('DL-01 / DL-04 fee and same-day by city', async () => {
      const k = await quote({ lines: [line('mug')], delivery: karachi }).expect(
        200,
      );
      expect(k.body.delivery).toMatchObject({
        city: 'Karachi',
        fee: 350,
        sameDay: true,
        earliestDate: '2026-11-18',
      });
      const g = await quote({
        lines: [line('mug')],
        delivery: { city: 'gwadar' },
      }).expect(200);
      expect(g.body.delivery).toMatchObject({
        city: 'gwadar',
        fee: 650,
        sameDay: false,
        earliestDate: '2026-11-20',
      });
    });

    it('DL-05 Sargodha prices from the store settings', async () => {
      const res = await quote({
        lines: [line('mug')],
        delivery: { city: 'SARGODHA' },
      }).expect(200);
      expect(res.body.delivery).toMatchObject({ city: 'Sargodha', fee: 550 });
    });

    it('DL-06 digital gifts need no address and cost nothing to deliver', async () => {
      const res = await quote({ lines: [line('egift')] }).expect(200);
      expect(res.body).toMatchObject({
        deliveryFee: 0,
        delivery: null,
        total: 5000,
      });
    });

    it('DL-07 free delivery only over Rs 5,000', async () => {
      const at5000 = await quote({
        lines: [line('plain-5000')],
        delivery: karachi,
      }).expect(200);
      expect(at5000.body.delivery).toMatchObject({
        fee: 350,
        freeDelivery: false,
      });
      const over = await quote({
        lines: [line('plain-5001')],
        delivery: karachi,
      }).expect(200);
      expect(over.body.delivery).toMatchObject({ fee: 0, freeDelivery: true });
      expect(over.body.total).toBe(5001);
    });

    it('DL-08 made-to-order lead time sets the earliest date, and an earlier date is refused', async () => {
      const res = await quote({
        lines: [line('necklace')],
        delivery: karachi,
      }).expect(200);
      expect(res.body.delivery).toMatchObject({
        sameDay: false,
        earliestDate: '2026-11-25',
      });
      const early = await quote({
        lines: [line('necklace')],
        delivery: { city: 'Karachi', date: '2026-11-23' },
      }).expect(400);
      expect(early.body.error.details).toEqual([
        'The earliest delivery to Karachi is 2026-11-25',
      ]);
      await quote({
        lines: [line('necklace')],
        delivery: { city: 'Karachi', date: '2026-11-25' },
      }).expect(200);
    });

    it('DL-10 only delivers within Pakistan', async () => {
      await quote({
        lines: [line('mug')],
        delivery: { city: 'Dubai', country: 'AE' },
      }).expect(400);
      await quote({
        lines: [line('mug')],
        delivery: { city: 'Karachi', country: 'PK' },
      }).expect(200);
    });

    it('asks for a city when something physical is in the box', async () => {
      const res = await quote({ lines: [line('mug')] }).expect(400);
      expect(res.body.error.details).toEqual(['Choose a delivery city']);
    });

    it('rejects an impossible date', async () => {
      await quote({
        lines: [line('mug')],
        delivery: { city: 'Karachi', date: '2026-02-31' },
      }).expect(400);
    });

    it('SC-01 flowers and chocolate cannot be scheduled more than 3 days ahead', async () => {
      await quote({
        lines: [line('flowers')],
        delivery: { city: 'Karachi', date: '2026-11-21' },
      }).expect(200);
      const late = await quote({
        lines: [line('flowers')],
        delivery: { city: 'Karachi', date: '2026-11-22' },
      }).expect(400);
      expect(late.body.error.details[0]).toMatch(/more than 3 days ahead/);
      // a chocolate box makes any gift perishable
      await quote({
        lines: [line('mug', 1, person({ extras: ['chocolate_box'] }))],
        delivery: { city: 'Karachi', date: '2026-11-22' },
      }).expect(400);
      // other gifts may be scheduled further out
      await quote({
        lines: [line('mug')],
        delivery: { city: 'Karachi', date: '2026-12-20' },
      }).expect(200);
    });
  });

  describe('same-day cut-off and capacity', () => {
    it('DL-01 after 1pm there is no same-day', async () => {
      await boot({ at: WED_1PM });
      const res = await quote({
        lines: [line('mug')],
        delivery: karachi,
      }).expect(200);
      expect(res.body.delivery).toMatchObject({
        sameDay: false,
        earliestDate: '2026-11-19',
      });
    });

    it('DL-09 same-day stops when the city is at capacity', async () => {
      const booked = doc({
        id: 'o1',
        customerId: 'c9',
        status: 'paid',
        city: 'Karachi',
        deliveryDate: '2026-11-18',
      });
      await boot({
        config: { sameDayCapacity: { Karachi: 1 } },
        orders: [booked],
      });
      const res = await quote({
        lines: [line('mug')],
        delivery: karachi,
      }).expect(200);
      expect(res.body.delivery.sameDay).toBe(false);
      const lahore = await quote({
        lines: [line('mug')],
        delivery: { city: 'Lahore' },
      }).expect(200);
      expect(lahore.body.delivery.sameDay).toBe(true);
    });
  });

  describe('promo codes', () => {
    beforeEach(() => boot());
    const withCode = (
      productId: string,
      extra: Record<string, unknown> = {},
      token?: string,
    ) =>
      quote(
        {
          lines: [line(productId)],
          delivery: karachi,
          promoCode: 'HELLO10',
          email: 'new@example.pk',
          ...extra,
        },
        token,
      );

    it('PR-04 HELLO10 needs an order over Rs 3,000', async () => {
      const at = await withCode('plain-3000').expect(200);
      expect(at.body.promo).toMatchObject({
        applied: false,
        reason: 'This code needs an order over Rs 3,000',
      });
      expect(at.body.discount).toBe(0);
      const over = await withCode('plain-3001').expect(200);
      expect(over.body.promo).toMatchObject({
        applied: true,
        percent: 10,
        discount: 300,
      });
      expect(over.body.total).toBe(3001 + 350 - 300);
    });

    it('PR-08 takes 10% off items and extras, not delivery', async () => {
      const res = await quote({
        lines: [line('plain-4000')],
        delivery: { city: 'Gwadar' },
        promoCode: 'hello10',
        email: 'new@example.pk',
      }).expect(200);
      expect(res.body).toMatchObject({
        subtotal: 4000,
        deliveryFee: 650,
        discount: 400,
        total: 4250,
      });
    });

    it('PR-05 works once: a customer who has ordered cannot use it again', async () => {
      const prior = doc({ id: 'o1', customerId: 'c1', status: 'delivered' });
      await app.close();
      await boot({ orders: [prior] });
      const res = await withCode('plain-4000', {
        email: 'Repeat@Example.pk',
      }).expect(200);
      expect(res.body.promo).toMatchObject({
        applied: false,
        reason: 'This code is for a first gift only',
      });
      const cancelled = doc({
        id: 'o2',
        customerId: 'c1',
        status: 'cancelled',
      });
      await app.close();
      await boot({ orders: [cancelled] });
      expect(
        (
          await withCode('plain-4000', { email: 'repeat@example.pk' }).expect(
            200,
          )
        ).body.promo.applied,
      ).toBe(true);
    });

    it('PR-05 a guest must give an email, a signed-in customer does not', async () => {
      const guest = await quote({
        lines: [line('plain-4000')],
        delivery: karachi,
        promoCode: 'HELLO10',
      }).expect(200);
      expect(guest.body.promo.reason).toBe(
        'Sign in or enter your email to use this code',
      );
      const reg = await request(server())
        .post('/api/v1/auth/register')
        .send({ email: 'signed@example.pk', password: 'password-123' })
        .expect(201);
      const signed = await quote(
        {
          lines: [line('plain-4000')],
          delivery: karachi,
          promoCode: 'HELLO10',
        },
        reg.body.accessToken,
      ).expect(200);
      expect(signed.body.promo.applied).toBe(true);
    });

    it('reports an unknown code without failing the quote', async () => {
      const res = await withCode('plain-4000', {
        promoCode: 'FREEGIFT',
      }).expect(200);
      expect(res.body.promo).toMatchObject({
        applied: false,
        reason: 'That code is not valid',
      });
      expect(res.body.total).toBe(4350);
      expect(
        (
          await quote({
            lines: [line('plain-4000')],
            delivery: karachi,
          }).expect(200)
        ).body.promo,
      ).toBeNull();
    });
  });
});
