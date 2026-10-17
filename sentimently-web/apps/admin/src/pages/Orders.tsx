import { rupees, shortDate } from '@sentimently/api';
import { Button, Chip, EmptyState, TextField } from '@sentimently/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import { PAYMENT_LABEL, QueryError, StatusBadge } from '../lib/present';

export const PRESETS = {
  needs: { label: 'Needs action', status: 'awaiting_payment,placed,paid' },
  active: { label: 'In progress', status: 'preparing,in_production,dispatched,failed_delivery' },
  finished: { label: 'Finished', status: 'delivered,returned,refunded,cancelled' },
  all: { label: 'All', status: '' },
} as const;
type Preset = keyof typeof PRESETS;
const PAGE_SIZE = 25;

export function Orders() {
  const [params, setParams] = useSearchParams();
  const preset = (params.get('show') as Preset) in PRESETS ? (params.get('show') as Preset) : 'needs';
  const q = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(q);

  const set = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(change)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in change)) next.delete('page');
    setParams(next, { replace: true });
  };

  const orders = useQuery({
    queryKey: ['orders', preset, q, city, page],
    queryFn: ({ signal }) => adminApi.orders({ status: PRESETS[preset].status || undefined, q: q || undefined, city: city || undefined, page, pageSize: PAGE_SIZE }, { signal }),
    placeholderData: keepPreviousData,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    set({ q: search.trim() || null });
  };
  const pages = orders.data ? Math.max(1, Math.ceil(orders.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <title>Orders | Bloomora studio</title>
      <h1>Orders</h1>
      <div className="presets" role="group" aria-label="Show">
        {(Object.keys(PRESETS) as Preset[]).map((k) => (
          <Chip key={k} pressed={preset === k} onClick={() => set({ show: k === 'needs' ? null : k })}>{PRESETS[k].label}</Chip>
        ))}
      </div>
      <form className="toolbar" onSubmit={submit} role="search" aria-label="Search orders">
        <TextField label="Search by order number, name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <TextField label="City" value={city} onChange={(e) => set({ city: e.target.value || null })} />
        <Button type="submit" variant="secondary">Search</Button>
        {(q || city) && <Button variant="ghost" onClick={() => { setSearch(''); set({ q: null, city: null }); }}>Clear</Button>}
      </form>

      {orders.error ? (
        <QueryError error={orders.error} onRetry={() => orders.refetch()} retrying={orders.isFetching} what="the orders" />
      ) : !orders.data ? (
        <p aria-busy="true">Loading orders…</p>
      ) : !orders.data.data.length ? (
        <EmptyState title="No orders here" message={q || city ? 'Nothing matches that search.' : 'Nothing in this list right now.'} />
      ) : (
        <>
          <p className="muted" aria-live="polite">{orders.data.total} order{orders.data.total === 1 ? '' : 's'}</p>
          <div className="table-wrap" aria-busy={orders.isFetching}>
            <table className="table">
              <caption className="sy-sr-only">Orders</caption>
              <thead>
                <tr><th scope="col">Order</th><th scope="col">Status</th><th scope="col">Customer</th><th scope="col">City</th><th scope="col">Deliver on</th><th scope="col">Payment</th><th scope="col" className="num">Total</th></tr>
              </thead>
              <tbody>
                {orders.data.data.map((o) => (
                  <tr key={o.id}>
                    <th scope="row">
                      <Link to={`/orders/${o.id}`}>{o.number}</Link><br />
                      <span className="muted">{shortDate(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}{o.personalised ? ' · personalised' : ''}</span>
                    </th>
                    <td><StatusBadge status={o.status} /></td>
                    <td>{o.contactName ?? '—'}<br /><span className="muted">{o.contactEmail}</span></td>
                    <td>{o.city ?? 'Digital'}</td>
                    <td>{o.deliveryDate ? shortDate(o.deliveryDate) : '—'}</td>
                    <td>{PAYMENT_LABEL[o.paymentMethod]}</td>
                    <td className="num">{rupees(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pager" aria-label="Pages">
            <Button variant="secondary" size="small" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</Button>
            <span>Page {page} of {pages}</span>
            <Button variant="secondary" size="small" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next</Button>
          </nav>
        </>
      )}
    </>
  );
}
