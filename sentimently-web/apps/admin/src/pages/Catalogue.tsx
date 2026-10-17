import { rupees } from '@sentimently/api';
import { Badge, Button, Chip, EmptyState, TextField } from '@sentimently/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import type { AdminProduct } from '../lib/admin-api';
import { QueryError } from '../lib/present';

const LOW = 5;
const FILTERS = [['all', 'All'], ['active', 'On the shop'], ['hidden', 'Hidden'], ['low', 'Low stock']] as const;
type Filter = (typeof FILTERS)[number][0];

function stockText(p: AdminProduct) {
  if (p.type === 'digital') return 'Digital';
  if (p.isMadeToOrder) return 'Made to order';
  return p.stock <= 0 ? 'Sold out' : `${p.stock} left`;
}

export function Catalogue() {
  const q = useQuery({ queryKey: ['products'], queryFn: ({ signal }) => adminApi.products({ signal }) });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const needle = search.trim().toLowerCase();
  const rows = (q.data ?? [])
    .filter((p) => filter === 'all' || (filter === 'active' && p.isActive !== false) || (filter === 'hidden' && p.isActive === false) || (filter === 'low' && p.type === 'physical' && !p.isMadeToOrder && p.isActive !== false && p.stock <= LOW))
    .filter((p) => !needle || `${p.name} ${p.slug}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <title>Catalogue | Bloomora studio</title>
      <h1>Catalogue</h1>
      <div className="actions">
        <Button as={Link} to="/catalogue/new">New gift</Button>
        <Button as={Link} to="/catalogue/groups" variant="secondary">Feelings, occasions and categories</Button>
      </div>
      <div className="presets" role="group" aria-label="Show">
        {FILTERS.map(([k, label]) => <Chip key={k} pressed={filter === k} onClick={() => setFilter(k)}>{label}</Chip>)}
      </div>
      <div className="toolbar"><TextField label="Search gifts" value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      {q.error ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the catalogue" />
      ) : !q.data ? (
        <p aria-busy="true">Loading…</p>
      ) : !q.data.length ? (
        <EmptyState title="No gifts yet" message="Add your first gift to start the shop."><Button as={Link} to="/catalogue/new">New gift</Button></EmptyState>
      ) : !rows.length ? (
        <EmptyState title="No gifts match" message="Try another filter or search." />
      ) : (
        <div className="table-wrap">
          <table className="table table--stack">
            <caption className="sy-sr-only">Gifts</caption>
            <thead><tr><th scope="col">Gift</th><th scope="col">Category</th><th scope="col" className="num">Price</th><th scope="col">Stock</th><th scope="col">Shop</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <th scope="row"><Link to={`/catalogue/${p.id}`}>{p.name}</Link><br /><span className="muted">{p.slug}</span></th>
                  <td data-label="Category">{p.category}</td>
                  <td className="num" data-label="Price">{p.offerPrice != null && p.offerPrice < p.price ? <>{rupees(p.offerPrice)} <del className="muted">{rupees(p.price)}</del></> : rupees(p.price)}</td>
                  <td data-label="Stock">{stockText(p)}{p.type === 'physical' && !p.isMadeToOrder && p.stock > 0 && p.stock <= LOW && <> <Badge tone="warn">Low</Badge></>}</td>
                  <td data-label="Shop">{p.isActive === false ? <Badge tone="offer">Hidden</Badge> : <Badge tone="digital">Live</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
