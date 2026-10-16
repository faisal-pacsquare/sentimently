import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const mug = { id: 'p1', slug: 'photo-mug', name: 'Photo mug', description: 'A mug', price: 1200, offerPrice: 999, type: 'physical', stock: 3, category: 'home', sentiments: ['i-miss-you'], occasions: [], recipients: [], allowedExtras: [], imageUrls: ['/images/mug.jpg'], isActive: true, createdAt: 'x', updatedAt: 'y' };
const card = { ...mug, id: 'p2', slug: 'egift', name: 'E-gift card', type: 'digital', digitalKind: 'egift', stock: 9999, isActive: false };
const group = (kind: string, slug: string, name: string) => ({ id: `${kind}-${slug}`, kind, slug, name, productCount: 1, sortOrder: 0 });

const reference = () =>
  server.use(
    http.get(`${BASE}/taxonomy/sentiments`, () => HttpResponse.json([group('sentiment', 'i-miss-you', 'I miss you'), group('sentiment', 'thank-you', 'Thank you')])),
    http.get(`${BASE}/taxonomy/occasions`, () => HttpResponse.json([group('occasion', 'birthday', 'Birthday')])),
    http.get(`${BASE}/taxonomy/recipients`, () => HttpResponse.json([group('recipient', 'friend', 'Friend')])),
    http.get(`${BASE}/taxonomy/categories`, () => HttpResponse.json([group('category', 'home', 'Home'), group('category', 'jewellery', 'Jewellery')])),
    http.get(`${BASE}/personalisation/options`, () => HttpResponse.json({ relationships: [], cardDesigns: [], messageMaxLength: 900, starterLines: [], extras: [{ code: 'gift-wrap', name: 'Gift wrap', price: 250 }] })),
  );

