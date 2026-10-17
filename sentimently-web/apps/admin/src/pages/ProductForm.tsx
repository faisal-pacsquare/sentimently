import { ApiError } from '@sentimently/api';
import { Alert, Button, Container, ErrorState, ProblemList, SelectField, TextArea, TextField } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../lib/admin-api';
import type { AdminProduct, ProductInput } from '../lib/admin-api';
import { useAuth } from '../lib/auth';
import { PhotoManager } from '../components/PhotoManager';
import { QueryError } from '../lib/present';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
const whole = (s: string) => /^\d+$/.test(s.trim());

interface Group { slug: string; name: string }

/** A set of tick boxes for choosing which feelings, occasions, recipients or extras a gift belongs to. */
function Picker({ legend, items, value, onChange }: { legend: string; items: Group[]; value: string[]; onChange(v: string[]): void }) {
  if (!items.length) return <p className="muted">{legend}: none created yet.</p>;
  return (
    <fieldset className="picker">
      <legend>{legend}</legend>
      {items.map((g) => (
        <label key={g.slug} className="studio__design">
          <input type="checkbox" checked={value.includes(g.slug)} onChange={() => onChange(value.includes(g.slug) ? value.filter((x) => x !== g.slug) : [...value, g.slug])} />
          <span>{g.name}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Form({ product }: { product?: AdminProduct }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const sentiments = useQuery({ queryKey: ['groups', 'sentiments'], queryFn: ({ signal }) => adminApi.groups('sentiments', { signal }) });
  const occasions = useQuery({ queryKey: ['groups', 'occasions'], queryFn: ({ signal }) => adminApi.groups('occasions', { signal }) });
  const recipients = useQuery({ queryKey: ['groups', 'recipients'], queryFn: ({ signal }) => adminApi.groups('recipients', { signal }) });
  const categories = useQuery({ queryKey: ['groups', 'categories'], queryFn: ({ signal }) => adminApi.groups('categories', { signal }) });
  const options = useQuery({ queryKey: ['options'], queryFn: ({ signal }) => adminApi.options({ signal }) });
  const lists = [sentiments, occasions, recipients, categories, options];
  const failed = lists.find((l) => l.error);

  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [type, setType] = useState<'physical' | 'digital'>(product?.type ?? 'physical');
  const [digitalKind, setDigitalKind] = useState<'egift' | 'greeting'>(product?.digitalKind ?? 'egift');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [offer, setOffer] = useState(product?.offerPrice != null ? String(product.offerPrice) : '');
  const [stock, setStock] = useState(product ? String(product.stock) : '0');
  const [madeToOrder, setMadeToOrder] = useState(!!product?.isMadeToOrder);
  const [leadMin, setLeadMin] = useState(product?.leadTimeMinDays != null ? String(product.leadTimeMinDays) : '');
  const [leadMax, setLeadMax] = useState(product?.leadTimeMaxDays != null ? String(product.leadTimeMaxDays) : '');
  const [perishable, setPerishable] = useState(!!product?.isPerishable);
  const [active, setActive] = useState(product?.isActive !== false);
  const [category, setCategory] = useState(product?.category ?? '');
  const [sent, setSent] = useState(product?.sentiments ?? []);
  const [occ, setOcc] = useState(product?.occasions ?? []);
  const [rec, setRec] = useState(product?.recipients ?? []);
  const [extras, setExtras] = useState(product?.allowedExtras ?? []);
  const savedPhotos = product?.imageUrls ?? [];
  const [images, setImages] = useState<string[]>(savedPhotos);
  const freshPhotos = useRef(new Set<string>()); // uploaded in this visit
  const [submitted, setSubmitted] = useState(false);

  const imagesChanged = images.join('\n') !== savedPhotos.join('\n');
  const physical = type === 'physical';

  const errors = {
    name: name.trim() ? '' : 'Give the gift a name.',
    slug: SLUG.test(slug) ? '' : 'Use lower-case words joined by hyphens, like photo-mug.',
    description: description.trim() ? '' : 'Describe the gift.',
    price: whole(price) && Number(price) > 0 ? '' : 'Enter the price in whole rupees.',
    offer: !offer.trim() ? '' : !whole(offer) ? 'Enter the offer price in whole rupees, or leave it empty.' : Number(offer) >= Number(price) ? 'The offer price must be lower than the price.' : '',
    stock: whole(stock) ? '' : 'Enter how many are in stock (0 if none).',
    lead: madeToOrder && ((leadMin && !whole(leadMin)) || (leadMax && !whole(leadMax)) || (leadMin && leadMax && Number(leadMin) > Number(leadMax))) ? 'Check the lead times: whole days, with the shortest not longer than the longest.' : '',
    category: category ? '' : 'Choose a category.',
    images: images.length > 10 ? 'At most 10 photos.' : '',
  };
  const valid = Object.values(errors).every((e) => !e);

  const body = (): ProductInput => ({
    slug, name: name.trim(), description: description.trim(), price: Number(price), type, stock: Number(stock), category,
    offerPrice: offer.trim() ? Number(offer) : null,
    isMadeToOrder: physical && madeToOrder,
    isPerishable: physical && perishable,
    isActive: active,
    sentiments: sent, occasions: occ, recipients: rec,
    allowedExtras: physical ? extras : [],
    ...(!physical ? { digitalKind } : {}),
    ...(physical && madeToOrder && leadMin ? { leadTimeMinDays: Number(leadMin) } : {}),
    ...(physical && madeToOrder && leadMax ? { leadTimeMaxDays: Number(leadMax) } : {}),
    // Photos already stored are left as they are unless they were edited, so an old relative path is never re-validated.
    ...(imagesChanged || !product ? { imageUrls: images } : {}),
  });

  const save = useMutation({
    mutationFn: () => (product ? adminApi.updateProduct(product.id, body()) : adminApi.createProduct(body())),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/catalogue');
    },
  });
  const toggle = useMutation({
    mutationFn: async () => {
      if (active) await adminApi.hideProduct(product!.id);
      else await adminApi.updateProduct(product!.id, { isActive: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/catalogue');
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const erase = useMutation({
    mutationFn: () => adminApi.deleteProduct(product!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      navigate('/catalogue');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (valid && !save.isPending) save.mutate();
  };
  const show = (m: string) => (submitted ? m : '');
  const refused = save.error instanceof ApiError && save.error.status >= 400 && save.error.status < 500 ? save.error : null;
  const problems = refused ? (refused.details.length ? refused.details : [refused.message]) : [];

  if (failed) return <QueryError error={failed.error} onRetry={() => lists.forEach((l) => l.error && l.refetch())} what="the groups and extras" />;
  if (lists.some((l) => !l.data)) return <p aria-busy="true">Loading…</p>;

  return (
    <>
      <title>{`${product ? product.name : 'New gift'} | Bloomora studio`}</title>
      <p><Link to="/catalogue">All gifts</Link></p>
      <h1>{product ? product.name : 'New gift'}</h1>
      <form className="auth-form product-form" onSubmit={submit} noValidate>
        <TextField label="Name" value={name} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} error={show(errors.name)} />
        <TextField label="Web address name (slug)" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} hint={product ? 'Changing this changes the gift\'s web address; old links will stop working.' : 'Filled in from the name. Used in the web address.'} error={show(errors.slug)} />

        <fieldset className="picker">
          <legend>Kind of gift</legend>
          <label className="studio__design"><input type="radio" name="type" checked={physical} onChange={() => setType('physical')} /> <span>Physical (delivered)</span></label>
          <label className="studio__design"><input type="radio" name="type" checked={!physical} onChange={() => setType('digital')} /> <span>Digital (sent by email)</span></label>
        </fieldset>
        {!physical && (
          <SelectField label="Digital kind" value={digitalKind} onChange={(e) => setDigitalKind(e.target.value as 'egift' | 'greeting')}>
            <option value="egift">E-gift card (code valid 12 months)</option>
            <option value="greeting">Greeting card (no expiry)</option>
          </SelectField>
        )}

        <TextArea label="Description" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} error={show(errors.description)} />

        <div className="fieldrow">
          <TextField label="Price (Rs)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} error={show(errors.price)} />
          <TextField label="Offer price (Rs, optional)" inputMode="numeric" value={offer} onChange={(e) => setOffer(e.target.value)} hint="Leave empty for no offer." error={show(errors.offer)} />
          <TextField label="In stock" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} hint={physical ? undefined : 'Digital gifts are not limited: keep a large number such as 9999.'} error={show(errors.stock)} />
        </div>

        {physical && (
          <fieldset className="picker">
            <legend>Making and delivery</legend>
            <label className="studio__design"><input type="checkbox" checked={madeToOrder} onChange={(e) => setMadeToOrder(e.target.checked)} /> <span>Made to order (can be ordered with no stock)</span></label>
            {madeToOrder && (
              <div className="fieldrow">
                <TextField label="Shortest time (days)" inputMode="numeric" value={leadMin} onChange={(e) => setLeadMin(e.target.value)} />
                <TextField label="Longest time (days)" inputMode="numeric" value={leadMax} onChange={(e) => setLeadMax(e.target.value)} />
              </div>
            )}
            {submitted && errors.lead && <p role="alert" className="sy-field__error">{errors.lead}</p>}
            <label className="studio__design"><input type="checkbox" checked={perishable} onChange={(e) => setPerishable(e.target.checked)} /> <span>Fresh gift (flowers, chocolate: can be scheduled up to 3 days ahead)</span></label>
          </fieldset>
        )}

        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} error={show(errors.category)}>
          <option value="">Choose a category</option>
          {categories.data!.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </SelectField>
        <Picker legend="Feelings" items={sentiments.data!} value={sent} onChange={setSent} />
        <Picker legend="Occasions" items={occasions.data!} value={occ} onChange={setOcc} />
        <Picker legend="Who it is for" items={recipients.data!} value={rec} onChange={setRec} />
        {physical && <Picker legend="Extras that can be added" items={options.data!.extras.map((x) => ({ slug: x.code, name: `${x.name} (Rs ${x.price})` }))} value={extras} onChange={setExtras} />}

        <PhotoManager value={images} onChange={setImages} saved={savedPhotos} fresh={freshPhotos} name={name} />
        {submitted && errors.images && <p role="alert" className="sy-field__error">{errors.images}</p>}

        <label className="studio__design"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> <span>Show this gift on the shop</span></label>

        <ProblemList problems={problems} />
        {save.error && !refused && <Alert tone="error">That did not go through (the server could not be reached). Nothing was saved; please try again.</Alert>}
        <div className="actions">
          <Button type="submit" loading={save.isPending}>{product ? 'Save changes' : 'Add gift'}</Button>
          <Button as={Link} to="/catalogue" variant="ghost">Cancel</Button>
          {product && <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate()}>{active ? 'Hide from the shop' : 'Show on the shop'}</Button>}
        </div>
        {toggle.error && <Alert tone="error">That did not go through. Please try again.</Alert>}
      </form>
      {product && isAdmin && (
        <section aria-labelledby="danger" className="danger-zone">
          <h2 id="danger">Delete this gift</h2>
          <p className="muted">Hiding keeps the gift and its photos so you can show it again later. Deleting removes it for good, together with its photos, reviews and wishlist entries. Past orders keep their own record of it. This cannot be undone.</p>
          {!confirmDelete && <Button variant="secondary" onClick={() => setConfirmDelete(true)}>Delete this gift…</Button>}
          {confirmDelete && (
            <Alert tone="error">
              <p><strong>Delete “{product.name}” for good?</strong></p>
              <div className="actions">
                <Button loading={erase.isPending} onClick={() => erase.mutate()}>Yes, delete it</Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
              </div>
            </Alert>
          )}
          {erase.error && <Alert tone="error">That did not go through. Nothing was deleted; please try again.</Alert>}
        </section>
      )}
    </>
  );
}

export function ProductForm() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['products'], queryFn: ({ signal }) => adminApi.products({ signal }), enabled: !!id });
  if (!id) return <Form />;
  if (q.error) return <QueryError error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} what="this gift" />;
  if (!q.data) return <p aria-busy="true">Loading…</p>;
  const product = q.data.find((p) => p.id === id);
  if (!product) return <Container><ErrorState title="Gift not found" message="There is no gift with that id." temporary={false} /><p><Link to="/catalogue">All gifts</Link></p></Container>;
  return <Form key={product.id + product.updatedAt} product={product} />;
}
