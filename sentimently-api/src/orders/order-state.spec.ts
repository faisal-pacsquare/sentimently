import { addMonths } from '../digital/digital-gifts.service';
import { canMove, refusal } from './order-state';
import { OrderStatus, STATUSES } from './order.types';

describe('order state machine', () => {
  const path: OrderStatus[] = [
    'placed',
    'preparing',
    'in_production',
    'dispatched',
    'delivered',
  ];

  it('walks the normal path one step at a time', () => {
    for (let i = 0; i < path.length - 1; i++)
      expect(canMove(path[i], path[i + 1])).toBe(true);
  });

  it('OR-01 an order can be cancelled until preparation has gone far enough', () => {
    for (const s of [
      'awaiting_payment',
      'placed',
      'paid',
      'preparing',
    ] as OrderStatus[]) {
      expect(canMove(s, 'cancelled')).toBe(true);
    }
  });

  it('OR-02 once a personalised item is in production the order cannot be cancelled', () => {
    expect(canMove('in_production', 'cancelled')).toBe(false);
    expect(refusal('in_production', 'cancelled')).toBe(
      'This order is already in production and can no longer be cancelled',
    );
  });

  it('OR-02 nor after it has been dispatched', () => {
    for (const s of [
      'dispatched',
      'delivered',
      'failed_delivery',
    ] as OrderStatus[]) {
      expect(canMove(s, 'cancelled')).toBe(false);
    }
  });

  it('refuses skipping steps and leaving a final state', () => {
    expect(canMove('placed', 'dispatched')).toBe(false);
    expect(canMove('awaiting_payment', 'preparing')).toBe(false);
    for (const to of STATUSES) expect(canMove('refunded', to)).toBe(false);
  });

  it('a failed delivery can be retried or returned', () => {
    expect(canMove('failed_delivery', 'dispatched')).toBe(true);
    expect(canMove('failed_delivery', 'returned')).toBe(true);
  });
});

describe('gift card expiry', () => {
  it('SC-03 an e-gift card lasts 12 months from the issue date', () => {
    expect(addMonths('2026-11-18T05:00:00.000Z', 12)).toBe(
      '2027-11-18T05:00:00.000Z',
    );
  });

  it('SC-03 clamps to the end of a short month', () => {
    expect(addMonths('2027-02-28T10:00:00.000Z', 12)).toBe(
      '2028-02-28T10:00:00.000Z',
    );
    expect(addMonths('2028-02-29T10:00:00.000Z', 12)).toBe(
      '2029-02-28T10:00:00.000Z',
    );
  });
});
