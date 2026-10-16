import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK, Clock } from '../pricing/pricing.service';
import { addWorkingDays, pkt } from '../pricing/rules';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';
import { PaymentMethod } from './order.types';

export interface Refund extends Doc {
  orderId: string;
  orderNumber: string;
  returnId?: string;
  reason: 'cancelled' | 'return' | 'damaged';
  amount: number;
  method: PaymentMethod;
  status: 'pending' | 'processed';
  /** OR-05: approved refunds are processed within 3 working days. */
  dueBy: string;
  arrivalNote: string;
  processedAt?: string;
  processedBy?: string;
  overdueAlertedAt?: string;
}

const PROCESS_WITHIN_WORKING_DAYS = 3;

@Injectable()
export class RefundsService {
  constructor(
    private readonly store: JsonStore,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** One refund per order and reason; asking again returns the one that exists. */
  async create(args: {
    orderId: string;
    orderNumber: string;
    method: PaymentMethod;
    amount: number;
    reason: Refund['reason'];
    returnId?: string;
  }) {
    const now = this.clock.now();
    const at = now.toISOString();
    const refund: Refund = {
      id: randomUUID(),
      ...args,
      status: 'pending',
      dueBy: addWorkingDays(pkt(now).date, PROCESS_WITHIN_WORKING_DAYS),
      arrivalNote:
        args.method === 'cod'
          ? 'Cash on delivery: we will ask for bank account details to send the money.'
          : 'Bank transfers land in 5 to 7 working days after we process them.',
      createdAt: at,
      updatedAt: at,
    };
    return this.store.mutate('refunds', (docs) => {
      const twin = docs.find(
        (d) =>
          (d as Refund).orderId === args.orderId &&
          (d as Refund).reason === args.reason &&
          (d as Refund).returnId === args.returnId,
      );
      if (twin) return twin as Refund;
      docs.push(refund);
      return refund;
    });
  }

  forOrder(orderId: string) {
    return this.store.find<Refund>('refunds', (r) => r.orderId === orderId);
  }

  async list(status?: string) {
    const today = pkt(this.clock.now()).date;
    const rows = (await this.store.all<Refund>('refunds'))
      .filter((r) => !status || r.status === status)
      .sort((a, b) => a.dueBy.localeCompare(b.dueBy));
    return rows.map((r) => ({
      ...r,
      overdue: r.status === 'pending' && r.dueBy < today,
    }));
  }

  async markProcessed(id: string, by: string) {
    const at = this.clock.now().toISOString();
    return this.store.mutate('refunds', (docs) => {
      const r = docs.find((d) => d.id === id) as Refund | undefined;
      if (!r) throw new NotFoundException('Refund not found');
      if (r.status === 'processed')
        return { refund: structuredClone(r), already: true };
      r.status = 'processed';
      r.processedAt = at;
      r.processedBy = by;
      r.updatedAt = at;
      return { refund: structuredClone(r), already: false };
    });
  }

  /** Pending refunds past their due date that nobody has been warned about yet. Marks them as warned. */
  async claimOverdue(): Promise<Refund[]> {
    const today = pkt(this.clock.now()).date;
    const at = this.clock.now().toISOString();
    const found: Refund[] = [];
    await this.store.mutate('refunds', (docs) => {
      found.length = 0;
      for (const r of docs as Refund[]) {
        if (r.status === 'pending' && r.dueBy < today && !r.overdueAlertedAt) {
          r.overdueAlertedAt = at;
          found.push(structuredClone(r));
        }
      }
    });
    return found;
  }
}
