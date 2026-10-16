import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { verifyPassword } from '../auth/password';
import { Customer, publicCustomer } from '../customers/customer.types';
import type { DigitalGift } from '../digital/digital-gifts.service';
import type { GiftLink } from '../fulfilment/gift-links.service';
import type { Reminder, WishlistEntry } from '../me/me.service';
import { Order } from '../orders/order.types';
import { CLOCK, Clock } from '../pricing/pricing.service';
import type { Review } from '../reviews/reviews.service';
import { JsonStore } from '../storage/json-store.service';

/** Orders in these states are finished, so their personal details can be removed. */
const FINISHED = ['delivered', 'cancelled', 'refunded', 'returned'];
/** How long finished orders keep personal details. A policy question for the studio (Q11); override with RETENTION_DAYS. */
const DEFAULT_RETENTION_DAYS = 730;

/** Removes who and where from an order but keeps what is needed for accounts: amounts, dates, city, items. */
function scrubOrder(o: Order, at: string) {
  o.contactEmail = `erased-${o.id}@erased.invalid`;
  delete o.contactName;
  delete o.contactPhone;
  delete o.idempotencyKey;
  if (o.delivery) {
    delete o.delivery.address;
    delete o.delivery.phone;
  }
  for (const l of o.lines) {
    if (l.personalisation) {
      l.personalisation.recipientName = 'erased';
      delete l.personalisation.message;
    }
  }
  o.anonymisedAt = at;
  o.updatedAt = at;
}

