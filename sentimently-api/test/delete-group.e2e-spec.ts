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

describe('Deleting a category or other group (e2e)', () => {
  let app: INestApplication;
  let admin = '';
  let staff = '';
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    const gift = (
      id: string,
      category: string,
      extra: Record<string, unknown> = {},
    ) =>
      doc({
        id,
        slug: `gift-${id}`,
        name: `Gift ${id}`,
        description: 'A gift',
        price: 1000,
        type: 'physical',
        stock: 5,
        category,
        sentiments: ['love', 'thanks'],
        occasions: ['eid'],
        recipients: [],
        isActive: true,
        imageUrls: [],
        ...extra,
      });
    const group = (kind: string, slug: string) =>
      doc({ id: `${kind}-${slug}`, kind, slug, name: slug.toUpperCase() });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy: [
            group('category', 'home'),
            group('category', 'ribbon'),
            group('category', 'empty'),
            group('sentiment', 'love'),
            group('sentiment', 'thanks'),
            group('occasion', 'eid'),
          ],
          extras: [],
          products: [
            gift('a', 'home'),
            gift('b', 'home', { isActive: false }), // hidden gifts count too
            gift('c', 'ribbon'),
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

  afterEach(() => app.close());

  const del = (id: string, token = admin, moveTo?: string) =>
    request(server())
      .delete(api(`/admin/taxonomy/${id}`))
      .query(moveTo ? { moveTo } : {})
      .set(auth(token));
  const gifts = async () =>
    (
      await request(server())
        .get(api('/admin/products'))
        .set(auth(admin))
        .expect(200)
    ).body as {
      id: string;
      category: string;
      sentiments: string[];
    }[];
  const groups = async (path: string) =>
    (
      (
        await request(server())
          .get(api(`/taxonomy/${path}`))
          .expect(200)
      ).body as { slug: string }[]
    ).map((g) => g.slug);

  it('is for administrators only', async () => {
    await request(server())
      .delete(api('/admin/taxonomy/category-empty'))
      .expect(401);
    await del('category-empty', staff).expect(403);
    expect(await groups('categories')).toContain('empty');
  });

  it('deletes an empty category', async () => {
    const res = await del('category-empty').expect(200);
    expect(res.body).toEqual({ giftsUpdated: 0 });
    expect(await groups('categories')).toEqual(['home', 'ribbon']);
  });

  it('will not delete a category that still has gifts (hidden ones too) unless told where they go', async () => {
    const res = await del('category-home').expect(409);
    expect(res.body.error.message).toMatch(/2 gifts are in this category/);
    expect(await groups('categories')).toContain('home');
    expect((await gifts()).filter((g) => g.category === 'home')).toHaveLength(
      2,
    );
  });

  it('moves the gifts to another category, and deletes nothing else', async () => {
    const res = await del('category-home', admin, 'ribbon').expect(200);
    expect(res.body).toEqual({ giftsUpdated: 2 });
    expect(await groups('categories')).toEqual(['ribbon', 'empty']);
    const all = await gifts();
    expect(all).toHaveLength(3);
    expect(all.every((g) => g.category === 'ribbon')).toBe(true);
    await request(server()).get(api('/products/gift-a')).expect(200);
  });

  it('refuses to move gifts to the category being deleted or to one that does not exist', async () => {
    await del('category-home', admin, 'home').expect(400);
    await del('category-home', admin, 'nowhere').expect(400);
    expect(await groups('categories')).toContain('home');
  });

  it('deleting a feeling takes it off the gifts and leaves them in the shop', async () => {
    const res = await del('sentiment-love').expect(200);
    expect(res.body).toEqual({ giftsUpdated: 3 });
    expect(await groups('sentiments')).toEqual(['thanks']);
    const all = await gifts();
    expect(all).toHaveLength(3);
    expect(all.every((g) => g.sentiments.join() === 'thanks')).toBe(true);
  });

  it('says not found for a group that is already gone', async () => {
    await del('category-empty').expect(200);
    await del('category-empty').expect(404);
  });
});
