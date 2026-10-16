import {
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { PaymentGateway, WebhookEvent } from './payment-gateway';

/**
 * Safepay (Pakistan) card gateway. Hosted checkout: the shopper pays on Safepay's page, so no card
 * data ever reaches this server.
 *
 * Flow (Safepay "Express Checkout"):
 *   1. POST /order/payments/v3/        create a payment session ("tracker"), amount in paisa, our order number in metadata
 *   2. POST /client/passport/v1/token  a one-hour token for the shopper's checkout page
 *   3. redirect the shopper to {host}/embedded/?tracker=...&tbt=...&redirect_url=...&cancel_url=...
 *   4. Safepay calls our webhook (payment.succeeded / payment.failed), signed HMAC-SHA512 over the raw body
 *
 * The webhook is only a nudge. We verify its signature, take the tracker from it, and then ask Safepay
 * (GET /reporter/api/v1/payments/{tracker}) what really happened, so a payment is never confirmed from
 * data that only came in through the webhook body.
 *
 * Items marked VERIFY come from Safepay's public documentation and SDKs, not from a live merchant account.
 * Check them against the sandbox before FEATURE_CARD_PAYMENTS is switched on (see Safepay_Sandbox_Checklist.md).
 */

export interface SafepayConfig {
  environment: 'sandbox' | 'production';
  /** Public key ("merchant_api_key"). */
  apiKey: string;
  /** Server key, sent as X-SFPY-MERCHANT-SECRET. Never sent to the browser. */
  secretKey: string;
  /** The endpoint's shared secret from Developers > Endpoints in the dashboard. A different value to secretKey. */
  webhookSecret: string;
  /** Where shoppers come back to, e.g. https://shop.example.pk */
  webBaseUrl: string;
}

const API_HOST = {
  sandbox: 'https://sandbox.api.getsafepay.com',
  production: 'https://api.getsafepay.com',
};
// VERIFY: hosted checkout host (from the official Node SDK source).
const CHECKOUT_HOST = {
  sandbox: 'https://sandbox.api.getsafepay.com/embedded/',
  production: 'https://getsafepay.com/embedded/',
};
const TIMEOUT_MS = 8000;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** First string in the object, at any depth, that looks like a tracker token. */
export function findTracker(value: unknown, depth = 0): string | undefined {
  if (typeof value === 'string')
    return /^track_[A-Za-z0-9-]+$/.test(value) ? value : undefined;
  if (depth > 5 || !isObject(value)) return undefined;
  for (const v of Object.values(value)) {
    const found = findTracker(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** First value for a key, at any depth. */
function findKey(value: unknown, key: string, depth = 0): unknown {
  if (depth > 6 || !isObject(value)) return undefined;
  if (key in value) return value[key];
  for (const v of Object.values(value)) {
    const found = findKey(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export class SafepayGateway implements PaymentGateway {
  private readonly logger = new Logger('Safepay');
  readonly available = true;

  constructor(
    private readonly cfg: SafepayConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  /** A gateway when every setting is present; otherwise undefined and card payments stay off. */
  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    http?: typeof fetch,
  ): SafepayGateway | undefined {
    const environment =
      env.SAFEPAY_ENV === 'production' ? 'production' : 'sandbox';
    const apiKey = env.SAFEPAY_API_KEY;
    const secretKey = env.SAFEPAY_SECRET_KEY;
    const webhookSecret = env.SAFEPAY_WEBHOOK_SECRET;
    const webBaseUrl = env.APP_URL?.replace(/\/+$/, '');
    if (!apiKey || !secretKey || !webhookSecret || !webBaseUrl)
      return undefined;
    return new SafepayGateway(
      { environment, apiKey, secretKey, webhookSecret, webBaseUrl },
      http,
    );
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Json> {
    let res: Response;
    try {
      res = await this.http(`${API_HOST[this.cfg.environment]}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'X-SFPY-MERCHANT-SECRET': this.cfg.secretKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      this.logger.warn(`${method} ${path} failed: ${String(e)}`);
      throw new ServiceUnavailableException('Safepay could not be reached');
    }
    if (!res.ok) {
      this.logger.warn(`${method} ${path} answered ${res.status}`);
      throw new ServiceUnavailableException('Safepay refused the request');
    }
    const json: unknown = await res.json().catch(() => undefined);
    if (!isObject(json))
      throw new ServiceUnavailableException(
        'Safepay sent an unreadable answer',
      );
    return json;
  }

  async createCharge(args: {
    orderNumber: string;
    amount: number;
    currency: string;
  }): Promise<{ gatewayRef: string; redirectUrl: string }> {
    // VERIFY: amount is in the smallest unit (paisa for PKR), as the docs say for USD cents.
    const session = await this.call('POST', '/order/payments/v3/', {
      merchant_api_key: this.cfg.apiKey,
      intent: 'CYBERSOURCE',
      mode: 'payment',
      currency: args.currency,
      amount: Math.round(args.amount * 100),
      metadata: { order_id: args.orderNumber },
    });
    const tracker = findTracker(session.data);
    if (!tracker)
      throw new ServiceUnavailableException('Safepay did not start a payment');

    const auth = await this.call('POST', '/client/passport/v1/token', {});
    if (typeof auth.data !== 'string')
      throw new ServiceUnavailableException(
        'Safepay did not give a checkout token',
      );

    const back = (extra: string) =>
      `${this.cfg.webBaseUrl}/order-placed?${extra}`;
    // VERIFY: query parameter names (taken from the SDK's checkout call: tracker, tbt, source, redirect_url, cancel_url).
    const query = new URLSearchParams({
      environment: this.cfg.environment,
      tracker,
      tbt: auth.data,
      source: 'hosted',
      redirect_url: back(
        `paid=1&order=${encodeURIComponent(args.orderNumber)}`,
      ),
      cancel_url: back(
        `cancelled=1&order=${encodeURIComponent(args.orderNumber)}`,
      ),
    });
    return {
      gatewayRef: tracker,
      redirectUrl: `${CHECKOUT_HOST[this.cfg.environment]}?${query.toString()}`,
    };
  }

  /** Checks the signature, then asks Safepay what really happened. Returns null for events we do not act on. */
  async parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: Buffer,
  ): Promise<WebhookEvent | null> {
    const sent = headers['x-sfpy-signature'];
    const signature = Array.isArray(sent) ? sent[0] : sent;
    if (!signature) throw new UnauthorizedException('Missing signature');
    // The signature covers the exact bytes Safepay sent. Re-serialising parsed JSON is only a fallback.
    const signed = rawBody ?? Buffer.from(JSON.stringify(body));
    const expected = createHmac('sha512', this.cfg.webhookSecret)
      .update(signed)
      .digest();
    const given = Buffer.from(signature.trim().toLowerCase(), 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw new UnauthorizedException('Bad signature');

    if (!isObject(body)) return null;
    const type = typeof body.type === 'string' ? body.type : '';
    if (type !== 'payment.succeeded' && type !== 'payment.failed') return null;
    const tracker = findTracker(body.data);
    if (!tracker) return null;

    const report = await this.call(
      'GET',
      `/reporter/api/v1/payments/${encodeURIComponent(tracker)}`,
    );
    const orderNumber = findKey(report.data, 'order_id');
    if (typeof orderNumber !== 'string') {
      this.logger.warn(
        `Payment ${tracker} has no order number in its metadata`,
      );
      return null;
    }
    // VERIFY: state names. Documented: TRACKER_ENDED means paid.
    const state = findKey(report.data, 'state');
    const paid = state === 'TRACKER_ENDED';
    if (type === 'payment.succeeded' && !paid) {
      // Tell Safepay to try again later rather than confirming something it has not finished.
      throw new ServiceUnavailableException('The payment is not complete yet');
    }

    // VERIFY: where the charged amount sits in the report. If it is not found, the check is skipped:
    // the tracker was created by us with the order total and cannot be changed by the shopper.
    const totals = findKey(report.data, 'purchase_totals');
    const raw = isObject(totals)
      ? findKey(totals, 'amount')
      : findKey(report.data, 'amount');
    const amount = typeof raw === 'number' ? raw / 100 : undefined;

    const id = findKey(body, 'token') ?? findKey(body, 'id');
    return {
      eventId: `${type}:${tracker}:${typeof id === 'string' ? id : ''}`,
      gatewayRef: tracker,
      orderNumber,
      status: type === 'payment.succeeded' ? 'succeeded' : 'failed',
      amount,
    };
  }
}
