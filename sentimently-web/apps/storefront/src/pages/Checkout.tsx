import { ApiError, rupees, shortDate, todayInPakistan } from '@sentimently/api';
import type { CheckoutLineInput, CheckoutRequest, PaymentMethod, QuoteRequest } from '@sentimently/api';
import { Alert, Button, Container, EmptyState, ProblemList, TextArea, TextField } from '@sentimently/ui';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBasket } from '../lib/basket';
import type { BoxLine } from '../lib/basket';
import { CITY_KEY, PROMO_KEY, saveLastOrder, useStored } from '../lib/prefs';
import { QueryError } from '../lib/present';
import { useQuote, useStoreSettings } from '../lib/queries';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  bank_transfer: 'Bank transfer',
  card: 'Debit or credit card',
};
const MESSAGE_MAX = 900;
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

interface CheckoutItem { key: string; line: BoxLine; digital: boolean }
interface Gift { recipientEmail: string; message: string; sendAt: string }
const emptyGift: Gift = { recipientEmail: '', message: '', sendAt: '' };

export function Checkout() {
  const basket = useBasket();
  const navigate = useNavigate();
  const { data: settings } = useStoreSettings();
  const [city] = useStored(CITY_KEY);
  const [promo] = useStored(PROMO_KEY);

  const { customer } = useAuth();
  const [email, setEmail] = useState(customer?.email ?? '');
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState('');
  const [date, setDate] = useState('');
  const [giftLink, setGiftLink] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod | ''>('');
  const [gifts, setGifts] = useState<Record<string, Gift>>({});
  const [submitted, setSubmitted] = useState(false);

  // A digital gift goes to one person, so a line of 3 becomes 3 gifts, each with its own recipient.
  const lines = basket.lines.flatMap<CheckoutItem>((l) =>
    l.type === 'digital'
      ? Array.from({ length: l.quantity }, (_, k) => ({ key: `${l.id}:${k}`, line: l, digital: true }))
      : [{ key: l.id, line: l, digital: false }],
  );
  const hasPhysical = lines.some((l) => !l.digital);
  const hasDigital = lines.some((l) => l.digital);
  const gift = (key: string) => gifts[key] ?? emptyGift;
  const setGift = (key: string, change: Partial<Gift>) => setGifts((g) => ({ ...g, [key]: { ...gift(key), ...change } }));

  const cityName = city.trim();
  const quoteRequest: QuoteRequest = {
    lines: lines.map(({ line }) => ({ productId: line.productId, quantity: line.type === 'digital' ? 1 : line.quantity, ...(line.personalisation ? { personalisation: line.personalisation } : {}) })),
    ...(hasPhysical ? { delivery: { city: cityName, method: giftLink ? ('gift_link' as const) : ('address' as const), ...(date ? { date } : {}) } } : {}),
    ...(promo ? { promoCode: promo } : {}),
    ...(emailOk(email) ? { email: email.trim() } : {}),
  };
  const quote = useQuote(quoteRequest, lines.length > 0 && (!hasPhysical || cityName.length > 0));
  const q = quote.data;
  const quoteProblems = quote.error instanceof ApiError && quote.error.status === 400 ? quote.error.details : [];

  const available = settings?.paymentMethods ?? [];
  const codOk = hasPhysical && !hasDigital && !giftLink;
  const methods = available.map((m) => ({ m, disabled: m === 'cod' && !codOk }));
  const chosen: PaymentMethod | '' = payment && methods.find((x) => x.m === payment && !x.disabled) ? payment : '';

  const errors = {
    email: emailOk(email) ? '' : 'Enter an email address so we can confirm your order.',
    name: name.trim() ? '' : 'Enter your name.',
    address: !hasPhysical || giftLink || address.trim().length >= 10 ? '' : 'Enter the full delivery address (at least 10 characters).',
    phone: !hasPhysical || giftLink || phone.trim().length >= 7 ? '' : 'Enter a phone number for the courier.',
    payment: chosen ? '' : 'Choose how you would like to pay.',
  };
  const giftErrors = (key: string) => {
    const g = gift(key);
    return {
      email: emailOk(g.recipientEmail) ? '' : 'Enter the email address this gift should be sent to.',
      message: [...g.message].length > MESSAGE_MAX ? `Keep the message to ${MESSAGE_MAX} characters.` : '',
    };
  };
  const digitalValid = lines.every((l) => !l.digital || (!giftErrors(l.key).email && !giftErrors(l.key).message));
  const valid = !errors.email && !errors.name && !errors.address && !errors.phone && !errors.payment && digitalValid;

  const request = (): CheckoutRequest => ({
    lines: lines.map(({ key, line, digital }): CheckoutLineInput => ({
      productId: line.productId,
      quantity: digital ? 1 : line.quantity,
      ...(line.personalisation ? { personalisation: line.personalisation } : {}),
      ...(digital
        ? {
            digital: {
              recipientEmail: gift(key).recipientEmail.trim(),
              ...(gift(key).message.trim() ? { message: gift(key).message.trim() } : {}),
              ...(gift(key).sendAt ? { sendAt: new Date(gift(key).sendAt).toISOString() } : {}),
            },
          }
        : {}),
    })),
    ...(hasPhysical
      ? {
          delivery: {
            city: cityName,
            method: giftLink ? ('gift_link' as const) : ('address' as const),
            ...(date ? { date } : {}),
            ...(!giftLink ? { address: address.trim(), phone: phone.trim() } : {}),
          },
        }
      : {}),
    ...(promo ? { promoCode: promo } : {}),
    contact: { email: email.trim(), name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
    paymentMethod: chosen as PaymentMethod,
  });

  // The same key is reused for a retry of the same order, so a double click or a flaky connection cannot place it twice.
  const attempt = useRef<{ key: string; body: string } | null>(null);
  const place = useMutation({
    mutationFn: () => {
      const body = request();
      const text = JSON.stringify(body);
      if (!attempt.current || attempt.current.body !== text) attempt.current = { key: newKey(), body: text };
      return api.checkout(body, attempt.current.key);
    },
    onSuccess: (res) => {
      saveLastOrder(res);
      if (res.payment.redirectUrl) {
        // Keep the gift box while they pay: if they cancel on the payment page they can try again.
        window.location.assign(res.payment.redirectUrl);
      } else {
        basket.clear();
        navigate('/order-placed', { replace: true });
      }
    },
  });
  const problems = place.error instanceof ApiError && place.error.status === 400 ? place.error.details : [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (valid && !place.isPending) place.mutate();
  };

  if (!basket.lines.length && !place.isSuccess) {
    return (
      <Container className="page">
        <title>Checkout | Sentimently</title>
        <h1>Checkout</h1>
        <EmptyState title="Your gift box is empty" message="Add a gift before checking out.">
          <Button as={Link} to="/shop">Browse gifts</Button>
        </EmptyState>
      </Container>
    );
  }
  if (hasPhysical && !cityName) {
    return (
      <Container className="page">
        <title>Checkout | Sentimently</title>
        <h1>Checkout</h1>
        <Alert tone="warn">Choose a delivery city in your gift box first, so we can work out delivery and dates.</Alert>
        <Button as={Link} to="/box">Back to gift box</Button>
      </Container>
    );
  }

  const show = (msg: string) => (submitted ? msg : '');
  const digitalLines = lines.filter((l) => l.digital);
  return (
    <Container className="page">
      <title>Checkout | Sentimently</title>
      <h1>Checkout</h1>
      <div className="box">
        <form className="checkout" onSubmit={submit} noValidate>
          <fieldset>
            <legend>Your details</legend>
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" hint="We send your confirmation here." error={show(errors.email)} />
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" error={show(errors.name)} />
            <TextField label={hasPhysical && !giftLink ? 'Phone number' : 'Phone number (optional)'} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" error={show(errors.phone)} />
          </fieldset>

          {hasPhysical && (
            <fieldset>
              <legend>Delivery to {cityName}</legend>
              <label className="studio__design">
                <input type="checkbox" checked={giftLink} onChange={(e) => setGiftLink(e.target.checked)} />
                <span>Let them choose where it goes: we give you a private link to send</span>
              </label>
              {!giftLink && (
                <TextArea label="Delivery address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} autoComplete="street-address" error={show(errors.address)} />
              )}
              <TextField label="Deliver on (optional)" type="date" min={todayInPakistan()} value={date} onChange={(e) => setDate(e.target.value)} hint="Leave empty for the earliest date." />
            </fieldset>
          )}

          {digitalLines.map(({ key, line }, i) => {
            const g = gift(key);
            const err = giftErrors(key);
            return (
              <fieldset key={key}>
                <legend>{line.name}{digitalLines.length > 1 ? ` (${i + 1})` : ''}: who gets it?</legend>
                <TextField label="Recipient email" type="email" value={g.recipientEmail} onChange={(e) => setGift(key, { recipientEmail: e.target.value })} error={show(err.email)} />
                <TextArea label="Message (optional)" rows={3} value={g.message} onChange={(e) => setGift(key, { message: e.target.value })} error={show(err.message)} />
                <TextField label="Send at (optional)" type="datetime-local" value={g.sendAt} onChange={(e) => setGift(key, { sendAt: e.target.value })} hint="Leave empty to send as soon as you have paid." />
              </fieldset>
            );
          })}

          <fieldset>
            <legend>Payment</legend>
            {methods.map(({ m, disabled }) => (
              <label key={m} className="studio__design">
                <input type="radio" name="payment" value={m} checked={chosen === m} disabled={disabled} onChange={() => setPayment(m)} />
                <span>{PAYMENT_LABEL[m]}{disabled ? ' (not available for this order)' : ''}</span>
              </label>
            ))}
            {submitted && errors.payment && <p className="sy-field__error" role="alert">{errors.payment}</p>}
          </fieldset>

          <ProblemList problems={problems} />
          {place.error && !problems.length && (
            <QueryError error={place.error} onRetry={() => place.mutate()} retrying={place.isPending} what="your order" />
          )}
          <Button type="submit" block loading={place.isPending} disabled={quote.isError}>
            Place order{q ? ` · ${rupees(q.total)}` : ''}
          </Button>
        </form>

        <aside className="box__summary" aria-label="Order summary">
          <h2>Summary</h2>
          <ul role="list" className="box__lines">
            {(q?.lines ?? []).map((l, i) => (
              <li key={i} className="co-line"><span>{l.quantity} × {l.name}</span><span>{rupees(l.lineTotal)}</span></li>
            ))}
          </ul>
          <ProblemList problems={quoteProblems} />
          {quote.error && !quoteProblems.length && <QueryError error={quote.error} onRetry={() => quote.refetch()} retrying={quote.isFetching} what="the prices" />}
          {q && !quoteProblems.length && (
            <dl className="totals" aria-busy={quote.isFetching}>
              <div><dt>Gifts</dt><dd>{rupees(q.itemsTotal)}</dd></div>
              {q.extrasTotal > 0 && <div><dt>Extras</dt><dd>{rupees(q.extrasTotal)}</dd></div>}
              {q.delivery && <div><dt>Delivery</dt><dd>{q.delivery.fee === 0 ? 'Free' : rupees(q.delivery.fee)}</dd></div>}
              {q.discount > 0 && <div><dt>Discount{q.promo?.applied ? ` (${q.promo.code})` : ''}</dt><dd>-{rupees(q.discount)}</dd></div>}
              <div className="totals__total"><dt>Total</dt><dd>{rupees(q.total)}</dd></div>
            </dl>
          )}
          {q?.delivery && <p className="sy-field__hint">{q.delivery.sameDay ? 'Can be delivered today.' : `Earliest delivery ${shortDate(q.delivery.earliestDate)}.`}</p>}
          <Button as={Link} to="/box" variant="ghost" size="small">Change gift box</Button>
        </aside>
      </div>
    </Container>
  );
}
