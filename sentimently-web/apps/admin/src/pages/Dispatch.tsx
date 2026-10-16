import { rupees, todayInPakistan } from '@sentimently/api';
import { Badge, EmptyState, TextField } from '@sentimently/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import { QueryError, StatusBadge } from '../lib/present';

/** The day sheet for the riders: everything due on one date, by city, with where it goes and what cash to collect. */
export function Dispatch() {
  const [date, setDate] = useState(todayInPakistan());
  const q = useQuery({ queryKey: ['dispatch', date], queryFn: ({ signal }) => adminApi.dispatch(date, { signal }), enabled: !!date });

  return (
    <>
      <title>Dispatch | Sentimently studio</title>
      <h1>Dispatch</h1>
      <div className="toolbar">
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {q.error ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the dispatch list" />
      ) : !q.data ? (
        <p aria-busy="true">Loading…</p>
      ) : !q.data.total ? (
        <EmptyState title="Nothing to deliver on this date" message="Orders appear here once they are being prepared, made or are out for delivery." />
      ) : (
        <>
          <p className="muted" aria-live="polite">{q.data.total} deliveries</p>
          {q.data.cities.map((c) => (
            <section key={c.city} aria-labelledby={`c-${c.city}`}>
              <h2 id={`c-${c.city}`}>{c.city || 'No city'} ({c.orders.length})</h2>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sy-sr-only">Deliveries in {c.city}</caption>
                  <thead><tr><th scope="col">Order</th><th scope="col">To</th><th scope="col">Items</th><th scope="col">Courier</th><th scope="col" className="num">Collect</th></tr></thead>
                  <tbody>
                    {c.orders.map((o) => (
                      <tr key={o.id}>
                        <th scope="row">
                          <Link to={`/orders/${o.id}`}>{o.number}</Link><br />
                          <StatusBadge status={o.status} /> {o.sameDay && <Badge tone="offer">Same day</Badge>}
                        </th>
                        <td>
                          {o.recipientName ?? '—'}<br />
                          {o.waitingForRecipientAddress ? <strong>Waiting for recipient address</strong> : o.address}<br />
                          {o.phone && <a href={`tel:${o.phone}`}>{o.phone}</a>}
                        </td>
                        <td>{o.items.map((x, i) => <div key={i}>{x}</div>)}</td>
                        <td>{o.courier ?? '—'}{o.trackingRef ? <><br />{o.trackingRef}</> : null}{o.attempts > 0 && <><br /><strong>{o.attempts} failed</strong></>}</td>
                        <td className="num">{o.cashToCollect ? rupees(o.cashToCollect) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
