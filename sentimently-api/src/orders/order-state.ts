import { OrderStatus } from './order.types';

/**
 * Allowed moves between order statuses. Anything not listed is refused.
 * OR-01: cancelling is allowed up to "preparing". OR-02: once a personalised item is "in_production" it can't be.
 */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ['paid', 'cancelled'],
  placed: ['preparing', 'cancelled'],
  paid: ['preparing', 'cancelled', 'delivered'], // paid -> delivered only for digital-only orders (checked by the caller)
  preparing: ['in_production', 'dispatched', 'cancelled'],
  in_production: ['dispatched'],
  dispatched: ['delivered', 'failed_delivery'],
  failed_delivery: ['dispatched', 'returned'],
  delivered: ['returned'],
  returned: ['refunded'],
  cancelled: ['refunded'],
  refunded: [],
};

export const canMove = (from: OrderStatus, to: OrderStatus) =>
  NEXT[from].includes(to);

export function refusal(from: OrderStatus, to: OrderStatus): string {
  if (
    to === 'cancelled' &&
    ['in_production', 'dispatched', 'delivered', 'failed_delivery'].includes(
      from,
    )
  ) {
    return from === 'in_production'
      ? 'This order is already in production and can no longer be cancelled'
      : 'This order has already been dispatched and can no longer be cancelled';
  }
  return `An order that is "${from}" cannot move to "${to}"`;
}

/** What a customer sees. */
export const LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'Waiting for payment',
  placed: 'Order received',
  paid: 'Payment received',
  preparing: 'Being prepared',
  in_production: 'Being made for you',
  dispatched: 'On its way',
  delivered: 'Delivered',
  failed_delivery: 'Delivery attempt failed',
  returned: 'Returned',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};
