import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { AlertsService } from '../alerts/alerts.service';
import { MAILER, Mailer } from '../mail/mailer';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';

export type DigitalKind = 'egift' | 'greeting';

export interface DigitalGift extends Doc {
  orderId: string;
  orderNumber: string;
  kind: DigitalKind;
  amount: number;
  senderName: string;
  recipientEmail: string;
  message?: string;
  /** When it is due. Set to the payment time for gifts that should go straight away. */
  sendAt?: string | null;
  sentAt?: string;
  issuedAt?: string; // set when payment is confirmed
  expiresAt?: string | null; // e-gift cards only: 12 months after issue (SC-03)
  code: string;
  status:
    | 'pending_payment'
    | 'scheduled'
    | 'sending'
    | 'sent'
    | 'failed'
    | 'cancelled';
  attempts?: number;
  nextAttemptAt?: string;
  lockedAt?: string;
  lastError?: string;
}

/** SC-04: a failed send is retried with growing gaps, then given up on and reported. */
export const MAX_SEND_ATTEMPTS = 5;
/** A gift stuck "sending" longer than this (the process died mid-send) is picked up again. */
const LOCK_MS = 5 * 60 * 1000;
const backoffMs = (attempts: number) => 2 ** attempts * 60 * 1000; // 2, 4, 8, 16 minutes

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no look-alikes
export function randomCode(length: number): string {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % 32]).join('');
}

/** SC-03: valid for 12 months from the issue date (calendar months, clamped to the end of a short month). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString();
}

export interface SendReport {
  sent: number;
  retrying: number;
  failed: number;
  /** Orders whose digital gifts have now all been sent. */
  completedOrderIds: string[];
}

