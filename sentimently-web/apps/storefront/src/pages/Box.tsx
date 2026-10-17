import { ApiError, rupees, shortDate } from '@sentimently/api';
import type { QuoteRequest } from '@sentimently/api';
import { Button, Container, EmptyState, ProblemList, SafeImage, SelectField, TextField } from '@sentimently/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MAX_QUANTITY, useBasket } from '../lib/basket';
import { CITY_KEY, PROMO_KEY, useStored } from '../lib/prefs';
import { QueryError } from '../lib/present';
import { useQuote, useStoreSettings } from '../lib/queries';

const OTHER = '__other__';

export function Box() {
  const basket = useBasket();
  const { data: settings } = useStoreSettings();
  const cities = Object.keys(settings?.deliveryRates ?? {});

  const [city, setCity] = useStored(CITY_KEY);
  const [promo, setPromo] = useStored(PROMO_KEY);
  const [promoInput, setPromoInput] = useState(promo);

  const hasPhysical = basket.lines.some((l) => l.type === 'physical');
  const ready = basket.lines.length > 0 && (!hasPhysical || city.trim().length > 0);
  const request: QuoteRequest = {
    lines: basket.asQuoteLines(),
    ...(hasPhysical ? { delivery: { city: city.trim() } } : {}),
    ...(promo ? { promoCode: promo } : {}),
  };
  const quote = useQuote(request, ready);

  const problems = quote.error instanceof ApiError && quote.error.status === 400 ? quote.error.details : [];
  const selectValue = cities.includes(city) ? city : city ? OTHER : '';
  const q = quote.data;

  if (!basket.lines.length) {
    return (
      <Container className="page">
        <title>Your gift box | Bloomora</title>
        <h1>Your gift box</h1>
        <EmptyState title="Your gift box is empty" message="Find something that says what you mean.">
          <Button as={Link} to="/shop">Browse gifts</Button>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container className="page">
      <title>Your gift box | Bloomora</title>
      <h1>Your gift box</h1>
      <div className="box">
        <section aria-label="Items">
          <ul className="box__lines" role="list">
            {basket.lines.map((l, i) => {
              const ql = q?.lines[i];
              return (
                <li key={l.id} className="box__line">
                  <div className="box__thumb" aria-hidden="true"><SafeImage src={l.image} name={l.name} /></div>
                  <div className="box__main">
                    <Link to={`/gifts/${l.slug}`} className="box__name">{l.name}</Link>
                    {l.personalisation && (
                      <p className="box__note">
                        For {l.personalisation.recipientName}. “{l.personalisation.message ? l.personalisation.message.slice(0, 60) : 'No message'}
                        {l.personalisation.message && l.personalisation.message.length > 60 ? '…' : ''}”
                      </p>
                    )}
                    {ql?.extras.length ? <p className="box__note">{ql.extras.map((e) => e.name).join(', ')}</p> : null}
                    <div className="box__controls">
                      {l.personalisation ? (
                        <Button as={Link} to={`/studio/${l.slug}?line=${l.id}`} variant="ghost" size="small">Edit</Button>
                      ) : (
                        <label>
                          <span className="sy-sr-only">Quantity of {l.name}</span>
                          <select className="sy-input sy-input--narrow" value={l.quantity} onChange={(e) => basket.setQuantity(l.id, Number(e.target.value))}>
                            {Array.from({ length: MAX_QUANTITY }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                      )}
                      <Button variant="ghost" size="small" onClick={() => basket.remove(l.id)} aria-label={`Remove ${l.name}`}>Remove</Button>
                    </div>
                  </div>
                  <p className="box__price">{rupees(ql ? ql.lineTotal : l.hintPrice * l.quantity)}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="box__summary" aria-label="Order summary">
          <h2>Summary</h2>
          {hasPhysical && (
            <>
              <SelectField
                label="Deliver to"
                value={selectValue}
                onChange={(e) => setCity(e.target.value === OTHER ? ' ' : e.target.value)}
                hint="Prices and dates depend on the city."
              >
                <option value="">Choose a city</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={OTHER}>Another city in Pakistan</option>
              </SelectField>
              {selectValue === OTHER && (
                <TextField label="City" value={city.trimStart()} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
              )}
            </>
          )}

          <form
            className="promo"
            onSubmit={(e) => { e.preventDefault(); setPromo(promoInput.trim()); }}
          >
            <TextField label="Promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} autoCapitalize="characters" />
            <Button type="submit" size="small" variant="secondary">Apply</Button>
          </form>
          {q?.promo && (
            <p role="status" className={q.promo.applied ? 'ok' : 'warn'}>
              {q.promo.applied ? `${q.promo.code}: ${q.promo.percent}% off (${rupees(q.promo.discount)})` : q.promo.reason}
            </p>
          )}

          <ProblemList problems={problems} />
          {quote.error && !problems.length && <QueryError error={quote.error} onRetry={() => quote.refetch()} retrying={quote.isFetching} what="the prices" />}
          {!ready && hasPhysical && <p className="sy-field__hint">Choose a delivery city to see the total.</p>}

          {q && !problems.length && (
            <dl className="totals" aria-busy={quote.isFetching}>
              <div><dt>Gifts</dt><dd>{rupees(q.itemsTotal)}</dd></div>
              {q.extrasTotal > 0 && <div><dt>Extras</dt><dd>{rupees(q.extrasTotal)}</dd></div>}
              {q.delivery && <div><dt>Delivery to {q.delivery.city}</dt><dd>{q.delivery.fee === 0 ? 'Free' : rupees(q.delivery.fee)}</dd></div>}
              {q.discount > 0 && <div><dt>Discount</dt><dd>-{rupees(q.discount)}</dd></div>}
              <div className="totals__total"><dt>Total</dt><dd>{rupees(q.total)}</dd></div>
            </dl>
          )}
          {q?.delivery && !problems.length && (
            <p className="sy-field__hint">
              {q.delivery.sameDay ? 'Can be delivered today.' : `Earliest delivery ${shortDate(q.delivery.earliestDate)}.`}
            </p>
          )}

          <Button as={Link} to="/checkout" block disabled={!q || !!problems.length || quote.isError}>Continue to checkout</Button>
          <Button variant="ghost" size="small" onClick={() => basket.clear()}>Empty gift box</Button>
        </aside>
      </div>
    </Container>
  );
}
