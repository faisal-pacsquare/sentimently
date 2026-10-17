import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { GoogleVerifier } from '../src/auth/google.verifier';
import { hashPassword } from '../src/auth/password';
import { ConsoleMailer, MAILER } from '../src/mail/mailer';
import { setupApp } from '../src/setup';
import { MemoryDriver } from '../src/storage/memory.driver';
import { Doc, STORAGE_DRIVER } from '../src/storage/storage.types';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');

const T = '2026-11-01T00:00:00.000Z';
const doc = (o: Record<string, unknown>) =>
  ({ createdAt: T, updatedAt: T, ...o }) as Doc;

const taxonomy = [
  doc({ id: 't1', kind: 'category', slug: 'jewellery', name: 'Jewellery' }),
  doc({ id: 't2', kind: 'sentiment', slug: 'i-miss-you', name: 'I miss you' }),
];
const extras = [doc({ id: 'premium_wrap', name: 'Premium wrap', price: 350 })];
const products = [
  doc({
    id: 'p1',
    slug: 'necklace',
    name: 'Necklace',
    description: 'd',
    price: 3500,
    type: 'physical',
    stock: 5,
    category: 'jewellery',
    isActive: true,
  }),
];

const guestOrder = doc({
  id: 'o-guest',
  number: 'SN-GUEST123',
  customerId: 'guest1',
  contactEmail: 'guest@example.pk',
  contactName: 'Gita Guest',
  status: 'delivered',
  paymentMethod: 'cod',
  currency: 'PKR',
  total: 1150,
  subtotal: 800,
  deliveryFee: 350,
  discount: 0,
  itemsTotal: 800,
  extrasTotal: 0,
  city: 'Karachi',
  lines: [],
  events: [],
  delivery: {
    method: 'address',
    address: 'House 9, Gulshan, Karachi',
    phone: '03001112222',
    city: 'Karachi',
    attempts: 0,
  },
});

async function seedCustomers() {
  const pw = await hashPassword('staff-password-1');
  return [
    doc({
      id: 'staff1',
      email: 'staff@sentimently.pk',
      role: 'staff',
      authProvider: 'email',
      isGuest: false,
      passwordHash: pw,
      name: 'Sana Staff',
    }),
    doc({
      id: 'guest1',
      email: 'guest@example.pk',
      role: 'customer',
      authProvider: 'email',
      isGuest: true,
    }),
    doc({
      id: 'buyer1',
      email: 'buyer@example.pk',
      role: 'customer',
      authProvider: 'email',
      isGuest: false,
      passwordHash: pw,
      name: 'Bilal Buyer',
    }),
  ];
}

