import { rupees, shortDate } from '@sentimently/api';
import type { CheckoutResponse } from '@sentimently/api';
import { Alert, Button, Container } from '@sentimently/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useBasket } from '../lib/basket';
import { loadLastOrder } from '../lib/prefs';

/** After paying by card the order is confirmed by the gateway, a moment later than the shopper returns. */
const POLL_MS = 3000;
const POLL_FOR_MS = 90_000;

function CardReturn({ res, cancelled }: { res: CheckoutResponse; cancelled: boolean }) {
  const basket = useBasket();
  const { number, contactEmail } = res.order;
  const started = useRef(Date.now());
  const [released, setReleased] = useState(false);

  // The box was kept while the shopper was away paying. Once they are back and have paid, it is done with.
  useEffect(() => {
    if (!cancelled) basket.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelled]);

  // They pressed Cancel on the payment page: let go of the order so the stock goes back on the shelf.
  const cancelOnce = useRef(false);
  useEffect(() => {
    if (!cancelled || cancelOnce.current) return;
    cancelOnce.current = true;
    api.cancelOrder(number, contactEmail, 'Card payment cancelled by the shopper').then(() => setReleased(true), () => undefined);
  }, [cancelled, number, contactEmail]);

  const status = useQuery({
    queryKey: ['order-status', number],
    queryFn: () => api.track(number, contactEmail),
    enabled: !cancelled,
    refetchInterval: (q) =>
      q.state.data && q.state.data.status !== 'awaiting_payment'
        ? false
        : Date.now() - started.current < POLL_FOR_MS ? POLL_MS : false,
  });

  if (cancelled) {
    return (
      <Container className="page">
        <title>Payment cancelled | Bloomora</title>
        <h1>Payment not completed</h1>
        <p>No money was taken.{released ? ` Order ${number} has been cancelled.` : ''} Your gift box is still here if you would like to try again.</p>
        <p><Button as={Link} to="/box">Back to gift box</Button></p>
      </Container>
    );
  }

  const paid = status.data && status.data.status !== 'awaiting_payment';
  const waited = Date.now() - started.current >= POLL_FOR_MS;
  return (
    <Container className="page">
      <title>{paid ? 'Order placed' : 'Confirming payment'} | Bloomora</title>
      {paid ? (
        <>
          <h1>Thank you, we have your payment</h1>
          <p>Order number <strong>{number}</strong>. We sent the details to {contactEmail}.</p>
          <p>Total <strong>{rupees(res.order.total)}</strong>.{res.order.estimatedBy ? ` Expected by ${shortDate(res.order.estimatedBy)}.` : ''}</p>
        </>
      ) : (
        <>
          <h1>Confirming your payment</h1>
          <p aria-live="polite" aria-busy={!waited}>
            {waited
              ? `We have not heard back from the bank yet. Your order number is ${number}. If you were charged, you do not need to do anything: we will email ${contactEmail} as soon as it is confirmed.`
              : 'This usually takes a few seconds. Please do not close this page.'}
          </p>
        </>
      )}
      <p>
        <Button as={Link} to="/track">Track this order</Button>{' '}
        <Button as={Link} to="/shop" variant="ghost">Keep shopping</Button>
      </p>
    </Container>
  );
}

export function OrderPlaced() {
  const [res] = useState(() => loadLastOrder<CheckoutResponse>());
  const [params] = useSearchParams();
  const [copied, setCopied] = useState(false);
  const fromCard = params.get('paid') === '1' || params.get('cancelled') === '1';

  if (!res) {
    return (
      <Container className="page">
        <title>Order | Bloomora</title>
        <h1>Looking for an order?</h1>
        <p>Use your order number and email to see where it is.</p>
        <Button as={Link} to="/track">Track an order</Button>
      </Container>
    );
  }
  if (fromCard && res.payment.method === 'card' && params.get('order') === res.order.number) {
    return <CardReturn res={res} cancelled={params.get('cancelled') === '1'} />;
  }

  const { order, payment, giftLink } = res;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(giftLink!.url);
      setCopied(true);
    } catch {
      /* the link is shown, so it can be copied by hand */
    }
  };
  return (
    <Container className="page">
      <title>Order placed | Bloomora</title>
      <h1>Thank you, your order is placed</h1>
      <p>Order number <strong>{order.number}</strong>. We sent the details to {order.contactEmail}.</p>
      <p>Total <strong>{rupees(order.total)}</strong>.{order.estimatedBy ? ` Expected by ${shortDate(order.estimatedBy)}.` : ''}</p>

      {payment.method === 'cod' && <Alert tone="info">Please keep {rupees(order.total)} ready to pay the courier in cash.</Alert>}
      {payment.method === 'bank_transfer' && (
        <Alert tone="warn">
          <strong>Please send the transfer to start your order.</strong>
          {payment.instructions && <span style={{ display: 'block', whiteSpace: 'pre-line' }}>{payment.instructions}</span>}
          <span style={{ display: 'block' }}>Use {order.number} as the reference.</span>
        </Alert>
      )}
      {giftLink && (
        <section aria-labelledby="gl">
          <h2 id="gl">Send this link to the person receiving the gift</h2>
          <p>They use it to tell us where to deliver it.</p>
          <p><code>{giftLink.url}</code></p>
          <Button variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
        </section>
      )}
      <p>
        <Button as={Link} to="/track">Track this order</Button>{' '}
        <Button as={Link} to="/shop" variant="ghost">Keep shopping</Button>
      </p>
    </Container>
  );
}
