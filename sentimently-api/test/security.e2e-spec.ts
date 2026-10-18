import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { assertProductionConfig } from '../src/common/security';
import { listRoutes } from '../src/openapi';
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
const SECRET = 'test-secret';

/** Every route that is allowed to be called without signing in. Adding one here must be a deliberate decision. */
const EXPECTED_PUBLIC = [
  'GET /api/v1/health',
  'GET /api/v1/internal/scheduler/run',
  'GET /api/v1/gift-links/:token',
  'GET /api/v1/personalisation/options',
  'GET /api/v1/uploads/:file', // photos saved on this computer while developing
  'GET /api/v1/products',
  'GET /api/v1/search/suggest', // search-as-you-type: reads the public catalogue only
  'GET /api/v1/products/:slug',
  'GET /api/v1/products/:slug/reviews',
  'GET /api/v1/store',
  'GET /api/v1/taxonomy/:kind',
  'GET /api/v1/taxonomy/:kind/:slug',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/google',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/auth/verify-email',
  'POST /api/v1/checkout',
  'POST /api/v1/contact',
  'POST /api/v1/gift-cards/check',
  'POST /api/v1/gift-links/:token/claim',
  'POST /api/v1/orders/cancel',
  'POST /api/v1/orders/returns',
  'POST /api/v1/orders/track',
  'POST /api/v1/payments/webhook',
  'POST /api/v1/quote',
];

