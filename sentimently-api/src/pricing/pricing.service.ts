import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { effectivePrice } from '../catalogue/catalogue.service';
import { Product } from '../catalogue/product.types';
import type { AuthUser, Customer } from '../customers/customer.types';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';
import {
  CARD_DESIGNS,
  MESSAGE_MAX_CHARS,
  QuoteDto,
  RELATIONSHIPS,
} from './quote.dto';
import {
  DeliveryConfig,
  deliveryFee,
  isRealDate,
  perishableDateOk,
  PERISHABLE_MAX_DAYS_AHEAD,
  pkt,
  rateFor,
  timing,
} from './rules';

export const CLOCK = Symbol('CLOCK');
export interface Clock {
  now(): Date;
}

interface Extra extends Doc {
  name: string;
  price: number;
  isActive: boolean;
}

interface PromoCode extends Doc {
  code: string;
  percent: number;
  minOrder: number;
  firstOrderOnly: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
}

type StoreConfig = Doc & DeliveryConfig;

type OrderRef = Doc & {
  customerId?: string;
  status?: string;
  city?: string;
  deliveryDate?: string;
};

/** Placeholder starter lines for "Help me write it". The prototype's 8 lines were not captured; replace with the studio's copy. */
export const STARTER_LINES = [
  'I have been thinking of you, and wanted you to know it.',
  'Thank you for being there, every single time.',
  'I am sorry. I wish I could take it back, and I mean it.',
  'Wherever you are today, I hope this makes you smile.',
  'You mean more to me than I ever say out loud.',
  'Happy birthday. Here is to everything good ahead of you.',
  'I miss you, and I am counting down until we meet.',
  'Congratulations. You earned every bit of this.',
];

/** PR-03: a product with its own list uses exactly that list; otherwise every active extra except express on made-to-order. */
export function allowedExtraCodes(p: Product, extras: Extra[]): Set<string> {
  if (p.allowedExtras) return new Set(p.allowedExtras);
  return new Set(
    extras
      .filter(
        (e) => e.isActive && !(p.isMadeToOrder && e.id === 'express_same_day'),
      )
      .map((e) => e.id),
  );
}

