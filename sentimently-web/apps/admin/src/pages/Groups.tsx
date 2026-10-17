import { ApiError } from '@sentimently/api';
import type { TaxonomyItem } from '@sentimently/api';
import { Alert, Button, Chip, EmptyState, SelectField, TextArea, TextField } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import type { AdminProduct, GroupKind } from '../lib/admin-api';
import { useAuth } from '../lib/auth';
import { QueryError } from '../lib/present';

const KINDS = [
  ['sentiments', 'sentiment', 'Feelings'],
  ['occasions', 'occasion', 'Occasions'],
  ['recipients', 'recipient', 'Who it is for'],
  ['categories', 'category', 'Categories'],
] as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);

function reason(e: unknown) {
  if (e instanceof ApiError && !e.isTemporary) return e.details[0] ?? e.message;
  return 'That did not go through (the server could not be reached). Nothing was saved; please try again.';
}

function Edit({ item, onDone }: { item: TaxonomyItem; onDone(): void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(item.name);
  const [blurb, setBlurb] = useState(item.blurb ?? '');
  const [image, setImage] = useState(item.image ?? '');
  const [order, setOrder] = useState(String(item.sortOrder ?? 0));
  const bad = !name.trim() || !/^\d+$/.test(order) || (image.trim() !== '' && !/^https?:\/\/\S+$/i.test(image.trim()));
  const save = useMutation({
    mutationFn: () => adminApi.updateGroup(item.id, { name: name.trim(), blurb: blurb.trim() || undefined, image: image.trim() || undefined, sortOrder: Number(order) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); onDone(); },
  });
  return (
    <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (!bad) save.mutate(); }}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!name.trim() ? 'Enter a name.' : ''} />
      <TextArea label="Short description (shown on its page)" rows={2} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
      <TextField label="Image link (optional)" value={image} onChange={(e) => setImage(e.target.value)} hint="A full link starting with https://." error={image.trim() && !/^https?:\/\/\S+$/i.test(image.trim()) ? 'Use a full link starting with https://.' : ''} />
      <TextField label="Order on the shop (0 first)" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} error={!/^\d+$/.test(order) ? 'Enter a whole number.' : ''} />
      {save.error && <Alert tone="error">{reason(save.error)}</Alert>}
      <div className="actions">
        <Button type="submit" size="small" loading={save.isPending}>Save</Button>
        <Button variant="ghost" size="small" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

/** The gifts using a group, hidden ones included (the public counts leave hidden gifts out). */
function usage(gifts: AdminProduct[], kind: GroupKind, slug: string) {
  const mine = gifts.filter((p) =>
    kind === 'category' ? p.category === slug : (kind === 'sentiment' ? p.sentiments : kind === 'occasion' ? p.occasions : p.recipients)?.includes(slug),
  );
  return { total: mine.length, hidden: mine.filter((p) => p.isActive === false).length };
}