describe('gift list', () => {
  it('lists gifts with price, stock and whether they are on the shop, and filters hidden and low stock', async () => {
    server.use(http.get(`${BASE}/admin/products`, () => HttpResponse.json([mug, card])));
    renderAdmin('/catalogue');
    expect(await screen.findByRole('link', { name: 'Photo mug' })).toHaveAttribute('href', '/catalogue/p1');
    expect(screen.getByText('3 left')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hidden' }));
    expect(screen.queryByRole('link', { name: 'Photo mug' })).toBeNull();
    expect(screen.getByRole('link', { name: 'E-gift card' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Low stock' }));
    expect(screen.queryByRole('link', { name: 'E-gift card' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Photo mug' })).toBeInTheDocument();
  });

  it('shows a retry, not an empty catalogue, when loading fails', async () => {
    server.use(http.get(`${BASE}/admin/products`, () => apiError(500, 'internal')));
    renderAdmin('/catalogue');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('No gifts yet')).toBeNull();
  });
});

describe('new gift', () => {
  it('fills in the web address from the name, and checks the form before sending', async () => {
    reference();
    renderAdmin('/catalogue/new');
    await userEvent.type(await screen.findByLabelText('Name'), 'Rose Candle Set');
    expect(screen.getByLabelText(/Web address name/)).toHaveValue('rose-candle-set');
    await userEvent.click(screen.getByRole('button', { name: 'Add gift' }));
    expect(await screen.findByText('Describe the gift.')).toBeInTheDocument();
    expect(screen.getByText('Enter the price in whole rupees.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
  });

  it('refuses an offer that is not lower than the price', async () => {
    reference();
    renderAdmin('/catalogue/new');
    await userEvent.type(await screen.findByLabelText('Price (Rs)'), '1000');
    await userEvent.type(screen.getByLabelText('Offer price (Rs, optional)'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Add gift' }));
    expect(await screen.findByText('The offer price must be lower than the price.')).toBeInTheDocument();
  });

  it('creates a gift with the chosen groups and extras', async () => {
    reference();
    let sent: Record<string, unknown> = {};
    server.use(
      http.get(`${BASE}/admin/products`, () => HttpResponse.json([])),
      http.post(`${BASE}/admin/products`, async ({ request }) => { sent = (await request.json()) as Record<string, unknown>; return HttpResponse.json({ ...mug, ...sent, id: 'new' }, { status: 201 }); }),
    );
    renderAdmin('/catalogue/new');
    await userEvent.type(await screen.findByLabelText('Name'), 'Rose Candle');
    await userEvent.type(screen.getByLabelText('Description'), 'A scented candle');
    await userEvent.type(screen.getByLabelText('Price (Rs)'), '1500');
    await userEvent.clear(screen.getByLabelText('In stock'));
    await userEvent.type(screen.getByLabelText('In stock'), '12');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'home');
    await userEvent.click(screen.getByLabelText('I miss you'));
    await userEvent.click(screen.getByLabelText('Birthday'));
    await userEvent.click(screen.getByLabelText(/Gift wrap/));
    await userEvent.click(screen.getByRole('button', { name: 'Add gift' }));
    await waitFor(() => expect(sent.slug).toBe('rose-candle'));
    expect(sent).toMatchObject({ name: 'Rose Candle', price: 1500, stock: 12, type: 'physical', category: 'home', sentiments: ['i-miss-you'], occasions: ['birthday'], allowedExtras: ['gift-wrap'], offerPrice: null, isActive: true, imageUrls: [] });
    expect(await screen.findByRole('heading', { name: 'Catalogue' })).toBeInTheDocument();
  });

  it('shows the server reason, for example a slug that is taken, and keeps what was typed', async () => {
    reference();
    server.use(http.post(`${BASE}/admin/products`, () => apiError(409, 'conflict', 'A gift with slug "rose-candle" already exists')));
    renderAdmin('/catalogue/new');
    await userEvent.type(await screen.findByLabelText('Name'), 'Rose Candle');
    await userEvent.type(screen.getByLabelText('Description'), 'A candle');
    await userEvent.type(screen.getByLabelText('Price (Rs)'), '1500');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'home');
    await userEvent.click(screen.getByRole('button', { name: 'Add gift' }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Rose Candle');
  });

  it('sends a digital gift without delivery options, with its kind', async () => {
    reference();
    let sent: Record<string, unknown> = {};
    server.use(http.post(`${BASE}/admin/products`, async ({ request }) => { sent = (await request.json()) as Record<string, unknown>; return HttpResponse.json({}, { status: 201 }); }), http.get(`${BASE}/admin/products`, () => HttpResponse.json([])));
    renderAdmin('/catalogue/new');
    await userEvent.type(await screen.findByLabelText('Name'), 'Gift card');
    await userEvent.click(screen.getByLabelText(/Digital \(sent by email\)/));
    expect(screen.queryByText(/Made to order/)).toBeNull();
    await userEvent.type(screen.getByLabelText('Description'), 'A card');
    await userEvent.type(screen.getByLabelText('Price (Rs)'), '5000');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'home');
    await userEvent.click(screen.getByRole('button', { name: 'Add gift' }));
    await waitFor(() => expect(sent.type).toBe('digital'));
    expect(sent).toMatchObject({ digitalKind: 'egift', isMadeToOrder: false, allowedExtras: [] });
  });
});

describe('editing a gift', () => {
  it('does not resend photo paths that were not edited, and can hide the gift', async () => {
    reference();
    let patch: Record<string, unknown> | undefined;
    server.use(
      http.get(`${BASE}/admin/products`, () => HttpResponse.json([mug])),
      http.patch(`${BASE}/admin/products/p1`, async ({ request }) => { patch = (await request.json()) as Record<string, unknown>; return HttpResponse.json(mug); }),
    );
    renderAdmin('/catalogue/p1');
    const price = await screen.findByLabelText('Price (Rs)');
    expect(price).toHaveValue('1200');
    await userEvent.clear(price);
    await userEvent.type(price, '1300');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patch).toBeDefined());
    expect(patch).toMatchObject({ price: 1300 });
    expect(patch).not.toHaveProperty('imageUrls');
  });

  it('hides a gift from the shop', async () => {
    reference();
    let hidden = false;
    server.use(
      http.get(`${BASE}/admin/products`, () => HttpResponse.json([mug])),
      http.delete(`${BASE}/admin/products/p1`, () => { hidden = true; return new HttpResponse(null, { status: 204 }); }),
    );
    renderAdmin('/catalogue/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Hide from the shop' }));
    await waitFor(() => expect(hidden).toBe(true));
  });

  it('says so for a gift that does not exist', async () => {
    reference();
    server.use(http.get(`${BASE}/admin/products`, () => HttpResponse.json([mug])));
    renderAdmin('/catalogue/nope');
    expect(await screen.findByText('Gift not found')).toBeInTheDocument();
  });
});

describe('groups', () => {
  it('adds a group using a generated web address, and shows a taken one in the server words', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/taxonomy/sentiments`, () => HttpResponse.json([group('sentiment', 'i-miss-you', 'I miss you')])),
      http.post(`${BASE}/admin/taxonomy`, async ({ request }) => { sent = await request.json(); return apiError(409, 'conflict', 'sentiment "thank-you-so-much" already exists'); }),
    );
    renderAdmin('/catalogue/groups');
    expect(await screen.findByText('I miss you')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Thank you so much');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(sent).toEqual({ kind: 'sentiment', slug: 'thank-you-so-much', name: 'Thank you so much' }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it('edits a group name', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/taxonomy/sentiments`, () => HttpResponse.json([group('sentiment', 'i-miss-you', 'I miss you')])),
      http.patch(`${BASE}/admin/taxonomy/sentiment-i-miss-you`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({}); }),
    );
    renderAdmin('/catalogue/groups');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit I miss you' }));
    const name = screen.getAllByLabelText('Name')[0]!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Missing you');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toMatchObject({ name: 'Missing you', sortOrder: 0 }));
  });
});