@Injectable()
export class PrivacyService {
  constructor(
    private readonly store: JsonStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Everything we hold about the signed-in customer, to download. */
  async export(customerId: string) {
    const c = await this.store.get<Customer>('customers', customerId);
    if (!c) throw new NotFoundException('Account not found');
    const orders = await this.store.find<Order>(
      'orders',
      (o) => o.customerId === customerId,
    );
    const orderIds = new Set(orders.map((o) => o.id));
    const [wishlist, reminders, reviews, gifts] = await Promise.all([
      this.store.find<WishlistEntry>(
        'wishlists',
        (w) => w.customerId === customerId,
      ),
      this.store.find<Reminder>(
        'reminders',
        (r) => r.customerId === customerId,
      ),
      this.store.find<Review>('reviews', (r) => r.customerId === customerId),
      this.store.find<DigitalGift>('digitalGifts', (g) =>
        orderIds.has(g.orderId),
      ),
    ]);
    return {
      exportedAt: this.clock.now().toISOString(),
      account: { ...publicCustomer(c), createdAt: c.createdAt },
      orders: orders.map((o) => {
        const copy = { ...o };
        delete copy.idempotencyKey;
        return copy;
      }),
      digitalGiftsSent: gifts.map((g) => ({
        orderNumber: g.orderNumber,
        kind: g.kind,
        recipientEmail: g.recipientEmail,
        status: g.status,
        sendAt: g.sendAt,
      })),
      wishlist: wishlist.map((w) => w.productId),
      reminders,
      reviews: reviews.map((r) => ({
        productId: r.productId,
        rating: r.rating,
        text: r.text,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Self-service deletion. Email-and-password accounts must confirm their password. */
  async deleteMyAccount(customerId: string, password?: string) {
    const c = await this.store.get<Customer>('customers', customerId);
    if (!c || c.isGuest) throw new NotFoundException('Account not found');
    if (
      c.passwordHash &&
      !(password && (await verifyPassword(password, c.passwordHash)))
    ) {
      throw new ForbiddenException('The password is not correct');
    }
    await this.erase(c);
  }

  /** For support: erase a person by email, including guests who never had an account. */
  async eraseByEmail(email: string) {
    const records = await this.store.find<Customer>(
      'customers',
      (x) => x.email === email.trim().toLowerCase(),
    );
    if (!records.length) return { erased: false };
    for (const c of records) await this.erase(c); // the account and any guest record kept for the same address
    return { erased: true };
  }

  /** Retention: finished orders older than the retention period lose their personal details. */
  async anonymiseOld(now: Date): Promise<number> {
    const days = Number(process.env.RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
    const before = new Date(now.getTime() - days * 86_400_000).toISOString();
    const old = await this.store.find<Order>(
      'orders',
      (o) =>
        FINISHED.includes(o.status) && !o.anonymisedAt && o.updatedAt < before,
    );
    await this.scrubOrders(
      old.map((o) => o.id),
      now.toISOString(),
    );
    return old.length;
  }

  // ---------- internals ----------

  private async erase(c: Customer) {
    const at = this.clock.now().toISOString();
    const orders = await this.store.find<Order>(
      'orders',
      (o) => o.customerId === c.id,
    );
    if (orders.some((o) => !FINISHED.includes(o.status))) {
      throw new ConflictException(
        'There is an order still in progress. Please try again once it is complete or cancelled.',
      );
    }

    await this.scrubOrders(
      orders.map((o) => o.id),
      at,
    );

    const wishlist = (
      await this.store.find<WishlistEntry>(
        'wishlists',
        (w) => w.customerId === c.id,
      )
    ).map((w) => w.id);
    const reminders = (
      await this.store.find<Reminder>('reminders', (r) => r.customerId === c.id)
    ).map((r) => r.id);
    await this.removeAll('wishlists', wishlist);
    await this.removeAll('reminders', reminders);

    // Ratings still count towards a gift's score, but the written review goes.
    const reviews = (
      await this.store.find<Review>('reviews', (r) => r.customerId === c.id)
    ).map((r) => r.id);
    if (reviews.length) {
      await this.store.mutateByIds('reviews', reviews, (docs) => {
        for (const d of docs.values()) delete (d as Review).text;
      });
    }

    // isGuest = true means this record can no longer sign in, and its tokens stop working at once.
    await this.store.mutateByIds('customers', [c.id], (docs) => {
      const r = docs.get(c.id) as Customer;
      Object.assign(r, {
        email: `deleted-${c.id}@deleted.invalid`,
        isGuest: true,
        deletedAt: at,
        updatedAt: at,
      });
      delete r.name;
      delete r.phone;
      delete r.passwordHash;
      delete r.resetTokenHash;
      delete r.resetExpiresAt;
    });
  }

  private async scrubOrders(orderIds: string[], at: string) {
    if (!orderIds.length) return;
    await this.store.mutateByIds('orders', orderIds, (docs) => {
      for (const d of docs.values()) scrubOrder(d as Order, at);
    });
    const ids = new Set(orderIds);

    const links = (
      await this.store.find<GiftLink>('giftLinks', (g) => ids.has(g.orderId))
    ).map((g) => g.id);
    if (links.length) {
      await this.store.mutateByIds('giftLinks', links, (docs) => {
        for (const d of docs.values()) {
          const g = d as GiftLink;
          delete g.recipientAddress;
          delete g.recipientPhone;
          delete g.recipientName;
        }
      });
    }

    const gifts = (
      await this.store.find<DigitalGift>('digitalGifts', (g) =>
        ids.has(g.orderId),
      )
    ).map((g) => g.id);
    if (gifts.length) {
      await this.store.mutateByIds('digitalGifts', gifts, (docs) => {
        for (const d of docs.values()) {
          const g = d as DigitalGift;
          g.recipientEmail = `erased-${g.id}@erased.invalid`;
          g.senderName = 'erased';
          delete g.message;
        }
      });
    }
  }

  private async removeAll(
    collection: 'wishlists' | 'reminders',
    ids: string[],
  ) {
    if (!ids.length) return;
    const drop = new Set(ids);
    await this.store.mutate(collection, (docs) => {
      for (let i = docs.length - 1; i >= 0; i--)
        if (drop.has(docs[i].id)) docs.splice(i, 1);
    });
  }
}
