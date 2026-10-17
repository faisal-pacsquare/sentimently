import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const gift = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, name, description: 'd', price: 1000, type: 'physical', stock: 9, category: 'home', sentiments: [], occasions: [], recipients: [], allowedExtras: [], imageUrls: [], isActive: true, createdAt: 'x', updatedAt: 'y', ...extra });
const list = [gift('a', 'Apple mug'), gift('b', 'Berry candle'), gift('c', 'Cherry frame', { isActive: false })];

const open = async (role: 'staff' | 'admin' = 'admin') => {
  server.use(http.get(`${BASE}/admin/products`, () => HttpResponse.json(list)));
  renderAdmin('/catalogue', role);
  await screen.findByRole('link', { name: 'Apple mug' });
};
const bar = () => screen.getByRole('region', { name: 'Selected gifts' });

describe('picking several gifts', () => {
  it('shows no actions until something is picked, then counts the picks', async () => {
    await open();
    expect(screen.queryByRole('region', { name: 'Selected gifts' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Apple mug' }));
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Berry candle' }));
    expect(within(bar()).getByText('2 selected')).toBeInTheDocument();
    await userEvent.click(within(bar()).getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('region', { name: 'Selected gifts' })).toBeNull();
  });

  it('select-all picks only what is shown under the current filter and search', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Hidden' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all gifts shown' }));
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument(); // the two others were never picked
    expect(screen.getByRole('checkbox', { name: 'Select all gifts shown' })).not.toBeChecked();
  });

  it('a gift hidden by a filter is never deleted by a delete that was meant for what is on screen', async () => {
    await open();
    let sent: unknown;
    server.use(http.post(`${BASE}/admin/products/bulk-delete`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ deleted: 1, notFound: 0 }); }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Apple mug' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hidden' })); // Apple is no longer on screen
    expect(screen.queryByRole('region', { name: 'Selected gifts' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Cherry frame' }));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete…' }));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Yes, delete 1' }));
    await waitFor(() => expect(sent).toEqual({ ids: ['c'] }));
  });

  it('asks before deleting, and keeping them deletes nothing', async () => {
    await open();
    let called = false;
    server.use(http.post(`${BASE}/admin/products/bulk-delete`, () => { called = true; return HttpResponse.json({ deleted: 2, notFound: 0 }); }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all gifts shown' }));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete…' }));
    expect(within(bar()).getByText(/Delete 3 gifts for good\?/)).toBeInTheDocument();
    await userEvent.click(within(bar()).getByRole('button', { name: 'Keep them' }));
    expect(within(bar()).queryByText(/for good\?/)).toBeNull();
    expect(called).toBe(false);
  });

  it('deletes the picked gifts after confirming and clears the picks', async () => {
    await open();
    let sent: unknown;
    server.use(http.post(`${BASE}/admin/products/bulk-delete`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ deleted: 2, notFound: 0 }); }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Apple mug' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Berry candle' }));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete…' }));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Yes, delete 2' }));
    await waitFor(() => expect(sent).toEqual({ ids: ['a', 'b'] }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Selected gifts' })).toBeNull());
  });

  it('keeps the picks and says so when deleting did not go through', async () => {
    await open();
    server.use(http.post(`${BASE}/admin/products/bulk-delete`, () => apiError(500, 'internal')));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Apple mug' }));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Delete…' }));
    await userEvent.click(within(bar()).getByRole('button', { name: 'Yes, delete 1' }));
    expect(await screen.findByText(/did not go through/)).toBeInTheDocument();
    expect(within(bar()).getByText('1 selected')).toBeInTheDocument();
  });

  it('staff can hide and show several gifts but are not offered delete', async () => {
    await open('staff');
    const calls: unknown[] = [];
    server.use(http.post(`${BASE}/admin/products/bulk-visibility`, async ({ request }) => { calls.push(await request.json()); return HttpResponse.json({ changed: 2 }); }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all gifts shown' }));
    expect(within(bar()).queryByRole('button', { name: 'Delete…' })).toBeNull();
    await userEvent.click(within(bar()).getByRole('button', { name: 'Hide from the shop' }));
    await waitFor(() => expect(calls).toEqual([{ ids: ['a', 'b', 'c'], visible: false }]));
  });
});
