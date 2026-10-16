import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { buildCatalogue } from '../src/catalogue/catalogue-import';
import { CLOCK } from '../src/pricing/pricing.service';
import { setupApp } from '../src/setup';
import { MemoryDriver } from '../src/storage/memory.driver';
import { Doc, STORAGE_DRIVER } from '../src/storage/storage.types';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');

const read = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8');
const seed = (file: string) =>
  JSON.parse(read('data', `${file}.json`)) as Doc[];

/**
 * Content rehearsal: the sample spreadsheets go through the importer and the result is served and priced by the real API.
 * This is what will happen with the studio's real files, so the same checks should pass for them.
 */
describe('Catalogue import rehearsal (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = '100000';
    const extras = seed('extras');
    const imported = buildCatalogue({
      taxonomyCsv: read('samples', 'taxonomy.sample.csv'),
      productsCsv: read('samples', 'products.sample.csv'),
      extraCodes: extras.map((e) => e.id),
    });
    expect(imported.errors).toEqual([]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          extras,
          promoCodes: seed('promoCodes'),
          storeConfig: seed('storeConfig'),
          taxonomy: imported.taxonomy as Doc[],
          products: imported.products as Doc[],
        }),
      )
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date('2026-11-18T05:00:00Z') })
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_MAX;
  });

  const product = async (slug: string) =>
    (
      await request(server())
        .get(api(`/products/${slug}`))
        .expect(200)
    ).body;

  it('serves the imported groups with their gift counts', async () => {
    const res = await request(server())
      .get(api('/taxonomy/sentiments'))
      .expect(200);
    expect(res.body.map((t: Doc) => [t.slug, t.productCount])).toEqual([
      ['i-miss-you', 3],
      ['thank-you', 3],
      ['im-sorry', 3],
    ]);
    const categories = await request(server())
      .get(api('/taxonomy/categories'))
      .expect(200);
    expect(categories.body.map((t: Doc) => [t.slug, t.productCount])).toEqual([
      ['home', 2],
      ['jewellery', 1],
      ['food', 1],
      ['digital', 2],
    ]);
  });

  it('filters and prices the imported gifts', async () => {
    const hub = await request(server())
      .get(api('/taxonomy/occasions/eid'))
      .expect(200);
    expect(hub.body.products.data.map((p: Doc) => p.slug).sort()).toEqual([
      'sample-chocolate-box',
      'sample-egift-card',
      'sample-name-necklace',
      'sample-scented-candle',
    ]);
    const cheap = await request(server())
      .get(api('/products?maxPrice=1000'))
      .expect(200);
    expect(cheap.body.data.map((p: Doc) => p.slug).sort()).toEqual([
      'sample-greeting-card',
      'sample-photo-mug',
    ]); // the mug counts at its offer price, Rs 999
    expect((await product('sample-photo-mug')).effectivePrice).toBe(999);
  });

  it("keeps each gift's own rules: made to order, perishable, digital", async () => {
    const necklace = await product('sample-name-necklace');
    expect(necklace).toMatchObject({ isMadeToOrder: true, leadTimeMaxDays: 7 });
    const quote = (lines: object[], delivery: object = { city: 'Karachi' }) =>
      request(server()).post(api('/quote')).send({ lines, delivery });
    const person = (extras: string[]) => ({
      recipientName: 'Ayesha',
      relationship: 'partner',
      cardDesign: 'classic',
      extras,
    });

    // made to order: nothing for 7 working days, and express is not on its list of extras
    const ok = await quote([
      {
        productId: necklace.id,
        quantity: 1,
        personalisation: person(['premium_wrap']),
      },
    ]).expect(200);
    expect(ok.body.delivery).toMatchObject({
      sameDay: false,
      earliestDate: '2026-11-27',
    });
    await quote([
      {
        productId: necklace.id,
        quantity: 1,
        personalisation: person(['express_same_day']),
      },
    ]).expect(400);

    // perishable: at most 3 days ahead
    const choc = await product('sample-chocolate-box');
    await quote([{ productId: choc.id, quantity: 1 }], {
      city: 'Karachi',
      date: '2026-11-21',
    }).expect(200);
    await quote([{ productId: choc.id, quantity: 1 }], {
      city: 'Karachi',
      date: '2026-11-22',
    }).expect(400);

    // digital: no address needed, no delivery fee
    const egift = await product('sample-egift-card');
    const digital = await quote(
      [{ productId: egift.id, quantity: 1 }],
      {},
    ).expect(200);
    expect(digital.body).toMatchObject({ deliveryFee: 0, total: 5000 });
  });
});