describe('Security (e2e)', () => {
  let app: INestApplication;
  let tokens: { customer: string; staff: string; admin: string };
  const server = () => app.getHttpServer();
  const api = (p: string) => `/api/v1${p}`;

  async function boot(env: Record<string, string> = {}) {
    Object.assign(
      process.env,
      {
        RATE_LIMIT_MAX: '100000',
        AUTH_RATE_LIMIT: '100000',
        JWT_SECRET: SECRET,
      },
      env,
    );
    const pw = await hashPassword('password-12345');
    const user = (id: string, role: string) =>
      doc({
        id,
        email: `${id}@example.pk`,
        role,
        isGuest: false,
        authProvider: 'email',
        passwordHash: pw,
      });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_DRIVER)
      .useValue(
        new MemoryDriver({
          products: [
            doc({
              id: 'p1',
              slug: 'mug',
              name: 'Mug',
              description: 'd',
              price: 800,
              type: 'physical',
              stock: 5,
              category: 'gifts',
              isActive: true,
            }),
          ],
          extras: seed('extras'),
          promoCodes: seed('promoCodes'),
          storeConfig: seed('storeConfig'),
          customers: [
            user('customer', 'customer'),
            user('staff', 'staff'),
            user('admin', 'admin'),
          ],
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
          .send({ email: `${id}@example.pk`, password: 'password-12345' })
          .expect(200)
      ).body.accessToken as string;
    tokens = {
      customer: await login('customer'),
      staff: await login('staff'),
      admin: await login('admin'),
    };
  }

  afterEach(async () => {
    await app.close();
    for (const k of [
      'RATE_LIMIT_MAX',
      'AUTH_RATE_LIMIT',
      'CORS_ORIGINS',
      'LOG_REQUESTS',
      'ERROR_WEBHOOK_URL',
    ])
      delete process.env[k];
    jest.restoreAllMocks();
  });

  const call = (method: string, path: string, token?: string) => {
    const r = request(server())
      [method.toLowerCase() as 'get'](path.replace(/:(\w+)/g, 'x'))
      .send({});
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  describe('who may call what', () => {
    beforeEach(() => boot());

    it('only the intended routes are public', () => {
      const publicRoutes = listRoutes(app)
        .filter((r) => r.isPublic)
        .map((r) => `${r.method} ${r.path}`)
        .sort();
      expect(publicRoutes).toEqual([...EXPECTED_PUBLIC].sort());
    });

    it('every other route turns away anonymous callers and forged or foreign tokens', async () => {
      const protectedRoutes = listRoutes(app).filter((r) => !r.isPublic);
      expect(protectedRoutes.length).toBeGreaterThan(30);
      const foreign = new JwtService({ secret: 'some-other-secret' }).sign({
        sub: 'admin',
        role: 'admin',
      });
      const expired = new JwtService({ secret: SECRET }).sign(
        { sub: 'admin', role: 'admin' },
        { expiresIn: '-10s' },
      );
      const noAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"admin","role":"admin"}').toString('base64url')}.`;
      const unknownUser = new JwtService({ secret: SECRET }).sign({
        sub: 'nobody',
        role: 'admin',
      });

      for (const r of protectedRoutes) {
        const label = `${r.method} ${r.path}`;
        expect([label, (await call(r.method, r.path)).status]).toEqual([
          label,
          401,
        ]);
        for (const bad of [foreign, expired, noAlg, unknownUser, 'garbage']) {
          expect([label, (await call(r.method, r.path, bad)).status]).toEqual([
            label,
            401,
          ]);
        }
      }
    }, 120_000);

    it('role-restricted routes refuse the wrong role and admit the right one', async () => {
      const restricted = listRoutes(app).filter((r) => !r.isPublic && r.roles);
      expect(restricted.length).toBeGreaterThan(20);
      for (const r of restricted) {
        const label = `${r.method} ${r.path}`;
        expect([
          label,
          (await call(r.method, r.path, tokens.customer)).status,
        ]).toEqual([label, 403]);
        const allowed = r.roles!.includes('staff')
          ? tokens.staff
          : tokens.admin;
        const status = (await call(r.method, r.path, allowed)).status;
        expect([label, status === 401 || status === 403]).toEqual([
          label,
          false,
        ]);
        if (!r.roles!.includes('staff'))
          expect([
            label,
            (await call(r.method, r.path, tokens.staff)).status,
          ]).toEqual([label, 403]);
      }
    }, 120_000);

    it('a customer cannot make themselves staff or admin', async () => {
      const reg = await request(server())
        .post(api('/auth/register'))
        .send({
          email: 'sly@example.pk',
          password: 'password-12345',
          role: 'admin',
          isGuest: false,
        })
        .expect(201);
      expect(reg.body.customer.role).toBe('customer');
      await request(server())
        .patch(api('/me'))
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .send({ role: 'admin', name: 'Sly' })
        .expect(200);
      await request(server())
        .get(api('/admin/orders'))
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(403);
    });

    it('a staff member cannot be stopped by a stale token: role changes apply at once', async () => {
      await request(server())
        .get(api('/admin/orders'))
        .set('Authorization', `Bearer ${tokens.staff}`)
        .expect(200);
      await app
        .get(JsonStore)
        .update('customers', 'staff', { role: 'customer' });
      await request(server())
        .get(api('/admin/orders'))
        .set('Authorization', `Bearer ${tokens.staff}`)
        .expect(403);
    });
  });

  describe('input handling', () => {
    beforeEach(() => boot());

    it('ignores __proto__ and unknown fields instead of letting them change anything', async () => {
      const body =
        '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"lines":[{"productId":"p1","quantity":1,"__proto__":{"polluted":"yes"}}],"delivery":{"city":"Karachi"}}';
      await request(server())
        .post(api('/quote'))
        .set('Content-Type', 'application/json')
        .send(body)
        .expect((r) => expect([200, 400]).toContain(r.status));
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();

      const created = await request(server())
        .post(api('/admin/products'))
        .set('Authorization', `Bearer ${tokens.staff}`)
        .set('Content-Type', 'application/json')
        .send(
          '{"__proto__":{"polluted":"yes"},"slug":"x-gift","name":"X","description":"d","price":100,"type":"digital","stock":1,"category":"gifts"}',
        );
      expect([201, 400]).toContain(created.status);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('rejects a request body that is far too large, in the normal error shape', async () => {
      const res = await request(server())
        .post(api('/quote'))
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ lines: [], pad: 'a'.repeat(300_000) }));
      expect(res.status).toBe(413);
      expect(res.body.error).toMatchObject({
        code: expect.any(String),
        message: expect.any(String),
      });
    });

    it('rejects malformed JSON in the normal error shape', async () => {
      const res = await request(server())
        .post(api('/quote'))
        .set('Content-Type', 'application/json')
        .send('{"lines": [');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    });

    it('does not echo input back as markup, and tells browsers not to guess types', async () => {
      const res = await request(server())
        .post(api('/auth/register'))
        .send({
          email: 'x@example.pk',
          password: 'password-12345',
          name: '<script>alert(1)</script>',
        })
        .expect(201);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('headers and caching', () => {
    beforeEach(() => boot());

    it('sends security headers and hides the framework', async () => {
      const res = await request(server()).get(api('/health')).expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('private responses are never cacheable; the public catalogue is', async () => {
      const mine = await request(server())
        .get(api('/me'))
        .set('Authorization', `Bearer ${tokens.customer}`)
        .expect(200);
      expect(mine.headers['cache-control']).toBe('no-store');
      const catalogue = await request(server())
        .get(api('/products'))
        .expect(200);
      expect(catalogue.headers['cache-control']).toContain('max-age=60');
      const error = await request(server())
        .get(api('/products/missing'))
        .expect(404);
      expect(error.headers['cache-control']).toBe('no-store');
    });

    it('serves the API contract', async () => {
      const res = await request(server()).get(api('/openapi.json')).expect(200);
      expect(res.body.info).toMatchObject({
        title: 'Sentimently API',
        version: '1.0.0',
      });
      expect(Object.keys(res.body.paths).length).toBeGreaterThan(40);
    });

    it('documents every route, with who may call it', async () => {
      const res = await request(server()).get(api('/openapi.json')).expect(200);
      for (const r of listRoutes(app)) {
        const op = res.body.paths[r.openApiPath]?.[r.method.toLowerCase()];
        expect([`${r.method} ${r.path}`, !!op]).toEqual([
          `${r.method} ${r.path}`,
          true,
        ]);
        expect(op['x-access']).toBe(
          r.isPublic
            ? 'public'
            : r.roles
              ? `roles: ${r.roles.join(', ')}`
              : 'signed-in',
        );
        expect(op.security).toEqual(r.isPublic ? [] : [{ bearer: [] }]);
      }
    });
  });

  describe('cross-origin access', () => {
    it('lets only the listed origins call the API from a browser', async () => {
      await boot({
        CORS_ORIGINS: 'https://shop.example.pk, https://admin.example.pk',
      });
      const ok = await request(server())
        .options(api('/checkout'))
        .set('Origin', 'https://shop.example.pk')
        .set('Access-Control-Request-Method', 'POST')
        .set(
          'Access-Control-Request-Headers',
          'authorization,idempotency-key,content-type',
        );
      expect(ok.status).toBeLessThan(300);
      expect(ok.headers['access-control-allow-origin']).toBe(
        'https://shop.example.pk',
      );
      expect(ok.headers['access-control-allow-headers']).toMatch(
        /Idempotency-Key/i,
      );
      expect(ok.headers['access-control-allow-credentials']).toBeUndefined();

      const bad = await request(server())
        .get(api('/products'))
        .set('Origin', 'https://evil.example');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();

      const exposed = await request(server())
        .get(api('/products'))
        .set('Origin', 'https://admin.example.pk');
      expect(exposed.headers['access-control-expose-headers']).toMatch(
        /Retry-After/,
      );
    });

    it('allows no other origin when none are configured', async () => {
      await boot();
      const res = await request(server())
        .get(api('/products'))
        .set('Origin', 'https://shop.example.pk');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('errors and logs', () => {
    beforeEach(() =>
      boot({ ERROR_WEBHOOK_URL: 'https://hooks.example/errors' }),
    );

    it('a server fault returns a generic message, never details, and is reported once a minute', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('ok'));
      jest
        .spyOn(JsonStore.prototype, 'read')
        .mockRejectedValue(new Error('database password is hunter2'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);

      for (let i = 0; i < 3; i++) {
        const res = await request(server()).get(api('/products')).expect(500);
        expect(res.body.error).toMatchObject({
          code: 'internal_error',
          message: 'Something went wrong. Please try again.',
        });
        expect(JSON.stringify(res.body)).not.toMatch(/hunter2|stack|at Object/);
      }
      await new Promise((r) => setTimeout(r, 50));
      const hooks = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('hooks.example'),
      );
      expect(hooks).toHaveLength(1);
      expect(
        String(JSON.parse(String((hooks[0][1] as RequestInit).body)).text),
      ).toMatch(/500 on \/api\/v1\/products/);
    });

    it('request logs name the route pattern, never the private link or ids in the real URL', async () => {
      process.env.LOG_REQUESTS = 'true';
      await app.close();
      await boot({ LOG_REQUESTS: 'true' });
      const lines: string[] = [];
      jest
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: unknown) => {
          lines.push(String(chunk));
          return true;
        });
      await request(server())
        .get(api('/gift-links/SUPER-SECRET-TOKEN-123'))
        .expect(404);
      await request(server())
        .get(api('/products/some-gift?email=a@b.pk'))
        .expect(404);
      jest.restoreAllMocks();

      const http = lines
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter((l) => l?.context === 'http');
      expect(http.map((l) => l.route)).toEqual([
        '/api/v1/gift-links/:token',
        '/api/v1/products/:slug',
      ]);
      expect(http[0]).toMatchObject({
        method: 'GET',
        status: 404,
        requestId: expect.any(String),
      });
      expect(lines.join('')).not.toMatch(/SUPER-SECRET-TOKEN|a@b\.pk/);
    });
  });

  describe('production configuration', () => {
    it('refuses weak or missing secrets in production, and only in production', () => {
      expect(() => assertProductionConfig({ NODE_ENV: 'production' })).toThrow(
        /JWT_SECRET/,
      );
      expect(() =>
        assertProductionConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' }),
      ).toThrow(/at least 32/);
      expect(() =>
        assertProductionConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'x'.repeat(32),
          CRON_SECRET: 'tiny',
        }),
      ).toThrow(/CRON_SECRET/);
      expect(() =>
        assertProductionConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'x'.repeat(32),
          ADMIN_EMAIL: 'a@b.pk',
          ADMIN_PASSWORD: 'short',
        }),
      ).toThrow(/ADMIN_PASSWORD/);
      expect(() =>
        assertProductionConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'x'.repeat(32),
          CRON_SECRET: 'y'.repeat(16),
        }),
      ).not.toThrow();
      expect(() =>
        assertProductionConfig({ NODE_ENV: 'development' }),
      ).not.toThrow();
    });

    it('on Vercel, refuses to run without a database unless a demo says so', () => {
      const base = {
        NODE_ENV: 'production',
        VERCEL: '1',
        JWT_SECRET: 'x'.repeat(32),
      };
      expect(() => assertProductionConfig(base)).toThrow(/durable storage/);
      expect(() =>
        assertProductionConfig({
          ...base,
          UPSTASH_REDIS_REST_URL: 'https://u',
          UPSTASH_REDIS_REST_TOKEN: 't',
        }),
      ).not.toThrow();
      expect(() =>
        assertProductionConfig({
          ...base,
          KV_REST_API_URL: 'https://u',
          KV_REST_API_TOKEN: 't',
        }),
      ).not.toThrow();
      expect(() =>
        assertProductionConfig({ ...base, ALLOW_MEMORY_STORAGE: 'true' }),
      ).not.toThrow();
      // a server that is not on Vercel (a single process) may keep data in memory
      expect(() =>
        assertProductionConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'x'.repeat(32),
        }),
      ).not.toThrow();
    });
  });
});
