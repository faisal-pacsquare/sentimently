import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { findTracker, SafepayGateway } from './safepay.gateway';

const cfg = {
  environment: 'sandbox' as const,
  apiKey: 'sec_public',
  secretKey: 'server-secret',
  webhookSecret: 'hook-secret',
  webBaseUrl: 'https://shop.example.pk',
};
const sign = (raw: string, secret = cfg.webhookSecret) =>
  createHmac('sha512', secret).update(raw).digest('hex');

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

/** A stand-in for Safepay: answers by path and records what we sent. */
function fakeSafepay(answers: Record<string, unknown | (() => Response)> = {}) {
  const calls: Call[] = [];
  const http = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = Object.keys(answers).find((k) => u.pathname.startsWith(k));
    const a = key ? answers[key] : undefined;
    if (typeof a === 'function') return (a as () => Response)();
    return new Response(JSON.stringify(a ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
  return { http, calls };
}

const session = {
  data: { tracker: { token: 'track_abc-123' }, state: 'TRACKER_STARTED' },
};
const passport = { data: 'tbt_token' };
const ended = (order = 'SN-ABC12345', amount: number | null = 115000) => ({
  data: {
    tracker: {
      token: 'track_abc-123',
      state: 'TRACKER_ENDED',
      metadata: { order_id: order },
    },
    purchase_totals: amount === null ? {} : { quote_amount: { amount } },
  },
});

describe('SafepayGateway', () => {
  describe('settings', () => {
    it('is off unless every setting is present', () => {
      expect(SafepayGateway.fromEnv({})).toBeUndefined();
      expect(
        SafepayGateway.fromEnv({
          SAFEPAY_API_KEY: 'a',
          SAFEPAY_SECRET_KEY: 'b',
          SAFEPAY_WEBHOOK_SECRET: 'c',
        }),
      ).toBeUndefined();
      expect(
        SafepayGateway.fromEnv({
          SAFEPAY_API_KEY: 'a',
          SAFEPAY_SECRET_KEY: 'b',
          SAFEPAY_WEBHOOK_SECRET: 'c',
          APP_URL: 'https://x.pk/',
        })?.available,
      ).toBe(true);
    });
  });

  describe('createCharge', () => {
    it('opens a session in paisa with the order number, and returns the hosted checkout link', async () => {
      const { http, calls } = fakeSafepay({
        '/order/payments/v3': session,
        '/client/passport': passport,
      });
      const out = await new SafepayGateway(cfg, http).createCharge({
        orderNumber: 'SN-ABC12345',
        amount: 1150,
        currency: 'PKR',
      });

      expect(calls[0].url).toBe(
        'https://sandbox.api.getsafepay.com/order/payments/v3/',
      );
      expect(calls[0].headers['X-SFPY-MERCHANT-SECRET']).toBe('server-secret');
      expect(calls[0].body).toMatchObject({
        merchant_api_key: 'sec_public',
        currency: 'PKR',
        amount: 115000,
        metadata: { order_id: 'SN-ABC12345' },
      });

      expect(out.gatewayRef).toBe('track_abc-123');
      const link = new URL(out.redirectUrl);
      expect(link.origin + link.pathname).toBe(
        'https://sandbox.api.getsafepay.com/embedded/',
      );
      expect(link.searchParams.get('tracker')).toBe('track_abc-123');
      expect(link.searchParams.get('tbt')).toBe('tbt_token');
      expect(link.searchParams.get('redirect_url')).toBe(
        'https://shop.example.pk/order-placed?paid=1&order=SN-ABC12345',
      );
      expect(link.searchParams.get('cancel_url')).toBe(
        'https://shop.example.pk/order-placed?cancelled=1&order=SN-ABC12345',
      );
    });

    it('never puts the server secret in the link the shopper sees', async () => {
      const { http } = fakeSafepay({
        '/order/payments/v3': session,
        '/client/passport': passport,
      });
      const out = await new SafepayGateway(cfg, http).createCharge({
        orderNumber: 'SN-1',
        amount: 10,
        currency: 'PKR',
      });
      expect(out.redirectUrl).not.toContain('server-secret');
      expect(out.redirectUrl).not.toContain('hook-secret');
    });

    it('fails clearly, as unavailable, when Safepay is down, refuses, or answers without a tracker', async () => {
      const down = (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch;
      await expect(
        new SafepayGateway(cfg, down).createCharge({
          orderNumber: 'SN-1',
          amount: 10,
          currency: 'PKR',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      const refused = fakeSafepay({
        '/order/payments/v3': () => new Response('{}', { status: 401 }),
      });
      await expect(
        new SafepayGateway(cfg, refused.http).createCharge({
          orderNumber: 'SN-1',
          amount: 10,
          currency: 'PKR',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      const empty = fakeSafepay({ '/order/payments/v3': { data: {} } });
      await expect(
        new SafepayGateway(cfg, empty.http).createCharge({
          orderNumber: 'SN-1',
          amount: 10,
          currency: 'PKR',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('uses the live host when told to', async () => {
      const { http, calls } = fakeSafepay({
        '/order/payments/v3': session,
        '/client/passport': passport,
      });
      const out = await new SafepayGateway(
        { ...cfg, environment: 'production' },
        http,
      ).createCharge({ orderNumber: 'SN-1', amount: 10, currency: 'PKR' });
      expect(calls[0].url.startsWith('https://api.getsafepay.com/')).toBe(true);
      expect(
        out.redirectUrl.startsWith('https://getsafepay.com/embedded/?'),
      ).toBe(true);
    });
  });

  describe('parseWebhook', () => {
    const body = {
      type: 'payment.succeeded',
      data: { notification: { tracker: 'track_abc-123' } },
      token: 'evt_9',
    };
    const raw = JSON.stringify(body);
    const headers = (sig: string) => ({ 'x-sfpy-signature': sig });

    it('rejects a missing or wrong signature before talking to Safepay', async () => {
      const { http, calls } = fakeSafepay();
      const g = new SafepayGateway(cfg, http);
      await expect(
        g.parseWebhook({}, body, Buffer.from(raw)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        g.parseWebhook(headers('00'), body, Buffer.from(raw)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        g.parseWebhook(
          headers(sign(raw, 'someone-else')),
          body,
          Buffer.from(raw),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(calls).toHaveLength(0);
    });

    it('rejects a signed body that was changed afterwards', async () => {
      const { http } = fakeSafepay();
      const tampered = raw.replace('payment.succeeded', 'payment.failed');
      await expect(
        new SafepayGateway(cfg, http).parseWebhook(
          headers(sign(raw)),
          JSON.parse(tampered),
          Buffer.from(tampered),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('confirms a success only after Safepay itself says the payment ended, and reads the amount in rupees', async () => {
      const { http, calls } = fakeSafepay({
        '/reporter/api/v1/payments': ended(),
      });
      const ev = await new SafepayGateway(cfg, http).parseWebhook(
        headers(sign(raw)),
        body,
        Buffer.from(raw),
      );
      expect(calls[0].url).toBe(
        'https://sandbox.api.getsafepay.com/reporter/api/v1/payments/track_abc-123',
      );
      expect(ev).toEqual({
        eventId: 'payment.succeeded:track_abc-123:evt_9',
        gatewayRef: 'track_abc-123',
        orderNumber: 'SN-ABC12345',
        status: 'succeeded',
        amount: 1150,
      });
    });

    it('does not confirm a "succeeded" callback while Safepay says the payment is unfinished, and asks for a resend', async () => {
      const pending = {
        data: {
          tracker: {
            state: 'TRACKER_STARTED',
            metadata: { order_id: 'SN-ABC12345' },
          },
        },
      };
      const { http } = fakeSafepay({ '/reporter/api/v1/payments': pending });
      await expect(
        new SafepayGateway(cfg, http).parseWebhook(
          headers(sign(raw)),
          body,
          Buffer.from(raw),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('reports a failure', async () => {
      const failed = JSON.stringify({ ...body, type: 'payment.failed' });
      const { http } = fakeSafepay({
        '/reporter/api/v1/payments': {
          data: {
            tracker: {
              state: 'TRACKER_STARTED',
              metadata: { order_id: 'SN-ABC12345' },
            },
          },
        },
      });
      const ev = await new SafepayGateway(cfg, http).parseWebhook(
        headers(sign(failed)),
        JSON.parse(failed),
        Buffer.from(failed),
      );
      expect(ev?.status).toBe('failed');
    });

    it('leaves the amount out when the report does not show one, instead of guessing', async () => {
      const { http } = fakeSafepay({
        '/reporter/api/v1/payments': ended('SN-ABC12345', null),
      });
      const ev = await new SafepayGateway(cfg, http).parseWebhook(
        headers(sign(raw)),
        body,
        Buffer.from(raw),
      );
      expect(ev?.amount).toBeUndefined();
    });

    it('acknowledges but ignores signed events of other kinds, or with no tracker, or no order number', async () => {
      const other = JSON.stringify({ type: 'refund.created', data: {} });
      const g = new SafepayGateway(cfg, fakeSafepay().http);
      expect(
        await g.parseWebhook(
          headers(sign(other)),
          JSON.parse(other),
          Buffer.from(other),
        ),
      ).toBeNull();

      const noTracker = JSON.stringify({ type: 'payment.succeeded', data: {} });
      expect(
        await g.parseWebhook(
          headers(sign(noTracker)),
          JSON.parse(noTracker),
          Buffer.from(noTracker),
        ),
      ).toBeNull();

      const noOrder = fakeSafepay({
        '/reporter/api/v1/payments': {
          data: { tracker: { state: 'TRACKER_ENDED' } },
        },
      });
      expect(
        await new SafepayGateway(cfg, noOrder.http).parseWebhook(
          headers(sign(raw)),
          body,
          Buffer.from(raw),
        ),
      ).toBeNull();
    });

    it('falls back to the re-serialised body when the raw bytes are not available', async () => {
      const { http } = fakeSafepay({ '/reporter/api/v1/payments': ended() });
      const ev = await new SafepayGateway(cfg, http).parseWebhook(
        headers(sign(JSON.stringify(body))),
        body,
      );
      expect(ev?.status).toBe('succeeded');
    });
  });

  describe('findTracker', () => {
    it('finds a tracker wherever it sits and ignores look-alikes', () => {
      expect(
        findTracker({ a: { b: ['x', { c: 'track_9f' }] } }),
      ).toBeUndefined(); // arrays are not searched
      expect(findTracker({ a: { b: { c: 'track_9f' } } })).toBe('track_9f');
      expect(
        findTracker({ a: 'not_a_track_token', b: 'tracker' }),
      ).toBeUndefined();
    });
  });
});
