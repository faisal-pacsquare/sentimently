import { ApiError } from '@sentimently/api';
import type { Product } from '@sentimently/api';
import { Alert, Button, TextArea } from '@sentimently/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useToggleWishlist, useWishlist } from '../lib/account';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Heart button. Visitors who are not signed in are sent to sign in and brought back to this gift. */
function Wish({ product }: { product: Product }) {
  const auth = useAuth();
  const here = useLocation();
  const list = useWishlist();
  const toggle = useToggleWishlist();
  if (auth.status === 'out') {
    return <p><Link className="wish" to={`/login?next=${encodeURIComponent(here.pathname)}`}>♡ Save for later (sign in)</Link></p>;
  }
  if (auth.status !== 'in') return null;
  const saved = !!list.data?.some((p) => p.id === product.id);
  return (
    <p>
      <Button variant="ghost" size="small" aria-pressed={saved} disabled={list.isPending || toggle.isPending} onClick={() => toggle.mutate({ productId: product.id, on: !saved })}>
        {saved ? '♥ Saved' : '♡ Save for later'}
      </Button>
      {(toggle.error || list.error) && <span role="alert" className="muted"> That did not work. Please try again.</span>}
    </p>
  );
}

function ReviewForm({ product }: { product: Product }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const post = useMutation({
    mutationFn: () => api.addReview(product.slug, { rating, ...(text.trim() ? { text: text.trim() } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', product.slug] }),
  });
  if (auth.status !== 'in') return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (rating) post.mutate();
  };
  if (post.isSuccess) return <Alert tone="info">Thank you for your review.</Alert>;
  const refused = post.error instanceof ApiError && !post.error.isTemporary ? post.error.details[0] ?? post.error.message : null;
  return (
    <form className="review-form" onSubmit={submit} noValidate aria-label="Write a review">
      <h3>Write a review</h3>
      <fieldset className="rating-pick">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n}>
            <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
            <span>{n} ★</span>
          </label>
        ))}
      </fieldset>
      {submitted && !rating && <p role="alert" className="sy-field__error">Choose a rating from 1 to 5.</p>}
      <TextArea label="Your review (optional)" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      {refused && <Alert tone="error">{refused}</Alert>}
      {post.error && !refused && <Alert tone="error">That did not work. Please try again.</Alert>}
      <Button type="submit" loading={post.isPending}>Post review</Button>
    </form>
  );
}

export function AccountBits({ product }: { product: Product }) {
  return <ReviewForm product={product} />;
}
AccountBits.Wishlist = Wish;