const rupees = (n: number) =>
  `Rs ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

@Injectable()
export class PricingService {
  constructor(
    private readonly store: JsonStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async options() {
    const extras = (await this.store.all<Extra>('extras')).filter(
      (e) => e.isActive,
    );
    return {
      relationships: RELATIONSHIPS,
      cardDesigns: CARD_DESIGNS,
      messageMaxLength: MESSAGE_MAX_CHARS,
      starterLines: STARTER_LINES,
      extras: extras.map((e) => ({ code: e.id, name: e.name, price: e.price })),
    };
  }

  /**
   * Prices a basket. The server is the only source of prices (PR-07): the request carries product ids and
   * choices, never amounts. Every problem is collected and returned together as a 400 with details.
   */
  async quote(dto: QuoteDto, user?: AuthUser) {
    const now = this.clock.now();
    const errors: string[] = [];
    const wanted = new Set(dto.lines.map((l) => l.productId));
    const [config, products, extras] = await Promise.all([
      this.config(),
      this.store.find<Product>('products', (p) => wanted.has(p.id)),
      this.store.all<Extra>('extras'),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const extraByCode = new Map(extras.map((e) => [e.id, e]));

    let itemsTotal = 0;
    let extrasTotal = 0;
    let hasPhysical = false;
    let perishable = false;
    let leadDays = 0;

    const lines = dto.lines.flatMap((l, i) => {
      const n = i + 1;
      const p = productById.get(l.productId);
      if (!p || p.isActive === false) {
        errors.push(`Line ${n}: that gift is not available`);
        return [];
      }
      if (!p.isMadeToOrder && p.stock < l.quantity)
        errors.push(`Line ${n}: only ${p.stock} of "${p.name}" left`);

      const chosen: Extra[] = [];
      const pz = l.personalisation;
      if (pz) {
        if (p.type === 'digital')
          errors.push(
            `Line ${n}: digital gifts are personalised when you send them`,
          );
        if (l.quantity !== 1)
          errors.push(
            `Line ${n}: a personalised gift must be its own line (quantity 1)`,
          );
        const length = [...(pz.message ?? '')].length;
        if (length > MESSAGE_MAX_CHARS)
          errors.push(
            `Line ${n}: the message is ${length} characters; the limit is ${MESSAGE_MAX_CHARS}`,
          );
        const allowed = allowedExtraCodes(p, extras);
        for (const code of new Set(pz.extras ?? [])) {
          if (code === 'classic_wrap') continue; // PR-01: included, no charge
          const e = extraByCode.get(code);
          if (!e || !e.isActive)
            errors.push(`Line ${n}: "${code}" is not a known extra`);
          else if (!allowed.has(code))
            errors.push(
              `Line ${n}: "${e.name}" is not available for "${p.name}"`,
            );
          else chosen.push(e);
        }
      }

      const unitPrice = effectivePrice(p);
      const lineItems = unitPrice * l.quantity;
      const lineExtras = chosen.reduce((s, e) => s + e.price, 0);
      itemsTotal += lineItems;
      extrasTotal += lineExtras;
      if (p.type === 'physical') hasPhysical = true;
      if (p.isMadeToOrder)
        leadDays = Math.max(
          leadDays,
          p.leadTimeMaxDays ?? p.leadTimeMinDays ?? 0,
        );
      if (p.isPerishable || chosen.some((e) => e.id === 'chocolate_box'))
        perishable = true;

      return [
        {
          productId: p.id,
          slug: p.slug,
          name: p.name,
          type: p.type,
          quantity: l.quantity,
          unitPrice,
          itemsTotal: lineItems,
          extras: chosen.map((e) => ({
            code: e.id,
            name: e.name,
            price: e.price,
          })),
          extrasTotal: lineExtras,
          lineTotal: lineItems + lineExtras,
          personalised: !!pz,
        },
      ];
    });

    const subtotal = itemsTotal + extrasTotal;

    // ----- delivery (DL-01 to DL-10, SC-01) -----
    let delivery: Record<string, unknown> | null = null;
    let fee = 0;
    if (hasPhysical) {
      const d = dto.delivery;
      if (!d?.city?.trim()) {
        errors.push('Choose a delivery city');
      } else {
        const { rate, city } = rateFor(config, d.city);
        fee = deliveryFee(subtotal, true, rate, config);
        const t = timing({
          now,
          rate,
          config,
          leadDays,
          capacityLeft: await this.capacityLeft(config, city, now),
        });
        if (d.date) {
          if (!isRealDate(d.date))
            errors.push('The delivery date is not a real date');
          else {
            if (d.date < t.earliestDate)
              errors.push(
                `The earliest delivery to ${city} is ${t.earliestDate}`,
              );
            if (perishable && !perishableDateOk(now, d.date)) {
              errors.push(
                `Flowers and chocolate cannot be scheduled more than ${PERISHABLE_MAX_DAYS_AHEAD} days ahead`,
              );
            }
          }
        }
        delivery = {
          city,
          method: d.method ?? 'address',
          fee,
          freeDelivery: fee === 0 && rate.fee > 0,
          sameDay: t.sameDay,
          earliestDate: t.earliestDate,
          estimatedBy: t.estimatedBy,
          requestedDate: d.date ?? null,
          perishable,
        };
      }
    }

    if (errors.length) throw new BadRequestException(errors);

    const promo = await this.promo(
      dto.promoCode,
      subtotal,
      now,
      user,
      dto.email,
    );
    const discount = promo?.applied ? promo.discount : 0;

    return {
      lines,
      itemsTotal,
      extrasTotal,
      subtotal,
      deliveryFee: fee,
      discount,
      total: subtotal + fee - discount,
      currency: 'PKR',
      delivery,
      promo,
      quotedAt: now.toISOString(),
    };
  }

  // ---------- helpers ----------

  private async config(): Promise<StoreConfig> {
    const c = await this.store.get<StoreConfig>('storeConfig', 'main');
    if (!c) throw new ServiceUnavailableException('Store settings are missing');
    return c;
  }

  /** DL-09: same-day orders already booked for this city today count against its daily capacity. */
  private async capacityLeft(
    config: StoreConfig,
    city: string,
    now: Date,
  ): Promise<number> {
    const cap = config.sameDayCapacity?.[city];
    if (cap === undefined) return Infinity;
    const today = pkt(now).date;
    const used = await this.store.find<OrderRef>(
      'orders',
      (o) =>
        o.city === city &&
        String(o.deliveryDate ?? '').slice(0, 10) === today &&
        o.status !== 'cancelled',
    );
    return cap - used.length;
  }

  /** PR-04 to PR-06, PR-08. A code that cannot be used is reported, not thrown, so the basket still prices. */
  private async promo(
    code: string | undefined,
    subtotal: number,
    now: Date,
    user: AuthUser | undefined,
    email: string | undefined,
  ) {
    const entered = code?.trim();
    if (!entered) return null;
    const fail = (reason: string) => ({
      code: entered.toUpperCase(),
      applied: false,
      reason,
      discount: 0,
    });

    const c = (await this.store.all<PromoCode>('promoCodes')).find(
      (p) => p.code.toLowerCase() === entered.toLowerCase(),
    );
    if (!c || !c.isActive) return fail('That code is not valid');
    const iso = now.toISOString();
    if ((c.startsAt && iso < c.startsAt) || (c.endsAt && iso > c.endsAt))
      return fail('That code is not valid right now');
    if (subtotal <= c.minOrder)
      return fail(`This code needs an order over ${rupees(c.minOrder)}`);

    if (c.firstOrderOnly) {
      if (!user && !email)
        return fail('Sign in or enter your email to use this code');
      // Everyone who has used this address, as a guest or with an account, counts as the same customer.
      const account = user
        ? await this.store.get<Customer>('customers', user.id)
        : undefined;
      const address = (account?.email ?? email ?? '').toLowerCase();
      const ids = new Set(
        (
          await this.store.find<Customer>(
            'customers',
            (x) => x.email === address,
          )
        ).map((x) => x.id),
      );
      if (user) ids.add(user.id);
      const earlier = await this.store.findOne<OrderRef>(
        'orders',
        (o) =>
          !!o.customerId && ids.has(o.customerId) && o.status !== 'cancelled',
      );
      if (earlier) return fail('This code is for a first gift only');
    }
    return {
      code: c.code,
      applied: true,
      percent: c.percent,
      discount: Math.round((subtotal * c.percent) / 100),
    };
  }
}
