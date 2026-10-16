import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { BASE, SETTINGS, apiError, seen, server } from '../test/server';
import { renderApp } from '../test/render';

const mug = { id: 'a', productId: 'id-photo-mug', slug: 'photo-mug', name: 'Photo mug', type: 'physical', hintPrice: 999, quantity: 1 };
const card = { id: 'b', productId: 'id-egift-card', slug: 'egift-card', name: 'E-gift card', type: 'digital', hintPrice: 5000, quantity: 2 };

const fill = (lines: unknown[], city = 'Karachi') => {
  localStorage.setItem('sentimently.box.v1', JSON.stringify(lines));
  localStorage.setItem('sentimently.city', city);
};

const order = (over = {}) => ({
  order: { number: 'SY-1001', total: 1349, contactEmail: 'a@b.pk', ...over },
  payment: { method: 'cod' },
  replayed: false,
});

describe('checkout', () => {
  it('sends a visitor with an empty box back to the shop', async () => {
    renderApp('/checkout');
    expect(await screen.findByText('Your gift box is empty')).toBeInTheDocument();
  });

  it('shows what is missing, and places nothing, until the form is complete', async () => {
    fill([mug]);
    renderApp('/checkout');
    await userEvent.click(await screen.findByRole('button', { name: /place order/i }));
    expect(await screen.findByText(/Enter an email address/)).toBeInTheDocument();
    expect(screen.getByText('Enter the full delivery address (at least 10 characters).')).toBeInTheDocument();
    expect(screen.getByText('Choose how you would like to pay.')).toBeInTheDocument();
    expect(seen.some((s) => s.url.pathname.endsWith('/checkout'))).toBe(false);
  });

  it('places a cash-on-delivery order with an idempotency key and no prices, then shows the order number', async () => {
    fill([mug]);
    let key: string | null = null;
    let body: unknown;
    server.use(http.post(`${BASE}/checkout`, async ({ request }) => { key = request.headers.get('Idempotency-Key'); body = await request.json(); return HttpResponse.json(order()); }));
    renderApp('/checkout');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.pk');
    await userEvent.type(screen.getByLabelText('Your name'), 'Ayesha');
    await userEvent.type(screen.getByLabelText('Phone number'), '03001234567');
    await userEvent.type(screen.getByLabelText('Delivery address'), 'House 4, Street 2, DHA');
    await userEvent.click(screen.getByLabelText('Cash on delivery'));
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByText('SY-1001')).toBeInTheDocument();
    expect(key).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/price|total/i);
    expect(localStorage.getItem('sentimently.box.v1')).toBe('[]');
  });

  it('does not offer cash on delivery with a digital gift, and asks for each recipient', async () => {
    fill([mug, card]);
    renderApp('/checkout');
    expect(await screen.findByLabelText(/Cash on delivery/)).toBeDisabled();
    expect(screen.getAllByLabelText('Recipient email')).toHaveLength(2);
  });

  it('keeps the box and shows the server reasons when the order is refused', async () => {
    fill([mug]);
    server.use(http.post(`${BASE}/checkout`, () => apiError(400, 'validation', 'Bad', ['Photo mug: only 0 left'])));
    renderApp('/checkout');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.pk');
    await userEvent.type(screen.getByLabelText('Your name'), 'Ayesha');
    await userEvent.type(screen.getByLabelText('Phone number'), '03001234567');
    await userEvent.type(screen.getByLabelText('Delivery address'), 'House 4, Street 2, DHA');
    await userEvent.click(screen.getByLabelText('Cash on delivery'));
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    expect(await screen.findByText('Photo mug: only 0 left')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('sentimently.box.v1')).toContain('photo-mug'));
  });

  it('only offers the payment methods the shop has switched on', async () => {
    fill([mug]);
    server.use(http.get(`${BASE}/store`, () => HttpResponse.json({ ...SETTINGS, paymentMethods: ['bank_transfer'] })));
    renderApp('/checkout');
    expect(await screen.findByLabelText('Bank transfer')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cash on delivery/)).toBeNull();
  });
});

describe('paying by card', () => {
  const cardOrder = { order: { number: 'SN-CARD1', total: 1349, contactEmail: 'a@b.pk' }, payment: { method: 'card', redirectUrl: 'https://pay.example/x' }, replayed: false };
  const last = () => sessionStorage.setItem('sentimently.lastOrder', JSON.stringify(cardOrder));

  it('keeps the gift box when sending the shopper off to pay', async () => {
    fill([mug]);
    server.use(
      http.get(`${BASE}/store`, () => HttpResponse.json({ ...SETTINGS, paymentMethods: ['card'] })),
      http.post(`${BASE}/checkout`, () => HttpResponse.json(cardOrder)),
    );
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    renderApp('/checkout');
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.pk');
    await userEvent.type(screen.getByLabelText('Your name'), 'Ayesha');
    await userEvent.type(screen.getByLabelText('Phone number'), '03001234567');
    await userEvent.type(screen.getByLabelText('Delivery address'), 'House 4, Street 2, DHA');
    await userEvent.click(screen.getByLabelText('Debit or credit card'));
    await userEvent.click(screen.getByRole('button', { name: /place order/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/x'));
    expect(localStorage.getItem('sentimently.box.v1')).toContain('photo-mug');
    vi.unstubAllGlobals();
  });

  it('waits for the bank to confirm, then thanks the shopper and empties the box', async () => {
    fill([mug]);
    last();
    let status = 'awaiting_payment';
    server.use(http.post(`${BASE}/orders/track`, () => HttpResponse.json({ number: 'SN-CARD1', status, statusLabel: status, placedAt: '2026-10-16T00:00:00Z', deliveryDate: null, estimatedBy: null, timeline: [] })));
    renderApp('/order-placed?paid=1&order=SN-CARD1');
    expect(await screen.findByRole('heading', { name: 'Confirming your payment' })).toBeInTheDocument();
    status = 'paid';
    expect(await screen.findByRole('heading', { name: /we have your payment/i }, { timeout: 6000 })).toBeInTheDocument();
    expect(localStorage.getItem('sentimently.box.v1')).toBe('[]');
  }, 12000);

  it('on cancel, releases the order and keeps the box', async () => {
    fill([mug]);
    last();
    let cancelled = false;
    server.use(http.post(`${BASE}/orders/cancel`, () => { cancelled = true; return HttpResponse.json({ number: 'SN-CARD1', status: 'cancelled', refund: null }); }));
    renderApp('/order-placed?cancelled=1&order=SN-CARD1');
    expect(await screen.findByRole('heading', { name: 'Payment not completed' })).toBeInTheDocument();
    await waitFor(() => expect(cancelled).toBe(true));
    expect(screen.getByRole('link', { name: 'Back to gift box' })).toBeInTheDocument();
    expect(localStorage.getItem('sentimently.box.v1')).toContain('photo-mug');
  });
});
