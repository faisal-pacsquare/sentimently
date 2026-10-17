import { rupees } from '@sentimently/api';
import { Alert, Badge, Button, Chip, EmptyState, SafeImage, TextField } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import { useAuth } from '../lib/auth';
import type { AdminProduct } from '../lib/admin-api';
import { photoSrc } from '../lib/photos';
import { ActionError, QueryError } from '../lib/present';

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
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const needle = search.trim().toLowerCase();
  const rows = (q.data ?? [])
    .filter((p) => filter === 'all' || (filter === 'active' && p.isActive !== false) || (filter === 'hidden' && p.isActive === false) || (filter === 'low' && p.type === 'physical' && !p.isMadeToOrder && p.isActive !== false && p.stock <= LOW))
    .filter((p) => !needle || `${p.name} ${p.slug}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Only gifts that are on screen count, so a filter can never hide a gift that is about to be deleted.
  const chosen = rows.filter((p) => picked.has(p.id));
  const allShown = rows.length > 0 && chosen.length === rows.length;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = () => { qc.invalidateQueries({ queryKey: ['products'] }); setPicked(new Set()); setConfirmDelete(false); };
  const visibility = useMutation({ mutationFn: (visible: boolean) => adminApi.setVisibility(chosen.map((p) => p.id), visible), onSuccess: done });
  const erase = useMutation({ mutationFn: () => adminApi.deleteProducts(chosen.map((p) => p.id)), onSuccess: done });
  const reset = () => { setConfirmDelete(false); visibility.reset(); erase.reset(); };

  return (
    <>
      <title>Catalogue | Bloomora studio</title>
      <h1>Catalogue</h1>
      <div className="actions">
        <Button as={Link} to="/catalogue/new">New gift</Button>
        <Button as={Link} to="/catalogue/groups" variant="secondary">Feelings, occasions and categories</Button>
        <Button as={Link} to="/catalogue/import" variant="secondary">Add from a spreadsheet</Button>
      </div>
      <div className="presets" role="group" aria-label="Show">
        {FILTERS.map(([k, label]) => <Chip key={k} pressed={filter === k} onClick={() => setFilter(k)}>{label}</Chip>)}
      </div>
      <div className="toolbar"><TextField label="Search gifts" value={search} onChange={(e) => setSearch(e.target.value)} /></div>

      {chosen.length > 0 && (
        <div className="bulk" role="region" aria-label="Selected gifts">
          <strong>{chosen.length} selected</strong>
          <Button size="small" variant="secondary" loading={visibility.isPending && visibility.variables === false} onClick={() => visibility.mutate(false)}>Hide from the shop</Button>
          <Button size="small" variant="secondary" loading={visibility.isPending && visibility.variables === true} onClick={() => visibility.mutate(true)}>Show on the shop</Button>
          {isAdmin && !confirmDelete && <Button size="small" variant="secondary" onClick={() => setConfirmDelete(true)}>Delete…</Button>}
          <Button size="small" variant="ghost" onClick={() => { setPicked(new Set()); reset(); }}>Clear</Button>
          {confirmDelete && (
            <Alert tone="error">
              <p><strong>Delete {chosen.length} {chosen.length === 1 ? 'gift' : 'gifts'} for good?</strong> Their photos, reviews and wishlist entries go too. Past orders keep their own record. This cannot be undone. To keep them for later, use Hide instead.</p>
              <div className="actions">
                <Button loading={erase.isPending} onClick={() => erase.mutate()}>Yes, delete {chosen.length}</Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep them</Button>
              </div>
            </Alert>
          )}
          <ActionError error={visibility.error ?? erase.error} />
        </div>
      )}

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
            <thead><tr><th scope="col" className="pick"><input type="checkbox" aria-label="Select all gifts shown" checked={allShown} onChange={() => setPicked(allShown ? new Set() : new Set(rows.map((p) => p.id)))} /></th><th scope="col">Gift</th><th scope="col">Category</th><th scope="col" className="num">Price</th><th scope="col">Stock</th><th scope="col">Shop</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="pick"><input type="checkbox" aria-label={`Select ${p.name}`} checked={picked.has(p.id)} onChange={() => { toggle(p.id); reset(); }} /></td>
                  <th scope="row"><span className="thumb-cell"><span className="thumb"><SafeImage src={p.imageUrls?.[0] ? photoSrc(p.imageUrls[0]) : undefined} name={p.name} /></span><span><Link to={`/catalogue/${p.id}`}>{p.name}</Link><br /><span className="muted">{p.slug}{(p.imageUrls?.length ?? 0) > 1 ? ` · ${p.imageUrls!.length} photos` : ''}</span></span></span></th>
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
