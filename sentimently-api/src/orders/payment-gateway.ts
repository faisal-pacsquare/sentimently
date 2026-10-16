import { ServiceUnavailableException } from '@nestjs/common';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface WebhookEvent {
  /** Unique per event. The same event delivered twice must not be applied twice (PY-02). */
  eventId: string;
  gatewayRef: string;
  orderNumber: string;
  status: 'succeeded' | 'failed';
  /** Left out when the gateway cannot say; then the amount fixed when the charge was created stands. */
  amount?: number;
}

/**
 * Card gateway adapter. The real one is SafepayGateway (safepay.gateway.ts), used when its settings are present. It must check the webhook signature in parseWebhook
 * and throw UnauthorizedException if it is wrong.
 */
export interface PaymentGateway {
  readonly available: boolean;
  createCharge(args: {
    orderNumber: string;
    amount: number;
    currency: string;
  }): Promise<{ gatewayRef: string; redirectUrl: string }>;
  /**
   * Checks the signature and turns the callback into an event, or null for callbacks we do not act on.
   * `rawBody` is the exact bytes received, which signatures are computed over.
   */
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
    rawBody?: Buffer,
  ): WebhookEvent | null | Promise<WebhookEvent | null>;
}

/** Used until a real gateway is configured: card payments are simply not offered. */
export class NullGateway implements PaymentGateway {
  readonly available = false;

  createCharge(): never {
    throw new ServiceUnavailableException(
      'Card payments are not available yet',
    );
  }

  parseWebhook(): never {
    throw new ServiceUnavailableException(
      'Card payments are not available yet',
    );
  }
}
