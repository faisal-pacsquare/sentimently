import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthUser, Customer } from '../customers/customer.types';
import {
  DigitalGift,
  DigitalGiftsService,
  randomCode,
} from '../digital/digital-gifts.service';
import { AlertsService } from '../alerts/alerts.service';
import { MAILER, Mailer } from '../mail/mailer';
import { MESSENGER, Messenger } from '../messaging/messenger';
import { CLOCK, Clock, PricingService } from '../pricing/pricing.service';
import { MESSAGE_MAX_CHARS } from '../pricing/quote.dto';
import { DeliveryConfig, pkt, rateFor } from '../pricing/rules';
import { Product } from '../catalogue/product.types';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';
import { AdminOrderQueryDto, CheckoutDto } from './checkout.dto';
import { confirmationEmail, shouldNotify, statusEmail } from './order-emails';
import { canMove, LABELS, refusal } from './order-state';
import { RefundsService } from './refunds.service';
import {
  hasPhysical,
  Order,
  OrderLine,
  OrderStatus,
  PaymentRecord,
} from './order.types';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
  WebhookEvent,
} from './payment-gateway';

const GIFT_LINK_DAYS = 30; // GL-04

/** A copy of the object without the named fields (keeps internal fields out of API responses). */
function without<T extends object, K extends keyof T>(
  o: T,
  ...keys: K[]
): Omit<T, K> {
  const copy = { ...o };
  for (const k of keys) delete copy[k];
  return copy;
}
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

type InsertOutcome = { existing: Order } | { clash: true } | { order: Order };