@Injectable()
export class DigitalGiftsService {
  constructor(
    private readonly store: JsonStore,
    private readonly alerts: AlertsService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Not pure (random code); build the document once, then pass it to the store. */
  build(args: {
    orderId: string;
    orderNumber: string;
    kind: DigitalKind;
    amount: number;
    senderName: string;
    recipientEmail: string;
    message?: string;
    sendAt?: string | null;
  }): DigitalGift {
    const now = new Date().toISOString();
    const code = [
      randomCode(4),
      randomCode(4),
      randomCode(4),
      randomCode(4),
    ].join('-');
    // Times are compared as text later, so store them in one fixed format (UTC, with milliseconds).
    const sendAt = args.sendAt ? new Date(args.sendAt).toISOString() : null;
    return {
      ...args,
      sendAt,
      id: randomUUID(),
      code: `GC-${code}`,
      status: 'pending_payment',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Called when an order becomes paid. The issue date, and with it the 12-month expiry of an e-gift card,
   * starts here. Gifts due now go out straight away; later ones wait for the scheduler.
   */
  async dispatchForOrder(
    orderId: string,
    now: Date,
  ): Promise<{ allSent: boolean }> {
    const issuedAt = now.toISOString();
    await this.store.mutate('digitalGifts', (docs) => {
      for (const d of docs as DigitalGift[]) {
        if (d.orderId !== orderId || d.status !== 'pending_payment') continue;
        d.issuedAt = issuedAt;
        d.expiresAt = d.kind === 'egift' ? addMonths(issuedAt, 12) : null;
        d.sendAt = d.sendAt && d.sendAt > issuedAt ? d.sendAt : issuedAt;
        d.status = 'scheduled';
        d.updatedAt = issuedAt;
      }
    });
    await this.sendDue(now, orderId);
    const all = await this.store.find<DigitalGift>(
      'digitalGifts',
      (d) => d.orderId === orderId,
    );
    return { allSent: all.length > 0 && all.every((d) => d.status === 'sent') };
  }

  /**
   * SC-02 / SC-04: sends every gift that is due. Each gift is first claimed (marked "sending") in one
   * atomic step, so two overlapping runs can never send the same gift twice.
   */
  async sendDue(now: Date, onlyOrderId?: string): Promise<SendReport> {
    const nowIso = now.toISOString();
    const staleBefore = new Date(now.getTime() - LOCK_MS).toISOString();

    const claimed: DigitalGift[] = [];
    await this.store.mutate('digitalGifts', (docs) => {
      claimed.length = 0; // the function can run again after a write conflict
      for (const d of docs as DigitalGift[]) {
        if (onlyOrderId && d.orderId !== onlyOrderId) continue;
        const ready =
          d.status === 'scheduled' &&
          !!d.sendAt &&
          d.sendAt <= nowIso &&
          (!d.nextAttemptAt || d.nextAttemptAt <= nowIso);
        const stuck =
          d.status === 'sending' && !!d.lockedAt && d.lockedAt < staleBefore;
        if (!ready && !stuck) continue;
        d.status = 'sending';
        d.lockedAt = nowIso;
        claimed.push(structuredClone(d));
      }
    });

    const report: SendReport = {
      sent: 0,
      retrying: 0,
      failed: 0,
      completedOrderIds: [],
    };
    for (const gift of claimed) {
      try {
        await this.deliver(gift);
        await this.settle(gift.id, (d) => {
          d.status = 'sent';
          d.sentAt = nowIso;
          d.lastError = undefined;
        });
        report.sent++;
      } catch (e) {
        const attempts = (gift.attempts ?? 0) + 1;
        const giveUp = attempts >= MAX_SEND_ATTEMPTS;
        await this.settle(gift.id, (d) => {
          d.attempts = attempts;
          d.lastError = String(e).slice(0, 200);
          d.status = giveUp ? 'failed' : 'scheduled';
          d.nextAttemptAt = giveUp
            ? undefined
            : new Date(now.getTime() + backoffMs(attempts)).toISOString();
        });
        if (giveUp) {
          report.failed++;
          await this.alerts.raise(
            'A digital gift could not be sent',
            `Gift ${gift.id} for order ${gift.orderNumber} to ${gift.recipientEmail} failed ${attempts} times. Last error: ${String(e).slice(0, 200)}`,
          );
        } else {
          report.retrying++;
        }
      }
    }

    const orderIds = [...new Set(claimed.map((g) => g.orderId))];
    if (orderIds.length) {
      const all = await this.store.find<DigitalGift>('digitalGifts', (d) =>
        orderIds.includes(d.orderId),
      );
      report.completedOrderIds = orderIds.filter((id) =>
        all.filter((d) => d.orderId === id).every((d) => d.status === 'sent'),
      );
    }
    return report;
  }

  /** Gives a failed gift a fresh start and tries it now. Only a gift that was given up on can be retried. */
  async retry(id: string, now: Date) {
    await this.store.mutateByIds('digitalGifts', [id], (docs) => {
      const d = docs.get(id) as DigitalGift | undefined;
      if (!d) throw new NotFoundException('Gift not found');
      if (d.status !== 'failed')
        throw new ConflictException(
          'Only a gift that failed can be sent again',
        );
      d.status = 'scheduled';
      d.attempts = 0;
      d.sendAt = now.toISOString();
      d.nextAttemptAt = undefined;
      d.lastError = undefined;
    });
    const report = await this.sendDue(now);
    const g = (await this.store.get<DigitalGift>('digitalGifts', id))!;
    return {
      completedOrderIds: report.completedOrderIds,
      gift: {
        id: g.id,
        status: g.status,
        attempts: g.attempts ?? 0,
        lastError: g.lastError,
      },
    };
  }

  async cancelForOrder(orderId: string) {
    await this.store.mutate('digitalGifts', (docs) => {
      for (const d of docs as DigitalGift[]) {
        if (
          d.orderId === orderId &&
          (d.status === 'pending_payment' || d.status === 'scheduled')
        )
          d.status = 'cancelled';
      }
    });
  }

  /** Lets a recipient (or the checkout later) see whether a code is usable. Expired codes are refused (SC-03). */
  async check(code: string, now: Date) {
    const g = await this.store.findOne<DigitalGift>(
      'digitalGifts',
      (d) => d.code === code.trim().toUpperCase(),
    );
    if (!g || g.status !== 'sent')
      return { valid: false, reason: 'not_found' as const };
    if (g.expiresAt && g.expiresAt < now.toISOString())
      return {
        valid: false,
        reason: 'expired' as const,
        expiresAt: g.expiresAt,
      };
    return {
      valid: true,
      kind: g.kind,
      amount: g.kind === 'egift' ? g.amount : undefined,
      expiresAt: g.expiresAt ?? null,
    };
  }

  private async settle(id: string, change: (d: DigitalGift) => void) {
    await this.store.mutate('digitalGifts', (docs) => {
      const d = docs.find((x) => x.id === id) as DigitalGift | undefined;
      if (!d || d.status !== 'sending') return; // cancelled or settled elsewhere in the meantime
      d.lockedAt = undefined;
      change(d);
    });
  }

  /** Throws if the email cannot be sent, so the caller can retry. */
  private async deliver(g: DigitalGift) {
    const lines =
      g.kind === 'egift'
        ? [
            `${g.senderName} sent you a Sentimently e-gift card worth Rs ${g.amount.toLocaleString('en-PK')}.`,
            `Your code: ${g.code}`,
            `Valid until ${g.expiresAt?.slice(0, 10)}.`,
          ]
        : [
            `${g.senderName} sent you a Sentimently greeting card.`,
            `Your reference: ${g.code}`,
          ];
    await this.mailer.send({
      to: g.recipientEmail,
      subject:
        g.kind === 'egift'
          ? 'You have been sent a gift card'
          : 'A greeting card for you',
      text: [...lines, g.message ? `\nTheir message:\n${g.message}` : ''].join(
        '\n',
      ),
    });
  }
}
