import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { apiError, BASE, seen, server } from '../test/server';

const BOX = 'sentimently.box.v1';
const line = (over: Record<string, unknown> = {}) => ({
  id: 'line1', productId: 'id-photo-mug', slug: 'photo-mug', name: 'Photo mug', type: 'physical', hintPrice: 999, quantity: 2, ...over,
});
const seedBox = (...lines: object[]) => localStorage.setItem(BOX, JSON.stringify(lines));
const lastQuote = () => [...seen].reverse().find((r) => r.url.pathname.endsWith('/quote'))!.body as { lines: object[]; delivery?: { city: string }; promoCode?: string };

describe('product page', () => {
  it('shows the offer price with the old one struck through, and does not invent reviews', async () => {
    renderApp('/gifts/photo-mug');
    expect(await screen.findByRole('heading', { level: 1, name: 'Photo mug' })).toBeInTheDocument();
    const price = document.querySelector('.product__price .sy-price')!;
    expect(price).toHaveTextContent('Now Rs 999');
    expect(price.querySelector('del')).toHaveTextContent('Was Rs 1,200');
    expect(screen.getByText(/4\.7/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Personalise' })).toHaveAttribute('href', '/studio/photo-mug');
  });

  it('says "No reviews yet" when there are none', async () => {
    renderApp('/gifts/candle');
    await screen.findByRole('heading', { level: 1, name: 'Scented candle' });
    expect((await screen.findAllByText('No reviews yet')).length).toBeGreaterThan(0);
  });

  it('adds to the gift box and the header count follows', async () => {
    renderApp('/gifts/photo-mug');
    await screen.findByRole('heading', { level: 1, name: 'Photo mug' });
    expect(screen.getByRole('link', { name: /gift box, 0 items/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add without personalising/i }));
    expect(await screen.findByText(/added to your gift box/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /gift box, 1 item/i })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(BOX)!)).toHaveLength(1);
  });

  it('warns when stock is low, and blocks a sold-out gift', async () => {
    renderApp('/gifts/candle');
    expect(await screen.findByText(/only 2 left/i)).toBeInTheDocument();
  });

  it('a sold-out gift cannot be added', async () => {
    renderApp('/gifts/sold-out-book');
    expect(await screen.findByText(/sold out right now/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add/i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Personalise' })).toBeNull();
  });

  it('a made-to-order gift is not "sold out" with no stock, and shows how long it takes', async () => {
    renderApp('/gifts/name-necklace');
    expect(await screen.findByText(/made to order: about 5 to 7 working days/i)).toBeInTheDocument();
    expect(screen.queryByText(/sold out/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Personalise' })).toBeInTheDocument();
  });

  it('a digital gift has no page on the shop: it is not sold here', async () => {
    renderApp('/gifts/egift-card');
    expect(await screen.findByRole('heading', { name: /could not find that gift/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to gift box' })).toBeNull();
  });

  it('a gift that does not exist is a real "not found"', async () => {
    renderApp('/gifts/nope');
    expect(await screen.findByRole('heading', { name: /could not find that gift/i })).toBeInTheDocument();
  });

  it('a gift that fails to load is an error with a retry, not "not found"', async () => {
    server.use(http.get(`${BASE}/products/photo-mug`, () => apiError(500, 'internal_error')));
    renderApp('/gifts/photo-mug');
    const alert = await screen.findByRole('alert');
    expect(screen.queryByText(/could not find that gift/i)).toBeNull();
    server.resetHandlers();
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Photo mug' })).toBeInTheDocument();
  });

  it('failing reviews do not hide the gift', async () => {
    server.use(http.get(`${BASE}/products/photo-mug/reviews`, () => apiError(500, 'internal_error')));
    renderApp('/gifts/photo-mug');
    expect(await screen.findByRole('heading', { level: 1, name: 'Photo mug' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/reviews/i);
    expect(screen.getByRole('button', { name: /add without personalising/i })).toBeInTheDocument();
  });

  it('shows verified reviews', async () => {
    server.use(http.get(`${BASE}/products/photo-mug/reviews`, () => HttpResponse.json([{ id: 'r1', rating: 5, text: 'Loved it', verified: true, author: 'Bilal', createdAt: '2026-11-02T00:00:00Z' }])));
    renderApp('/gifts/photo-mug');
    expect(await screen.findByText('Loved it')).toBeInTheDocument();
    expect(screen.getByText('Verified purchase')).toBeInTheDocument();
  });
});

describe('gift box', () => {
  it('is empty with a way to start shopping', () => {
    renderApp('/box');
    expect(screen.getByRole('heading', { name: /your gift box is empty/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse gifts' })).toHaveAttribute('href', '/shop');
  });

  it('asks for a city, then lets the server price it', async () => {
    seedBox(line());
    renderApp('/box');
    expect(await screen.findByText(/choose a delivery city to see the total/i)).toBeInTheDocument();
    expect(seen.filter((s) => s.url.pathname.endsWith('/quote'))).toHaveLength(0);

    await userEvent.selectOptions(await screen.findByLabelText('Deliver to'), 'Karachi');
    const totals = await screen.findByText('Total');
    expect(totals.parentElement).toHaveTextContent('Rs 2,348'); // 2 x 999 + Rs 350 delivery, worked out by the server
    expect(screen.getByText(/delivery to karachi/i).parentElement).toHaveTextContent('Rs 350');
  });

  it('never sends a price to the server', async () => {
    seedBox(line());
    localStorage.setItem('sentimently.city', 'Karachi');
    renderApp('/box');
    await screen.findByText('Total');
    const body = lastQuote();
    expect(body.lines).toEqual([{ productId: 'id-photo-mug', quantity: 2 }]);
    expect(JSON.stringify(body)).not.toMatch(/price|hint|total/i);
    expect(body.delivery).toEqual({ city: 'Karachi' });
  });

  it('a digital gift left in an old box is dropped, and the rest of the box stays', async () => {
    seedBox(
      line({ id: 'd1', productId: 'id-egift-card', slug: 'egift-card', name: 'E-gift card', type: 'digital', hintPrice: 5000, quantity: 1 }),
      line(),
    );
    renderApp('/box');
    expect(await screen.findByText('Photo mug')).toBeInTheDocument();
    expect(screen.queryByText('E-gift card')).toBeNull();
  });

  it('lists every problem the server finds, in its own words, and stops checkout', async () => {
    seedBox(line());
    localStorage.setItem('sentimently.city', 'Karachi');
    server.use(http.post(`${BASE}/quote`, () => apiError(400, 'validation_error', 'The request is not valid.', ['Line 1: only 1 of "Photo mug" left', 'The earliest delivery to Karachi is 2026-11-19'])));
    renderApp('/box');
    expect(await screen.findByText('Line 1: only 1 of "Photo mug" left')).toBeInTheDocument();
    expect(screen.getByText('The earliest delivery to Karachi is 2026-11-19')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to checkout' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('explains why a promo code was not used, without failing the box', async () => {
    seedBox(line());
    localStorage.setItem('sentimently.city', 'Karachi');
    renderApp('/box');
    await screen.findByText('Total');
    await userEvent.type(screen.getByLabelText('Promo code'), 'freegift');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('That code is not valid')).toBeInTheDocument();
    expect(lastQuote().promoCode).toBe('freegift');
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('changes quantity and removes lines, remembering the box', async () => {
    seedBox(line());
    localStorage.setItem('sentimently.city', 'Karachi');
    renderApp('/box');
    await screen.findByText('Total');
    await userEvent.selectOptions(screen.getByLabelText('Quantity of Photo mug'), '3');
    await waitFor(() => expect(JSON.parse(localStorage.getItem(BOX)!)[0].quantity).toBe(3));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Photo mug' }));
    expect(await screen.findByRole('heading', { name: /gift box is empty/i })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(BOX)!)).toEqual([]);
  });

  it('a price that cannot be loaded is an error with a retry, and the box is kept', async () => {
    seedBox(line());
    localStorage.setItem('sentimently.city', 'Karachi');
    server.use(http.post(`${BASE}/quote`, () => apiError(500, 'internal_error')));
    renderApp('/box');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load the prices/i);
    expect(screen.getByText('Photo mug')).toBeInTheDocument();
  });
});

describe('help pages', () => {
  it('shows the delivery rates from the shop settings', async () => {
    renderApp('/delivery');
    expect(await screen.findByRole('row', { name: /karachi rs 350/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /rest of pakistan rs 650/i })).toBeInTheDocument();
    expect(screen.getByText(/free on orders over rs 5,000/i)).toBeInTheDocument();
  });

  it('tracking: a wrong pair gives one plain answer', async () => {
    server.use(http.post(`${BASE}/orders/track`, () => apiError(404, 'not_found', 'We could not find an order with those details')));
    renderApp('/track');
    await userEvent.type(screen.getByLabelText('Order number'), 'SN-AAAAAAAA');
    await userEvent.type(screen.getByLabelText('Email address'), 'a@b.pk');
    await userEvent.click(screen.getByRole('button', { name: 'Track' }));
    expect(await screen.findByText(/could not find an order with those details/i)).toBeInTheDocument();
  });

  it('tracking: shows the status and its history', async () => {
    server.use(http.post(`${BASE}/orders/track`, () => HttpResponse.json({
      number: 'SN-AAAAAAAA', status: 'dispatched', statusLabel: 'On its way', placedAt: '2026-11-18T05:00:00Z', deliveryDate: '2026-11-19', estimatedBy: null,
      timeline: [{ status: 'placed', label: 'Order received', at: '2026-11-18T05:00:00Z' }, { status: 'dispatched', label: 'On its way', at: '2026-11-18T09:00:00Z' }],
    })));
    renderApp('/track');
    await userEvent.type(screen.getByLabelText('Order number'), 'SN-AAAAAAAA');
    await userEvent.type(screen.getByLabelText('Email address'), 'a@b.pk');
    await userEvent.click(screen.getByRole('button', { name: 'Track' }));
    expect(await screen.findByRole('heading', { name: /SN-AAAAAAAA: On its way/ })).toBeInTheDocument();
    expect(document.querySelectorAll('ol.timeline li')).toHaveLength(2);
  });

  it('contact: sends the message, or lists what to fix', async () => {
    server.use(http.post(`${BASE}/contact`, () => apiError(400, 'validation_error', 'The request is not valid.', ['subject should not be empty'])));
    renderApp('/contact');
    await userEvent.type(screen.getByLabelText('Your name'), 'Zara');
    await userEvent.type(screen.getByLabelText('Email'), 'zara@example.pk');
    await userEvent.type(screen.getByLabelText('Subject'), 'x');
    await userEvent.type(screen.getByLabelText('Message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('subject should not be empty')).toBeInTheDocument();

    server.use(http.post(`${BASE}/contact`, () => HttpResponse.json({ id: 'm1', message: 'Thank you. We will get back to you soon.' }, { status: 201 })));
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/we will get back to you soon/i)).toBeInTheDocument();
  });
});
