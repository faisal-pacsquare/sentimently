import { ApiError } from '@sentimently/api';
import { Alert, Button, Container, TextArea, TextField } from '@sentimently/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { QueryError } from '../lib/present';
import { NotFound } from './NotFound';

/** What the person receiving a gift sees. They have no account: the long private link is the key. */
export function GiftLink() {
  const { token = '' } = useParams();
  const link = useQuery({ queryKey: ['gift-link', token], queryFn: ({ signal }) => api.giftLink(token, { signal }) });
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const claim = useMutation({
    mutationFn: () => api.claimGiftLink(token, { address: address.trim(), phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) }),
  });

  const errors = {
    address: address.trim().length >= 10 ? '' : 'Enter the full delivery address (at least 10 characters).',
    phone: phone.trim().length >= 7 ? '' : 'Enter a phone number for the courier.',
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!errors.address && !errors.phone) claim.mutate();
  };

  if (link.error) {
    if (link.error instanceof ApiError && link.error.isNotFound) return <NotFound what="that gift link" />;
    return <Container className="page"><QueryError error={link.error} onRetry={() => link.refetch()} retrying={link.isFetching} what="your gift" /></Container>;
  }
  if (link.isPending) return <Container className="page"><div className="sy-skeleton" style={{ height: '12rem' }} aria-busy="true" aria-label="Loading your gift" /></Container>;

  const preview = link.data;
  const refused = claim.error instanceof ApiError && !claim.error.isTemporary ? claim.error : null;
  const done = claim.isSuccess;
  const status = done ? 'claimed-now' : refused?.status === 410 ? 'expired' : refused?.status === 409 ? 'claimed' : preview.status;

  return (
    <Container className="page page--narrow">
      <title>Your gift | Bloomora</title>
      {status === 'expired' && (
        <>
          <h1>This gift link has expired</h1>
          <p>Gift links work for 30 days. Please get in touch with the person who sent it, or contact us and we will help.</p>
          <Button as={Link} to="/contact">Contact us</Button>
        </>
      )}
      {status === 'claimed' && (
        <>
          <h1>This gift is already on its way</h1>
          <p>Someone has already chosen where it goes. If that was not you, please contact us.</p>
          <Button as={Link} to="/contact">Contact us</Button>
        </>
      )}
      {status === 'claimed-now' && (
        <>
          <h1>Thank you, it is on its way</h1>
          <Alert tone="info">{claim.data?.message}</Alert>
        </>
      )}
      {status === 'ready' && (
        <>
          <h1>{preview.recipientName ? `A gift for ${preview.recipientName}` : 'You have a gift'}</h1>
          <p>Someone is sending you something special. Tell us where to deliver it{preview.city ? ` in ${preview.city}` : ''}.</p>
          <form className="auth-form" onSubmit={submit} noValidate>
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <TextArea label="Delivery address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" error={submitted ? errors.address : ''} />
            <TextField label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" hint="Only used by the courier." error={submitted ? errors.phone : ''} />
            {refused && refused.status !== 409 && refused.status !== 410 && <Alert tone="error">{refused.details[0] ?? refused.message}</Alert>}
            {claim.error && !refused && <QueryError error={claim.error} onRetry={() => claim.mutate()} retrying={claim.isPending} what="your gift" />}
            <Button type="submit" block loading={claim.isPending}>Send my gift here</Button>
          </form>
        </>
      )}
    </Container>
  );
}
