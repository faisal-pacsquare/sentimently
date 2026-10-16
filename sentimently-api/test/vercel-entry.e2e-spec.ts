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
