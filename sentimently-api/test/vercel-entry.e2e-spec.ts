import { createServer } from 'node:http';
import handler from '../src/vercel';
// supertest is CommonJS and the e2e jest config has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');

/**
 * The function Vercel runs (api/index.js loads dist/vercel). Every other test builds the app another way, so this
 * is the only one that proves the serverless entry itself starts and answers.
 */
describe('Vercel entry point (e2e)', () => {
  const server = createServer((req, res) => {
    void handler(req, res);
  });

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-this-suite';
    process.env.RATE_LIMIT_MAX = '1000';
  });
  afterAll(() => {
    server.close();
  });

  it('starts and answers the health check', async () => {
    const res = await request(server).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('serves the catalogue from the seed data', async () => {
    const res = await request(server)
      .get('/api/v1/products?pageSize=1')
      .expect(200);
    expect(res.body.total).toBeGreaterThan(100);
  });
});

describe('Vercel entry point, bad configuration (e2e)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  const call = async (env: Record<string, string>) => {
    Object.assign(process.env, env);
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.KV_REST_API_URL;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh = require('../src/vercel').default as typeof handler;
    const server = createServer((req, res) => {
      void fresh(req, res);
    });
    try {
      return await request(server).get('/api/v1/health');
    } finally {
      server.close();
    }
  };

  it('says which setting is wrong, in words, with no secret values in the answer', async () => {
    const res = await call({
      NODE_ENV: 'production',
      VERCEL: '1',
      JWT_SECRET: 'too-short-SECRETVALUE',
      ADMIN_EMAIL: 'a@b.pk',
      ADMIN_PASSWORD: 'PWVALUE1',
    });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('misconfigured');
    expect(res.body.error.message).toMatch(/JWT_SECRET/);
    expect(res.body.error.message).toMatch(/ADMIN_PASSWORD/);
    expect(res.body.error.message).toMatch(/durable storage/);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRETVALUE|PWVALUE1/);
  });
});
