import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { BASE, apiError, server } from '../test/server';

describe('gift link', () => {
  const preview = (status: string) => http.get(`${BASE}/gift-links/tok1`, () => HttpResponse.json({ status, recipientName: 'Ayesha', city: 'Lahore' }));

  it('asks the recipient where to deliver, and checks the address and phone first', async () => {
    server.use(preview('ready'));
    renderApp('/gift/tok1');
    expect(await screen.findByRole('heading', { name: 'A gift for Ayesha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send my gift here' }));
    expect(await screen.findByText(/Enter the full delivery address/)).toBeInTheDocument();
    expect(screen.getByText('Enter a phone number for the courier.')).toBeInTheDocument();
  });

  it('claims the gift', async () => {
    let sent: unknown;
    server.use(preview('ready'), http.post(`${BASE}/gift-links/tok1/claim`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ message: 'Your gift is on its way.' }); }));
    renderApp('/gift/tok1');
    await userEvent.type(await screen.findByLabelText('Delivery address'), 'House 4, Street 2, Gulberg');
    await userEvent.type(screen.getByLabelText('Phone number'), '03001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Send my gift here' }));
    expect(await screen.findByText('Your gift is on its way.')).toBeInTheDocument();
    expect(sent).toEqual({ address: 'House 4, Street 2, Gulberg', phone: '03001234567' });
  });

  it('explains an expired or already claimed link', async () => {
    server.use(preview('expired'));
    const first = renderApp('/gift/tok1');
    expect(await screen.findByRole('heading', { name: 'This gift link has expired' })).toBeInTheDocument();
    first.unmount();
    server.use(preview('claimed'));
    renderApp('/gift/tok1');
    expect(await screen.findByRole('heading', { name: 'This gift is already on its way' })).toBeInTheDocument();
  });

  it('says "not found" only for a link that does not exist, and offers a retry for a failure', async () => {
    server.use(http.get(`${BASE}/gift-links/tok1`, () => apiError(404, 'not_found')));
    const first = renderApp('/gift/tok1');
    expect(await screen.findByRole('heading', { name: /could not find/i })).toBeInTheDocument();
    first.unmount();
    server.use(http.get(`${BASE}/gift-links/tok1`, () => apiError(500, 'internal')));
    renderApp('/gift/tok1');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('shows the claim form again with the reason if someone else claimed it first', async () => {
    server.use(preview('ready'), http.post(`${BASE}/gift-links/tok1/claim`, () => apiError(409, 'conflict', 'This gift has already been claimed')));
    renderApp('/gift/tok1');
    await userEvent.type(await screen.findByLabelText('Delivery address'), 'House 4, Street 2, Gulberg');
    await userEvent.type(screen.getByLabelText('Phone number'), '03001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Send my gift here' }));
    expect(await screen.findByRole('heading', { name: 'This gift is already on its way' })).toBeInTheDocument();
  });
});

describe('cancelling', () => {
  const fillIn = async () => {
    await userEvent.type(await screen.findByLabelText('Order number'), 'SN-AAA111');
    await userEvent.type(screen.getByLabelText('Email used for the order'), 'zara@example.pk');
  };

  it('cancels and shows when the refund is due', async () => {
    let sent: unknown;
    server.use(http.post(`${BASE}/orders/cancel`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ number: 'SN-AAA111', status: 'cancelled', refund: { amount: 1349, dueBy: '2026-10-21', note: 'Bank transfers take 5 to 7 days.' } }); }));
    renderApp('/cancel-order');
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this order' }));
    expect(await screen.findByText(/Order SN-AAA111 is cancelled/)).toBeInTheDocument();
    expect(screen.getByText(/Rs 1,349/)).toBeInTheDocument();
    expect(sent).toEqual({ number: 'SN-AAA111', email: 'zara@example.pk' });
  });

  it('shows the shop reason when it is too late to cancel', async () => {
    server.use(http.post(`${BASE}/orders/cancel`, () => apiError(409, 'conflict', 'We have started preparing your order. Please contact us.')));
    renderApp('/cancel-order');
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this order' }));
    expect(await screen.findByText('We have started preparing your order. Please contact us.')).toBeInTheDocument();
  });

  it('does not say the order is missing when the server is down', async () => {
    server.use(http.post(`${BASE}/orders/cancel`, () => apiError(503, 'unavailable')));
    renderApp('/cancel-order');
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel this order' }));
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/could not find an order/)).toBeNull();
  });

  it('asks for the details before calling the server', async () => {
    renderApp('/cancel-order');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel this order' }));
    expect(await screen.findByText('Enter the order number.')).toBeInTheDocument();
  });
});

describe('returns', () => {
  const fillIn = async () => {
    await userEvent.type(await screen.findByLabelText('Order number'), 'SN-AAA111');
    await userEvent.type(screen.getByLabelText('Email used for the order'), 'zara@example.pk');
    await userEvent.type(screen.getByLabelText('What happened?'), 'Not what I wanted');
  };

  it('needs the unused confirmation for a return', async () => {
    renderApp('/returns');
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(/confirm the item is unused/)).toBeInTheDocument();
  });

  it('sends a return', async () => {
    let sent: unknown;
    server.use(http.post(`${BASE}/orders/returns`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ id: 'r1', status: 'requested', refundAmount: 999 }, { status: 201 }); }));
    renderApp('/returns');
    await fillIn();
    await userEvent.click(screen.getByLabelText(/unused and in its original packaging/));
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(/we have your request/)).toBeInTheDocument();
    expect(sent).toEqual({ number: 'SN-AAA111', email: 'zara@example.pk', kind: 'return', reason: 'Not what I wanted', confirmUnused: true });
  });

  it('needs a photo link for damage, and sends it', async () => {
    let sent: unknown;
    server.use(http.post(`${BASE}/orders/returns`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ id: 'r2', status: 'requested', refundAmount: 1349 }, { status: 201 }); }));
    renderApp('/returns');
    await userEvent.click(await screen.findByLabelText('It arrived damaged'));
    await fillIn();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Add a link to at least one photo of the damage.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Photo link 1'), 'https://photos.example/mug.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(sent).toMatchObject({ kind: 'damaged', photoUrls: ['https://photos.example/mug.jpg'] }));
    expect(await screen.findByText(/we have your request/)).toBeInTheDocument();
  });

  it('shows the shop reason when the return window has passed', async () => {
    server.use(http.post(`${BASE}/orders/returns`, () => apiError(409, 'conflict', 'The 7 day return window has passed')));
    renderApp('/returns');
    await fillIn();
    await userEvent.click(screen.getByLabelText(/unused and in its original packaging/));
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('The 7 day return window has passed')).toBeInTheDocument();
  });
});

describe('checking a gift card', () => {
  it('shows the value and expiry of a real code', async () => {
    server.use(http.post(`${BASE}/gift-cards/check`, () => HttpResponse.json({ valid: true, kind: 'egift', amount: 5000, expiresAt: '2027-10-16T00:00:00.000Z' })));
    renderApp('/gift-card');
    await userEvent.type(await screen.findByLabelText('Gift card code'), 'ABCD-1234');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText(/e-gift card is valid for Rs 5,000/)).toBeInTheDocument();
  });

  it('does not reveal more than "not found" for a wrong code', async () => {
    server.use(http.post(`${BASE}/gift-cards/check`, () => HttpResponse.json({ valid: false, reason: 'not_found' })));
    renderApp('/gift-card');
    await userEvent.type(await screen.findByLabelText('Gift card code'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText(/could not find that code/)).toBeInTheDocument();
  });
});
