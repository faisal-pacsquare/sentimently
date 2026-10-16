import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MAILER, Mailer } from '../mail/mailer';
import { CLOCK, Clock } from '../pricing/pricing.service';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';
import {
  CompleteReturnDto,
  DecisionDto,
  ReturnRequestDto,
} from './returns.dto';
import { OrdersService } from './orders.service';
import { deliveredAt, Order } from './order.types';
import { RefundsService } from './refunds.service';

export interface ReturnRequest extends Doc {
  orderId: string;
  orderNumber: string;
  kind: 'return' | 'damaged';
  lineIndexes: number[];
  reason: string;
  photoUrls: string[];
  status: 'requested' | 'approved' | 'rejected' | 'completed';
  resolution?: 'refund' | 'replacement';
  /** What a refund would be before any fault adjustment. */
  refundAmount: number;
  deliveredAt: string;
  staffNote?: string;
  decidedBy?: string;
  decidedAt?: string;
  refundId?: string;
}

const HOUR = 3_600_000;
export const DAMAGE_REPORT_HOURS = 48; // OR-03
export const RETURN_WINDOW_DAYS = 7; // OR-04

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly store: JsonStore,
    private readonly orders: OrdersService,
    private readonly refunds: RefundsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ---------- customer ----------

  async request(dto: ReturnRequestDto) {
    const order = await this.orders.findByNumberAndEmail(dto.number, dto.email);
    if (order.status !== 'delivered')
      throw new ConflictException(
        'Only delivered orders can be returned or reported as damaged',
      );

    const delivered = deliveredAt(order) ?? order.updatedAt;
    const hoursSince =
      (this.clock.now().getTime() - Date.parse(delivered)) / HOUR;
    const photos = dto.photoUrls ?? [];

    let lineIndexes: number[];
    let refundAmount: number;
    if (dto.kind === 'damaged') {
      // OR-03: a photo within 48 hours; replacement or a full refund including delivery.
      if (!photos.length)
        throw new BadRequestException(['Add at least one photo of the damage']);
      if (hoursSince > DAMAGE_REPORT_HOURS)
        throw new ConflictException(
          `Damage must be reported within ${DAMAGE_REPORT_HOURS} hours of delivery`,
        );
      lineIndexes = order.lines.flatMap((l, i) =>
        l.type === 'physical' ? [i] : [],
      );
      refundAmount = order.total;
    } else {
      // OR-04: within 7 days, unused, original packaging, and never personalised items.
      if (hoursSince > RETURN_WINDOW_DAYS * 24)
        throw new ConflictException(
          `Returns must be requested within ${RETURN_WINDOW_DAYS} days of delivery`,
        );
      if (!dto.confirmUnused)
        throw new BadRequestException([
          'Confirm the items are unused and in their original packaging',
        ]);
      const eligible = order.lines.flatMap((l, i) =>
        l.type === 'physical' && !l.personalisation ? [i] : [],
      );
      if (!eligible.length)
        throw new ConflictException(
          'Personalised and digital gifts cannot be returned',
        );
      lineIndexes = dto.lines ?? eligible;
      const bad = lineIndexes.filter((i) => !eligible.includes(i));
      if (!lineIndexes.length || bad.length)
        throw new BadRequestException([
          'Choose items that can be returned: personalised and digital gifts cannot be',
        ]);
      const items = lineIndexes.reduce(
        (s, i) => s + order.lines[i].lineTotal,
        0,
      );
      // The delivery fee is not refunded (the customer pays to send it back unless it is faulty), and any discount is shared out.
      refundAmount =
        order.subtotal > 0
          ? Math.round(
              (items * (order.subtotal - order.discount)) / order.subtotal,
            )
          : items;
    }

    const at = this.clock.now().toISOString();
    const request: ReturnRequest = {
      id: randomUUID(),
      orderId: order.id,
      orderNumber: order.number,
      kind: dto.kind,
      lineIndexes,
      reason: dto.reason,
      photoUrls: photos,
      status: 'requested',
      refundAmount,
      deliveredAt: delivered,
      createdAt: at,
      updatedAt: at,
    };
    await this.store.mutate('returns', (docs) => {
      if (
        docs.some(
          (d) =>
            (d as ReturnRequest).orderId === order.id &&
            (d as ReturnRequest).status !== 'rejected',
        )
      ) {
        throw new ConflictException(
          'A request for this order is already open or has been completed',
        );
      }
      docs.push(request);
    });
    await this.tell(
      order,
      'We have your request',
      `We received your ${dto.kind === 'damaged' ? 'damage report' : 'return request'} for order ${order.number}. We will reply soon.`,
    );
    return { id: request.id, status: request.status, refundAmount };
  }

  // ---------- staff ----------

  async list(status?: string) {
    return (await this.store.all<ReturnRequest>('returns'))
      .filter((r) => !status || r.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async decide(id: string, staffId: string, dto: DecisionDto) {
    const at = this.clock.now().toISOString();
    if (
      dto.decision === 'approve' &&
      (await this.get(id)).kind === 'damaged' &&
      !dto.resolution
    ) {
      throw new BadRequestException([
        'Choose a resolution for damaged goods: refund or replacement',
      ]);
    }
    const req = await this.store.mutate('returns', (docs) => {
      const r = docs.find((d) => d.id === id) as ReturnRequest | undefined;
      if (!r) throw new NotFoundException('Request not found');
      if (r.status !== 'requested')
        throw new ConflictException(`This request is already ${r.status}`);
      r.status = dto.decision === 'reject' ? 'rejected' : 'approved';
      r.resolution =
        dto.decision === 'approve'
          ? r.kind === 'damaged'
            ? dto.resolution
            : 'refund'
          : undefined;
      r.staffNote = dto.note;
      r.decidedBy = staffId;
      r.decidedAt = at;
      r.updatedAt = at;
      return structuredClone(r);
    });
    const order = await this.orders.getById(req.orderId);

    if (req.status === 'rejected') {
      await this.tell(
        order,
        'About your request',
        `We could not approve your request for order ${order.number}.${dto.note ? ` ${dto.note}` : ''}`,
      );
    } else if (req.kind === 'damaged' && req.resolution === 'replacement') {
      await this.store.update<ReturnRequest>('returns', id, {
        status: 'completed',
      });
      await this.orders.addNote(
        order.id,
        'Damaged on arrival: replacement to be sent',
        staffId,
      );
      await this.tell(
        order,
        'We will send a replacement',
        `Sorry about the damage. We will send a replacement for order ${order.number}.`,
      );
    } else if (req.kind === 'damaged') {
      await this.finishWithRefund(req, order, staffId, 0);
    } else {
      await this.tell(
        order,
        'Your return is approved',
        `Please send the items back for order ${order.number}. The return cost is yours unless they were faulty. We refund the items once they arrive.`,
      );
    }
    return this.get(id);
  }

  /** Goods are back. Creates the refund (delivery is included if they were faulty). */
  async complete(id: string, staffId: string, dto: CompleteReturnDto) {
    const req = await this.get(id);
    if (req.kind !== 'return' || req.status !== 'approved')
      throw new ConflictException('Only an approved return can be completed');
    const order = await this.orders.getById(req.orderId);
    await this.finishWithRefund(
      req,
      order,
      staffId,
      dto.faulty ? order.deliveryFee : 0,
    );
    return this.get(id);
  }

  /** Marks the money as sent. A full refund also closes the order. */
  async processRefund(refundId: string, staffId: string) {
    const { refund, already } = await this.refunds.markProcessed(
      refundId,
      staffId,
    );
    if (already) return refund;
    const order = await this.orders.getById(refund.orderId);
    if (
      (order.status === 'returned' || order.status === 'cancelled') &&
      refund.amount >= order.total
    ) {
      await this.orders.transition(order.id, 'refunded', staffId, {
        note: `Refund of Rs ${refund.amount} processed`,
      });
    } else {
      await this.orders.addNote(
        order.id,
        `Refund of Rs ${refund.amount} processed`,
        staffId,
      );
      await this.tell(
        order,
        'Your refund is on its way',
        `We processed a refund of Rs ${refund.amount} for order ${order.number}. ${refund.arrivalNote}`,
      );
    }
    return refund;
  }

  // ---------- helpers ----------

  private async get(id: string) {
    const r = await this.store.get<ReturnRequest>('returns', id);
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  private async finishWithRefund(
    req: ReturnRequest,
    order: Order,
    staffId: string,
    extra: number,
  ) {
    const refund = await this.refunds.create({
      orderId: order.id,
      orderNumber: order.number,
      method: order.paymentMethod,
      amount: req.refundAmount + extra,
      reason: req.kind === 'damaged' ? 'damaged' : 'return',
      returnId: req.id,
    });
    if (order.status === 'delivered') {
      await this.orders.transition(order.id, 'returned', staffId, {
        note: req.kind === 'damaged' ? 'Damaged on arrival' : 'Items returned',
      });
    }
    await this.store.update<ReturnRequest>('returns', req.id, {
      status: 'completed',
      refundId: refund.id,
    });
  }

  private async tell(order: Order, subject: string, text: string) {
    try {
      await this.mailer.send({
        to: order.contactEmail,
        subject: `Order ${order.number}: ${subject}`,
        text,
      });
    } catch (e) {
      this.logger.error(`Could not email ${order.contactEmail}: ${String(e)}`);
    }
  }
}
