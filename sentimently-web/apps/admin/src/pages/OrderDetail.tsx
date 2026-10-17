import { ApiError, dateTime, rupees, shortDate } from '@sentimently/api';
import type { OrderStatus } from '@sentimently/api';
import { Alert, Button, Container, ErrorState, TextArea, TextField } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import { useAuth } from '../lib/auth';
import type { AdminOrder, AdminOrderDetail } from '../lib/admin-api';
import { ActionError, PAYMENT_LABEL, QueryError, STATUS_LABEL, StatusBadge } from '../lib/present';

/** The same moves the server allows, so only sensible buttons are shown. The server still decides. */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ['paid', 'cancelled'],
  placed: ['preparing', 'cancelled'],
  paid: ['preparing', 'cancelled', 'delivered'],
  preparing: ['in_production', 'dispatched', 'cancelled'],
  in_production: ['dispatched'],
  dispatched: ['delivered', 'failed_delivery'],
  failed_delivery: ['dispatched', 'returned'],
  delivered: ['returned'],
  returned: ['refunded'],
  cancelled: ['refunded'],
  refunded: [],
};

const ACTION: Partial<Record<OrderStatus, string>> = {
  paid: 'Confirm payment received',
  preparing: 'Start preparing',
  in_production: 'Start production',
  dispatched: 'Mark dispatched',
  delivered: 'Mark delivered',
  failed_delivery: 'Delivery failed',
  returned: 'Mark returned',
  refunded: 'Mark refunded',
  cancelled: 'Cancel order',
};

/** Who did it, in words. Staff and customer ids mean nothing on screen, so only system actors are named. */
function actor(by?: string) {
  if (!by) return '';
  if (by === 'system' || by === 'gateway') return by === 'gateway' ? 'payment gateway' : 'automatic';
  return by.startsWith('customer:') ? 'customer' : '';
}

function Moves({ order }: { order: AdminOrder }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState(order.delivery?.courier ?? '');
  const [trackingRef, setTrackingRef] = useState(order.delivery?.trackingRef ?? '');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const move = useMutation({
    mutationFn: (status: OrderStatus) =>
      adminApi.move(order.id, {
        status,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(status === 'dispatched' && courier.trim() ? { courier: courier.trim() } : {}),
        ...(status === 'dispatched' && trackingRef.trim() ? { trackingRef: trackingRef.trim() } : {}),
      }),
    onSuccess: (detail) => {
      qc.setQueryData(['order', order.id], detail);
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['dispatch'] });
      setNote('');
      setConfirmCancel(false);
    },
  });

  // Digital-only orders go from paid straight to delivered; a physical order must be prepared and dispatched first.
  const digitalOnly = order.lines.every((l) => l.type === 'digital');
  const options = NEXT[order.status].filter((s) => s !== 'delivered' || order.status !== 'paid' || digitalOnly);
  if (!options.length) return <p className="muted">No further steps for this order.</p>;
  const going = (s: OrderStatus) => move.isPending && move.variables === s;

  return (
    <section aria-labelledby="mv">
      <h2 id="mv">Next step</h2>
      {options.includes('dispatched') && (
        <div className="fieldrow">
          <TextField label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} />
          <TextField label="Tracking number" value={trackingRef} onChange={(e) => setTrackingRef(e.target.value)} />
        </div>
      )}
      <TextArea label="Note (optional, kept on the order)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="actions">
        {options.filter((s) => s !== 'cancelled').map((s, i) => (
          <Button key={s} variant={i === 0 ? 'primary' : 'secondary'} loading={going(s)} disabled={move.isPending} onClick={() => move.mutate(s)}>
            {ACTION[s] ?? STATUS_LABEL[s]}
          </Button>
        ))}
        {options.includes('cancelled') && !confirmCancel && (
          <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel order…</Button>
        )}
        {confirmCancel && (
          <>
            <Button variant="primary" loading={going('cancelled')} disabled={move.isPending} onClick={() => move.mutate('cancelled')}>Yes, cancel this order</Button>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep it</Button>
          </>
        )}
      </div>
      <ActionError error={move.error} />
    </section>
  );
}

