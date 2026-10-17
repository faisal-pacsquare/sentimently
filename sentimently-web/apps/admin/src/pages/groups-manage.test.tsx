import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const gift = (id: string, name: string, category: string, extra: Record<string, unknown> = {}) => ({ id, slug: id, name, description: 'd', price: 1000, type: 'physical', stock: 9, category, sentiments: [], occasions: [], recipients: [], allowedExtras: [], imageUrls: [], isActive: true, createdAt: 'x', updatedAt: 'y', ...extra });
const gifts = [gift('a', 'Apple mug', 'home'), gift('b', 'Berry candle', 'home', { isActive: false }), gift('c', 'Cherry frame', 'ribbon', { sentiments: ['love'] })];
const group = (kind: string, slug: string, name: string) => ({ id: `${kind}-${slug}`, kind, slug, name, productCount: 0, sortOrder: 0 });
const categories = [group('category', 'home', 'Home'), group('category', 'ribbon', 'Ribbon flowers'), group('category', 'empty', 'Empty one')];

const reference = () =>
  server.use(
    http.get(`${BASE}/admin/products`, () => HttpResponse.json(gifts)),
    http.get(`${BASE}/taxonomy/categories`, () => HttpResponse.json(categories)),
    http.get(`${BASE}/taxonomy/sentiments`, () => HttpResponse.json([group('sentiment', 'love', 'Love')])),
    http.get(`${BASE}/taxonomy/occasions`, () => HttpResponse.json([])),
    http.get(`${BASE}/taxonomy/recipients`, () => HttpResponse.json([])),
    http.get(`${BASE}/personalisation/options`, () => HttpResponse.json({ relationships: [], cardDesigns: [], messageMaxLength: 900, starterLines: [], extras: [] })),
  );

const openCategories = async (role: 'staff' | 'admin' = 'admin') => {
  reference();
  renderAdmin('/catalogue/groups', role);
  await userEvent.click(await screen.findByRole('button', { name: 'Categories' }));
  await screen.findByText(/Ribbon flowers/);
};

describe('managing categories', () => {
  it('counts every gift in a category, hidden ones included', async () => {
    await openCategories();
    expect(await screen.findByText(/home · 2 gifts \(1 hidden\)/)).toBeInTheDocument();
    expect(screen.getByText(/ribbon · 1 gift$/)).toBeInTheDocument();
    expect(screen.getByText(/empty · 0 gifts/)).toBeInTheDocument();
  });

  it('links to the gifts in a category and to a new gift inside it', async () => {
    await openCategories();
    expect(screen.getByRole('link', { name: 'View the gifts in Home' })).toHaveAttribute('href', '/catalogue?category=home');
    expect(screen.getByRole('link', { name: 'Add a gift to Home' })).toHaveAttribute('href', '/catalogue/new?category=home');
  });

  it('is offered delete only to administrators', async () => {
    await openCategories('staff');
    expect(screen.getByRole('button', { name: 'Edit Home' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Home' })).toBeNull();
  });

  it('will not delete a category with gifts until a category to move them to is chosen', async () => {
    await openCategories();
    let url = '';
    server.use(http.delete(`${BASE}/admin/taxonomy/:id`, ({ request }) => { url = request.url; return HttpResponse.json({ giftsUpdated: 2 }); }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Home' }));
    expect(screen.getByText(/2 gifts are in this category/)).toBeInTheDocument();
    const go = screen.getByRole('button', { name: 'Move the gifts and delete' });
    expect(go).toBeDisabled();
    const choose = screen.getByLabelText('Move the 2 gifts to');
    expect(within(choose).queryByRole('option', { name: 'Home' })).toBeNull(); // not into itself
    await userEvent.selectOptions(choose, 'ribbon');
    await userEvent.click(go);
    await waitFor(() => expect(url).toContain('/admin/taxonomy/category-home?moveTo=ribbon'));
  });

  it('deletes an empty category after one confirmation, and keeping it deletes nothing', async () => {
    await openCategories();
    let called = 0;
    server.use(http.delete(`${BASE}/admin/taxonomy/:id`, () => { called++; return HttpResponse.json({ giftsUpdated: 0 }); }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Empty one' }));
    expect(screen.getByText('No gifts use it.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(called).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Empty one' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(called).toBe(1));
  });

  it('shows why a delete was refused', async () => {
    await openCategories();
    server.use(http.delete(`${BASE}/admin/taxonomy/:id`, () => apiError(409, 'conflict', '1 gift is in this category. Choose another category to move it to first.')));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Empty one' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(await screen.findByText(/Choose another category/)).toBeInTheDocument();
  });

  it('a feeling can be deleted without moving anything: its gifts just lose the tag', async () => {
    reference();
    renderAdmin('/catalogue/groups', 'admin');
    await screen.findByText(/love · 1 gift/);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Love' }));
    expect(screen.getByText(/taken off 1 gift/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete it' })).toBeEnabled();
  });
});

describe('gifts under a category', () => {
  it('the catalogue can be opened already showing one category, and cleared', async () => {
    reference();
    renderAdmin('/catalogue?category=home', 'admin');
    expect(await screen.findByRole('link', { name: 'Apple mug' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Berry candle' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cherry frame' })).toBeNull();
    expect(await screen.findByText('Category: Home')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a gift here' })).toHaveAttribute('href', '/catalogue/new?category=home');
    await userEvent.click(screen.getByRole('button', { name: 'Show all gifts' }));
    expect(await screen.findByRole('link', { name: 'Cherry frame' })).toBeInTheDocument();
  });

  it('a new gift opened from a category starts inside it', async () => {
    reference();
    renderAdmin('/catalogue/new?category=ribbon&sentiment=love', 'admin');
    const select = await screen.findByLabelText('Category');
    await waitFor(() => expect(select).toHaveValue('ribbon'));
    expect(screen.getByRole('checkbox', { name: 'Love' })).toBeChecked();
  });
});
