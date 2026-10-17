import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { session } from '../lib/core';
import { apiError, renderAdmin, staffUser } from '../test/render';
import { BASE, server } from '../test/setup';

const row = { id: 'o1', number: 'SN-AAA111', status: 'placed', createdAt: '2026-10-10T08:00:00.000Z', contactName: 'Zara', contactEmail: 'zara@example.pk', city: 'Karachi', deliveryDate: '2026-10-12', total: 1349, paymentMethod: 'cod', itemCount: 1, personalised: true };
const order = (status: string, over = {}) => ({
  order: {
    id: 'o1', number: 'SN-AAA111', status, createdAt: '2026-10-10T08:00:00.000Z', contactEmail: 'zara@example.pk', contactName: 'Zara', paymentMethod: 'cod',
    itemsTotal: 999, extrasTotal: 0, deliveryFee: 350, discount: 0, total: 1349, city: 'Karachi', deliveryDate: '2026-10-12',
    delivery: { method: 'address', address: 'House 4, DHA', city: 'Karachi', phone: '0300', attempts: 0 },
    lines: [{ productId: 'p1', slug: 'mug', name: 'Photo mug', type: 'physical', quantity: 1, unitPrice: 999, lineTotal: 999, extras: [], personalisation: { recipientName: 'Ayesha', relationship: 'Friend', cardDesign: 'Classic', message: 'Happy birthday' } }],
    events: [{ type: 'created', to: 'placed', at: '2026-10-10T08:00:00.000Z' }], ...over,
  },
  payments: [], digitalGifts: [],
});

describe('signing in', () => {
  it('sends a signed-out visitor to sign in, and staff land on the orders', async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json({ accessToken: 'tok', customer: staffUser })),
      http.get(`${BASE}/me`, () => HttpResponse.json(staffUser)),
      http.get(`${BASE}/admin/orders`, () => HttpResponse.json({ data: [], page: 1, pageSize: 25, total: 0 })),
    );
    renderAdmin('/', null);
    await userEvent.type(await screen.findByLabelText('Email'), 'staff@studio.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'staff-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeInTheDocument();
  });

  it('tells a customer account that this is for staff', async () => {
    renderAdmin('/', 'customer');
    expect(await screen.findByText('This is for studio staff')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Orders' })).toBeNull();
  });

  it('shows a wrong password in the server words', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => apiError(401, 'unauthorized', 'Email or password is not right')));
    renderAdmin('/login', null);
    await userEvent.type(await screen.findByLabelText('Email'), 'a@b.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is not right')).toBeInTheDocument();
  });

  it('does not sign staff out when the server fails', async () => {
    session.set('tok');
    server.use(http.get(`${BASE}/me`, () => apiError(500, 'internal')));
    renderAdmin('/', null);
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(session.get()).toBe('tok');
  });
});

describe('orders list', () => {
  it('shows the orders that need action first, and searches', async () => {
    const seen: string[] = [];
    server.use(http.get(`${BASE}/admin/orders`, ({ request }) => { seen.push(new URL(request.url).search); return HttpResponse.json({ data: [row], page: 1, pageSize: 25, total: 1 }); }));
    renderAdmin('/');
    expect(await screen.findByRole('link', { name: 'SN-AAA111' })).toHaveAttribute('href', '/orders/o1');
    expect(seen[0]).toContain('status=awaiting_payment%2Cplaced%2Cpaid');
    await userEvent.type(screen.getByLabelText(/Search by order number/), 'zara');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(seen.some((s) => s.includes('q=zara'))).toBe(true));
  });

  it('shows a retry, not an empty list, when loading fails', async () => {
    server.use(http.get(`${BASE}/admin/orders`, () => apiError(500, 'internal')));
    renderAdmin('/');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('No orders here')).toBeNull();
  });

  it('says so when a list is truly empty', async () => {
    server.use(http.get(`${BASE}/admin/orders`, () => HttpResponse.json({ data: [], page: 1, pageSize: 25, total: 0 })));
    renderAdmin('/');
    expect(await screen.findByText('No orders here')).toBeInTheDocument();
  });
});

