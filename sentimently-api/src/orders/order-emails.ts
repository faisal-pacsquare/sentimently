import { LABELS } from './order-state';
import { Order, OrderStatus } from './order.types';

const rs = (n: number) =>
  `Rs ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

export function confirmationEmail(
  o: Order,
  extra: { bankInstructions?: string; giftLinkUrl?: string },
) {
  const lines = o.lines.map(
    (l) => `- ${l.name} x${l.quantity}: ${rs(l.lineTotal)}`,
  );
  const pay =
    o.paymentMethod === 'cod'
      ? 'Payment: cash on delivery.'
      : o.paymentMethod === 'bank_transfer'
        ? `Payment: bank transfer. Please pay ${rs(o.total)} quoting ${o.number}.\n${extra.bankInstructions ?? ''}`.trim()
        : 'Payment: card. Your order is confirmed once the payment completes.';
  return {
    subject: `Your Bloomora order ${o.number}`,
    text: [
      `Thank you${o.contactName ? `, ${o.contactName}` : ''}. We have your order ${o.number}.`,
      '',
      ...lines,
      o.discount ? `Discount: -${rs(o.discount)}` : '',
      `Delivery: ${rs(o.deliveryFee)}`,
      `Total: ${rs(o.total)}`,
      '',
      pay,
      o.deliveryDate ? `Delivery date: ${o.deliveryDate}` : '',
      extra.giftLinkUrl
        ? `\nSend this private link to the person getting your gift, so they can add their address:\n${extra.giftLinkUrl}\nIt works once and never shows your details.`
        : '',
      '',
      'You can follow your order any time with your order number and this email address.',
    ]
      .filter((l) => l !== '')
      .join('\n'),
  };
}

/** Which status changes the customer is told about. */
const NOTIFY: OrderStatus[] = [
  'paid',
  'dispatched',
  'delivered',
  'failed_delivery',
  'cancelled',
  'refunded',
];
export const shouldNotify = (to: OrderStatus) => NOTIFY.includes(to);

export function statusEmail(o: Order, to: OrderStatus) {
  if (to === 'failed_delivery' && (o.delivery?.attempts ?? 0) >= 2) {
    return {
      subject: `Order ${o.number}: we could not deliver`,
      text: `We tried twice to deliver order ${o.number} and could not. We will contact you to arrange what happens next.`,
    };
  }
  const tracking = o.delivery?.trackingRef
    ? `\nTracking: ${o.delivery.courier ?? ''} ${o.delivery.trackingRef}`.trimEnd()
    : '';
  return {
    subject: `Order ${o.number}: ${LABELS[to].toLowerCase()}`,
    text: `Your order ${o.number} is now: ${LABELS[to]}.${tracking}\n\nFollow it any time with your order number and this email address.`,
  };
}
