import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../auth/password';
import { Customer, publicCustomer } from '../customers/customer.types';
import { StoreSettings } from '../store/store.controller';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';
import {
  CreatePromoDto,
  CreateStaffDto,
  RateInput,
  UpdateExtraDto,
  UpdatePromoDto,
  UpdateStoreDto,
} from './admin-settings.dto';

export interface Promo extends Doc {
  code: string;
  percent: number;
  minOrder: number;
  firstOrderOnly: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
}

const isInt = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0;

/** A delivery tier must be whole rupees and whole days, with the minimum no later than the maximum. */
function checkRate(label: string, r: unknown, errors: string[]) {
  const x = r as Partial<RateInput> | undefined;
  if (!x || typeof x !== 'object')
    return errors.push(
      `${label}: must be an object with fee, minDays, maxDays and sameDay`,
    );
  if (!isInt(x.fee))
    errors.push(`${label}: fee must be a whole number of rupees`);
  if (!isInt(x.minDays) || !isInt(x.maxDays))
    errors.push(`${label}: minDays and maxDays must be whole numbers`);
  else if (x.minDays > x.maxDays)
    errors.push(`${label}: minDays is greater than maxDays`);
  if (typeof x.sameDay !== 'boolean')
    errors.push(`${label}: sameDay must be true or false`);
}

@Injectable()
export class AdminSettingsService {
  constructor(private readonly store: JsonStore) {}

  // ---------- store settings ----------

  async getStore() {
    const c = await this.store.get<StoreSettings>('storeConfig', 'main');
    if (!c) throw new NotFoundException('Store settings are missing');
    return c;
  }

  /**
   * Changes take effect at once: quotes and checkouts read the settings each time.
   * Maps (the delivery table, same-day capacity) are replaced whole, so send every city.
   */
  async updateStore(dto: UpdateStoreDto) {
    const errors: string[] = [];
    if (dto.deliveryRates) {
      if (!Object.keys(dto.deliveryRates).length)
        errors.push('deliveryRates: needs at least one city');
      for (const [city, rate] of Object.entries(dto.deliveryRates))
        checkRate(`deliveryRates.${city}`, rate, errors);
    }
    if (dto.restOfPakistan)
      checkRate('restOfPakistan', dto.restOfPakistan, errors);
    if (dto.sameDayCapacity) {
      for (const [city, n] of Object.entries(dto.sameDayCapacity))
        if (!isInt(n))
          errors.push(`sameDayCapacity.${city}: must be a whole number`);
    }
    if (dto.socialLinks) {
      for (const [name, url] of Object.entries(dto.socialLinks))
        if (typeof url !== 'string' || !/^https?:\/\/\S+$/.test(url))
          errors.push(`socialLinks.${name}: must be a web address`);
    }
    if (errors.length) throw new BadRequestException(errors);

    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    const updated = await this.store.update<StoreSettings>(
      'storeConfig',
      'main',
      patch as Partial<StoreSettings>,
    );
    if (!updated) throw new NotFoundException('Store settings are missing');
    return updated;
  }

  // ---------- promo codes ----------

  promos() {
    return this.store.all<Promo>('promoCodes');
  }

  async createPromo(dto: CreatePromoDto) {
    const code = dto.code.toUpperCase();
    const now = new Date().toISOString();
    const promo: Promo = {
      id: code,
      code,
      percent: dto.percent,
      minOrder: dto.minOrder ?? 0,
      firstOrderOnly: dto.firstOrderOnly ?? false,
      startsAt: dto.startsAt ?? null,
      endsAt: dto.endsAt ?? null,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.checkWindow(promo);
    return this.store.appendIf('promoCodes', (docs) => {
      if (docs.some((d) => d.id === code))
        throw new ConflictException(`The code ${code} already exists`);
      return { add: promo, result: promo };
    });
  }

  async updatePromo(code: string, dto: UpdatePromoDto) {
    const id = code.toUpperCase();
    const current = await this.store.get<Promo>('promoCodes', id);
    if (!current) throw new NotFoundException('Promo code not found');
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    this.checkWindow({ ...current, ...patch } as Promo);
    return (await this.store.update<Promo>(
      'promoCodes',
      id,
      patch as Partial<Promo>,
    ))!;
  }

  private checkWindow(p: Promo) {
    if (p.startsAt && p.endsAt && p.startsAt >= p.endsAt)
      throw new BadRequestException(['startsAt must be before endsAt']);
  }

  // ---------- extras (paid add-ons) ----------

  extras() {
    return this.store.all('extras');
  }

  async updateExtra(code: string, dto: UpdateExtraDto) {
    if (code === 'classic_wrap' && dto.price !== undefined && dto.price !== 0)
      throw new BadRequestException([
        'classic wrap is always included in the price',
      ]);
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    const e = await this.store.update('extras', code, patch);
    if (!e) throw new NotFoundException('Extra not found');
    return e;
  }

  // ---------- staff accounts ----------

  async staff() {
    const people = await this.store.find<Customer>(
      'customers',
      (c) => c.role === 'staff' || c.role === 'admin',
    );
    return people.map((c) => ({
      ...publicCustomer(c),
      createdAt: c.createdAt,
    }));
  }

  async createStaff(dto: CreateStaffDto) {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await hashPassword(dto.password);
    const now = new Date().toISOString();
    return this.store.mutate('customers', (docs) => {
      const existing = docs.find(
        (d) => (d as Customer).email === email && !(d as Customer).isGuest,
      ) as Customer | undefined;
      if (existing) {
        if (existing.role !== 'customer')
          throw new ConflictException('That person is already on the team');
        throw new ConflictException(
          'That email already has a customer account. Use a different address for the team account.',
        );
      }
      const staff: Customer = {
        id: randomUUID(),
        email,
        name: dto.name,
        role: dto.role,
        authProvider: 'email',
        passwordHash,
        isGuest: false,
        emailVerified: true, // an admin vouches for the address
        createdAt: now,
        updatedAt: now,
      };
      if (!existing) docs.push(staff);
      return publicCustomer(staff);
    });
  }

  /** Takes team access away. The person stays a normal customer. You cannot remove yourself or the last admin. */
  async removeStaff(id: string, actorId: string) {
    if (id === actorId)
      throw new BadRequestException(['You cannot remove your own access']);
    return this.store.mutate('customers', (docs) => {
      const target = docs.find((d) => d.id === id) as Customer | undefined;
      if (!target || (target.role !== 'staff' && target.role !== 'admin'))
        throw new NotFoundException('Team member not found');
      if (
        target.role === 'admin' &&
        docs.filter((d) => (d as Customer).role === 'admin').length <= 1
      ) {
        throw new ConflictException('There must always be at least one admin');
      }
      target.role = 'customer';
      target.updatedAt = new Date().toISOString();
      return publicCustomer(target);
    });
  }
}
