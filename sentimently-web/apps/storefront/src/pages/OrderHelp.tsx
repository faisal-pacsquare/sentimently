import { ApiError, rupees, shortDate } from '@sentimently/api';
import { Alert, Button, Container, ProblemList, TextArea, TextField } from '@sentimently/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { QueryError } from '../lib/present';

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Pages opened from the account pass the order number and email along in memory, never in the address bar. */
function usePrefill() {
  const state = useLocation().state as { number?: string; email?: string } | null;
  return { number: state?.number ?? '', email: state?.email ?? '' };
}

/** A refusal (409, 404) is explained in the server's words. A broken connection or server gets a retry. */
function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  if (!error) return null;
  if (error instanceof ApiError && error.isNotFound) {
    return <Alert tone="error">We could not find an order with those details. Check the number and the email you used.</Alert>;
  }
  if (error instanceof ApiError && !error.isTemporary) {
    return error.status === 400 ? <ProblemList problems={error.details.length ? error.details : [error.message]} /> : <Alert tone="error">{error.message}</Alert>;
  }
  return <QueryError error={error} onRetry={retry} what="that" />;
}

function OrderFields({ number, setNumber, email, setEmail, submitted }: { number: string; setNumber(v: string): void; email: string; setEmail(v: string): void; submitted: boolean }) {
  return (
    <>
      <TextField label="Order number" hint="From your confirmation email, like SN-7K3M9Q2X" value={number} onChange={(e) => setNumber(e.target.value)} autoCapitalize="characters" error={submitted && !number.trim() ? 'Enter the order number.' : ''} />
      <TextField label="Email used for the order" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" error={submitted && !emailOk(email) ? 'Enter the email address you ordered with.' : ''} />
    </>
  );
}

export function CancelOrder() {
  const pre = usePrefill();
  const [number, setNumber] = useState(pre.number);
  const [email, setEmail] = useState(pre.email);
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const cancel = useMutation({ mutationFn: () => api.cancelOrder(number.trim(), email.trim(), reason.trim() || undefined) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (number.trim() && emailOk(email)) cancel.mutate();
  };

  return (
    <Container className="page page--narrow">
      <title>Cancel an order | Sentimently</title>
      <h1>Cancel an order</h1>
      {cancel.isSuccess ? (
        <>
          <Alert tone="info">
            Order {cancel.data.number} is cancelled.
            {cancel.data.refund
              ? ` Your refund of ${rupees(cancel.data.refund.amount)} is due by ${shortDate(cancel.data.refund.dueBy)}. ${cancel.data.refund.note}`
              : ' Nothing was charged, so there is nothing to refund.'}
          </Alert>
          <p><Button as={Link} to="/shop">Keep shopping</Button></p>
        </>
      ) : (
        <>
          <p>You can cancel until we start preparing your order. After that, <Link to="/contact">contact us</Link> and we will see what we can do.</p>
          <form className="auth-form" onSubmit={submit} noValidate>
            <OrderFields {...{ number, setNumber, email, setEmail, submitted }} />
            <TextArea label="Why are you cancelling? (optional)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Failure error={cancel.error} retry={() => cancel.mutate()} />
            <Button type="submit" loading={cancel.isPending}>Cancel this order</Button>
          </form>
        </>
      )}
    </Container>
  );
}

export function ReturnOrder() {
  const pre = usePrefill();
  const [number, setNumber] = useState(pre.number);
  const [email, setEmail] = useState(pre.email);
  const [kind, setKind] = useState<'return' | 'damaged'>('return');
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState(['']);
  const [unused, setUnused] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const photoUrls = photos.map((p) => p.trim()).filter(Boolean);
  const errors = {
    reason: reason.trim() ? '' : 'Tell us what happened.',
    photos: kind === 'damaged' && !photoUrls.length ? 'Add a link to at least one photo of the damage.' : '',
    unused: kind === 'return' && !unused ? 'Please confirm the item is unused and in its original packaging.' : '',
  };
  const send = useMutation({
    mutationFn: () => api.requestReturn({
      number: number.trim(), email: email.trim(), kind, reason: reason.trim(),
      ...(kind === 'damaged' ? { photoUrls } : { confirmUnused: true }),
    }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (number.trim() && emailOk(email) && !errors.reason && !errors.photos && !errors.unused) send.mutate();
  };

  return (
    <Container className="page page--narrow">
      <title>Return or report damage | Sentimently</title>
      <h1>Return or report damage</h1>
      {send.isSuccess ? (
        <>
          <Alert tone="info">
            Thank you, we have your request{send.data.refundAmount ? ` for a refund of up to ${rupees(send.data.refundAmount)}` : ''}. We will email you once we have looked at it.
          </Alert>
          <p><Button as={Link} to="/shop">Keep shopping</Button></p>
        </>
      ) : (
        <>
          <p>Changed your mind? Returns are for unused items within 7 days of delivery (not personalised or digital gifts). Something arrived damaged? Tell us within 48 hours, with a photo. <Link to="/delivery">Read the full policy</Link>.</p>
          <form className="auth-form" onSubmit={submit} noValidate>
            <fieldset className="rating-pick">
              <legend>What is this about?</legend>
              <label><input type="radio" name="kind" checked={kind === 'return'} onChange={() => setKind('return')} /> I changed my mind</label>
              <label><input type="radio" name="kind" checked={kind === 'damaged'} onChange={() => setKind('damaged')} /> It arrived damaged</label>
            </fieldset>
            <OrderFields {...{ number, setNumber, email, setEmail, submitted }} />
            <TextArea label="What happened?" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} error={submitted ? errors.reason : ''} />
            {kind === 'damaged' && (
              <fieldset className="auth-form">
                <legend>Photos of the damage</legend>
                <p className="muted">Paste a link to each photo, for example from Google Photos or Drive with sharing switched on. Up to 5.</p>
                {photos.map((p, i) => (
                  <TextField key={i} label={`Photo link ${i + 1}`} type="url" value={p} onChange={(e) => setPhotos((all) => all.map((x, j) => (j === i ? e.target.value : x)))} />
                ))}
                {photos.length < 5 && <Button variant="ghost" size="small" onClick={() => setPhotos((all) => [...all, ''])}>Add another photo link</Button>}
                {submitted && errors.photos && <p role="alert" className="sy-field__error">{errors.photos}</p>}
              </fieldset>
            )}
            {kind === 'return' && (
              <label className="studio__design">
                <input type="checkbox" checked={unused} onChange={(e) => setUnused(e.target.checked)} />
                <span>The item is unused and in its original packaging</span>
              </label>
            )}
            {submitted && errors.unused && <p role="alert" className="sy-field__error">{errors.unused}</p>}
            <Failure error={send.error} retry={() => send.mutate()} />
            <Button type="submit" loading={send.isPending}>Send request</Button>
          </form>
        </>
      )}
    </Container>
  );
}
