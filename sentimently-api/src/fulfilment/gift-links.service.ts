import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AlertsService } from '../alerts/alerts.service';
import { MAILER, Mailer } from '../mail/mailer';
import { Order } from '../orders/order.types';
import { OrdersService } from '../orders/orders.service';
import { CLOCK, Clock } from '../pricing/pricing.service';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';

export interface GiftLink extends Doc {
  orderId: string;
  tokenHash: string;
  isClaimed: boolean;
  claimedAt?: string;
  expiresAt: string;
  recipientAddress?: string;
  recipientPhone?: string;
  recipientName?: string;
  expiryNotified?: boolean;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const NOT_VALID = 'This gift link is not valid';
/** A link for an order that was cancelled or sent back is as good as unknown. */
const DEAD = ['cancelled', 'refunded', 'returned'];

@Injectable()
export class GiftLinksService {
  private readonly logger = new Logger(GiftLinksService.name);

  constructor(
    private readonly store: JsonStore,
    private readonly orders: OrdersService,
    private readonly alerts: AlertsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * GL-02: what the recipient sees tells them nothing about the sender (no name, email, phone or order number).
   * An unknown link and a link for a cancelled order look the same.
   */
  async preview(token: string) {
    const { link, order } = await this.lookup(token);
    const status = link.isClaimed
      ? 'claimed'
      : link.expiresAt < this.clock.now().toISOString()
        ? 'expired'
        : 'ready';
    const recipientName =
      order.lines.find((l) => l.personalisation)?.personalisation
        ?.recipientName ?? null;
    return { status, recipientName, city: order.city ?? null };
  }

  /** GL-01: claimable once. GL-03: the address goes to the studio, never to the sender. GL-04: expires after 30 days. */
  async claim(
    token: string,
    dto: { address: string; phone: string; name?: string },
  ) {
    const hash = sha256(token);
    const { order } = await this.lookup(token);
    const now = this.clock.now().toISOString();

    // One atomic step: of two people claiming at once, exactly one gets through.
    await this.store.mutate('giftLinks', (docs) => {
      const l = docs.find((d) => (d as GiftLink).tokenHash === hash) as
        GiftLink | undefined;
      if (!l) throw new NotFoundException(NOT_VALID);
      if (l.isClaimed)
        throw new ConflictException('This gift has already been claimed');
      if (l.expiresAt < now)
        throw new GoneException('This gift link has expired');
      Object.assign(l, {
        isClaimed: true,
        claimedAt: now,
        recipientAddress: dto.address,
        recipientPhone: dto.phone,
        recipientName: dto.name,
        updatedAt: now,
      });
    });

    await this.store.mutateByIds('orders', [order.id], (docs) => {
      const o = docs.get(order.id) as Order | undefined;
      if (!o) return;
      o.delivery = {
        method: 'gift_link',
        city: o.city ?? '',
        attempts: 0,
        ...o.delivery,
        address: dto.address,
        phone: dto.phone,
      };
      o.events.push({
        at: now,
        type: 'note',
        by: 'recipient',
        note: 'The recipient added their address',
      });
      o.updatedAt = now;
    });

    await this.tell(
      order.contactEmail,
      `Order ${order.number}: your gift link was used`,
      'The person you sent your gift to has added their address, so we can now get your gift to them. We keep their details private, as promised.',
    );
    return {
      message: 'Thank you. Your details are saved and your gift is on its way.',
    };
  }

  /** Links past their 30 days that nobody claimed: tell the sender and the studio, once. */
  async notifyExpired(): Promise<number> {
    const now = this.clock.now().toISOString();
    const expired: GiftLink[] = [];
    await this.store.mutate('giftLinks', (docs) => {
      expired.length = 0;
      for (const l of docs as GiftLink[]) {
        if (!l.isClaimed && !l.expiryNotified && l.expiresAt < now) {
          l.expiryNotified = true;
          expired.push(structuredClone(l));
        }
      }
    });
    for (const l of expired) {
      const order = await this.store.get<Order>('orders', l.orderId);
      if (!order || DEAD.includes(order.status)) continue;
      await this.orders.addNote(
        order.id,
        'The gift link expired without being claimed',
      );
      await this.tell(
        order.contactEmail,
        `Order ${order.number}: your gift link expired`,
        'Nobody used the private link for your gift within 30 days. We will be in touch about what to do next.',
      );
      await this.alerts.raise(
        'A gift link expired unclaimed',
        `Order ${order.number}: contact ${order.contactEmail} to decide between a new link and a refund.`,
      );
    }
    return expired.length;
  }

  private async lookup(token: string) {
    const hash = sha256(token);
    const link = await this.store.findOne<GiftLink>(
      'giftLinks',
      (g) => g.tokenHash === hash,
    );
    if (!link) throw new NotFoundException(NOT_VALID);
    const order = await this.store.get<Order>('orders', link.orderId);
    if (!order || DEAD.includes(order.status))
      throw new NotFoundException(NOT_VALID);
    return { link, order };
  }

  private async tell(to: string, subject: string, text: string) {
    try {
      await this.mailer.send({ to, subject, text });
    } catch (e) {
      this.logger.error(`Could not email ${to}: ${String(e)}`);
    }
  }
}