describe('order detail', () => {
  it('shows what the studio needs: the card message, address and cash to collect', async () => {
    server.use(http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json(order('placed'))));
    renderAdmin('/orders/o1');
    expect(await screen.findByText('Happy birthday')).toBeInTheDocument();
    expect(screen.getByText(/House 4, DHA/)).toBeInTheDocument();
    expect(screen.getByText(/Collect Rs 1,349 in cash/)).toBeInTheDocument();
  });

  it('moves the order on and shows the new state', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json(order('placed'))),
      http.post(`${BASE}/admin/orders/o1/status`, async ({ request }) => { sent = await request.json(); return HttpResponse.json(order('preparing')); }),
    );
    renderAdmin('/orders/o1');
    await userEvent.click(await screen.findByRole('button', { name: 'Start preparing' }));
    await waitFor(() => expect(sent).toEqual({ status: 'preparing' }));
    expect(await screen.findByRole('button', { name: 'Mark dispatched' })).toBeInTheDocument();
  });

  it('sends the courier and tracking number when dispatching', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json(order('preparing'))),
      http.post(`${BASE}/admin/orders/o1/status`, async ({ request }) => { sent = await request.json(); return HttpResponse.json(order('dispatched')); }),
    );
    renderAdmin('/orders/o1');
    await userEvent.type(await screen.findByLabelText('Courier'), 'TCS');
    await userEvent.type(screen.getByLabelText('Tracking number'), 'TCS123');
    await userEvent.click(screen.getByRole('button', { name: 'Mark dispatched' }));
    await waitFor(() => expect(sent).toEqual({ status: 'dispatched', courier: 'TCS', trackingRef: 'TCS123' }));
  });

  it('asks twice before cancelling', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json(order('placed'))),
      http.post(`${BASE}/admin/orders/o1/status`, () => { calls++; return HttpResponse.json(order('cancelled')); }),
    );
    renderAdmin('/orders/o1');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel order…' }));
    expect(calls).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel this order' }));
    await waitFor(() => expect(calls).toBe(1));
  });

  it('shows the reason when the server refuses a move, and leaves the order alone', async () => {
    server.use(
      http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json(order('placed'))),
      http.post(`${BASE}/admin/orders/o1/status`, () => apiError(409, 'conflict', 'This order is already in production and can no longer be cancelled')),
    );
    renderAdmin('/orders/o1');
    await userEvent.click(await screen.findByRole('button', { name: 'Start preparing' }));
    expect(await screen.findByText(/already in production/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start preparing' })).toBeInTheDocument();
  });

  it('says a failed connection is not a refusal', async () => {
    server.use(
      http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json(order('placed'))),
      http.post(`${BASE}/admin/orders/o1/status`, () => apiError(503, 'unavailable')),
    );
    renderAdmin('/orders/o1');
    await userEvent.click(await screen.findByRole('button', { name: 'Start preparing' }));
    expect(await screen.findByText(/Nothing was changed/)).toBeInTheDocument();
  });

  it('does not offer "delivered" straight from paid for an order with physical gifts', async () => {
    server.use(http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json(order('paid'))));
    renderAdmin('/orders/o1');
    expect(await screen.findByRole('button', { name: 'Start preparing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark delivered' })).toBeNull();
  });
});

