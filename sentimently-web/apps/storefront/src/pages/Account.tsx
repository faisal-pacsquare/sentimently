import { ApiError, dateTime, rupees, shortDate } from '@sentimently/api';
import { Alert, Button, Container, EmptyState, ProblemList, ProductCard, TextField } from '@sentimently/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMyOrder, useMyOrders, useReminderActions, useReminders, useToggleWishlist, useWishlist } from '../lib/account';
import { api } from '../lib/api';
import { ACCOUNT, useAuth } from '../lib/auth';
import { cardData, QueryError } from '../lib/present';
import { NotFound } from './NotFound';

/** The signed-in area. Signed-out visitors are sent to sign in and brought back; a failed load is a retry, never a sign-out. */
export function Account() {
  const auth = useAuth();
  const here = useLocation();
  const navigate = useNavigate();
  const resend = useMutation({ mutationFn: () => api.resendVerification() });

  if (auth.status === 'out') {
    return <Navigate to={`/login?next=${encodeURIComponent(here.pathname + here.search)}`} replace />;
  }
  if (auth.status === 'error') {
    return <Container className="page"><QueryError error={auth.error} onRetry={auth.retry} what="your account" /></Container>;
  }
  if (auth.status === 'loading' || !auth.customer) {
    return <Container className="page"><div className="sy-skeleton" style={{ height: '12rem' }} aria-busy="true" aria-label="Loading your account" /></Container>;
  }
  const me = auth.customer;
  return (
    <Container className="page">
      <title>My account | Bloomora</title>
      <div className="account-head">
        <h1>{me.name ? `Hello, ${me.name}` : 'My account'}</h1>
        <Button variant="secondary" size="small" onClick={() => { auth.signOut(); navigate('/'); }}>Sign out</Button>
      </div>
      {!me.emailVerified && (
        <Alert tone="warn">
          <strong>Please confirm your email.</strong> We emailed a link to {me.email}. It keeps your account safe and lets you reset your password. If it has not arrived after a few minutes, check your spam folder or ask for a new one.{' '}
          {resend.isSuccess && resend.data.sent ? (
            <span>{resend.data.message}</span>
          ) : (
            <>
              <Button variant="ghost" size="small" loading={resend.isPending} onClick={() => resend.mutate()}>{resend.isSuccess ? 'Try again' : 'Send the link again'}</Button>
              {resend.isSuccess && <span role="status"> {resend.data.message} <Link to="/contact?topic=other">Write to us</Link> if it keeps happening.</span>}
            </>
          )}
          {resend.error && <span> We could not send it just now. Please try again.</span>}
        </Alert>
      )}
      <nav className="account-nav" aria-label="My account">
        <NavLink to="/account" end>Orders</NavLink>
        <NavLink to="/account/wishlist">Wishlist</NavLink>
        <NavLink to="/account/reminders">Reminders</NavLink>
        <NavLink to="/account/details">Details</NavLink>
      </nav>
      <Outlet />
    </Container>
  );
}

