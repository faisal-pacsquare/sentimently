import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const order = (status: string, paymentMethod = 'cod') => ({
  order: { id: 'o1', number: 'SN-1001', status, paymentMethod, currency: 'PKR', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', itemsTotal: 2000, extrasTotal: 0, subtotal: 2000, deliveryFee: 0, discount: 0, total: 2000, city: 'Karachi', contactEmail: 'a@b.pk', contactPhone: '0300', lines: [], events: [] },
  payments: [],
  digitalGifts: [],
  giftLink: null,
});
const detail = (status: string, paymentMethod?: string) => {
  const d = order(status, paymentMethod);
  server.use(http.get(`${BASE}/admin/orders/o1`, () => HttpResponse.json({ ...d.order, ...d, order: d.order })));
};

const review = (id: string, rating: number) => ({ id, productId: 'p1', rating, text: 'Lovely', verified: true, status: 'published', createdAt: '2026-11-01T00:00:00.000Z' });

describe('deleting a review', () => {
  it('is offered to administrators only', async () => {
    server.use(http.get(`${BASE}/admin/reviews`, () => HttpResponse.json([review('r1', 5)])));
    renderAdmin('/reviews', 'staff');
    await screen.findByText('Lovely');
    expect(screen.getByRole('button', { name: 'Hide from the shop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete this/ })).toBeNull();
  });

  it('asks first, then deletes only that review', async () => {
    server.use(http.get(`${BASE}/admin/reviews`, () => HttpResponse.json([review('r1', 5), review('r2', 2)])));
    const deleted: string[] = [];
    server.use(http.delete(`${BASE}/admin/reviews/:id`, ({ params }) => { deleted.push(String(params.id)); return new HttpResponse(null, { status: 204 }); }));
    renderAdmin('/reviews', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete this 2 star review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(deleted).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete this 2 star review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(deleted).toEqual(['r2']));
  });

  it('says so when it did not go through', async () => {
    server.use(http.get(`${BASE}/admin/reviews`, () => HttpResponse.json([review('r1', 5)])));
    server.use(http.delete(`${BASE}/admin/reviews/:id`, () => apiError(500, 'internal')));
    renderAdmin('/reviews', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete this 5 star review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(await screen.findByText(/did not go through/)).toBeInTheDocument();
  });
});

describe('deleting an order', () => {
  it('is not offered on an order that is not cancelled, and says why', async () => {
    detail('paid');
    renderAdmin('/orders/o1', 'admin');
    expect(await screen.findByText(/Only cancelled orders can be deleted\. To remove this order, cancel it first\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete this order/ })).toBeNull();
  });

  it('is not offered to staff, even on a cancelled order', async () => {
    detail('cancelled');
    renderAdmin('/orders/o1', 'staff');
    await screen.findByRole('heading', { name: /SN-1001/ });
    expect(screen.queryByRole('button', { name: /Delete this order/ })).toBeNull();
  });

  it('needs the order number typed before it can be deleted, then deletes and returns to the list', async () => {
    detail('cancelled');
    let deleted = false;
    server.use(
      http.delete(`${BASE}/admin/orders/o1`, () => { deleted = true; return HttpResponse.json({ number: 'SN-1001', removed: {} }); }),
      http.get(`${BASE}/admin/orders`, () => HttpResponse.json({ data: [], page: 1, pageSize: 20, total: 0 })),
    );
    renderAdmin('/orders/o1', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete this order…' }));
    const go = screen.getByRole('button', { name: 'Delete SN-1001 for good' });
    expect(go).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type SN-1001 to confirm'), 'SN-1002');
    expect(go).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Type SN-1001 to confirm'));
    await userEvent.type(screen.getByLabelText('Type SN-1001 to confirm'), 'sn-1001');
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeInTheDocument();
  });

  it('warns that a card payment is not refunded by deleting', async () => {
    detail('cancelled', 'card');
    renderAdmin('/orders/o1', 'admin');
    expect(await screen.findByText(/does not refund them/)).toBeInTheDocument();
  });

  it('shows the reason when the server refuses', async () => {
    detail('cancelled');
    server.use(http.delete(`${BASE}/admin/orders/o1`, () => apiError(409, 'conflict', 'Only cancelled orders can be deleted. Cancel this order first if you want to remove it.')));
    renderAdmin('/orders/o1', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete this order…' }));
    await userEvent.type(screen.getByLabelText('Type SN-1001 to confirm'), 'SN-1001');
    await userEvent.click(screen.getByRole('button', { name: 'Delete SN-1001 for good' }));
    expect(await screen.findByText(/Cancel this order first/)).toBeInTheDocument();
  });
});
