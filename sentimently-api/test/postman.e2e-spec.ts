import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { buildCatalogue } from '../src/catalogue/catalogue-import';
import { listRoutes } from '../src/openapi';
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

interface Item {
  name: string;
  request: {
    method: string;
    body?: { raw: string };
    header: { key: string; value: string }[];
    auth?: { type: string };
  };
}
interface Collection {
  item: { name: string; item: Item[] }[];
}

/**
 * The Postman collection is generated, but it is only worth shipping if its example requests really work.
 * This replays the first journey a developer tries, using the collection's own bodies.
 */
describe('Postman collection (e2e)', () => {
  let app: INestApplication;
  const collectionPath = join(
    __dirname,
    '../postman/Sentimently.postman_collection.json',
  );
  const collection: Collection = JSON.parse(
    existsSync(collectionPath)
      ? readFileSync(collectionPath, 'utf8')
      : '{"item":[]}',
  );
  const items = collection.item.flatMap((f) => f.item);
  const vars: Record<string, string> = {};
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    process.env.RATE_LIMIT_MAX = '100000';
    process.env.AUTH_RATE_LIMIT = '100000';
    const extras = seed('extras');
    const imported = buildCatalogue({
      taxonomyCsv: read('samples', 'taxonomy.sample.csv'),
      productsCsv: read('samples', 'products.sample.csv'),
      extraCodes: extras.map((e) => e.id),
    });
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
    delete process.env.AUTH_RATE_LIMIT;
  });

  const find = (name: string) => {
    const item = items.find((i) => i.name === name);
    if (!item) throw new Error(`The collection has no "${name}"`);
    return item;
  };
  const fill = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
  const send = (name: string, path: string) => {
    const item = find(name);
    const req = request(server())[item.request.method.toLowerCase() as 'post'](
      `/api/v1${path}`,
    );
    if (item.request.auth?.type !== 'noauth' && vars.token)
      req.set('Authorization', `Bearer ${vars.token}`);
    for (const h of item.request.header)
      req.set(h.key, fill(h.value).replace('{{$guid}}', `key-${Date.now()}`));
    return item.request.body
      ? req.send(JSON.parse(fill(item.request.body.raw)))
      : req;
  };

  it('has a request for every route in the API', () => {
    const names = new Set(items.map((i) => i.name));
    const missing = listRoutes(app)
      .map((r) => `${r.method} ${r.openApiPath.replace('/api/v1', '')}`)
      .filter((n) => !names.has(n));
    expect(missing).toEqual([]);
  });

  it("runs the first journey end to end with the collection's own request bodies", async () => {
    const registered = await send(
      'POST /auth/register',
      '/auth/register',
    ).expect(201);
    vars.token = registered.body.accessToken;

    const list = await request(server()).get('/api/v1/products').expect(200);
    vars.productId = list.body.data.find(
      (p: Doc) => p.slug === 'sample-photo-mug',
    ).id;

    await send('POST /quote', '/quote').expect(200);
    const order = await send('POST /checkout', '/checkout').expect(201);
    vars.orderId = order.body.order.id;
    vars.orderNumber = order.body.order.number;

    const track = await send('POST /orders/track', '/orders/track').expect(200);
    expect(track.body.number).toBe(vars.orderNumber);
    await send('GET /orders', '/orders').expect(200);
    await send('POST /orders/cancel', '/orders/cancel').expect(200);
  });

  it('marks public requests as needing no token, and the rest as using the collection token', () => {
    expect(find('POST /quote').request.auth).toEqual({ type: 'noauth' });
    expect(find('GET /me').request.auth).toBeUndefined();
    expect(
      find('POST /checkout').request.header.some(
        (h) => h.key === 'Idempotency-Key',
      ),
    ).toBe(true);
  });
});