interface QuotedDelivery {
  city: string;
  method: 'address' | 'gift_link';
  sameDay: boolean;
  earliestDate: string;
  estimatedBy: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly store: JsonStore,
    private readonly pricing: PricingService,
    private readonly digital: DigitalGiftsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MESSENGER) private readonly messenger: Messenger,
    private readonly refunds: RefundsService,
    private readonly alerts: AlertsService,
  ) {}

  // ======================================================================
  // Checkout
  // ======================================================================

  async checkout(
    dto: CheckoutDto,
    user: AuthUser | undefined,
    idempotencyKey?: string,
  ) {
    const now = this.clock.now();
    const account = user
      ? await this.store.get<Customer>('customers', user.id)
      : undefined;
    const email = (dto.contact?.email ?? account?.email)?.trim().toLowerCase();
    if (!email)
      throw new BadRequestException([
        'An email address is needed to confirm your order',
      ]);

    // Price it again on the server. This throws the same 400 list as /quote if anything is wrong.
    const quote = await this.pricing.quote(
      {
        lines: dto.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          personalisation: l.personalisation,
        })),
        delivery: dto.delivery && {
          city: dto.delivery.city,
          method: dto.delivery.method,
          date: dto.delivery.date,
          country: dto.delivery.country,
        },
        promoCode: dto.promoCode,
        email,
      },
      user,
    );
    const quotedDelivery = quote.delivery as QuotedDelivery | null;
    const physical = quote.lines.some((l) => l.type === 'physical');
    const digitalCount = quote.lines.filter((l) => l.type === 'digital').length;
    const method = quotedDelivery?.method ?? 'address';

    const errors: string[] = [];
    dto.lines.forEach((l, i) => {
      const n = i + 1;
      if (quote.lines[i].type === 'digital') {
        if (!l.digital)
          errors.push(
            `Line ${n}: add the recipient's email for this digital gift`,
          );
        if (l.quantity !== 1)
          errors.push(
            `Line ${n}: send each digital gift on its own line (quantity 1)`,
          );
        if ([...(l.digital?.message ?? '')].length > MESSAGE_MAX_CHARS)
          errors.push(
            `Line ${n}: the message is over ${MESSAGE_MAX_CHARS} characters`,
          );
        if (l.digital?.sendAt) {
          const t = Date.parse(l.digital.sendAt);
          if (t < now.getTime() - 60_000)
            errors.push(`Line ${n}: the send time is in the past`);
          if (t > now.getTime() + 365 * 86_400_000)
            errors.push(`Line ${n}: the send time is more than a year away`);
        }
      } else if (l.digital) {
        errors.push(`Line ${n}: only digital gifts have a recipient email`);
      }
    });
    if (physical && method === 'address') {
      if (!dto.delivery?.address) errors.push('Enter the delivery address');
      if (!dto.delivery?.phone)
        errors.push('Enter a phone number for the courier');
    }
    if (
      dto.paymentMethod === 'cod' &&
      (!physical || digitalCount > 0 || method === 'gift_link')
    ) {
      errors.push(
        'Cash on delivery is only for gifts delivered to a known address',
      );
    }
    if (
      dto.paymentMethod === 'card' &&
      !(process.env.FEATURE_CARD_PAYMENTS === 'true' && this.gateway.available)
    ) {
      errors.push('Card payments are not available yet');
    }
    if (errors.length) throw new BadRequestException(errors);

    // A repeated submit with the same key returns the first order instead of making a second one.
    if (idempotencyKey) {
      const earlier = await this.store.findOne<Order>(
        'orders',
        (o) => o.idempotencyKey === idempotencyKey && o.contactEmail === email,
      );
      if (earlier) return this.response(earlier, {}, true);
    }

    // PY-03: take the stock in one step. If any gift is short, nothing is taken and the order fails.
    const wanted = new Map<string, number>();
    for (const l of quote.lines)
      wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity);
    const reserved = await this.reserveStock(wanted);
    let orderCreated = false;

    try {
      const customerId =
        user?.id ??
        (await this.guestCustomerId(
          email,
          dto.contact?.name,
          dto.contact?.phone,
        ));
      const senderName =
        dto.contact?.name ?? account?.name ?? email.split('@')[0];
      const nowIso = now.toISOString();

      const gifts: DigitalGift[] = [];
      const lines: OrderLine[] = quote.lines.map((ql, i) => {
        const input = dto.lines[i];
        const line: OrderLine = {
          productId: ql.productId,
          slug: ql.slug,
          name: ql.name,
          type: ql.type as 'physical' | 'digital',
          quantity: ql.quantity,
          unitPrice: ql.unitPrice,
          itemsTotal: ql.itemsTotal,
          extras: ql.extras,
          extrasTotal: ql.extrasTotal,
          lineTotal: ql.lineTotal,
          stockReserved: reserved.has(ql.productId),
        };
        if (input.personalisation) {
          line.personalisation = {
            recipientName: input.personalisation.recipientName,
            relationship: input.personalisation.relationship,
            message: input.personalisation.message,
            cardDesign: input.personalisation.cardDesign,
            extras: ql.extras.map((e) => e.code),
          };
        }
        if (input.digital) {
          const gift = this.digital.build({
            orderId: '',
            orderNumber: '',
            kind: 'greeting',
            amount: ql.unitPrice,
            senderName,
            recipientEmail: input.digital.recipientEmail.toLowerCase(),
            message: input.digital.message,
            sendAt: input.digital.sendAt ?? null,
          });
          gifts.push(gift);
          line.digitalGiftId = gift.id;
        }
        return line;
      });
      await this.applyDigitalKinds(lines, gifts);

      const status: OrderStatus =
        dto.paymentMethod === 'cod' ? 'placed' : 'awaiting_payment';
      const deliveryDate = quotedDelivery
        ? (dto.delivery?.date ??
          (quotedDelivery.sameDay
            ? pkt(now).date
            : quotedDelivery.earliestDate))
        : undefined;
      const base: Omit<Order, 'number'> = {
        id: randomUUID(),
        customerId,
        contactEmail: email,
        contactName: dto.contact?.name ?? account?.name,
        contactPhone: dto.contact?.phone ?? dto.delivery?.phone,
        status,
        paymentMethod: dto.paymentMethod,
        currency: 'PKR',
        itemsTotal: quote.itemsTotal,
        extrasTotal: quote.extrasTotal,
        subtotal: quote.subtotal,
        deliveryFee: quote.deliveryFee,
        discount: quote.discount,
        total: quote.total,
        promoCode: quote.promo?.applied ? quote.promo.code : undefined,
        city: quotedDelivery?.city,
        deliveryDate,
        estimatedBy: quotedDelivery?.estimatedBy,
        sameDay: quotedDelivery?.sameDay,
        delivery: quotedDelivery
          ? {
              method,
              address: dto.delivery?.address,
              city: quotedDelivery.city,
              phone: dto.delivery?.phone,
              attempts: 0,
            }
          : undefined,
        lines,
        idempotencyKey,
        events: [{ at: nowIso, type: 'created', to: status, by: customerId }],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const { order, existing } = await this.insertOrder(
        base,
        email,
        idempotencyKey,
      );
      orderCreated = !existing;
      if (existing) {
        await this.releaseStock(reserved, quote.lines);
        return this.response(existing, {}, true);
      }

      for (const g of gifts) {
        g.orderId = order.id;
        g.orderNumber = order.number;
      }
      if (gifts.length)
        await this.store.mutate('digitalGifts', (docs) => {
          for (const g of gifts)
            if (!docs.some((d) => d.id === g.id)) docs.push(g);
        });

      const payment: PaymentRecord = {
        id: randomUUID(),
        orderId: order.id,
        method: dto.paymentMethod,
        status: 'pending',
        amount: order.total,
        processedEvents: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await this.store.appendIf('payments', () => ({
        add: payment,
        result: undefined,
      }));

      const extra: { redirectUrl?: string; giftLinkUrl?: string } = {};
      if (method === 'gift_link' && physical)
        extra.giftLinkUrl = await this.createGiftLink(order, now);
      if (dto.paymentMethod === 'card') {
        try {
          const charge = await this.gateway.createCharge({
            orderNumber: order.number,
            amount: order.total,
            currency: order.currency,
          });
          extra.redirectUrl = charge.redirectUrl;
          await this.store.update<PaymentRecord>('payments', payment.id, {
            gatewayRef: charge.gatewayRef,
          });
        } catch (e) {
          await this.transition(order.id, 'cancelled', 'system', {
            note: 'The card payment could not be started',
          });
          throw e instanceof ServiceUnavailableException
            ? e
            : new ServiceUnavailableException(
                'The card payment could not be started. Please try again.',
              );
        }
      }

      const config = await this.store.get<
        Doc & { bankTransferInstructions?: string }
      >('storeConfig', 'main');
      await this.safeSend(
        email,
        confirmationEmail(order, {
          bankInstructions: config?.bankTransferInstructions,
          giftLinkUrl: extra.giftLinkUrl,
        }),
      );

      const fresh = (await this.store.get<Order>('orders', order.id)) ?? order;
      return this.response(fresh, {
        ...extra,
        bankInstructions:
          dto.paymentMethod === 'bank_transfer'
            ? config?.bankTransferInstructions
            : undefined,
      });
    } catch (e) {
      // Before an order exists the stock is ours to give back. After that, cancelling the order does it.
      if (!orderCreated) await this.releaseStock(reserved, quote.lines);
      throw e;
    }
  }

  // ======================================================================
  // Order lifecycle
  // ======================================================================

  /** The only way a status changes. Checks the state machine and applies the side effects. */
  async transition(
    orderId: string,
    to: OrderStatus,
    actor: string,
    opts: { note?: string; courier?: string; trackingRef?: string } = {},
  ) {
    const at = this.clock.now().toISOString();
    // OR-06: read what the re-delivery fee would be before the atomic step, which must stay free of I/O.
    let redeliveryFee = 0;
    if (to === 'dispatched') {
      const [current, config] = await Promise.all([
        this.store.get<Order>('orders', orderId),
        this.store.get<Doc & DeliveryConfig>('storeConfig', 'main'),
      ]);
      if (current?.city && config)
        redeliveryFee = rateFor(config, current.city).rate.fee;
    }

    const { order, from } = await this.store.mutateByIds(
      'orders',
      [orderId],
      (docs) => {
        const o = docs.get(orderId) as Order | undefined;
        if (!o) throw new NotFoundException('Order not found');
        if (
          !canMove(o.status, to) ||
          (o.status === 'paid' && to === 'delivered' && hasPhysical(o))
        ) {
          throw new ConflictException(refusal(o.status, to));
        }
        // GL-03: nothing leaves the studio for a gift link until the recipient has added their address.
        if (
          to === 'dispatched' &&
          o.delivery?.method === 'gift_link' &&
          !o.delivery.address
        ) {
          throw new ConflictException(
            'Waiting for the recipient to add their address',
          );
        }
        const previous = o.status;
        o.status = to;
        o.updatedAt = at;
        o.events.push({
          at,
          type: 'status',
          from: previous,
          to,
          by: actor,
          note: opts.note,
        });
        if (opts.courier || opts.trackingRef || to === 'failed_delivery') {
          o.delivery = {
            method: 'address',
            city: o.city ?? '',
            ...o.delivery,
            attempts: o.delivery?.attempts ?? 0,
          };
          if (opts.courier) o.delivery.courier = opts.courier;
          if (opts.trackingRef) o.delivery.trackingRef = opts.trackingRef;
          if (to === 'failed_delivery') o.delivery.attempts += 1;
        }
        // OR-06: the first re-delivery in the same city is free; later ones are charged.
        if (
          to === 'dispatched' &&
          previous === 'failed_delivery' &&
          o.delivery
        ) {
          const n = (o.delivery.redeliveries ?? 0) + 1;
          o.delivery.redeliveries = n;
          if (n > 1)
            o.redeliveryFeeDue = (o.redeliveryFeeDue ?? 0) + redeliveryFee;
        }
        return { order: structuredClone(o), from: previous };
      },
    );
    await this.afterTransition(order, from, to);
    return order;
  }

  private async afterTransition(
    order: Order,
    _from: OrderStatus,
    to: OrderStatus,
  ) {
    switch (to) {
      case 'cancelled': {
        await this.restoreStock(order);
        await this.digital.cancelForOrder(order.id);
        // Money already received has to go back (OR-05). Decide before pending payments are closed.
        const payments = await this.store.find<PaymentRecord>(
          'payments',
          (p) => p.orderId === order.id,
        );
        await this.setPayments(order.id, ['pending'], 'cancelled');
        if (payments.some((p) => p.status === 'confirmed')) {
          await this.refunds.create({
            orderId: order.id,
            orderNumber: order.number,
            method: order.paymentMethod,
            amount: order.total,
            reason: 'cancelled',
          });
        }
        break;
      }
      case 'paid': {
        await this.setPayments(order.id, ['pending'], 'confirmed');
        const { allSent } = await this.digital.dispatchForOrder(
          order.id,
          this.clock.now(),
        );
        if (allSent && !hasPhysical(order))
          await this.transition(order.id, 'delivered', 'system', {
            note: 'Digital gifts sent',
          });
        break;
      }
      case 'dispatched':
        await this.text(
          order.delivery?.phone,
          `Your Bloomora gift is on its way${order.delivery?.trackingRef ? ` (tracking ${order.delivery.trackingRef})` : ''}. Please keep your phone nearby for the courier.`,
        );
        break;
      case 'failed_delivery':
        await this.text(
          order.delivery?.phone,
          'We could not deliver your Bloomora gift today. We will be in touch to arrange another attempt.',
        );
        // OR-06: after two failed attempts the studio contacts the sender.
        if ((order.delivery?.attempts ?? 0) >= 2) {
          await this.addNote(
            order.id,
            'Two delivery attempts failed: contact the sender',
          );
          await this.alerts.raise(
            'Delivery failed twice',
            `Order ${order.number} (${order.city ?? 'unknown city'}) failed delivery twice. Contact ${order.contactEmail}${order.contactPhone ? ` / ${order.contactPhone}` : ''}.`,
          );
        }
        break;
      case 'delivered':
        if (order.paymentMethod === 'cod')
          await this.setPayments(order.id, ['pending'], 'confirmed');
        break;
      case 'refunded':
        await this.setPayments(order.id, ['confirmed'], 'refunded');
        break;
    }
    if (shouldNotify(to))
      await this.safeSend(order.contactEmail, statusEmail(order, to));
  }

  /** Digital-only orders finish once their last gift has been sent. */
  async completeDigitalOrders(orderIds: string[]) {
    for (const id of orderIds) {
      const o = await this.store.get<Order>('orders', id);
      if (o && o.status === 'paid' && !hasPhysical(o)) {
        await this.transition(id, 'delivered', 'system', {
          note: 'Digital gifts sent',
        });
      }
    }
  }

  /**
   * OR-01 / OR-02: a customer may cancel until preparation starts, at no cost.
   * Once it has started they must contact the studio, and once a personalised item is in production it can't be cancelled.
   */
  async cancelByCustomer(number: string, email: string, reason?: string) {
    const o = await this.findByNumberAndEmail(number, email);
    if (o.status === 'cancelled')
      throw new ConflictException('This order is already cancelled');
    if (!['awaiting_payment', 'placed', 'paid'].includes(o.status)) {
      throw new ConflictException(
        o.status === 'preparing'
          ? 'We have started preparing your order. Please contact us to see if it can still be cancelled.'
          : refusal(o.status, 'cancelled'),
      );
    }
    await this.transition(o.id, 'cancelled', `customer:${o.customerId}`, {
      note: reason,
    });
    const refund = (await this.refunds.forOrder(o.id))[0];
    return {
      number: o.number,
      status: 'cancelled' as const,
      refund: refund
        ? {
            amount: refund.amount,
            dueBy: refund.dueBy,
            note: refund.arrivalNote,
          }
        : null,
    };
  }

  /** PY-02: a gateway event is applied once, however many times it is delivered. */
  async handleGatewayEvent(ev: WebhookEvent) {
    const order = await this.store.findOne<Order>(
      'orders',
      (o) => o.number === ev.orderNumber,
    );
    if (!order) return { result: 'ignored' }; // acknowledge so the gateway stops retrying

    const result = await this.store.mutate('payments', (docs) => {
      const p = docs.find(
        (d) =>
          (d as PaymentRecord).orderId === order.id &&
          (d as PaymentRecord).gatewayRef === ev.gatewayRef,
      ) as PaymentRecord | undefined;
      if (!p) return 'unknown_payment';
      if (p.processedEvents.includes(ev.eventId)) return 'duplicate';
      p.processedEvents.push(ev.eventId);
      p.status =
        ev.status === 'failed'
          ? 'failed'
          : ev.amount !== undefined && ev.amount !== order.total
            ? 'mismatch'
            : 'confirmed';
      return p.status;
    });

    if (result === 'confirmed') {
      const current = await this.store.get<Order>('orders', order.id);
      if (current?.status === 'awaiting_payment')
        await this.transition(order.id, 'paid', 'gateway');
      else if (
        current &&
        (current.status === 'cancelled' || current.status === 'refunded')
      )
        await this.addNote(
          order.id,
          'Payment arrived after the order was cancelled: refund needed',
        );
    } else if (result === 'mismatch') {
      await this.addNote(
        order.id,
        `Gateway reported ${ev.amount} but the order total is ${order.total}: check before confirming`,
      );
    } else if (result === 'failed') {
      await this.addNote(order.id, 'The card payment failed');
    }
    return { result };
  }

  // ======================================================================
  // Reading orders
  // ======================================================================

  /** OR-07 / E5-5: status and dates only. A wrong email and an unknown number look identical. */
  async track(number: string, email: string) {
    const o = await this.findByNumberAndEmail(number, email);
    return {
      number: o.number,
      status: o.status,
      statusLabel: LABELS[o.status],
      placedAt: o.createdAt,
      deliveryDate: o.deliveryDate ?? null,
      estimatedBy: o.estimatedBy ?? null,
      timeline: this.timeline(o),
    };
  }

  /** The one lookup behind tracking, cancelling and returns. A wrong email and an unknown number fail the same way. */
  async findByNumberAndEmail(number: string, email: string): Promise<Order> {
    const o = await this.store.findOne<Order>(
      'orders',
      (x) =>
        x.number === number.trim().toUpperCase() &&
        x.contactEmail === email.trim().toLowerCase(),
    );
    if (!o)
      throw new NotFoundException(
        'We could not find an order with those details',
      );
    return o;
  }

  async getById(id: string): Promise<Order> {
    const o = await this.store.get<Order>('orders', id);
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  async listMine(customerId: string) {
    const orders = await this.store.find<Order>(
      'orders',
      (o) => o.customerId === customerId,
    );
    return orders
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => this.customerView(o));
  }

  async getMine(customerId: string, number: string) {
    const o = await this.store.findOne<Order>(
      'orders',
      (x) => x.number === number.toUpperCase() && x.customerId === customerId,
    );
    if (!o) throw new NotFoundException('Order not found');
    return this.customerView(o);
  }

  async adminList(q: AdminOrderQueryDto) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 25));
    const statuses = q.status
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const needle = q.q?.trim().toLowerCase();
    const rows = (await this.store.all<Order>('orders'))
      .filter(
        (o) =>
          (!statuses?.length || statuses.includes(o.status)) &&
          (!q.city || o.city?.toLowerCase() === q.city.toLowerCase()) &&
          (!q.from || o.createdAt.slice(0, 10) >= q.from) &&
          (!q.to || o.createdAt.slice(0, 10) <= q.to) &&
          (!needle ||
            `${o.number} ${o.contactEmail} ${o.contactName ?? ''}`
              .toLowerCase()
              .includes(needle)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * pageSize;
    return {
      data: rows.slice(start, start + pageSize).map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        createdAt: o.createdAt,
        contactName: o.contactName,
        contactEmail: o.contactEmail,
        city: o.city,
        deliveryDate: o.deliveryDate,
        total: o.total,
        paymentMethod: o.paymentMethod,
        itemCount: o.lines.reduce((s, l) => s + l.quantity, 0),
        personalised: o.lines.some((l) => !!l.personalisation),
      })),
      page,
      pageSize,
      total: rows.length,
    };
  }

  /**
   * Deletes a cancelled order for good, with the records that only make sense with it: its payments, returns,
   * refunds, gift link and digital gifts. Any other order is refused: cancel it first. Stock needs no handling,
   * because cancelling already put it back. Sales reports no longer count the order. A card payment is not
   * refunded here: refund it with the payment provider.
   */
  async adminDelete(id: string, by: string) {
    const order = await this.store.get<Order>('orders', id);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'cancelled')
      throw new ConflictException(
        'Only cancelled orders can be deleted. Cancel this order first if you want to remove it.',
      );
    if (!(await this.store.remove('orders', id)))
      throw new NotFoundException('Order not found');
    const gone: Record<string, number> = {};
    for (const collection of [
      'payments',
      'digitalGifts',
      'returns',
      'refunds',
    ] as const) {
      gone[collection] = await this.store.mutate(collection, (docs) => {
        let n = 0;
        for (let i = docs.length - 1; i >= 0; i--)
          if ((docs[i] as { orderId?: string }).orderId === id) {
            docs.splice(i, 1);
            n++;
          }
        return n;
      });
    }
    if (order.giftLinkId)
      await this.store.remove('giftLinks', order.giftLinkId);
    this.logger.warn(
      `Cancelled order ${order.number} deleted by ${by}; removed ${JSON.stringify(gone)}`,
    );
    return { number: order.number, removed: gone };
  }

  async adminGet(id: string) {
    const o = await this.store.get<Order>('orders', id);
    if (!o) throw new NotFoundException('Order not found');
    const [payments, gifts, link] = await Promise.all([
      this.store.find<PaymentRecord>('payments', (p) => p.orderId === id),
      this.store.find<DigitalGift>('digitalGifts', (g) => g.orderId === id),
      o.giftLinkId
        ? this.store.get<Doc & { isClaimed: boolean; expiresAt: string }>(
            'giftLinks',
            o.giftLinkId,
          )
        : undefined,
    ]);
    const order = without(o, 'idempotencyKey');
    return {
      order,
      payments: payments.map((p) => without(p, 'processedEvents')),
      digitalGifts: gifts.map((g) => ({
        id: g.id,
        kind: g.kind,
        recipientEmail: g.recipientEmail,
        status: g.status,
        sendAt: g.sendAt,
        sentAt: g.sentAt,
        expiresAt: g.expiresAt,
        codeHint: g.code.slice(-4),
        attempts: g.attempts ?? 0,
        lastError: g.lastError,
      })),
      giftLink: link
        ? { isClaimed: link.isClaimed, expiresAt: link.expiresAt }
        : null,
    };
  }

  /** What the studio has to make: orders being prepared or in production, soonest delivery first. */
  async production() {
    const orders = (await this.store.all<Order>('orders'))
      .filter((o) => o.status === 'preparing' || o.status === 'in_production')
      .sort(
        (a, b) =>
          (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999') ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const view = (o: Order) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      deliveryDate: o.deliveryDate,
      city: o.city,
      sameDay: o.sameDay,
      lines: o.lines
        .filter((l) => l.type === 'physical')
        .map((l) => ({
          name: l.name,
          quantity: l.quantity,
          extras: l.extras,
          personalisation: l.personalisation,
        })),
    });
    return {
      preparing: orders.filter((o) => o.status === 'preparing').map(view),
      inProduction: orders
        .filter((o) => o.status === 'in_production')
        .map(view),
    };
  }

  // ======================================================================
  // Helpers
  // ======================================================================

  private timeline(o: Order) {
    return o.events
      .filter((e) => (e.type === 'created' || e.type === 'status') && e.to)
      .map((e) => ({
        status: e.to as OrderStatus,
        label: LABELS[e.to as OrderStatus],
        at: e.at,
      }));
  }

  /** What the buyer may see of their own order. Internal notes, staff ids and the idempotency key stay out. */
  private customerView(o: Order) {
    const rest = without(o, 'idempotencyKey', 'events', 'giftLinkId');
    // GL-03: for a gift link the recipient's address and phone are never shown to the sender.
    const delivery =
      o.delivery?.method === 'gift_link'
        ? {
            method: 'gift_link' as const,
            city: o.delivery.city,
            claimed: !!o.delivery.address,
          }
        : o.delivery;
    return {
      ...rest,
      delivery,
      statusLabel: LABELS[o.status],
      timeline: this.timeline(o),
    };
  }

  private response(
    o: Order,
    extra: {
      redirectUrl?: string;
      giftLinkUrl?: string;
      bankInstructions?: string;
    },
    replayed = false,
  ) {
    return {
      order: this.customerView(o),
      payment: {
        method: o.paymentMethod,
        instructions: extra.bankInstructions,
        redirectUrl: extra.redirectUrl,
      },
      giftLink: extra.giftLinkUrl ? { url: extra.giftLinkUrl } : undefined,
      replayed,
    };
  }

  /** Takes stock for every gift that is not made to order, all or nothing. Returns the product ids it took stock from. */
  private async reserveStock(
    wanted: Map<string, number>,
  ): Promise<Set<string>> {
    return this.store.mutateByIds('products', [...wanted.keys()], (docs) => {
      const taken = new Set<string>();
      for (const [id, qty] of wanted) {
        const p = docs.get(id) as Product | undefined;
        if (!p || p.isActive === false)
          throw new ConflictException(
            'One of the gifts is no longer available',
          );
        if (p.isMadeToOrder) continue;
        if (p.stock < qty)
          throw new ConflictException(`Sorry, "${p.name}" just sold out`);
        p.stock -= qty;
        taken.add(id);
      }
      return taken;
    });
  }

  private async releaseStock(
    reserved: Set<string>,
    lines: { productId: string; quantity: number }[],
  ) {
    if (!reserved.size) return;
    await this.adjustStock(lines.filter((l) => reserved.has(l.productId)));
  }

  private async restoreStock(order: Order) {
    await this.adjustStock(order.lines.filter((l) => l.stockReserved));
  }

  private async adjustStock(lines: { productId: string; quantity: number }[]) {
    if (!lines.length) return;
    await this.store.mutateByIds(
      'products',
      lines.map((l) => l.productId),
      (docs) => {
        for (const l of lines) {
          const p = docs.get(l.productId) as Product | undefined;
          if (p) p.stock += l.quantity;
        }
      },
    );
  }

  /** The e-gift card / greeting card kind is a product setting. */
  private async applyDigitalKinds(lines: OrderLine[], gifts: DigitalGift[]) {
    if (!gifts.length) return;
    const products = await this.store.all<Product>('products');
    for (const l of lines) {
      const gift = gifts.find((g) => g.id === l.digitalGiftId);
      if (gift)
        gift.kind =
          products.find((p) => p.id === l.productId)?.digitalKind ?? 'greeting';
    }
  }

  private async guestCustomerId(
    email: string,
    name?: string,
    phone?: string,
  ): Promise<string> {
    const now = new Date().toISOString();
    const fresh: Customer = {
      id: randomUUID(),
      email,
      name,
      phone,
      role: 'customer',
      authProvider: 'email',
      isGuest: true,
      createdAt: now,
      updatedAt: now,
    };
    // Typing an email proves nothing, so a guest order never lands in someone's account, even if the address has one.
    // The customer adds it to their account later by proving they own the order (order number + email).
    return this.store.appendIf('customers', (docs) => {
      const found = docs.find(
        (d) =>
          (d as Customer).email === email &&
          (d as Customer).isGuest &&
          !(d as Customer).deletedAt,
      );
      return found ? { result: found.id } : { add: fresh, result: fresh.id };
    });
  }

  private async insertOrder(
    base: Omit<Order, 'number'>,
    email: string,
    idempotencyKey?: string,
  ): Promise<{ order: Order; existing?: Order }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const order = { ...base, number: `SN-${randomCode(8)}` } as Order;
      const result = await this.store.appendIf<InsertOutcome>(
        'orders',
        (docs) => {
          const twin = idempotencyKey
            ? (docs.find(
                (d) =>
                  (d as Order).idempotencyKey === idempotencyKey &&
                  (d as Order).contactEmail === email,
              ) as Order | undefined)
            : undefined;
          if (twin) return { result: { existing: structuredClone(twin) } };
          if (docs.some((d) => (d as Order).number === order.number))
            return { result: { clash: true } };
          return { add: order, result: { order } };
        },
      );
      if ('existing' in result) return { order, existing: result.existing };
      if ('order' in result) return { order };
    }
    throw new ServiceUnavailableException(
      'Could not create an order number. Please try again.',
    );
  }

  /** The token is shown once (to the sender); only its hash is kept. */
  private async createGiftLink(order: Order, now: Date): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const id = randomUUID();
    const at = now.toISOString();
    const expiresAt = new Date(
      now.getTime() + GIFT_LINK_DAYS * 86_400_000,
    ).toISOString();
    await this.store.appendIf('giftLinks', () => ({
      add: {
        id,
        orderId: order.id,
        tokenHash: sha256(token),
        isClaimed: false,
        expiresAt,
        createdAt: at,
        updatedAt: at,
      },
      result: undefined,
    }));
    await this.store.update<Order>('orders', order.id, { giftLinkId: id });
    return `${process.env.APP_URL ?? 'http://localhost:3000'}/gift/${token}`;
  }

  private async setPayments(
    orderId: string,
    from: PaymentRecord['status'][],
    to: PaymentRecord['status'],
  ) {
    const ids = (
      await this.store.find<PaymentRecord>(
        'payments',
        (p) => p.orderId === orderId && from.includes(p.status),
      )
    ).map((p) => p.id);
    if (!ids.length) return;
    await this.store.mutateByIds('payments', ids, (docs) => {
      for (const d of docs.values()) {
        const p = d as PaymentRecord;
        if (from.includes(p.status)) p.status = to;
      }
    });
  }

  async addNote(orderId: string, note: string, by = 'system') {
    const at = this.clock.now().toISOString();
    await this.store.mutateByIds('orders', [orderId], (docs) => {
      (docs.get(orderId) as Order | undefined)?.events.push({
        at,
        type: 'note',
        by,
        note,
      });
    });
  }

  /** Text messages are a courtesy: a provider outage must not break an order. */
  private async text(to: string | undefined, text: string) {
    if (!to) return;
    try {
      await this.messenger.send({ to, text });
    } catch (e) {
      this.logger.error(`Could not text ${to}: ${String(e)}`);
    }
  }

  /** Email trouble must never undo an order or a payment. */
  private async safeSend(to: string, mail: { subject: string; text: string }) {
    try {
      await this.mailer.send({ to, ...mail });
    } catch (e) {
      this.logger.error(`Could not email ${to}: ${String(e)}`);
    }
  }
}