function DeleteOrder({ o }: { o: AdminOrder }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const erase = useMutation({
    mutationFn: () => adminApi.deleteOrder(o.id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['order', o.id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['production'] });
      navigate('/');
    },
  });
  return (
    <section aria-labelledby="danger" className="danger-zone">
      <h2 id="danger">Delete this order</h2>
      <p className="muted">Only cancelled orders can be deleted. This removes the order for good, with its payments, returns, refunds, gift link and any digital gifts. The customer no longer sees it, and sales reports no longer count it. It cannot be undone.</p>
      {o.paymentMethod === 'card' && <Alert tone="warn">If the customer paid by card, deleting does not refund them: refund it with the payment provider first.</Alert>}
      {!open && <Button variant="secondary" onClick={() => setOpen(true)}>Delete this order…</Button>}
      {open && (
        <Alert tone="error">
          <TextField label={`Type ${o.number} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <div className="actions">
            <Button loading={erase.isPending} disabled={typed.trim().toUpperCase() !== o.number.toUpperCase()} onClick={() => erase.mutate()}>Delete {o.number} for good</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setTyped(''); }}>Keep it</Button>
          </div>
        </Alert>
      )}
      <ActionError error={erase.error} />
    </section>
  );
}

function Detail({ d }: { d: AdminOrderDetail }) {
  const { isAdmin } = useAuth();
  const o = d.order;
  const qc = useQueryClient();
  const retry = useMutation({ mutationFn: (id: string) => adminApi.retryDigital(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['order', o.id] }) });
  const stages = o.events.filter((e) => e.type === 'created' || e.type === 'status' || e.type === 'note');
  return (
    <>
      <title>{`${o.number} | Bloomora studio`}</title>
      <p><Link to="/">All orders</Link></p>
      <h1>{o.number} <StatusBadge status={o.status} /></h1>
      <p className="muted">Placed {dateTime(o.createdAt)}</p>

      <div className="cols">
        <div>
          <Moves key={o.status} order={o} />

          <h2>Items</h2>
          <ul className="lines">
            {o.lines.map((l, i) => (
              <li key={i}>
                <strong>{l.quantity} × {l.name}</strong> <span className="muted">{l.type === 'digital' ? 'digital' : ''}</span> · {rupees(l.lineTotal)}
                {l.extras.length > 0 && <div>Extras: {l.extras.map((x) => x.name).join(', ')}</div>}
                {l.personalisation && (
                  <div>
                    For <strong>{l.personalisation.recipientName}</strong> ({l.personalisation.relationship}), card: {l.personalisation.cardDesign}
                    {l.personalisation.message && <p className="quote">{l.personalisation.message}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {d.digitalGifts.length > 0 && (
            <section aria-labelledby="dg">
              <h2 id="dg">Digital gifts</h2>
              <ul className="lines">
                {d.digitalGifts.map((g) => (
                  <li key={g.id}>
                    {g.kind} to {g.recipientEmail}: <strong>{g.status}</strong>
                    {g.sentAt ? ` (sent ${dateTime(g.sentAt)})` : g.sendAt ? ` (scheduled ${dateTime(g.sendAt)})` : ''} · code ends {g.codeHint}
                    {g.lastError && <div className="muted">Last error: {g.lastError} ({g.attempts} tries)</div>}
                    {g.status === 'failed' && <Button size="small" variant="secondary" loading={retry.isPending} onClick={() => retry.mutate(g.id)}>Try sending again</Button>}
                  </li>
                ))}
              </ul>
              <ActionError error={retry.error} />
            </section>
          )}

          <h2>History</h2>
          <ol className="timeline">
            {stages.map((e, i) => (
              <li key={i}>
                <strong>{e.type === 'note' ? 'Note' : e.to ? STATUS_LABEL[e.to] : e.type}</strong> <span className="muted">{dateTime(e.at)}{actor(e.by) ? ` · ${actor(e.by)}` : ''}</span>
                {e.note && <div>{e.note}</div>}
              </li>
            ))}
          </ol>
        </div>

        <aside aria-label="Order summary">
          <h2>Customer</h2>
          <p>{o.contactName ?? '—'}<br /><a href={`mailto:${o.contactEmail}`}>{o.contactEmail}</a>{o.contactPhone && <><br /><a href={`tel:${o.contactPhone}`}>{o.contactPhone}</a></>}</p>

          <h2>Delivery</h2>
          {o.delivery ? (
            <p>
              {o.delivery.address ?? (o.delivery.method === 'gift_link' ? 'Waiting for the recipient to add an address' : '—')}<br />
              {o.delivery.city}{o.delivery.phone ? ` · ${o.delivery.phone}` : ''}<br />
              {o.deliveryDate ? <>On {shortDate(o.deliveryDate)}{o.sameDay ? ' (same day)' : ''}</> : null}
              {o.delivery.courier && <><br />{o.delivery.courier} {o.delivery.trackingRef}</>}
              {o.delivery.attempts > 0 && <><br /><strong>{o.delivery.attempts} failed attempt{o.delivery.attempts === 1 ? '' : 's'}</strong></>}
              {!!o.redeliveryFeeDue && <><br />Re-delivery fee to collect: {rupees(o.redeliveryFeeDue)}</>}
            </p>
          ) : <p>Digital only.</p>}
          {d.giftLink && <p className="muted">Gift link {d.giftLink.isClaimed ? 'claimed' : `not claimed yet, expires ${shortDate(d.giftLink.expiresAt)}`}.</p>}

          <h2>Payment</h2>
          <p>{PAYMENT_LABEL[o.paymentMethod]}</p>
          {d.payments.map((p) => (
            <p key={p.id} className="muted">{p.status} · {rupees(p.amount)}{p.gatewayRef ? ` · ${p.gatewayRef}` : ''}</p>
          ))}
          {o.paymentMethod === 'cod' && <Alert tone="info">Collect {rupees(o.total)} in cash.</Alert>}
          <dl className="totals">
            <div><dt>Gifts</dt><dd>{rupees(o.itemsTotal)}</dd></div>
            {o.extrasTotal > 0 && <div><dt>Extras</dt><dd>{rupees(o.extrasTotal)}</dd></div>}
            <div><dt>Delivery</dt><dd>{rupees(o.deliveryFee)}</dd></div>
            {o.discount > 0 && <div><dt>Discount{o.promoCode ? ` (${o.promoCode})` : ''}</dt><dd>-{rupees(o.discount)}</dd></div>}
            <div className="totals__total"><dt>Total</dt><dd>{rupees(o.total)}</dd></div>
          </dl>
        </aside>
      </div>
      {isAdmin && (o.status === 'cancelled' ? <DeleteOrder o={o} /> : <p className="muted">Only cancelled orders can be deleted. To remove this order, cancel it first.</p>)}
    </>
  );
}

export function OrderDetail() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['order', id], queryFn: ({ signal }) => adminApi.order(id, { signal }) });
  if (q.error) {
    if (q.error instanceof ApiError && q.error.isNotFound) return <Container><ErrorState title="Order not found" message="There is no order with that id." temporary={false} /><p><Link to="/">All orders</Link></p></Container>;
    return <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="this order" />;
  }
  if (!q.data) return <p aria-busy="true">Loading the order…</p>;
  return <Detail d={q.data} />;
}
