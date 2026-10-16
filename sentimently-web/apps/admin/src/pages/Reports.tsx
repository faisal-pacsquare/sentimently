import { rupees, todayInPakistan } from '@sentimently/api';
import { TextField } from '@sentimently/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../lib/admin-api';
import { PAYMENT_LABEL, QueryError, STATUS_LABEL } from '../lib/present';

const daysAgo = (n: number) => {
  const d = new Date(`${todayInPakistan()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stat card"><span className="muted">{label}</span><strong>{value}</strong>{note && <span className="muted">{note}</span>}</div>;
}

export function Reports() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(todayInPakistan());
  const q = useQuery({ queryKey: ['summary', from, to], queryFn: ({ signal }) => adminApi.summary({ from: from || undefined, to: to || undefined }, { signal }) });
  const s = q.data;
  return (
    <>
      <title>Reports | Sentimently studio</title>
      <h1>Reports</h1>
      <div className="toolbar">
        <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {q.error ? <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the report" /> : !s ? <p aria-busy="true">Loading…</p> : (
        <div aria-busy={q.isFetching}>
          <ul className="cards">
            <li><Stat label="Sales" value={rupees(s.sales.revenue)} note={`${s.sales.orders} orders`} /></li>
            <li><Stat label="Average order" value={rupees(s.sales.averageOrderValue)} note={`${s.sales.itemsSold} items sold`} /></li>
            <li><Stat label="Delivered on time" value={s.delivery.onTimePercent === null ? '—' : `${s.delivery.onTimePercent}%`} note={`${s.delivery.delivered} delivered${s.delivery.averageDaysToDeliver !== null ? `, ${s.delivery.averageDaysToDeliver} days on average` : ''}`} /></li>
            <li><Stat label="Failed delivery attempts" value={String(s.delivery.ordersWithFailedAttempts)} note="orders affected" /></li>
            <li><Stat label="Refunds to send" value={rupees(s.refunds.pending.amount)} note={`${s.refunds.pending.count} waiting`} /></li>
            <li><Stat label="Refunds sent" value={rupees(s.refunds.processed.amount)} note={`${s.refunds.processed.count} refunds`} /></li>
          </ul>

          <div className="cols">
            <section aria-labelledby="tp">
              <h2 id="tp">Top gifts</h2>
              {!s.topProducts.length ? <p>No sales in this period.</p> : (
                <table className="table"><caption className="sy-sr-only">Top gifts by sales</caption>
                  <thead><tr><th scope="col">Gift</th><th scope="col" className="num">Sold</th><th scope="col" className="num">Sales</th></tr></thead>
                  <tbody>{s.topProducts.map((p) => <tr key={p.productId}><th scope="row">{p.name}</th><td className="num">{p.quantity}</td><td className="num">{rupees(p.revenue)}</td></tr>)}</tbody>
                </table>
              )}
            </section>
            <section aria-labelledby="bs">
              <h2 id="bs">Orders by status</h2>
              <table className="table"><caption className="sy-sr-only">Orders by status</caption>
                <tbody>{Object.entries(s.byStatus).map(([k, n]) => <tr key={k}><th scope="row">{STATUS_LABEL[k as keyof typeof STATUS_LABEL] ?? k}</th><td className="num">{n}</td></tr>)}</tbody>
              </table>
            </section>
          </div>

          <div className="cols">
            <section aria-labelledby="bc">
              <h2 id="bc">By city</h2>
              <table className="table"><caption className="sy-sr-only">Sales by city</caption>
                <thead><tr><th scope="col">City</th><th scope="col" className="num">Orders</th><th scope="col" className="num">Sales</th></tr></thead>
                <tbody>{Object.entries(s.byCity).sort(([, a], [, b]) => b.revenue - a.revenue).map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className="num">{v.orders}</td><td className="num">{rupees(v.revenue)}</td></tr>)}</tbody>
              </table>
            </section>
            <section aria-labelledby="bp">
              <h2 id="bp">By payment and promo</h2>
              <table className="table"><caption className="sy-sr-only">Sales by payment method</caption>
                <tbody>{Object.entries(s.byPaymentMethod).map(([k, v]) => <tr key={k}><th scope="row">{PAYMENT_LABEL[k as keyof typeof PAYMENT_LABEL] ?? k}</th><td className="num">{v.orders}</td><td className="num">{rupees(v.revenue)}</td></tr>)}</tbody>
              </table>
              {Object.entries(s.promoUse).map(([k, v]) => <p key={k} className="muted">{k}: {v.orders} orders, {rupees(v.discountTotal)} given</p>)}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
