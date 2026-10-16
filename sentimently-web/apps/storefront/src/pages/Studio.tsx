import { ApiError, rupees } from '@sentimently/api';
import type { PersonalisationInput, PersonalisationOptions, Product as ProductT, QuoteRequest } from '@sentimently/api';
import { Button, Container, ProblemList, SelectField, TextArea, TextField } from '@sentimently/ui';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useBasket } from '../lib/basket';
import type { BoxLine } from '../lib/basket';
import { QueryError } from '../lib/present';
import { usePersonalisationOptions, useProduct, useQuote } from '../lib/queries';
import { NotFound } from './NotFound';

/** Characters as people count them: an emoji or an Urdu letter with a mark is one, not two. */
export const countCharacters = (s: string) => Array.from(s).length;

function StudioForm({ product, options, editing }: { product: ProductT; options: PersonalisationOptions; editing?: BoxLine }) {
  const basket = useBasket();
  const navigate = useNavigate();
  const start = editing?.personalisation;
  const [recipientName, setRecipientName] = useState(start?.recipientName ?? '');
  const [relationship, setRelationship] = useState(start?.relationship ?? '');
  const [cardDesign, setCardDesign] = useState(start?.cardDesign ?? options.cardDesigns[0] ?? '');
  const [message, setMessage] = useState(start?.message ?? '');
  const [extras, setExtras] = useState<string[]>(start?.extras ?? []);
  const [submitted, setSubmitted] = useState(false);

  const used = countCharacters(message);
  const max = options.messageMaxLength;
  const over = used > max;

  const errors = {
    recipientName: recipientName.trim() ? '' : 'Tell us who this gift is for.',
    relationship: relationship ? '' : 'Choose how they are related to you.',
    message: over ? `Your message is ${used - max} character${used - max === 1 ? '' : 's'} too long.` : '',
  };
  const valid = !errors.recipientName && !errors.relationship && !errors.message;

  const personalisation: PersonalisationInput = {
    recipientName: recipientName.trim(),
    relationship,
    cardDesign,
    ...(message.trim() ? { message: message.trim() } : {}),
    ...(extras.length ? { extras } : {}),
  };

  // The server prices it, extras included. We only ask once the form could be accepted.
  const request: QuoteRequest = { lines: [{ productId: product.id, quantity: 1, personalisation }] };
  const quote = useQuote(request, valid);
  const problems = quote.error instanceof ApiError && quote.error.status === 400 ? quote.error.details : [];
  const line = quote.data?.lines[0];

  const toggle = (code: string) => setExtras((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    if (editing) basket.update(editing.id, { personalisation });
    else {
      basket.add({
        productId: product.id, slug: product.slug, name: product.name, image: product.imageUrls?.[0],
        type: product.type, hintPrice: product.effectivePrice, personalisation,
      });
    }
    navigate('/box');
  };

  return (
    <Container className="page">
      <title>{`Personalise ${product.name} | Sentimently`}</title>
      <nav aria-label="Breadcrumb" className="crumbs">
        <Link to="/shop">All gifts</Link> / <Link to={`/gifts/${product.slug}`}>{product.name}</Link> / <span aria-current="page">Personalise</span>
      </nav>
      <h1>{editing ? 'Edit your personalisation' : `Personalise ${product.name}`}</h1>

      <div className="studio">
        <form className="studio__form" onSubmit={submit} noValidate>
          <TextField
            label="Who is it for?"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            autoComplete="off"
            error={submitted ? errors.recipientName : ''}
          />
          <SelectField
            label="They are your…"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            error={submitted ? errors.relationship : ''}
          >
            <option value="">Choose one</option>
            {options.relationships.map((r) => <option key={r} value={r}>{r}</option>)}
          </SelectField>

          <fieldset className="studio__designs">
            <legend>Card design</legend>
            {options.cardDesigns.map((d) => (
              <label key={d} className="studio__design">
                <input type="radio" name="cardDesign" value={d} checked={cardDesign === d} onChange={() => setCardDesign(d)} />
                <span>{d}</span>
              </label>
            ))}
          </fieldset>

          <div>
            <TextArea
              label="Your message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              hint="Optional. It is printed on the card."
              error={errors.message}
            />
            <p className={`studio__count${over ? ' studio__count--over' : ''}`} aria-live="polite">
              {used} / {max} characters
            </p>
            {options.starterLines.length > 0 && (
              <details className="studio__starters">
                <summary>Help me write it</summary>
                <ul role="list">
                  {options.starterLines.map((s) => (
                    <li key={s}>
                      <button type="button" className="studio__starter" onClick={() => setMessage(s)}>{s}</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {options.extras.length > 0 && (
            <fieldset className="studio__extras">
              <legend>Add something extra</legend>
              {options.extras.map((x) => (
                <label key={x.code} className="studio__extra">
                  <input type="checkbox" checked={extras.includes(x.code)} onChange={() => toggle(x.code)} />
                  <span>{x.name}</span>
                  <span className="studio__extra-price">+ {rupees(x.price)}</span>
                </label>
              ))}
            </fieldset>
          )}

          <ProblemList problems={problems} />
          {quote.error && !problems.length && <QueryError error={quote.error} onRetry={() => quote.refetch()} retrying={quote.isFetching} what="the price" />}

          <div className="studio__total" aria-live="polite">
            {line ? <>Total for this gift: <strong>{rupees(line.lineTotal)}</strong></> : <>From {rupees(product.effectivePrice)}</>}
          </div>
          <Button type="submit" block>{editing ? 'Save changes' : 'Add to gift box'}</Button>
        </form>

        <aside className="studio__preview" aria-label="Preview of your card">
          <div className={`card-preview card-preview--${cardDesign.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
            <p className="card-preview__to">Dear {recipientName.trim() || '…'},</p>
            <p className="card-preview__msg">{message.trim() || 'Your message will appear here.'}</p>
            <p className="card-preview__from">With love</p>
          </div>
        </aside>
      </div>
    </Container>
  );
}

export function Studio() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const basket = useBasket();
  const product = useProduct(slug);
  const options = usePersonalisationOptions();

  if (product.error) {
    if (product.error instanceof ApiError && product.error.isNotFound) return <NotFound what="that gift" />;
    return <Container className="page"><QueryError error={product.error} onRetry={() => product.refetch()} retrying={product.isFetching} what="this gift" /></Container>;
  }
  if (options.error) {
    return <Container className="page"><QueryError error={options.error} onRetry={() => options.refetch()} retrying={options.isFetching} what="the personalisation choices" /></Container>;
  }
  if (product.isPending || options.isPending) {
    return <Container className="page"><div className="sy-skeleton" style={{ height: '22rem' }} aria-busy="true" aria-label="Loading" /></Container>;
  }
  if (product.data.type !== 'physical') {
    return <NotFound what="a personalisation page for that gift" />;
  }

  const lineId = params.get('line');
  const editing = lineId ? basket.lines.find((l) => l.id === lineId && l.productId === product.data.id) : undefined;
  // key: opening a different line to edit starts a fresh form
  return <StudioForm key={editing?.id ?? 'new'} product={product.data} options={options.data} editing={editing} />;
}