describe('other desks', () => {
  it('starts making an order from the production board', async () => {
    let sent: unknown;
    const ticket = { id: 'o1', number: 'SN-AAA111', status: 'preparing', city: 'Karachi', deliveryDate: '2026-10-12', sameDay: true, lines: [{ name: 'Photo mug', quantity: 1, extras: [], personalisation: { recipientName: 'Ayesha', relationship: 'Friend', cardDesign: 'Classic', message: 'Happy birthday' } }] };
    server.use(
      http.get(`${BASE}/admin/production`, () => HttpResponse.json({ preparing: [ticket], inProduction: [] })),
      http.post(`${BASE}/admin/orders/o1/status`, async ({ request }) => { sent = await request.json(); return HttpResponse.json(order('in_production')); }),
    );
    renderAdmin('/production');
    expect(await screen.findByText('Happy birthday')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start making' }));
    await waitFor(() => expect(sent).toEqual({ status: 'in_production' }));
  });

  it('lists the day sheet with cash to collect', async () => {
    server.use(http.get(`${BASE}/admin/dispatch`, () => HttpResponse.json({ date: '2026-10-12', total: 1, cities: [{ city: 'Karachi', orders: [{ id: 'o1', number: 'SN-AAA111', status: 'dispatched', sameDay: false, recipientName: 'Ayesha', address: 'House 4, DHA', phone: '0300', waitingForRecipientAddress: false, courier: 'TCS', trackingRef: 'T1', attempts: 0, cashToCollect: 1349, items: ['1 x Photo mug'] }] }] })));
    renderAdmin('/dispatch');
    expect(await screen.findByText('Rs 1,349')).toBeInTheDocument();
    expect(screen.getByText(/House 4, DHA/)).toBeInTheDocument();
  });

  it('approves a damage report with the chosen resolution, and marks a refund as sent', async () => {
    let decision: unknown;
    let processed = '';
    server.use(
      http.get(`${BASE}/admin/returns`, () => HttpResponse.json([{ id: 'r1', orderId: 'o1', orderNumber: 'SN-AAA111', kind: 'damaged', reason: 'Broken handle', photoUrls: ['https://p.example/1.jpg'], status: 'requested', refundAmount: 1349, createdAt: '2026-10-11T00:00:00Z' }])),
      http.get(`${BASE}/admin/refunds`, () => HttpResponse.json([{ id: 'f1', orderNumber: 'SN-BBB222', reason: 'cancelled', amount: 500, method: 'bank_transfer', status: 'pending', dueBy: '2026-10-20', arrivalNote: '' }])),
      http.post(`${BASE}/admin/returns/r1/decision`, async ({ request }) => { decision = await request.json(); return HttpResponse.json({}); }),
      http.post(`${BASE}/admin/refunds/f1/process`, () => { processed = 'f1'; return HttpResponse.json({}); }),
    );
    renderAdmin('/returns');
    await userEvent.click(await screen.findByLabelText('Send a replacement'));
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(decision).toEqual({ decision: 'approve', resolution: 'replacement' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark money sent' }));
    await waitFor(() => expect(processed).toBe('f1'));
  });

  it('hides a review from the shop', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/admin/reviews`, () => HttpResponse.json([{ id: 'v1', productId: 'p1', rating: 1, text: 'Rude words', verified: true, status: 'published', createdAt: '2026-10-11T00:00:00Z' }])),
      http.patch(`${BASE}/admin/reviews/v1`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({}); }),
    );
    renderAdmin('/reviews');
    await userEvent.click(await screen.findByRole('button', { name: 'Hide from the shop' }));
    await waitFor(() => expect(sent).toEqual({ status: 'hidden' }));
  });

  it('closes an inbox message', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/admin/contact`, () => HttpResponse.json([{ id: 'm1', name: 'Hira', email: 'hira@example.pk', topic: 'bulk_gifting', subject: '50 boxes', message: 'We need 50 boxes for Eid', status: 'new', createdAt: '2026-10-11T00:00:00Z' }])),
      http.patch(`${BASE}/admin/contact/m1`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({}); }),
    );
    renderAdmin('/inbox');
    expect(await screen.findByText('We need 50 boxes for Eid')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(sent).toEqual({ status: 'closed' }));
  });

  it('shows the sales summary', async () => {
    server.use(http.get(`${BASE}/admin/reports/summary`, () => HttpResponse.json({
      range: { from: null, to: null }, sales: { orders: 3, revenue: 4500, averageOrderValue: 1500, itemsSold: 4 }, byStatus: { delivered: 2, placed: 1 },
      byPaymentMethod: { cod: { orders: 3, revenue: 4500 } }, byCity: { Karachi: { orders: 3, revenue: 4500 } },
      delivery: { delivered: 2, onTimePercent: 100, averageDaysToDeliver: 1.5, ordersWithFailedAttempts: 0 }, promoUse: {}, topProducts: [{ productId: 'p1', name: 'Photo mug', quantity: 4, revenue: 4000 }],
      refunds: { pending: { count: 1, amount: 500 }, processed: { count: 0, amount: 0 } },
    })));
    renderAdmin('/reports');
    expect(await screen.findByText('Rs 4,500', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Photo mug' })).toBeInTheDocument();
  });
});

describe('signing out', () => {
  it('has a Sign out button on every page, which ends the session and returns to the sign-in page', async () => {
    server.use(http.get(`${BASE}/admin/orders`, () => HttpResponse.json({ data: [], page: 1, pageSize: 25, total: 0 })));
    renderAdmin('/', 'staff');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Studio sign in' })).toBeInTheDocument();
    expect(session.get()).toBeNull();
  });
});
