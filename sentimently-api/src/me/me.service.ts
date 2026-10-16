import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { effectivePrice } from '../catalogue/catalogue.service';
import { Product } from '../catalogue/product.types';
import { Customer, publicCustomer } from '../customers/customer.types';
import type { Order } from '../orders/order.types';
import { Doc } from '../storage/storage.types';
import { JsonStore } from '../storage/json-store.service';
import {
  CreateReminderDto,
  UpdateProfileDto,
  UpdateReminderDto,
} from './me.dto';

export interface WishlistEntry extends Doc {
  customerId: string;
  productId: string;
}

export interface Reminder extends Doc {
  customerId: string;
  label: string;
  date: string;
  recipientName?: string;
  notifyDaysBefore: number;
  lastNotifiedAt?: string;
}

@Injectable()
export class MeService {
  constructor(private readonly store: JsonStore) {}

  async profile(customerId: string) {
    const c = await this.store.get<Customer>('customers', customerId);
    if (!c) throw new NotFoundException('Account not found');
    return publicCustomer(c);
  }

  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const patch: Partial<Customer> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.phone !== undefined) patch.phone = dto.phone;
    const c = await this.store.update<Customer>('customers', customerId, patch);
    if (!c) throw new NotFoundException('Account not found');
    return publicCustomer(c);
  }

  /**
   * Adds an order that was placed as a guest to this account. The proof is the order number plus the email on it:
   * both only ever reach the person who ordered, so a stranger who merely knows an email address gets nowhere.
   * An order that belongs to another account is reported as not found.
   */
  async claimOrder(customerId: string, number: string, email: string) {
    const notFound = () =>
      new NotFoundException('We could not find an order with those details');
    const order = await this.store.findOne<Order>(
      'orders',
      (o) =>
        o.number === number.trim().toUpperCase() &&
        o.contactEmail === email.trim().toLowerCase(),
    );
    if (!order) throw notFound();
    if (order.customerId === customerId)
      return { number: order.number, added: false };

    const owner = await this.store.get<Customer>('customers', order.customerId);
    if (!owner || !owner.isGuest || owner.deletedAt) throw notFound();

    const at = new Date().toISOString();
    await this.store.mutateByIds('orders', [order.id], (docs) => {
      const o = docs.get(order.id) as Order;
      if (o.customerId !== order.customerId)
        throw new ConflictException(
          'This order was just added to another account',
        );
      o.customerId = customerId;
      o.updatedAt = at;
      o.events.push({
        at,
        type: 'note',
        by: customerId,
        note: 'Added to an account',
      });
    });
    return { number: order.number, added: true };
  }

  // ---------- wishlist ----------

  async wishlist(customerId: string) {
    const entries = await this.store.find<WishlistEntry>(
      'wishlists',
      (w) => w.customerId === customerId,
    );
    const ids = new Set(entries.map((e) => e.productId));
    const products = await this.store.find<Product>(
      'products',
      (p) => ids.has(p.id) && p.isActive !== false,
    );
    return products.map((p) => ({ ...p, effectivePrice: effectivePrice(p) }));
  }

  async addToWishlist(customerId: string, productId: string) {
    const product = await this.store.get<Product>('products', productId);
    if (!product || product.isActive === false)
      throw new NotFoundException('That gift does not exist');
    const id = `${customerId}:${productId}`; // one entry per customer and gift
    await this.store.mutate('wishlists', (docs) => {
      if (docs.some((d) => d.id === id)) return;
      const now = new Date().toISOString();
      docs.push({
        id,
        customerId,
        productId,
        createdAt: now,
        updatedAt: now,
      } as WishlistEntry);
    });
  }

  async removeFromWishlist(customerId: string, productId: string) {
    await this.store.remove('wishlists', `${customerId}:${productId}`);
  }

  // ---------- occasion reminders ----------

  reminders(customerId: string) {
    return this.store.find<Reminder>(
      'reminders',
      (r) => r.customerId === customerId,
    );
  }

  async createReminder(customerId: string, dto: CreateReminderDto) {
    return this.store.insert<Reminder>('reminders', {
      id: randomUUID(),
      customerId,
      label: dto.label,
      date: dto.date,
      recipientName: dto.recipientName,
      notifyDaysBefore: dto.notifyDaysBefore ?? 7,
    });
  }

  async updateReminder(customerId: string, id: string, dto: UpdateReminderDto) {
    await this.ownReminder(customerId, id);
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    return this.store.update<Reminder>('reminders', id, patch);
  }

  async deleteReminder(customerId: string, id: string) {
    await this.ownReminder(customerId, id);
    await this.store.remove('reminders', id);
  }

  /** Another customer's reminder looks exactly like a missing one. */
  private async ownReminder(customerId: string, id: string) {
    const r = await this.store.get<Reminder>('reminders', id);
    if (!r || r.customerId !== customerId)
      throw new NotFoundException('Reminder not found');
    return r;
  }
}
