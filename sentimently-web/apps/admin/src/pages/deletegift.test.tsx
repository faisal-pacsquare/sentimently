import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const mug = { id: 'p1', slug: 'photo-mug', name: 'Photo mug', description: 'A mug', price: 1200, type: 'physical', stock: 3, category: 'home', sentiments: [], occasions: [], recipients: [], allowedExtras: [], imageUrls: [], isActive: true, createdAt: 'x', updatedAt: 'y' };
const group = (kind: string, slug: string, name: string) => ({ id: `${kind}-${slug}`, kind, slug, name, productCount: 1, sortOrder: 0 });

const reference = () =>
  server.use(
    http.get(`${BASE}/taxonomy/sentiments`, () => HttpResponse.json([])),
    http.get(`${BASE}/taxonomy/occasions`, () => HttpResponse.json([])),
    http.get(`${BASE}/taxonomy/recipients`, () => HttpResponse.json([])),
    http.get(`${BASE}/taxonomy/categories`, () => HttpResponse.json([group('category', 'home', 'Home')])),
    http.get(`${BASE}/personalisation/options`, () => HttpResponse.json({ relationships: [], cardDesigns: [], messageMaxLength: 900, starterLines: [], extras: [] })),
    http.get(`${BASE}/admin/products`, () => HttpResponse.json([mug])),
  );

describe('deleting a gift for good', () => {
  it('is offered to administrators only', async () => {
    reference();
    renderAdmin('/catalogue/p1', 'staff');
    await screen.findByRole('button', { name: 'Hide from the shop' });
    expect(screen.queryByRole('button', { name: /Delete this gift/ })).toBeNull();
  });

  it('asks first, and keeping it deletes nothing', async () => {
    reference();
    let deleted = false;
    server.use(http.delete(`${BASE}/admin/products/p1/permanent`, () => { deleted = true; return new HttpResponse(null, { status: 204 }); }));
    renderAdmin('/catalogue/p1', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: /Delete this gift/ }));
    expect(screen.getByText(/Delete “Photo mug” for good\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText(/for good\?/)).toBeNull();
    expect(deleted).toBe(false);
  });

  it('deletes after confirming and returns to the catalogue', async () => {
    reference();
    let deleted = false;
    server.use(http.delete(`${BASE}/admin/products/p1/permanent`, () => { deleted = true; return new HttpResponse(null, { status: 204 }); }));
    renderAdmin('/catalogue/p1', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: /Delete this gift/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByRole('heading', { name: 'Catalogue' })).toBeInTheDocument();
  });

  it('says so when it did not go through, and stays on the gift', async () => {
    reference();
    server.use(http.delete(`${BASE}/admin/products/p1/permanent`, () => apiError(500, 'internal')));
    renderAdmin('/catalogue/p1', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: /Delete this gift/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(await screen.findByText(/Nothing was deleted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });
});
