import { ApiError, dateTime, rupees } from '@sentimently/api';
import type { Rate } from '@sentimently/api';
import { Alert, Button, Container, ProblemList, SelectField, TextArea, TextField } from '@sentimently/ui';
import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import { QueryError } from '../lib/present';
import { useStoreSettings } from '../lib/queries';

function timing(r: Rate): string {
  if (r.sameDay) return 'Same day if ordered before the cut-off, otherwise next working day';
  if (r.minDays === r.maxDays) return `${r.minDays} working day${r.minDays === 1 ? '' : 's'}`;
  return `${r.minDays} to ${r.maxDays} working days`;
}

export function Delivery() {
  const { data, error, isPending, refetch, isFetching } = useStoreSettings();
  const cutoff = data ? (data.sameDayCutoffHour > 12 ? `${data.sameDayCutoffHour - 12}pm` : `${data.sameDayCutoffHour}am`) : '1pm';
  return (
    <Container className="page prose">
      <title>Delivery and returns | Bloomora</title>
      <h1>Delivery and returns</h1>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} retrying={isFetching} what="the delivery rates" />
      ) : isPending ? (
        <p aria-busy="true">Loading rates…</p>
      ) : (
        <>
          <h2>Delivery charges</h2>
          <p>Delivery is free on orders over {rupees(data.freeDeliveryThreshold)}. We deliver within Pakistan only. Order before {cutoff} for same-day delivery where it is offered.</p>
          <table className="rates">
            <caption className="sy-sr-only">Delivery charges and times by city</caption>
            <thead><tr><th scope="col">City</th><th scope="col">Charge</th><th scope="col">Time</th></tr></thead>
            <tbody>
              {Object.entries(data.deliveryRates).map(([city, r]) => (
                <tr key={city}><th scope="row">{city}</th><td>{rupees(r.fee)}</td><td>{timing(r)}</td></tr>
              ))}
              <tr><th scope="row">Rest of Pakistan</th><td>{rupees(data.restOfPakistan.fee)}</td><td>{timing(data.restOfPakistan)}</td></tr>
              <tr><th scope="row">Digital gifts</th><td>Free</td><td>Instant, or at the time you choose</td></tr>
            </tbody>
          </table>
        </>
      )}
      <h2>Made to order and fresh gifts</h2>
      <p>Personalised items such as engraved jewellery and printed books are made for you, so they take longer; the gift page shows how long. Flowers and chocolate can be scheduled up to 3 days ahead.</p>
      <h2>Cancelling</h2>
      <p>You can cancel for free until we start preparing your order. Once a personalised item is being made, it can no longer be cancelled. <Link to="/cancel-order">Cancel an order</Link>.</p>
      <h2>Returns and damage</h2>
      <ul>
        <li>Changed your mind? Return an unused item in its original packaging within 7 days of delivery. Personalised and digital gifts cannot be returned. The cost of sending it back is yours unless it was faulty.</li>
        <li>Arrived damaged? Send us a photo within 48 hours. We will replace it or refund you in full, including delivery.</li>
        <li><Link to="/returns">Start a return or report damage</Link>.</li>
        <li>Refunds are processed within 3 working days of approval. Bank transfers then take 5 to 7 working days to arrive.</li>
        <li>If we cannot deliver after two attempts we will contact you. The first re-delivery in the same city is free.</li>
      </ul>
    </Container>
  );
}

