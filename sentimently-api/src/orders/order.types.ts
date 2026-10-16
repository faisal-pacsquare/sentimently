import { Doc } from '../storage/storage.types';

export const STATUSES = [
  'awaiting_payment', // bank transfer or card, not yet confirmed
  'placed', // cash on delivery, accepted
  'paid',
  'preparing',
  'in_production', // personalised item being made: can no longer be cancelled (OR-02)
  'dispatched',
  'delivered',
  'failed_delivery',
  'returned',
  'refunded',
  'cancelled',
] as const;
export type OrderStatus = (typeof STATUSES)[number];

export type PaymentMethod = 'cod' | 'bank_transfer' | 'card';

export interface OrderEntry {
  at: string;
  type: 'created' | 'status' | 'payment' | 'note';
  from?: OrderStatus;
  to?: OrderStatus;
  by: string; // customer id, staff id, or "system"
  note?: string;
}

export interface OrderLine {
  productId: string;
  slug: string;
  name: string;
  type: 'physical' | 'digital';
  quantity: number;
  unitPrice: number;
  itemsTotal: number;
  extras: { code: string; name: string; price: number }[];
  extrasTotal: number;
  lineTotal: number;
  /** True when stock was taken for this line, so cancelling puts it back. */
  stockReserved: boolean;
  personalisation?: {
    recipientName: string;
    relationship: string;
    message?: string;
    cardDesign: string;
    extras: string[];
  };
  digitalGiftId?: string;
}

/**
 * Field names here are a contract with other modules: reviews read customerId/status/lines[].productId,
 * and same-day capacity and first-gift codes read city, deliveryDate, customerId and status.
 */
export interface Order extends Doc {
  number: string;
  customerId: string;
  contactEmail: string;
  contactName?: string;
  contactPhone?: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  currency: 'PKR';
  itemsTotal: number;
  extrasTotal: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  promoCode?: string;
  city?: string;
  deliveryDate?: string;
  estimatedBy?: string;
  sameDay?: boolean;
  delivery?: {
    method: 'address' | 'gift_link';
    address?: string;
    city: string;
    phone?: string;
    courier?: string;
    trackingRef?: string;
    attempts: number;
    /** How many times a failed delivery was sent out again (OR-06). */
    redeliveries?: number;
  };
  /** Re-delivery fees the customer owes after the first free one (OR-06). Collected by staff. */
  redeliveryFeeDue?: number;
  lines: OrderLine[];
  giftLinkId?: string;
  idempotencyKey?: string;
  /** Set when personal details were removed (account deleted, or retention period passed). */
  anonymisedAt?: string;
  events: OrderEntry[];
}

export interface PaymentRecord extends Doc {
  orderId: string;
  method: PaymentMethod;
  status:
    'pending' | 'confirmed' | 'failed' | 'cancelled' | 'refunded' | 'mismatch';
  amount: number;
  gatewayRef?: string;
  processedEvents: string[];
}

export const hasPhysical = (o: Pick<Order, 'lines'>) =>
  o.lines.some((l) => l.type === 'physical');

/** When the order was marked delivered (the last time it reached that status), or undefined. */
export function deliveredAt(o: Pick<Order, 'events'>): string | undefined {
  return [...o.events].reverse().find((e) => e.to === 'delivered')?.at;
}