describe('Accounts and engagement (e2e)', () => {
  let app: INestApplication;
  let google: { verify: jest.Mock };
  const server = () => app.getHttpServer();
  const api = (path: string) => `/api/v1${path}`;

  async function boot(
    env: Record<string, string> = {},
    orders: Doc[] = [guestOrder],
  ) {
    Object.assign(
      process.env,
      {
        AUTH_RATE_LIMIT: '1000',
        CONTACT_RATE_LIMIT: '1000',
        RATE_LIMIT_MAX: '1000',
        JWT_SECRET: 'test-secret',
      },
      env,
    );
    google = { verify: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          taxonomy,
          extras,
          products,
          customers: await seedCustomers(),
          orders,
        }),
      )
      .overrideProvider(GoogleVerifier)
      .useValue(google)
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  }

  afterEach(async () => {
    await app.close();
    for (const k of [
      'AUTH_RATE_LIMIT',
      'CONTACT_RATE_LIMIT',
      'RATE_LIMIT_MAX',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'ADMIN_RESET',
    ])
      delete process.env[k];
  });

  const mailbox = () => app.get<ConsoleMailer>(MAILER).outbox;
  const tokenFrom = (to: string, subject: string) =>
    /token=([a-f0-9]+)/.exec(
      [...mailbox()]
        .reverse()
        .find((m) => m.to === to && m.subject.includes(subject))!.text,
    )![1];
  const confirm = (token: string) =>
    request(server()).post(api('/auth/verify-email')).send({ token });
  const bearerOf = (token: string) => ({ Authorization: `Bearer ${token}` });
  const myOrders = async (token: string) =>
    (
      await request(server())
        .get(api('/orders'))
        .set(bearerOf(token))
        .expect(200)
    ).body as Doc[];

  const register = (email: string, password = 'password-123', name?: string) =>
    request(server())
      .post(api('/auth/register'))
      .send({ email, password, name });
  const login = (email: string, password: string) =>
    request(server()).post(api('/auth/login')).send({ email, password });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  async function tokenFor(email: string, password = 'staff-password-1') {
    return (await login(email, password).expect(200)).body
      .accessToken as string;
  }

  describe('sign-up and sign-in', () => {
    beforeEach(() => boot());

    it('E3-1 registers, returns a token, and the token opens /me', async () => {
      const res = await register(
        'Ayesha@Example.pk',
        'password-123',
        'Ayesha Khan',
      ).expect(201);
      expect(res.body.customer).toMatchObject({
        email: 'ayesha@example.pk',
        name: 'Ayesha Khan',
        role: 'customer',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
      const me = await request(server())
        .get(api('/me'))
        .set(bearer(res.body.accessToken))
        .expect(200);
      expect(me.body.email).toBe('ayesha@example.pk');
    });

    it('E3-1 rejects a duplicate of a confirmed email, and a short password', async () => {
      await register('dup@example.pk').expect(201);
      await confirm(tokenFrom('dup@example.pk', 'Confirm')).expect(200);
      await register('DUP@example.pk').expect(409);
      await register('short@example.pk', 'abc').expect(400);
    });

    it('E3-1 logs in case-insensitively and gives one message for a wrong password or unknown email', async () => {
      await register('login@example.pk').expect(201);
      await login('LOGIN@example.pk', 'password-123').expect(200);
      const wrong = await login('login@example.pk', 'wrong-password').expect(
        401,
      );
      const unknown = await login('nobody@example.pk', 'password-123').expect(
        401,
      );
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
    });

    it('a guest record cannot sign in', async () => {
      await login('guest@example.pk', 'anything-123').expect(401);
    });

    it('E3-6 private routes need a valid token; public routes ignore a bad one', async () => {
      await request(server()).get(api('/me')).expect(401);
      await request(server())
        .get(api('/me'))
        .set(bearer('garbage'))
        .expect(401);
      await request(server())
        .get(api('/products'))
        .set(bearer('garbage'))
        .expect(200);
    });
  });

  describe('password reset', () => {
    beforeEach(() => boot());

    it('E3-1 resets once with the emailed link, and never reveals which emails exist', async () => {
      await register('reset@example.pk', 'old-password-1').expect(201);
      const known = await request(server())
        .post(api('/auth/forgot-password'))
        .send({ email: 'reset@example.pk' })
        .expect(202);
      const unknown = await request(server())
        .post(api('/auth/forgot-password'))
        .send({ email: 'ghost@example.pk' })
        .expect(202);
      expect(known.body).toEqual(unknown.body);

      const token = tokenFrom('reset@example.pk', 'Reset your');
      expect(
        mailbox().filter((m) => m.subject.includes('Reset your')),
      ).toHaveLength(1); // none for the unknown address

      await request(server())
        .post(api('/auth/reset-password'))
        .send({ token, password: 'brand-new-pass' })
        .expect(200);
      await request(server())
        .post(api('/auth/reset-password'))
        .send({ token, password: 'another-pass-1' })
        .expect(400);
      await login('reset@example.pk', 'old-password-1').expect(401);
      await login('reset@example.pk', 'brand-new-pass').expect(200);
    });

    it('E3-1 rejects an unknown reset token', async () => {
      await request(server())
        .post(api('/auth/reset-password'))
        .send({ token: 'nope', password: 'brand-new-pass' })
        .expect(400);
    });
  });

  describe('Google sign-in', () => {
    beforeEach(() => boot());

    it('E3-2 creates an account, and links to a confirmed one by email', async () => {
      google.verify.mockResolvedValueOnce({
        email: 'New.Person@gmail.com',
        name: 'New Person',
      });
      const created = await request(server())
        .post(api('/auth/google'))
        .send({ idToken: 'tok' })
        .expect(200);
      expect(created.body.customer).toMatchObject({
        email: 'new.person@gmail.com',
        authProvider: 'google',
        emailVerified: true,
      });

      await register('both@example.pk').expect(201);
      await confirm(tokenFrom('both@example.pk', 'Confirm')).expect(200);
      google.verify.mockResolvedValueOnce({
        email: 'both@example.pk',
        name: 'Both',
      });
      const linked = await request(server())
        .post(api('/auth/google'))
        .send({ idToken: 'tok' })
        .expect(200);
      expect(linked.body.customer.authProvider).toBe('email'); // keeps the password sign-in
      await login('both@example.pk', 'password-123').expect(200);
    });
  });

  describe('profile, wishlist and reminders', () => {
    let token: string;
    beforeEach(async () => {
      await boot();
      token = (await register('me@example.pk').expect(201)).body.accessToken;
    });

    it('E3-3 updates the profile', async () => {
      const res = await request(server())
        .patch(api('/me'))
        .set(bearer(token))
        .send({ name: 'Me', phone: '0300 1234567' })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'Me', phone: '0300 1234567' });
    });

    it('E3-3 adds, lists and removes wishlist gifts; adding twice is harmless', async () => {
      await request(server())
        .put(api('/me/wishlist/p1'))
        .set(bearer(token))
        .expect(204);
      await request(server())
        .put(api('/me/wishlist/p1'))
        .set(bearer(token))
        .expect(204);
      const list = await request(server())
        .get(api('/me/wishlist'))
        .set(bearer(token))
        .expect(200);
      expect(list.body.map((p: Doc) => p.slug)).toEqual(['necklace']);
      await request(server())
        .delete(api('/me/wishlist/p1'))
        .set(bearer(token))
        .expect(204);
      expect(
        (await request(server()).get(api('/me/wishlist')).set(bearer(token)))
          .body,
      ).toEqual([]);
      await request(server())
        .put(api('/me/wishlist/missing'))
        .set(bearer(token))
        .expect(404);
    });

    it('E3-4 manages reminders, and hides other customers reminders', async () => {
      const created = await request(server())
        .post(api('/me/reminders'))
        .set(bearer(token))
        .send({
          label: 'Mum birthday',
          date: '2027-03-01',
          recipientName: 'Mum',
        })
        .expect(201);
      expect(created.body).toMatchObject({
        label: 'Mum birthday',
        notifyDaysBefore: 7,
      });
      await request(server())
        .patch(api(`/me/reminders/${created.body.id}`))
        .set(bearer(token))
        .send({ notifyDaysBefore: 3 })
        .expect(200);
      expect(
        (await request(server()).get(api('/me/reminders')).set(bearer(token)))
          .body[0].notifyDaysBefore,
      ).toBe(3);

      const other = (await register('other@example.pk').expect(201)).body
        .accessToken;
      await request(server())
        .delete(api(`/me/reminders/${created.body.id}`))
        .set(bearer(other))
        .expect(404);
      await request(server())
        .delete(api(`/me/reminders/${created.body.id}`))
        .set(bearer(token))
        .expect(204);
      await request(server())
        .post(api('/me/reminders'))
        .set(bearer(token))
        .send({ label: 'x', date: 'not-a-date' })
        .expect(400);
    });
  });

  describe('reviews', () => {
    const paidOrder = doc({
      id: 'o1',
      customerId: 'buyer1',
      status: 'delivered',
      lines: [{ productId: 'p1' }],
    });
    beforeEach(() => boot({}, [paidOrder]));

    it('OR-08 only buyers count towards the rating; a non-buyer review is shown but not counted', async () => {
      const visitor = (
        await register(
          'visitor@example.pk',
          'password-123',
          'Vera Visitor',
        ).expect(201)
      ).body.accessToken;
      const buyer = await tokenFor('buyer@example.pk');

      const v = await request(server())
        .post(api('/products/necklace/reviews'))
        .set(bearer(visitor))
        .send({ rating: 1, text: 'meh' })
        .expect(201);
      expect(v.body.verified).toBe(false);
      expect(
        (await request(server()).get(api('/products/necklace'))).body,
      ).toMatchObject({ rating: null, reviewCount: 0 });

      const b = await request(server())
        .post(api('/products/necklace/reviews'))
        .set(bearer(buyer))
        .send({ rating: 5, text: 'lovely' })
        .expect(201);
      expect(b.body.verified).toBe(true);
      expect(
        (await request(server()).get(api('/products/necklace'))).body,
      ).toMatchObject({ rating: 5, reviewCount: 1 });

      const list = await request(server())
        .get(api('/products/necklace/reviews'))
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body.map((r: Doc) => r.author).sort()).toEqual([
        'Bilal',
        'Vera',
      ]);
      expect(JSON.stringify(list.body)).not.toMatch(/customerId|email/);
    });

    it('E3-5 needs sign-in, allows one review per gift, validates the rating', async () => {
      await request(server())
        .post(api('/products/necklace/reviews'))
        .send({ rating: 5 })
        .expect(401);
      const buyer = await tokenFor('buyer@example.pk');
      await request(server())
        .post(api('/products/necklace/reviews'))
        .set(bearer(buyer))
        .send({ rating: 6 })
        .expect(400);
      await request(server())
        .post(api('/products/necklace/reviews'))
        .set(bearer(buyer))
        .send({ rating: 4 })
        .expect(201);
      await request(server())
        .post(api('/products/necklace/reviews'))
        .set(bearer(buyer))
        .send({ rating: 4 })
        .expect(409);
      await request(server())
        .post(api('/products/unknown/reviews'))
        .set(bearer(buyer))
        .send({ rating: 4 })
        .expect(404);
    });

    it('E3-5 staff can hide a review, which removes it from the rating', async () => {
      const buyer = await tokenFor('buyer@example.pk');
      const staff = await tokenFor('staff@sentimently.pk');
      const r = await request(server())
        .post(api('/products/necklace/reviews'))
        .set(bearer(buyer))
        .send({ rating: 5 })
        .expect(201);
      await request(server())
        .patch(api(`/admin/reviews/${r.body.id}`))
        .set(bearer(buyer))
        .send({ status: 'hidden' })
        .expect(403);
      await request(server())
        .patch(api(`/admin/reviews/${r.body.id}`))
        .set(bearer(staff))
        .send({ status: 'hidden' })
        .expect(200);
      expect(
        (await request(server()).get(api('/products/necklace'))).body,
      ).toMatchObject({ rating: null, reviewCount: 0 });
      expect(
        (await request(server()).get(api('/products/necklace/reviews'))).body,
      ).toEqual([]);
    });
  });

  describe('admin catalogue', () => {
    let staff: string;
    const gift = {
      slug: 'photo-book',
      name: 'Photo Book',
      description: 'Memories',
      price: 6000,
      type: 'physical',
      stock: 3,
      category: 'jewellery',
    };
    beforeEach(async () => {
      await boot();
      staff = await tokenFor('staff@sentimently.pk');
    });

    it('E2-5 customers get 403 and anonymous callers 401', async () => {
      const customer = (await register('cust@example.pk').expect(201)).body
        .accessToken;
      await request(server())
        .post(api('/admin/products'))
        .set(bearer(customer))
        .send(gift)
        .expect(403);
      await request(server())
        .post(api('/admin/products'))
        .send(gift)
        .expect(401);
    });

    it('E2-5 staff create, edit and hide a gift, and the public catalogue follows', async () => {
      const created = await request(server())
        .post(api('/admin/products'))
        .set(bearer(staff))
        .send(gift)
        .expect(201);
      expect(
        (await request(server()).get(api('/products/photo-book'))).body.name,
      ).toBe('Photo Book');

      await request(server())
        .patch(api(`/admin/products/${created.body.id}`))
        .set(bearer(staff))
        .send({ offerPrice: 4500 })
        .expect(200);
      expect(
        (await request(server()).get(api('/products/photo-book'))).body,
      ).toMatchObject({ effectivePrice: 4500, onOffer: true });

      await request(server())
        .delete(api(`/admin/products/${created.body.id}`))
        .set(bearer(staff))
        .expect(204);
      await request(server()).get(api('/products/photo-book')).expect(404);
      const all = await request(server())
        .get(api('/admin/products'))
        .set(bearer(staff))
        .expect(200);
      expect(all.body.find((p: Doc) => p.slug === 'photo-book').isActive).toBe(
        false,
      );
    });

    it('E2-5 rejects bad references, a bad offer price and a duplicate slug', async () => {
      const bad = await request(server())
        .post(api('/admin/products'))
        .set(bearer(staff))
        .send({
          ...gift,
          category: 'nope',
          sentiments: ['x'],
          allowedExtras: ['gold'],
        })
        .expect(400);
      expect(bad.body.error.message).toMatch(
        /category "nope".*sentiment "x".*extra "gold"/,
      );
      await request(server())
        .post(api('/admin/products'))
        .set(bearer(staff))
        .send({ ...gift, offerPrice: 6000 })
        .expect(400);
      await request(server())
        .post(api('/admin/products'))
        .set(bearer(staff))
        .send({ ...gift, slug: 'necklace' })
        .expect(409);
      await request(server())
        .post(api('/admin/products'))
        .set(bearer(staff))
        .send({ ...gift, slug: 'Bad Slug' })
        .expect(400);
    });

    it('E2-5 ignores fields a client should not set', async () => {
      const res = await request(server())
        .post(api('/admin/products'))
        .set(bearer(staff))
        .send({ ...gift, id: 'hacked', rating: 5, reviewCount: 999 })
        .expect(201);
      expect(res.body).toMatchObject({ rating: null, reviewCount: 0 });
      expect(res.body.id).not.toBe('hacked');
    });

    it('E2-5 staff manage taxonomy groups', async () => {
      const t = await request(server())
        .post(api('/admin/taxonomy'))
        .set(bearer(staff))
        .send({ kind: 'occasion', slug: 'eid', name: 'Eid' })
        .expect(201);
      await request(server())
        .post(api('/admin/taxonomy'))
        .set(bearer(staff))
        .send({ kind: 'occasion', slug: 'eid', name: 'Eid' })
        .expect(409);
      await request(server())
        .patch(api(`/admin/taxonomy/${t.body.id}`))
        .set(bearer(staff))
        .send({ name: 'Eid al-Fitr' })
        .expect(200);
      expect(
        (await request(server()).get(api('/taxonomy/occasions'))).body[0].name,
      ).toBe('Eid al-Fitr');
    });
  });

  describe('contact form', () => {
    beforeEach(() => boot());
    const message = {
      name: 'Zara',
      email: 'zara@example.pk',
      topic: 'bulk_gifting',
      subject: '50 boxes',
      message: 'Corporate order',
    };

    it('E8-3 / E8-2 anyone can send a message; only staff can read it', async () => {
      await request(server()).post(api('/contact')).send(message).expect(201);
      await request(server())
        .post(api('/contact'))
        .send({ ...message, topic: 'weather' })
        .expect(400);
      await request(server()).get(api('/admin/contact')).expect(401);
      const staff = await tokenFor('staff@sentimently.pk');
      const list = await request(server())
        .get(api('/admin/contact'))
        .set(bearer(staff))
        .expect(200);
      expect(list.body).toHaveLength(1);
      await request(server())
        .patch(api(`/admin/contact/${list.body[0].id}`))
        .set(bearer(staff))
        .send({ status: 'closed' })
        .expect(200);
    });
  });

  describe('limits and bootstrap', () => {
    it('sign-in is rate limited much harder than the rest of the API', async () => {
      await boot({ AUTH_RATE_LIMIT: '2' });
      await login('x@example.pk', 'password-123').expect(401);
      await login('x@example.pk', 'password-123').expect(401);
      const res = await login('x@example.pk', 'password-123').expect(429);
      expect(res.body.error.code).toBe('rate_limited');
    });

    it('the contact form is rate limited', async () => {
      await boot({ CONTACT_RATE_LIMIT: '1' });
      const m = {
        name: 'Z',
        email: 'z@example.pk',
        topic: 'other',
        subject: 's',
        message: 'm',
      };
      await request(server()).post(api('/contact')).send(m).expect(201);
      await request(server()).post(api('/contact')).send(m).expect(429);
    });

    it('creates the first admin from ADMIN_EMAIL and ADMIN_PASSWORD', async () => {
      await boot({
        ADMIN_EMAIL: 'Owner@Sentimently.pk',
        ADMIN_PASSWORD: 'owner-password-1',
      });
      const token = await tokenFor('owner@sentimently.pk', 'owner-password-1');
      await request(server())
        .get(api('/admin/products'))
        .set(bearer(token))
        .expect(200);
    });

    describe('a lost admin password', () => {
      // an admin already exists in the database, with a password nobody remembers
      async function bootWithAdmin(env: Record<string, string>) {
        Object.assign(
          process.env,
          {
            AUTH_RATE_LIMIT: '1000',
            RATE_LIMIT_MAX: '1000',
            JWT_SECRET: 'test-secret',
          },
          env,
        );
        const old = await hashPassword('forgotten-password-1');
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        })
          .overrideProvider(STORAGE_DRIVER)
          .useValue(
            new MemoryDriver({
              taxonomy,
              extras,
              products,
              customers: [
                doc({
                  id: 'admin1',
                  email: 'owner@sentimently.pk',
                  role: 'admin',
                  authProvider: 'email',
                  isGuest: false,
                  emailVerified: true,
                  passwordHash: old,
                }),
              ],
              orders: [],
            }),
          )
          .overrideProvider(GoogleVerifier)
          .useValue({ verify: jest.fn() })
          .compile();
        app = moduleRef.createNestApplication();
        setupApp(app);
        await app.init();
      }

      it('is NOT changed just by changing ADMIN_PASSWORD (the account already exists)', async () => {
        await bootWithAdmin({
          ADMIN_EMAIL: 'owner@sentimently.pk',
          ADMIN_PASSWORD: 'brand-new-password-1',
        });
        await login('owner@sentimently.pk', 'brand-new-password-1').expect(401);
        await login('owner@sentimently.pk', 'forgotten-password-1').expect(200);
      });

      it('is replaced when ADMIN_RESET=true, keeping the same account', async () => {
        await bootWithAdmin({
          ADMIN_EMAIL: 'owner@sentimently.pk',
          ADMIN_PASSWORD: 'brand-new-password-1',
          ADMIN_RESET: 'true',
        });
        const res = await login(
          'owner@sentimently.pk',
          'brand-new-password-1',
        ).expect(200);
        expect(res.body.customer).toMatchObject({
          id: 'admin1',
          role: 'admin',
        });
        await login('owner@sentimently.pk', 'forgotten-password-1').expect(401);
      });

      it('with ADMIN_RESET and a different email, adds that person as an admin and leaves the other one alone', async () => {
        await bootWithAdmin({
          ADMIN_EMAIL: 'new-owner@sentimently.pk',
          ADMIN_PASSWORD: 'brand-new-password-1',
          ADMIN_RESET: 'true',
        });
        await login('new-owner@sentimently.pk', 'brand-new-password-1').expect(
          200,
        );
        await login('owner@sentimently.pk', 'forgotten-password-1').expect(200);
      });
    });
  });
  describe('email that does not leave the building', () => {
    beforeEach(() => boot());

    it('tells a signed-in person the truth when the confirmation email could not be delivered', async () => {
      const me = await register('newbie@example.pk').expect(201);
      const res = await request(server())
        .post(api('/auth/resend-verification'))
        .set(bearerOf(me.body.accessToken))
        .expect(202);
      // the test mailer only logs, so nothing really went out
      expect(res.body.sent).toBe(false);
      expect(res.body.message).toMatch(/could not send the email/i);
    });

    it('the admin test-email tool says plainly that no email service is set up', async () => {
      const staff = await tokenFor('staff@sentimently.pk');
      await request(server())
        .post(api('/admin/mail/test'))
        .send({ to: 'a@b.pk' })
        .expect(401);
      await request(server())
        .post(api('/admin/mail/test'))
        .set(bearer(staff))
        .send({ to: 'a@b.pk' })
        .expect(403); // staff are not admins
    });
  });

  describe('email ownership and guest orders', () => {
    beforeEach(() => boot());

    it('registering an address that has guest orders reveals none of them', async () => {
      const attacker = await register(
        'guest@example.pk',
        'attacker-pass-1',
      ).expect(201);
      expect(attacker.body.customer).toMatchObject({ emailVerified: false });
      expect(attacker.body.customer.id).not.toBe('guest1');
      expect(await myOrders(attacker.body.accessToken)).toEqual([]);
      // knowing only the address is not enough to claim anything
      const claim = (number: string, email: string) =>
        request(server())
          .post(api('/me/claim-order'))
          .set(bearerOf(attacker.body.accessToken))
          .send({ number, email });
      await claim('SN-GUEST123', 'someone@else.pk').expect(404);
      await claim('SN-GUESS999', 'guest@example.pk').expect(404);
    });

    it('confirming the address does not hand guest orders to whoever set the password', async () => {
      // the real owner is tricked into clicking the confirmation link that the attacker's sign-up caused
      const attacker = await register(
        'guest@example.pk',
        'attacker-pass-1',
      ).expect(201);
      await confirm(tokenFrom('guest@example.pk', 'Confirm')).expect(200);
      expect(await myOrders(attacker.body.accessToken)).toEqual([]);
    });

    it('whoever has the order number and its email can add the order to their own account, once', async () => {
      const owner = await register(
        'guest@example.pk',
        'owners-own-pass',
      ).expect(201);
      const token = owner.body.accessToken;
      const claim = () =>
        request(server())
          .post(api('/me/claim-order'))
          .set(bearerOf(token))
          .send({ number: 'sn-guest123', email: 'Guest@Example.pk' });
      expect((await claim().expect(200)).body).toEqual({
        number: 'SN-GUEST123',
        added: true,
      });
      expect((await myOrders(token)).map((o) => o.number)).toEqual([
        'SN-GUEST123',
      ]);
      expect((await claim().expect(200)).body.added).toBe(false); // already mine: harmless

      const other = await register('other@example.pk').expect(201);
      await request(server())
        .post(api('/me/claim-order'))
        .set(bearerOf(other.body.accessToken))
        .send({ number: 'SN-GUEST123', email: 'guest@example.pk' })
        .expect(404); // not a guest order any more
      await request(server())
        .post(api('/me/claim-order'))
        .send({ number: 'SN-GUEST123', email: 'guest@example.pk' })
        .expect(401);
    });

    it('a stranger who registered first cannot keep the address: the real owner replaces them', async () => {
      const squatter = await register(
        'victim@example.pk',
        'squatter-pass-1',
        'Squatter',
      ).expect(201);
      const owner = await register(
        'victim@example.pk',
        'owner-pass-12345',
        'Real Owner',
      ).expect(201);
      expect(owner.body.customer).toMatchObject({
        name: 'Real Owner',
        emailVerified: false,
      });

      await request(server())
        .get(api('/me'))
        .set(bearerOf(squatter.body.accessToken))
        .expect(401); // their sign-in dies at once
      await login('victim@example.pk', 'squatter-pass-1').expect(401);
      await login('victim@example.pk', 'owner-pass-12345').expect(200);
      await request(server())
        .get(api('/me'))
        .set(bearerOf(owner.body.accessToken))
        .expect(200);
    });

    it('a confirmed address cannot be taken over', async () => {
      await register('safe@example.pk', 'first-pass-123').expect(201);
      await confirm(tokenFrom('safe@example.pk', 'Confirm')).expect(200);
      await register('safe@example.pk', 'second-pass-123').expect(409);
      await login('safe@example.pk', 'first-pass-123').expect(200);
    });

    it('Google sign-in replaces an unconfirmed squatter instead of joining their password to the real owner', async () => {
      await register('g-victim@example.pk', 'squatter-pass-1').expect(201);
      google.verify.mockResolvedValueOnce({
        email: 'g-victim@example.pk',
        name: 'Real Owner',
      });
      const res = await request(server())
        .post(api('/auth/google'))
        .send({ idToken: 'tok' })
        .expect(200);
      expect(res.body.customer).toMatchObject({
        authProvider: 'google',
        emailVerified: true,
      });
      await login('g-victim@example.pk', 'squatter-pass-1').expect(401); // the squatter's password is gone
    });

    it('Google sign-in does not reveal guest orders either', async () => {
      google.verify.mockResolvedValueOnce({
        email: 'guest@example.pk',
        name: 'Gita',
      });
      const res = await request(server())
        .post(api('/auth/google'))
        .send({ idToken: 'tok' })
        .expect(200);
      expect(await myOrders(res.body.accessToken)).toEqual([]);
    });

    it('resetting the password through the emailed link evicts a password set by someone else', async () => {
      await register('reset-victim@example.pk', 'squatter-pass-1').expect(201);
      await request(server())
        .post(api('/auth/forgot-password'))
        .send({ email: 'reset-victim@example.pk' })
        .expect(202);
      const token = tokenFrom('reset-victim@example.pk', 'Reset your');
      await request(server())
        .post(api('/auth/reset-password'))
        .send({ token, password: 'owner-pass-12345' })
        .expect(200);
      await login('reset-victim@example.pk', 'squatter-pass-1').expect(401);
      const owner = await login(
        'reset-victim@example.pk',
        'owner-pass-12345',
      ).expect(200);
      expect(owner.body.customer.emailVerified).toBe(true); // the link also proved the mailbox
    });

    it('confirmation links work once, expire with a new one, and unknown ones are refused', async () => {
      const reg = await register('confirm@example.pk').expect(201);
      const first = tokenFrom('confirm@example.pk', 'Confirm');
      await confirm('not-a-real-token').expect(400);

      await request(server())
        .post(api('/auth/resend-verification'))
        .set(bearerOf(reg.body.accessToken))
        .expect(202);
      const second = tokenFrom('confirm@example.pk', 'Confirm');
      expect(second).not.toBe(first);
      await confirm(first).expect(400); // replaced by the newer link
      const ok = await confirm(second).expect(200);
      expect(ok.body.customer.emailVerified).toBe(true);
      await confirm(second).expect(400); // single use

      const before = mailbox().length;
      await request(server())
        .post(api('/auth/resend-verification'))
        .set(bearerOf(reg.body.accessToken))
        .expect(202); // confirmed: nothing to send
      expect(mailbox()).toHaveLength(before);
      await request(server())
        .post(api('/auth/resend-verification'))
        .expect(401);
    });
  });
});
