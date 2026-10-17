import { rupees, shortDate } from '@sentimently/api';
import type { Rate } from '@sentimently/api';
import { Alert, Badge, Button, Chip, TextArea, TextField } from '@sentimently/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminApi } from '../lib/admin-api';
import type { AdminStore, Extra, Promo } from '../lib/admin-api';
import { ActionError, QueryError } from '../lib/present';

const whole = (s: string) => /^\d+$/.test(s.trim());
const webLink = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function Saved({ ok }: { ok: boolean }) {
  return ok ? <Alert tone="info">Saved. It is live on the shop now.</Alert> : null;
}

// ---------------------------------------------------------------- shop details

function ShopForm({ store }: { store: AdminStore }) {
  const qc = useQueryClient();
  const [announcement, setAnnouncement] = useState(store.announcement ?? '');
  const [banner, setBanner] = useState(store.banner ?? '');
  const [threshold, setThreshold] = useState(String(store.freeDeliveryThreshold));
  const [cutoff, setCutoff] = useState(String(store.sameDayCutoffHour));
  const [phone, setPhone] = useState(store.contactPhone ?? '');
  const [email, setEmail] = useState(store.contactEmail ?? '');
  const [bank, setBank] = useState(store.bankTransferInstructions ?? '');
  const [social, setSocial] = useState(Object.entries(store.socialLinks ?? {}).map(([name, url]) => ({ name, url })));
  const [submitted, setSubmitted] = useState(false);

  const errors = {
    threshold: whole(threshold) ? '' : 'Enter whole rupees.',
    cutoff: whole(cutoff) && Number(cutoff) <= 23 ? '' : 'Enter an hour from 0 to 23 (13 means 1pm).',
    email: !email.trim() || emailOk(email) ? '' : 'Enter a valid email address, or leave it empty.',
    social: social.some((s) => s.name.trim() && !webLink(s.url)) ? 'Each link must start with https://.' : social.some((s) => !s.name.trim() && s.url.trim()) ? 'Give each link a name, like Instagram.' : '',
  };
  const valid = Object.values(errors).every((e) => !e);

  const save = useMutation({
    mutationFn: () => adminApi.saveStore({
      announcement: announcement.trim() || null, banner: banner.trim() || null,
      freeDeliveryThreshold: Number(threshold), sameDayCutoffHour: Number(cutoff),
      contactPhone: phone.trim() || null, contactEmail: email.trim() || null,
      bankTransferInstructions: bank.trim() || null,
      socialLinks: Object.fromEntries(social.filter((s) => s.name.trim() && s.url.trim()).map((s) => [s.name.trim(), s.url.trim()])),
    }),
    onSuccess: (s) => qc.setQueryData(['store'], s),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (valid) save.mutate();
  };
  const show = (m: string) => (submitted ? m : '');

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <TextField label="Announcement bar" value={announcement} onChange={(e) => setAnnouncement(e.target.value)} hint="The line across the top of every page. Leave empty for none." />
      <TextField label="Home page banner" value={banner} onChange={(e) => setBanner(e.target.value)} />
      <div className="fieldrow">
        <TextField label="Free delivery over (Rs)" inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} hint="Orders strictly above this get free delivery." error={show(errors.threshold)} />
        <TextField label="Same-day cut-off hour" inputMode="numeric" value={cutoff} onChange={(e) => setCutoff(e.target.value)} hint="Pakistan time, 24 hour clock. 13 = 1pm." error={show(errors.cutoff)} />
      </div>
      <div className="fieldrow">
        <TextField label="Shop phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <TextField label="Shop email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={show(errors.email)} />
      </div>
      <TextArea label="Bank transfer instructions" rows={4} value={bank} onChange={(e) => setBank(e.target.value)} hint="Shown to customers who pay by bank transfer: account name, number, bank." />
      <fieldset className="picker">
        <legend>Social links</legend>
        {social.map((s, i) => (
          <div key={i} className="fieldrow">
            <TextField label={`Name ${i + 1}`} value={s.name} onChange={(e) => setSocial((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <TextField label={`Link ${i + 1}`} value={s.url} onChange={(e) => setSocial((all) => all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <Button variant="ghost" size="small" onClick={() => setSocial((all) => all.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`}>Remove</Button>
          </div>
        ))}
        <Button variant="secondary" size="small" onClick={() => setSocial((all) => [...all, { name: '', url: '' }])}>Add a link</Button>
        {submitted && errors.social && <p role="alert" className="sy-field__error">{errors.social}</p>}
      </fieldset>
      <ActionError error={save.error} />
      <Saved ok={save.isSuccess} />
      <Button type="submit" loading={save.isPending}>Save shop details</Button>
    </form>
  );
}

// ---------------------------------------------------------------- delivery

interface Row { city: string; fee: string; minDays: string; maxDays: string; sameDay: boolean; capacity: string }
const toRow = (city: string, r: Rate, capacity?: number): Row => ({ city, fee: String(r.fee), minDays: String(r.minDays), maxDays: String(r.maxDays), sameDay: r.sameDay, capacity: capacity !== undefined ? String(capacity) : '' });

function DeliveryForm({ store }: { store: AdminStore }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(Object.entries(store.deliveryRates).map(([c, r]) => toRow(c, r, store.sameDayCapacity?.[c])));
  const [rest, setRest] = useState<Row>(toRow('Rest of Pakistan', store.restOfPakistan));
  const [submitted, setSubmitted] = useState(false);

  const rowError = (r: Row, i?: number) => {
    if (i !== undefined && !r.city.trim()) return 'Enter the city name.';
    if (i !== undefined && rows.some((o, j) => j !== i && o.city.trim().toLowerCase() === r.city.trim().toLowerCase())) return 'This city is listed twice.';
    if (!whole(r.fee) || !whole(r.minDays) || !whole(r.maxDays)) return 'Fee and days must be whole numbers.';
    if (Number(r.minDays) > Number(r.maxDays)) return 'The shortest time cannot be longer than the longest.';
    if (r.capacity.trim() && !whole(r.capacity)) return 'Capacity must be a whole number, or empty for no limit.';
    return '';
  };
  const problems = [...rows.map((r, i) => rowError(r, i)), rowError(rest)].some(Boolean) || !rows.length;

  const rate = (r: Row): Rate => ({ fee: Number(r.fee), minDays: Number(r.minDays), maxDays: Number(r.maxDays), sameDay: r.sameDay });
  const save = useMutation({
    mutationFn: () => adminApi.saveStore({
      deliveryRates: Object.fromEntries(rows.map((r) => [r.city.trim(), rate(r)])),
      restOfPakistan: rate(rest),
      sameDayCapacity: Object.fromEntries(rows.filter((r) => r.sameDay && r.capacity.trim()).map((r) => [r.city.trim(), Number(r.capacity)])),
    }),
    onSuccess: (s) => qc.setQueryData(['store'], s),
  });
  const update = (i: number, change: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...change } : r)));

  return (
    <form className="auth-form" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (!problems) save.mutate(); }} noValidate>
      <p className="muted">Fees are in rupees. Days are working days (0 = the same day). "Same day" cities can take orders until the cut-off hour; capacity is how many same-day orders a city can take in one day (empty = no limit).</p>
      <div className="table-wrap">
        <table className="table">
          <caption className="sy-sr-only">Delivery by city</caption>
          <thead><tr><th scope="col">City</th><th scope="col">Fee</th><th scope="col">Min days</th><th scope="col">Max days</th><th scope="col">Same day</th><th scope="col">Daily limit</th><th scope="col"><span className="sy-sr-only">Remove</span></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input className="sy-input" aria-label={`City ${i + 1}`} value={r.city} onChange={(e) => update(i, { city: e.target.value })} /></td>
                <td><input className="sy-input" aria-label={`Fee for ${r.city || `city ${i + 1}`}`} inputMode="numeric" value={r.fee} onChange={(e) => update(i, { fee: e.target.value })} /></td>
                <td><input className="sy-input" aria-label={`Shortest days for ${r.city || `city ${i + 1}`}`} inputMode="numeric" value={r.minDays} onChange={(e) => update(i, { minDays: e.target.value })} /></td>
                <td><input className="sy-input" aria-label={`Longest days for ${r.city || `city ${i + 1}`}`} inputMode="numeric" value={r.maxDays} onChange={(e) => update(i, { maxDays: e.target.value })} /></td>
                <td><input type="checkbox" aria-label={`Same day in ${r.city || `city ${i + 1}`}`} checked={r.sameDay} onChange={(e) => update(i, { sameDay: e.target.checked })} /></td>
                <td><input className="sy-input" aria-label={`Daily limit for ${r.city || `city ${i + 1}`}`} inputMode="numeric" value={r.capacity} disabled={!r.sameDay} onChange={(e) => update(i, { capacity: e.target.value })} /></td>
                <td><Button variant="ghost" size="small" onClick={() => setRows((all) => all.filter((_, j) => j !== i))} aria-label={`Remove ${r.city || `city ${i + 1}`}`}>Remove</Button>{submitted && rowError(r, i) && <div role="alert" className="sy-field__error">{rowError(r, i)}</div>}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Rest of Pakistan</th>
              <td><input className="sy-input" aria-label="Fee for the rest of Pakistan" inputMode="numeric" value={rest.fee} onChange={(e) => setRest({ ...rest, fee: e.target.value })} /></td>
              <td><input className="sy-input" aria-label="Shortest days for the rest of Pakistan" inputMode="numeric" value={rest.minDays} onChange={(e) => setRest({ ...rest, minDays: e.target.value })} /></td>
              <td><input className="sy-input" aria-label="Longest days for the rest of Pakistan" inputMode="numeric" value={rest.maxDays} onChange={(e) => setRest({ ...rest, maxDays: e.target.value })} /></td>
              <td colSpan={3}>{submitted && rowError(rest) && <span role="alert" className="sy-field__error">{rowError(rest)}</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="actions">
        <Button variant="secondary" size="small" onClick={() => setRows((all) => [...all, { city: '', fee: '650', minDays: '2', maxDays: '4', sameDay: false, capacity: '' }])}>Add a city</Button>
      </div>
      {submitted && !rows.length && <p role="alert" className="sy-field__error">Keep at least one city.</p>}
      <ActionError error={save.error} />
      <Saved ok={save.isSuccess} />
      <Button type="submit" loading={save.isPending}>Save delivery</Button>
    </form>
  );
}

// ---------------------------------------------------------------- promo codes

/** Promo dates are whole days in Pakistan time: a code starts at the beginning of its first day and ends at the close of its last. */
const startIso = (d: string) => `${d}T00:00:00+05:00`;
const endIso = (d: string) => `${d}T23:59:59+05:00`;
const pktDay = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 10) : '');

function PromoRow({ p }: { p: Promo }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [percent, setPercent] = useState(String(p.percent));
  const [minOrder, setMinOrder] = useState(String(p.minOrder));
  const [first, setFirst] = useState(p.firstOrderOnly);
  const [from, setFrom] = useState(pktDay(p.startsAt));
  const [to, setTo] = useState(pktDay(p.endsAt));
  const bad = !whole(percent) || Number(percent) < 1 || Number(percent) > 100 || !whole(minOrder) || (from && to && from > to);
  const done = () => qc.invalidateQueries({ queryKey: ['promos'] });
  const save = useMutation({
    mutationFn: () => adminApi.updatePromo(p.code, { percent: Number(percent), minOrder: Number(minOrder), firstOrderOnly: first, startsAt: from ? startIso(from) : null, endsAt: to ? endIso(to) : null }),
    onSuccess: () => { done(); setEditing(false); },
  });
  const toggle = useMutation({ mutationFn: () => adminApi.updatePromo(p.code, { isActive: !p.isActive }), onSuccess: done });

  if (editing) {
    return (
      <li>
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (!bad) save.mutate(); }}>
          <strong>{p.code}</strong>
          <div className="fieldrow">
            <TextField label="Percent off" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} error={!whole(percent) || Number(percent) < 1 || Number(percent) > 100 ? 'From 1 to 100.' : ''} />
            <TextField label="Minimum order (Rs)" inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} error={!whole(minOrder) ? 'Whole rupees.' : ''} />
          </div>
          <div className="fieldrow">
            <TextField label="First day" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label="Last day" type="date" value={to} onChange={(e) => setTo(e.target.value)} error={from && to && from > to ? 'The last day must not be before the first.' : ''} />
          </div>
          <label className="studio__design"><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> <span>First order only</span></label>
          <ActionError error={save.error} />
          <div className="actions"><Button type="submit" size="small" loading={save.isPending}>Save</Button><Button variant="ghost" size="small" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      </li>
    );
  }
  return (
    <li>
      <strong>{p.code}</strong> {p.percent}% off {p.isActive ? <Badge tone="digital">Active</Badge> : <Badge tone="offer">Off</Badge>}
      <div className="muted">
        Orders over {rupees(p.minOrder)}{p.firstOrderOnly ? ', first order only' : ''}
        {p.startsAt ? `, from ${shortDate(pktDay(p.startsAt))}` : ''}{p.endsAt ? `, until ${shortDate(pktDay(p.endsAt))}` : ''}
      </div>
      <div className="actions">
        <Button variant="ghost" size="small" onClick={() => setEditing(true)} aria-label={`Edit ${p.code}`}>Edit</Button>
        <Button variant="ghost" size="small" loading={toggle.isPending} onClick={() => toggle.mutate()} aria-label={`${p.isActive ? 'Turn off' : 'Turn on'} ${p.code}`}>{p.isActive ? 'Turn off' : 'Turn on'}</Button>
      </div>
      <ActionError error={toggle.error} />
    </li>
  );
}

function Promos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['promos'], queryFn: ({ signal }) => adminApi.promos({ signal }) });
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('10');
  const [minOrder, setMinOrder] = useState('0');
  const [first, setFirst] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    code: /^[A-Za-z0-9]{3,20}$/.test(code) ? '' : '3 to 20 letters or digits, no spaces.',
    percent: whole(percent) && Number(percent) >= 1 && Number(percent) <= 100 ? '' : 'From 1 to 100.',
    minOrder: whole(minOrder) ? '' : 'Whole rupees.',
  };
  const create = useMutation({
    mutationFn: () => adminApi.createPromo({ code, percent: Number(percent), minOrder: Number(minOrder), firstOrderOnly: first }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promos'] }); setCode(''); setSubmitted(false); },
  });
  return (
    <div className="cols">
      <section aria-labelledby="pc">
        <h2 id="pc">Codes</h2>
        {q.error ? <QueryError error={q.error} onRetry={() => q.refetch()} what="the promo codes" /> : !q.data ? <p aria-busy="true">Loading…</p> : !q.data.length ? <p>No promo codes yet.</p> : (
          <ul className="lines">{q.data.map((p) => <PromoRow key={p.id} p={p} />)}</ul>
        )}
      </section>
      <form className="auth-form" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); if (Object.values(errors).every((x) => !x)) create.mutate(); }} noValidate>
        <h2>New code</h2>
        <TextField label="Code" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" hint="Customers type this at checkout. Not case sensitive." error={submitted ? errors.code : ''} />
        <TextField label="Percent off" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} error={submitted ? errors.percent : ''} />
        <TextField label="Minimum order (Rs)" inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} error={submitted ? errors.minOrder : ''} />
        <label className="studio__design"><input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> <span>First order only</span></label>
        <ActionError error={create.error} />
        <Button type="submit" loading={create.isPending}>Create code</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- extras

function ExtraRow({ x }: { x: Extra }) {
  const qc = useQueryClient();
  const [name, setName] = useState(x.name);
  const [price, setPrice] = useState(String(x.price));
  const locked = x.id === 'classic_wrap'; // always included in the gift price
  const dirty = name !== x.name || price !== String(x.price);
  const bad = !name.trim() || !whole(price);
  const save = useMutation({ mutationFn: () => adminApi.updateExtra(x.id, { name: name.trim(), price: Number(price) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['extras'] }) });
  const toggle = useMutation({ mutationFn: () => adminApi.updateExtra(x.id, { isActive: !x.isActive }), onSuccess: () => qc.invalidateQueries({ queryKey: ['extras'] }) });
  return (
    <tr>
      <td><input className="sy-input" aria-label={`Name of ${x.id}`} value={name} onChange={(e) => setName(e.target.value)} /></td>
      <td><input className="sy-input" aria-label={`Price of ${x.name}`} inputMode="numeric" value={price} disabled={locked} onChange={(e) => setPrice(e.target.value)} /></td>
      <td>{x.isActive ? <Badge tone="digital">On</Badge> : <Badge tone="offer">Off</Badge>}</td>
      <td className="actions">
        <Button size="small" disabled={!dirty || bad} loading={save.isPending} onClick={() => save.mutate()} aria-label={`Save ${x.name}`}>Save</Button>
        {!locked && <Button size="small" variant="ghost" loading={toggle.isPending} onClick={() => toggle.mutate()} aria-label={`${x.isActive ? 'Turn off' : 'Turn on'} ${x.name}`}>{x.isActive ? 'Turn off' : 'Turn on'}</Button>}
        <ActionError error={save.error ?? toggle.error} />
      </td>
    </tr>
  );
}

function Extras() {
  const q = useQuery({ queryKey: ['extras'], queryFn: ({ signal }) => adminApi.extras({ signal }) });
  if (q.error) return <QueryError error={q.error} onRetry={() => q.refetch()} what="the extras" />;
  if (!q.data) return <p aria-busy="true">Loading…</p>;
  return (
    <>
      <p className="muted">Paid add-ons customers can choose when personalising a gift. Classic wrap is always included and cannot be priced. Which gifts offer which extras is set on each gift.</p>
      <div className="table-wrap">
        <table className="table">
          <caption className="sy-sr-only">Extras</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Price (Rs)</th><th scope="col">Status</th><th scope="col"><span className="sy-sr-only">Actions</span></th></tr></thead>
          <tbody>{q.data.map((x) => <ExtraRow key={x.id} x={x} />)}</tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- page

const TABS = [['shop', 'Shop details'], ['delivery', 'Delivery'], ['promos', 'Promo codes'], ['extras', 'Extras']] as const;
type Tab = (typeof TABS)[number][0];

export function Settings() {
  const [tab, setTab] = useState<Tab>('shop');
  const store = useQuery({ queryKey: ['store'], queryFn: ({ signal }) => adminApi.store({ signal }), enabled: tab === 'shop' || tab === 'delivery' });
  return (
    <>
      <title>Settings | Bloomora studio</title>
      <h1>Settings</h1>
      <p className="muted">Changes go live on the shop straight away.</p>
      <div className="presets" role="group" aria-label="Settings">
        {TABS.map(([k, label]) => <Chip key={k} pressed={tab === k} onClick={() => setTab(k)}>{label}</Chip>)}
      </div>
      {(tab === 'shop' || tab === 'delivery') && (store.error ? <QueryError error={store.error} onRetry={() => store.refetch()} retrying={store.isFetching} what="the settings" /> : !store.data ? <p aria-busy="true">Loading…</p> : tab === 'shop' ? <ShopForm store={store.data} /> : <DeliveryForm store={store.data} />)}
      {tab === 'promos' && <Promos />}
      {tab === 'extras' && <Extras />}
    </>
  );
}

