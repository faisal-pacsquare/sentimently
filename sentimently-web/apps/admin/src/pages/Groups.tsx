import { ApiError } from '@sentimently/api';
import type { TaxonomyItem } from '@sentimently/api';
import { Alert, Button, Chip, EmptyState, TextArea, TextField } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import type { GroupKind } from '../lib/admin-api';
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
  const q = useQuery({ queryKey: ['groups', active[0]], queryFn: ({ signal }) => adminApi.groups(active[0], { signal }) });

  return (
    <>
      <title>Groups | Bloomora studio</title>
      <p><Link to="/catalogue">All gifts</Link></p>
      <h1>Feelings, occasions and categories</h1>
      <p className="muted">These are how shoppers browse. A gift can belong to several feelings, occasions and recipients, and to one category.</p>
      <div className="presets" role="group" aria-label="Kind">
        {KINDS.map((k) => <Chip key={k[0]} pressed={active[0] === k[0]} onClick={() => { setActive(k); setEditing(null); }}>{k[2]}</Chip>)}
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
                        <strong>{g.name}</strong> <span className="muted">{g.slug} · {g.productCount ?? 0} gift{g.productCount === 1 ? '' : 's'}</span>
                        {g.blurb && <div className="muted">{g.blurb}</div>}
                        <div><Button variant="ghost" size="small" onClick={() => setEditing(g.id)} aria-label={`Edit ${g.name}`}>Edit</Button></div>
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