export function Track() {
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const track = useMutation({ mutationFn: () => api.track(number.trim(), email.trim()) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    track.mutate();
  };
  const err = track.error instanceof ApiError ? track.error : null;
  const r = track.data;
  // The order number is passed along, so the person does not have to type it again. Never the email.
  const helpLink = `/contact?topic=order${number.trim() ? `&order=${encodeURIComponent(number.trim())}` : ''}`;

  return (
    <Container className="page prose">
      <title>Track an order | Bloomora</title>
      <h1>Track an order</h1>
      <form onSubmit={submit} className="narrow">
        <TextField label="Order number" hint="From your confirmation email, like SN-7K3M9Q2X" value={number} onChange={(e) => setNumber(e.target.value)} required autoCapitalize="characters" />
        <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <Button type="submit" loading={track.isPending}>Track</Button>
      </form>
      {err?.isNotFound && <Alert tone="error">We could not find an order with those details. Check the number and the email you used, or <Link to={helpLink}>write to us</Link> and we will look for it.</Alert>}
      {err && !err.isNotFound && <QueryError error={err} onRetry={() => track.mutate()} retrying={track.isPending} what="your order" />}
      {r && (
        <section aria-live="polite" className="track-result">
          <h2>{r.number}: {r.statusLabel}</h2>
          {r.deliveryDate && <p>Delivery date: {r.deliveryDate}</p>}
          {['awaiting_payment', 'placed', 'paid'].includes(r.status) && <p><Link to="/cancel-order">Cancel this order</Link></p>}
          {r.status === 'delivered' && <p><Link to="/returns">Return an item or report damage</Link></p>}
          <ol className="timeline">
            {r.timeline.map((t, i) => (
              <li key={`${t.status}-${i}`}><strong>{t.label}</strong> <span>{dateTime(t.at)}</span></li>
            ))}
          </ol>
        </section>
      )}
      <aside className="track-help" aria-label="Need help?">
        <h2>Need help with an order?</h2>
        <p>If something looks wrong, or you cannot find your order, <Link to={helpLink}>write to us</Link>. It goes straight to our team by email.</p>
      </aside>
    </Container>
  );
}

const TOPICS = [
  ['order', 'My order'],
  ['delivery', 'Delivery'],
  ['payment', 'Payment'],
  ['personalisation', 'Personalising a gift'],
  ['bulk_gifting', 'Bulk or corporate gifting'],
  ['other', 'Something else'],
] as const;

export function Contact() {
  const [params] = useSearchParams();
  const topicParam = params.get('topic');
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    orderNumber: (params.get('order') ?? '').slice(0, 40),
    topic: TOPICS.some(([v]) => v === topicParam) ? (topicParam as string) : 'other',
    subject: '', message: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const send = useMutation({
    mutationFn: () => api.contact({ ...form, phone: form.phone || undefined, orderNumber: form.orderNumber || undefined }),
  });
  const err = send.error instanceof ApiError ? send.error : null;

  if (send.isSuccess) {
    return (
      <Container className="page prose">
        <title>Contact us | Bloomora</title>
        <h1>Thank you</h1>
        <Alert tone="info">{send.data.message}</Alert>
        <p>Our team has been emailed and will reply to <strong>{form.email}</strong>.</p>
      </Container>
    );
  }
  return (
    <Container className="page prose">
      <title>Contact us | Bloomora</title>
      <h1>Contact us</h1>
      <p>Questions, ideas, or planning a big order? Write to us.</p>
      <form className="narrow" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
        <ProblemList problems={err?.status === 400 ? err.details : []} />
        {send.error && !(err && err.status === 400) && (
          <QueryError error={send.error} onRetry={() => send.mutate()} retrying={send.isPending} what="your message" />
        )}
        <TextField label="Your name" value={form.name} onChange={set('name')} required autoComplete="name" />
        <TextField label="Email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        <TextField label="Phone (optional)" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        <SelectField label="What is it about?" value={form.topic} onChange={set('topic')}>
          {TOPICS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
        <TextField label="Order number (optional)" value={form.orderNumber} onChange={set('orderNumber')} />
        <TextField label="Subject" value={form.subject} onChange={set('subject')} required maxLength={150} />
        <TextArea label="Message" value={form.message} onChange={set('message')} required maxLength={5000} />
        <Button type="submit" loading={send.isPending}>Send message</Button>
      </form>
    </Container>
  );
}
