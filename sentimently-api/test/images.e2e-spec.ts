import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 7),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);

describe('Gift photos (e2e)', () => {
  let app: INestApplication;
  let dir: string;
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let staff = '';
  let buyer = '';

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy: [
            doc({ id: 't1', kind: 'category', slug: 'home', name: 'Home' }),
          ],
          extras: [],
          products: [
            doc({
              id: 'p1',
              slug: 'mug',
              name: 'Photo mug',
              description: 'A mug',
              price: 1000,
              type: 'physical',
              stock: 5,
              category: 'home',
              isActive: true,
              imageUrls: [],
            }),
          ],
          customers: [
            doc({
              id: 's1',
              email: 'staff@x.pk',
              role: 'staff',
              authProvider: 'email',
              isGuest: false,
              passwordHash: pw,
              emailVerified: true,
            }),
            doc({
              id: 'b1',
              email: 'buyer@x.pk',
              role: 'customer',
              authProvider: 'email',
              isGuest: false,
              passwordHash: pw,
              emailVerified: true,
            }),
          ],
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    const login = async (email: string) =>
      (
        await request(server())
          .post(api('/auth/login'))
          .send({ email, password: 'staff-password-1' })
          .expect(200)
      ).body.accessToken as string;
    staff = await login('staff@x.pk');
    buyer = await login('buyer@x.pk');
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  const upload = (buf: Buffer, name = 'photo.jpg', token = staff) =>
    request(server())
      .post(api('/admin/images'))
      .set(auth(token))
      .attach('file', buf, { filename: name, contentType: 'image/jpeg' });
  const patch = (imageUrls: string[]) =>
    request(server())
      .patch(api('/admin/products/p1'))
      .set(auth(staff))
      .send({ imageUrls });

  it('only studio staff can upload', async () => {
    await request(server())
      .post(api('/admin/images'))
      .attach('file', JPEG, 'a.jpg')
      .expect(401);
    await upload(JPEG, 'a.jpg', buyer).expect(403);
  });

  it('stores a photo, and the shop can show it to anyone, with a long cache time', async () => {
    const res = await upload(JPEG).expect(201);
    expect(res.body.url).toMatch(/^\/api\/v1\/uploads\/[0-9a-f-]{36}\.jpg$/);
    const shown = await request(server()).get(res.body.url).expect(200); // no sign-in needed
    expect(shown.headers['content-type']).toMatch(/image\/jpeg/);
    expect(shown.headers['cache-control']).toMatch(/max-age=31536000/);
    expect(shown.headers['x-content-type-options']).toBe('nosniff');
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('uses what the file really is, not what it is called', async () => {
    const png = await upload(PNG, 'looks-like.jpg').expect(201);
    expect(png.body.url).toMatch(/\.png$/);
  });

  it('refuses things that are not photos, however they are named', async () => {
    await upload(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
      'logo.jpg',
    ).expect(400);
    await upload(
      Buffer.from('hello, I am a text file pretending'),
      'photo.jpg',
    ).expect(400);
    await request(server())
      .post(api('/admin/images'))
      .set(auth(staff))
      .expect(400); // no file at all
    expect(await readdir(dir)).toHaveLength(0);
  });

  it('refuses a photo that is too large', async () => {
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(5 * 1024 * 1024, 1),
    ]);
    await upload(big).expect(413);
    expect(await readdir(dir)).toHaveLength(0);
  });

  it('will not serve anything outside the photos folder', async () => {
    await request(server())
      .get(api('/uploads/..%2f..%2fpackage.json'))
      .expect(404);
    await request(server()).get(api('/uploads/passwd')).expect(404);
    await request(server())
      .get(api('/uploads/00000000-0000-0000-0000-000000000000.jpg'))
      .expect(404);
  });

  it('a gift can use uploaded photos and links, but not scripts', async () => {
    const { body } = await upload(JPEG).expect(201);
    await patch([body.url, 'https://cdn.example.com/mug.jpg']).expect(200);
    const list = await request(server())
      .get(api('/admin/products'))
      .set(auth(staff))
      .expect(200);
    expect(list.body.find((p: Doc) => p.id === 'p1').imageUrls).toEqual([
      body.url,
      'https://cdn.example.com/mug.jpg',
    ]);
    await patch(['javascript:alert(1)']).expect(400);
    await patch(['ftp://files.example.com/a.jpg']).expect(400);
    await patch(['data:text/html;base64,PHNjcmlwdD4=']).expect(400);
  });

  it('removing a photo from a gift deletes the file; a link to another site is left alone', async () => {
    const a = (await upload(JPEG).expect(201)).body.url as string;
    const b = (await upload(PNG).expect(201)).body.url as string;
    await patch([a, b, 'https://cdn.example.com/mug.jpg']).expect(200);
    expect(await readdir(dir)).toHaveLength(2);
    await patch([b, 'https://cdn.example.com/mug.jpg']).expect(200); // a is gone from the gift
    await request(server()).get(a).expect(404);
    await request(server()).get(b).expect(200);
    await patch([]).expect(200); // everything removed
    expect(await readdir(dir)).toHaveLength(0);
  });

  it('deleting an uploaded photo is refused while a gift still uses it', async () => {
    const url = (await upload(JPEG).expect(201)).body.url as string;
    await patch([url]).expect(200);
    const refused = await request(server())
      .delete(api('/admin/images'))
      .set(auth(staff))
      .send({ url })
      .expect(409);
    expect(refused.body.error.message).toMatch(/still used by "Photo mug"/);
    await request(server()).get(url).expect(200);
  });

  it('deleting a photo nobody uses removes it, and links to other sites cannot be "deleted"', async () => {
    const url = (await upload(JPEG).expect(201)).body.url as string;
    await request(server())
      .delete(api('/admin/images'))
      .set(auth(staff))
      .send({ url })
      .expect(204);
    await request(server()).get(url).expect(404);
    await request(server())
      .delete(api('/admin/images'))
      .set(auth(staff))
      .send({ url: 'https://cdn.example.com/mug.jpg' })
      .expect(400);
    await request(server())
      .delete(api('/admin/images'))
      .send({ url })
      .expect(401);
  });

  it('the health page says which photo store is in use', async () => {
    expect(
      (await request(server()).get(api('/health')).expect(200)).body.images,
    ).toBe('local');
  });
});