function Remove({ item, gifts, categories, onDone }: { item: TaxonomyItem; gifts: AdminProduct[]; categories: TaxonomyItem[]; onDone(): void }) {
  const qc = useQueryClient();
  const n = usage(gifts, item.kind, item.slug).total;
  const others = categories.filter((c) => c.id !== item.id);
  const needsMove = item.kind === 'category' && n > 0;
  const [moveTo, setMoveTo] = useState('');
  const erase = useMutation({
    mutationFn: () => adminApi.deleteGroup(item.id, needsMove ? moveTo : undefined),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); qc.invalidateQueries({ queryKey: ['products'] }); onDone(); },
  });
  const noun = n === 1 ? 'gift' : 'gifts';
  return (
    <Alert tone="error">
      <p><strong>Delete “{item.name}”?</strong> This cannot be undone.</p>
      {needsMove ? (
        <>
          <p>{n} {noun} {n === 1 ? 'is' : 'are'} in this category (hidden ones too). They are not deleted: choose where they go.</p>
          <SelectField label={`Move the ${n} ${noun} to`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">Choose a category</option>
            {others.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </SelectField>
        </>
      ) : n > 0 ? (
        <p>It will be taken off {n} {noun}. The {noun} stay in the shop.</p>
      ) : (
        <p>No gifts use it.</p>
      )}
      {erase.error && <Alert tone="error">{reason(erase.error)}</Alert>}
      <div className="actions">
        <Button size="small" loading={erase.isPending} disabled={needsMove && !moveTo} onClick={() => erase.mutate()}>{needsMove ? 'Move the gifts and delete' : 'Yes, delete it'}</Button>
        <Button size="small" variant="ghost" onClick={onDone}>Keep it</Button>
      </div>
    </Alert>
  );
}

function Add({ kind, onDone }: { kind: GroupKind; onDone(): void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const create = useMutation({
    mutationFn: () => adminApi.createGroup({ kind, slug, name: name.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setName(''); setSlug(''); setTouched(false); setSubmitted(false); onDone(); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (name.trim() && SLUG.test(slug)) create.mutate();
  };
  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <h3>Add one</h3>
      <TextField label="Name" value={name} onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} error={submitted && !name.trim() ? 'Enter a name.' : ''} />
      <TextField label="Web address name (slug)" value={slug} onChange={(e) => { setSlug(e.target.value); setTouched(true); }} hint="Cannot be changed later." error={submitted && !SLUG.test(slug) ? 'Use lower-case words joined by hyphens.' : ''} />
      {create.error && <Alert tone="error">{reason(create.error)}</Alert>}
      <Button type="submit" loading={create.isPending}>Add</Button>
    </form>
  );
}

export function Groups() {
  const [active, setActive] = useState<(typeof KINDS)[number]>(KINDS[0]);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const { isAdmin } = useAuth();
  const gifts = useQuery({ queryKey: ['products'], queryFn: ({ signal }) => adminApi.products({ signal }) });
  const categories = useQuery({ queryKey: ['groups', 'categories'], queryFn: ({ signal }) => adminApi.groups('categories', { signal }) });
  const q = useQuery({ queryKey: ['groups', active[0]], queryFn: ({ signal }) => adminApi.groups(active[0], { signal }) });

  return (
    <>
      <title>Groups | Bloomora studio</title>
      <p><Link to="/catalogue">All gifts</Link></p>
      <h1>Feelings, occasions and categories</h1>
      <p className="muted">These are how shoppers browse. A gift can belong to several feelings, occasions and recipients, and to one category.</p>
      <div className="presets" role="group" aria-label="Kind">
        {KINDS.map((k) => <Chip key={k[0]} pressed={active[0] === k[0]} onClick={() => { setActive(k); setEditing(null); setRemoving(null); }}>{k[2]}</Chip>)}
      </div>
      {q.error ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="the list" />
      ) : !q.data ? (
        <p aria-busy="true">Loading…</p>
      ) : (
        <div className="cols">
          <section aria-labelledby="gl">
            <h2 id="gl">{active[2]} ({q.data.length})</h2>
            {!q.data.length ? <EmptyState title="None yet" message="Add the first one." /> : (
              <ul className="lines">
                {[...q.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)).map((g) => (
                  <li key={g.id}>
                    {editing === g.id ? <Edit item={g} onDone={() => setEditing(null)} /> : (
                      <>
                        {(() => {
                          const u = gifts.data ? usage(gifts.data, g.kind, g.slug) : null;
                          return (
                            <>
                              <strong>{g.name}</strong> <span className="muted">{g.slug} · {u ? `${u.total} gift${u.total === 1 ? '' : 's'}${u.hidden ? ` (${u.hidden} hidden)` : ''}` : `${g.productCount ?? 0} gift${g.productCount === 1 ? '' : 's'}`}</span>
                            </>
                          );
                        })()}
                        {g.blurb && <div className="muted">{g.blurb}</div>}
                        {removing === g.id ? (
                          <Remove item={g} gifts={gifts.data ?? []} categories={categories.data ?? []} onDone={() => setRemoving(null)} />
                        ) : (
                          <div className="actions">
                            <Button as={Link} to={`/catalogue?${g.kind}=${encodeURIComponent(g.slug)}`} variant="ghost" size="small" aria-label={`View the gifts in ${g.name}`}>View gifts</Button>
                            <Button as={Link} to={`/catalogue/new?${g.kind}=${encodeURIComponent(g.slug)}`} variant="ghost" size="small" aria-label={`Add a gift to ${g.name}`}>Add a gift</Button>
                            <Button variant="ghost" size="small" onClick={() => setEditing(g.id)} aria-label={`Edit ${g.name}`}>Edit</Button>
                            {isAdmin && <Button variant="ghost" size="small" disabled={!gifts.data || !categories.data} onClick={() => setRemoving(g.id)} aria-label={`Delete ${g.name}`}>Delete</Button>}
                          </div>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Add kind={active[1]} onDone={() => setEditing(null)} />
        </div>
      )}
    </>
  );
}