export function Orders() {
  const { data, error, isPending, refetch, isFetching } = useMyOrders();
  if (error) return <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="your orders" />;
  if (isPending) return <p aria-busy="true">Loading your orders…</p>;
  if (!data.length) {
    return (
      <EmptyState title="No orders yet" message="When you order, it will show up here. Ordered before as a guest? Add that order from the Details tab.">
        <Button as={Link} to="/shop">Browse gifts</Button>
      </EmptyState>
    );
  }
  return (
    <ul className="orders" role="list">
      {data.map((o) => (
        <li key={o.id}>
          <Link to={`/account/orders/${encodeURIComponent(o.number)}`} className="orders__row">
            <span><strong>{o.number}</strong><br /><span className="muted">{shortDate(o.createdAt)}</span></span>
            <span className="orders__status">{o.statusLabel}</span>
            <span>{rupees(o.total)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function OrderDetail() {
  const { number = '' } = useParams();
  const { data: o, error, isPending, refetch, isFetching } = useMyOrder(number);
  if (error) {
    if (error instanceof ApiError && error.isNotFound) return <NotFound what="that order" />;
    return <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="this order" />;
  }
  if (isPending) return <p aria-busy="true">Loading the order…</p>;
  return (
    <section aria-labelledby="od">
      <p><Link to="/account">All orders</Link></p>
      <h2 id="od">Order {o.number}</h2>
      <p><strong>{o.statusLabel}</strong>. Placed {shortDate(o.createdAt)}{o.estimatedBy ? `. Expected by ${shortDate(o.estimatedBy)}` : ''}.</p>
      <ul role="list" className="box__lines">
        {o.lines.map((l, i) => (
          <li key={i} className="co-line">
            <span>
              {l.quantity} × <Link to={`/gifts/${l.slug}`}>{l.name}</Link>
              {l.extras.length > 0 && <span className="muted"> ({l.extras.map((x) => x.name).join(', ')})</span>}
              {l.personalisation && <span className="muted"> for {l.personalisation.recipientName}</span>}
            </span>
            <span>{rupees(l.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="totals">
        <div><dt>Gifts</dt><dd>{rupees(o.itemsTotal)}</dd></div>
        {o.extrasTotal > 0 && <div><dt>Extras</dt><dd>{rupees(o.extrasTotal)}</dd></div>}
        <div><dt>Delivery</dt><dd>{o.deliveryFee === 0 ? 'Free' : rupees(o.deliveryFee)}</dd></div>
        {o.discount > 0 && <div><dt>Discount</dt><dd>-{rupees(o.discount)}</dd></div>}
        <div className="totals__total"><dt>Total</dt><dd>{rupees(o.total)}</dd></div>
      </dl>
      {o.delivery?.address && <p>Delivering to {o.delivery.address}, {o.delivery.city}.</p>}
      {o.delivery?.trackingRef && <p>Courier {o.delivery.courier ?? ''} tracking {o.delivery.trackingRef}.</p>}
      {['awaiting_payment', 'placed', 'paid'].includes(o.status) && (
        <p><Button as={Link} to="/cancel-order" state={{ number: o.number, email: o.contactEmail }} variant="secondary">Cancel this order</Button></p>
      )}
      {o.status === 'delivered' && (
        <p><Button as={Link} to="/returns" state={{ number: o.number, email: o.contactEmail }} variant="secondary">Return an item or report damage</Button></p>
      )}
      <h3>Progress</h3>
      <ol className="timeline">
        {o.timeline.map((t, i) => <li key={i}><strong>{t.label}</strong> <span className="muted">{dateTime(t.at)}</span></li>)}
      </ol>
    </section>
  );
}

export function Wishlist() {
  const { data, error, isPending, refetch, isFetching } = useWishlist();
  const toggle = useToggleWishlist();
  if (error) return <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="your wishlist" />;
  if (isPending) return <p aria-busy="true">Loading your wishlist…</p>;
  if (!data.length) {
    return <EmptyState title="Nothing saved yet" message="Tap the heart on a gift to keep it here."><Button as={Link} to="/shop">Browse gifts</Button></EmptyState>;
  }
  return (
    <ul className="grid" role="list">
      {data.map((p) => (
        <li key={p.id}>
          <ProductCard product={cardData(p)} linkProps={{ href: `/gifts/${p.slug}` }} />
          <Button variant="ghost" size="small" onClick={() => toggle.mutate({ productId: p.id, on: false })} aria-label={`Remove ${p.name} from wishlist`}>Remove</Button>
        </li>
      ))}
    </ul>
  );
}

export function Reminders() {
  const { data, error, isPending, refetch, isFetching } = useReminders();
  const { add, remove } = useReminderActions();
  const [label, setLabel] = useState('');
  const [recipient, setRecipient] = useState('');
  const [date, setDate] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!label.trim() || !date) return;
    add.mutate(
      { label: label.trim(), date, ...(recipient.trim() ? { recipientName: recipient.trim() } : {}), notifyDaysBefore: 7 },
      { onSuccess: () => { setLabel(''); setRecipient(''); setDate(''); setSubmitted(false); } },
    );
  };
  const problems = add.error instanceof ApiError && add.error.status === 400 ? add.error.details : [];

  return (
    <section aria-labelledby="rem">
      <h2 id="rem">Never miss a date</h2>
      <p>We email you a week before, so there is time to choose and send something.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <TextField label="What is the occasion?" value={label} onChange={(e) => setLabel(e.target.value)} error={submitted && !label.trim() ? 'Give it a name, for example Ammi birthday.' : ''} />
        <TextField label="Who is it for? (optional)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={submitted && !date ? 'Choose the date.' : ''} />
        <ProblemList problems={problems} />
        {add.error && !problems.length && <QueryError error={add.error} onRetry={() => add.mutate({ label, date })} what="the reminder" />}
        <Button type="submit" loading={add.isPending}>Add reminder</Button>
      </form>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="your reminders" />
      ) : isPending ? (
        <p aria-busy="true">Loading…</p>
      ) : !data.length ? (
        <p>No reminders yet.</p>
      ) : (
        <ul role="list" className="orders">
          {data.map((r) => (
            <li key={r.id} className="orders__row">
              <span><strong>{r.label}</strong>{r.recipientName ? ` · ${r.recipientName}` : ''}<br /><span className="muted">{shortDate(r.date)}</span></span>
              <span />
              <Button variant="ghost" size="small" onClick={() => remove.mutate(r.id)} aria-label={`Delete reminder ${r.label}`}>Delete</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Details() {
  const auth = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = auth.customer!;
  const [name, setName] = useState(me.name ?? '');
  const [phone, setPhone] = useState(me.phone ?? '');
  const [claimNo, setClaimNo] = useState('');
  const [claimEmail, setClaimEmail] = useState(me.email);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  const save = useMutation({
    mutationFn: () => api.updateMe({ name: name.trim(), phone: phone.trim() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ACCOUNT, 'me'] }),
  });
  const claim = useMutation({
    mutationFn: () => api.claimOrder(claimNo.trim(), claimEmail.trim()),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ACCOUNT, 'orders'] }),
  });
  const download = useMutation({
    mutationFn: async () => {
      const data = await api.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-sentimently-data.json';
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAccount(me.authProvider === 'email' ? password : undefined),
    onSuccess: () => { auth.signOut(); navigate('/', { replace: true }); },
  });

  const failed = (e: unknown) => (e instanceof ApiError && !e.isTemporary ? e.details[0] ?? e.message : 'Something went wrong. Please try again.');

  return (
    <div className="account-details">
      <section aria-labelledby="me-h">
        <h2 id="me-h">Your details</h2>
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <TextField label="Email" value={me.email} readOnly hint={me.emailVerified ? 'Confirmed' : 'Not confirmed yet'} />
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          {save.isSuccess && <Alert tone="info">Saved.</Alert>}
          {save.error && <Alert tone="error">{failed(save.error)}</Alert>}
          <Button type="submit" loading={save.isPending}>Save</Button>
        </form>
      </section>

      <section aria-labelledby="claim-h">
        <h2 id="claim-h">Add an earlier order</h2>
        <p>Ordered as a guest? Enter the order number and the email you used.</p>
        <form className="auth-form" onSubmit={(e) => { e.preventDefault(); claim.mutate(); }}>
          <TextField label="Order number" value={claimNo} onChange={(e) => setClaimNo(e.target.value)} />
          <TextField label="Email used for the order" type="email" value={claimEmail} onChange={(e) => setClaimEmail(e.target.value)} />
          {claim.isSuccess && <Alert tone="info">{claim.data.added ? `Order ${claim.data.number} is now in your account.` : `Order ${claim.data.number} was already in your account.`}</Alert>}
          {claim.error && <Alert tone="error">{failed(claim.error)}</Alert>}
          <Button type="submit" variant="secondary" loading={claim.isPending} disabled={!claimNo.trim()}>Add order</Button>
        </form>
      </section>

      <section aria-labelledby="priv-h">
        <h2 id="priv-h">Your data</h2>
        <p><Button variant="secondary" loading={download.isPending} onClick={() => download.mutate()}>Download my data</Button></p>
        {download.error && <Alert tone="error">{failed(download.error)}</Alert>}
        {!confirming ? (
          <p><Button variant="ghost" onClick={() => setConfirming(true)}>Delete my account</Button></p>
        ) : (
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); remove.mutate(); }}>
            <Alert tone="warn">This removes your account, wishlist and reminders. Orders you have placed are kept for our records, without your details once they are complete.</Alert>
            {me.authProvider === 'email' && <TextField label="Your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            {remove.error && <Alert tone="error">{failed(remove.error)}</Alert>}
            <Button type="submit" loading={remove.isPending} disabled={me.authProvider === 'email' && !password}>Yes, delete my account</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Keep my account</Button>
          </form>
        )}
      </section>

      <p><Button variant="secondary" onClick={() => { auth.signOut(); navigate('/'); }}>Sign out</Button></p>
    </div>
  );
}

