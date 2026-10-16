import { Inject, Injectable } from '@nestjs/common';
import { deliveredAt, Order } from '../orders/order.types';
import { Refund } from '../orders/refunds.service';
import { CLOCK, Clock } from '../pricing/pricing.service';
import { pkt } from '../pricing/rules';
import { JsonStore } from '../storage/json-store.service';

/** An order counts as a sale unless it is unpaid, cancelled, or the goods came back. */
const NOT_A_SALE = ['awaiting_payment', 'cancelled', 'refunded', 'returned'];
/** Orders the studio still has to get out of the door on a given day. */
const ON_THE_ROTA = [
  'placed',
  'paid',
  'preparing',
  'in_production',
  'dispatched',
  'failed_delivery',
];

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
const bump = <T>(
  map: Record<string, T>,
  key: string,
  make: () => T,
  apply: (v: T) => void,
) => apply((map[key] ??= make()));

@Injectable()
export class ReportsService {
  constructor(
    private readonly store: JsonStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Sales, orders by status, delivery performance, promo use and refunds for orders created in a date range (YYYY-MM-DD, both optional). */
  async summary(from?: string, to?: string) {
    const orders = (await this.store.all<Order>('orders')).filter(
      (o) =>
        (!from || o.createdAt.slice(0, 10) >= from) &&
        (!to || o.createdAt.slice(0, 10) <= to),
    );
    const sales = orders.filter((o) => !NOT_A_SALE.includes(o.status));
    const revenue = sales.reduce((s, o) => s + o.total, 0);

    const byStatus: Record<string, number> = {};
    for (const o of orders) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

    const byPayment: Record<string, { orders: number; revenue: number }> = {};
    const byCity: Record<string, { orders: number; revenue: number }> = {};
    for (const o of sales) {
      bump(
        byPayment,
        o.paymentMethod,
        () => ({ orders: 0, revenue: 0 }),
        (v) => {
          v.orders++;
          v.revenue += o.total;
        },
      );
      bump(
        byCity,
        o.city ?? 'digital',
        () => ({ orders: 0, revenue: 0 }),
        (v) => {
          v.orders++;
          v.revenue += o.total;
        },
      );
    }

    const promos: Record<string, { orders: number; discountTotal: number }> =
      {};
    for (const o of sales) {
      if (o.promoCode)
        bump(
          promos,
          o.promoCode,
          () => ({ orders: 0, discountTotal: 0 }),
          (v) => {
            v.orders++;
            v.discountTotal += o.discount;
          },
        );
    }

    const products: Record<
      string,
      { name: string; quantity: number; revenue: number }
    > = {};
    for (const o of sales) {
      for (const l of o.lines)
        bump(
          products,
          l.productId,
          () => ({ name: l.name, quantity: 0, revenue: 0 }),
          (v) => {
            v.quantity += l.quantity;
            v.revenue += l.lineTotal;
          },
        );
    }

    // Delivery performance: only physical orders that reached the customer.
    const delivered = orders.filter(
      (o) => o.status === 'delivered' && o.delivery && deliveredAt(o),
    );
    const onTime = delivered.filter(
      (o) =>
        o.deliveryDate && pkt(new Date(deliveredAt(o)!)).date <= o.deliveryDate,
    ).length;
    const days = delivered.map((o) =>
      daysBetween(
        pkt(new Date(o.createdAt)).date,
        pkt(new Date(deliveredAt(o)!)).date,
      ),
    );

    const refunds = await this.store.all<Refund>('refunds');
    const sum = (rs: Refund[]) => rs.reduce((s, r) => s + r.amount, 0);

    return {
      range: { from: from ?? null, to: to ?? null },
      sales: {
        orders: sales.length,
        revenue,
        averageOrderValue: sales.length
          ? Math.round(revenue / sales.length)
          : 0,
        itemsSold: sales.reduce(
          (s, o) => s + o.lines.reduce((n, l) => n + l.quantity, 0),
          0,
        ),
      },
      byStatus,
      byPaymentMethod: byPayment,
      byCity,
      delivery: {
        delivered: delivered.length,
        onTimePercent: delivered.length
          ? Math.round((onTime / delivered.length) * 100)
          : null,
        averageDaysToDeliver: days.length
          ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) /
            10
          : null,
        ordersWithFailedAttempts: orders.filter(
          (o) => (o.delivery?.attempts ?? 0) > 0,
        ).length,
      },
      promoUse: promos,
      topProducts: Object.entries(products)
        .map(([productId, v]) => ({ productId, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      refunds: {
        pending: {
          count: refunds.filter((r) => r.status === 'pending').length,
          amount: sum(refunds.filter((r) => r.status === 'pending')),
        },
        processed: {
          count: refunds.filter((r) => r.status === 'processed').length,
          amount: sum(refunds.filter((r) => r.status === 'processed')),
        },
      },
    };
  }

  /**
   * The studio's day sheet: everything due on one date, grouped by city, with where it goes and who to call.
   * Gift-link orders show "waiting for address" until the recipient has added theirs.
   */
  async rota(date?: string, city?: string) {
    const day = date ?? pkt(this.clock.now()).date;
    const orders = (await this.store.all<Order>('orders')).filter(
      (o) =>
        ON_THE_ROTA.includes(o.status) &&
        o.deliveryDate === day &&
        o.delivery &&
        (!city || o.city?.toLowerCase() === city.toLowerCase()),
    );
    const byCity = new Map<string, Order[]>();
    for (const o of orders)
      byCity.set(o.city ?? '', [...(byCity.get(o.city ?? '') ?? []), o]);

    return {
      date: day,
      total: orders.length,
      cities: [...byCity.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, list]) => ({
          city: name,
          orders: list
            .sort(
              (a, b) =>
                Number(!!b.sameDay) - Number(!!a.sameDay) ||
                a.createdAt.localeCompare(b.createdAt),
            )
            .map((o) => ({
              id: o.id,
              number: o.number,
              status: o.status,
              sameDay: !!o.sameDay,
              recipientName:
                o.lines.find((l) => l.personalisation)?.personalisation
                  ?.recipientName ??
                o.contactName ??
                null,
              address: o.delivery?.address ?? null,
              phone: o.delivery?.phone ?? null,
              waitingForRecipientAddress:
                o.delivery?.method === 'gift_link' && !o.delivery.address,
              courier: o.delivery?.courier ?? null,
              trackingRef: o.delivery?.trackingRef ?? null,
              attempts: o.delivery?.attempts ?? 0,
              cashToCollect: o.paymentMethod === 'cod' ? o.total : 0,
              items: o.lines
                .filter((l) => l.type === 'physical')
                .map((l) => `${l.quantity} x ${l.name}`),
            })),
        })),
    };
  }
}
