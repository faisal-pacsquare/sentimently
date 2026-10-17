import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const mug = { id: 'p1', slug: 'photo-mug', name: 'Photo mug', description: 'A mug', price: 1200, type: 'physical', stock: 3, category: 'home', sentiments: [], occasions: [], recipients: [], allowedExtras: [], imageUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg', 'https://cdn.example.com/c.jpg'], isActive: true, createdAt: 'x', updatedAt: 'y' };
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

const list = () => screen.getByRole('list', { name: 'Photos of this gift' });
const order = () => within(list()).getAllByRole('listitem').map((li) => within(li).getByRole('button', { name: /^Remove photo/ }).getAttribute('aria-label'));
const png = (name = 'new.png', extra = 0) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3, 4, ...Array(extra).fill(9)])], name, { type: 'image/png' });

describe('gift photos in the studio', () => {
  it('shows the gift\'s photos with the first marked as the main photo', async () => {
    reference();
    renderAdmin('/catalogue/p1');
    await screen.findByRole('list', { name: 'Photos of this gift' });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);
    expect(within(within(list()).getAllByRole('listitem')[0]!).getByText('Main photo')).toBeInTheDocument();
    expect(within(within(list()).getAllByRole('listitem')[1]!).queryByText('Main photo')).toBeNull();
  });

  it('puts a chosen photo first, moves photos along, and sends the new order when saved', async () => {
    reference();
    let patch: Record<string, unknown> | undefined;
    server.use(http.patch(`${BASE}/admin/products/p1`, async ({ request }) => { patch = (await request.json()) as Record<string, unknown>; return HttpResponse.json(mug); }));
    renderAdmin('/catalogue/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Make photo 3 the main photo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move photo 3 earlier' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patch).toBeDefined());
    expect(patch!.imageUrls).toEqual(['https://cdn.example.com/c.jpg', 'https://cdn.example.com/b.jpg', 'https://cdn.example.com/a.jpg']);
  });

  it('removes a photo, and the saved list no longer has it', async () => {
    reference();
    let patch: Record<string, unknown> | undefined;
    server.use(http.patch(`${BASE}/admin/products/p1`, async ({ request }) => { patch = (await request.json()) as Record<string, unknown>; return HttpResponse.json(mug); }));
    renderAdmin('/catalogue/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo 2' }));
    expect(order()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patch).toBeDefined());
    expect(patch!.imageUrls).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/c.jpg']);
  });

  it('does not delete a gift\'s existing photo from storage just because it was removed on screen (only saving does)', async () => {
    reference();
    let deleted = false;
    server.use(http.delete(`${BASE}/admin/images`, () => { deleted = true; return new HttpResponse(null, { status: 204 }); }));
    renderAdmin('/catalogue/p1');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo 1' }));
    expect(deleted).toBe(false);
  });

  it('uploads photos from the computer, in the order chosen, and adds them to the gift', async () => {
    reference();
    const sent: string[] = [];
    let n = 0;
    server.use(http.post(`${BASE}/admin/images`, async ({ request }) => {
      const form = await request.formData();
      sent.push(String((form.get('file') as File).size));
      return HttpResponse.json({ url: `https://abc.public.blob.vercel-storage.com/gifts/${++n}.png` }, { status: 201 });
    }));
    renderAdmin('/catalogue/p1');
    await screen.findByRole('list', { name: 'Photos of this gift' });
    await userEvent.upload(screen.getByLabelText('Choose photos to upload'), [png('one.png', 0), png('two.png', 5)]);
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(5));
    expect(sent).toEqual(['12', '17']); // one after the other, in the order chosen
    expect(order()[3]).toBe('Remove photo 4');
  });

  it('deletes a photo from storage straight away if it was uploaded a moment ago and then removed', async () => {
    reference();
    const deleted: unknown[] = [];
    server.use(
      http.post(`${BASE}/admin/images`, () => HttpResponse.json({ url: 'https://abc.public.blob.vercel-storage.com/gifts/new.png' }, { status: 201 })),
      http.delete(`${BASE}/admin/images`, async ({ request }) => { deleted.push(await request.json()); return new HttpResponse(null, { status: 204 }); }),
    );
    renderAdmin('/catalogue/p1');
    await screen.findByRole('list', { name: 'Photos of this gift' });
    await userEvent.upload(screen.getByLabelText('Choose photos to upload'), png());
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(4));
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 4' }));
    await waitFor(() => expect(deleted).toEqual([{ url: 'https://abc.public.blob.vercel-storage.com/gifts/new.png' }]));
  });

  it('says why a photo was refused and keeps the others', async () => {
    reference();
    let n = 0;
    server.use(http.post(`${BASE}/admin/images`, () => (++n === 1 ? apiError(400, 'validation_error', 'Bad', ['That file is not a photo we can use. Use a JPEG, PNG, WebP or GIF image.']) : HttpResponse.json({ url: 'https://abc.public.blob.vercel-storage.com/gifts/ok.png' }, { status: 201 }))));
    renderAdmin('/catalogue/p1');
    await screen.findByRole('list', { name: 'Photos of this gift' });
    await userEvent.upload(screen.getByLabelText('Choose photos to upload'), [png('bad.png'), png('good.png')]);
    expect(await screen.findByText(/bad\.png: That file is not a photo we can use/)).toBeInTheDocument();
    await waitFor(() => expect(within(list()).getAllByRole('listitem')).toHaveLength(4));
  });

  it('explains when photo storage is not set up on the API', async () => {
    reference();
    server.use(http.post(`${BASE}/admin/images`, () => apiError(503, 'unavailable', 'Photo uploads are not set up yet. In Vercel, create a Blob store')));
    renderAdmin('/catalogue/p1');
    await screen.findByRole('list', { name: 'Photos of this gift' });
    await userEvent.upload(screen.getByLabelText('Choose photos to upload'), png());
    expect(await screen.findByText(/could not upload|connection failed/i)).toBeInTheDocument();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);
  });

  it('adds a photo by link, refusing anything that is not a full https link or is already there', async () => {
    reference();
    renderAdmin('/catalogue/p1');
    const box = await screen.findByLabelText('Or add a photo by link');
    await userEvent.type(box, 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(await screen.findByText('Use a full link starting with https://.')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'https://cdn.example.com/a.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(await screen.findByText('That photo is already on this gift.')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'https://cdn.example.com/d.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(4);
  });

  it('refuses a file that is not a photo before sending it anywhere', async () => {
    reference();
    let called = false;
    server.use(http.post(`${BASE}/admin/images`, () => { called = true; return HttpResponse.json({ url: 'x' }, { status: 201 }); }));
    renderAdmin('/catalogue/p1');
    await screen.findByRole('list', { name: 'Photos of this gift' });
    const pdf = new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Choose photos to upload'), pdf, { applyAccept: false });
    expect(await screen.findByText(/menu\.pdf: use a JPEG, PNG, WebP or GIF/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('starts a new gift with no photos and explains what happens without one', async () => {
    reference();
    renderAdmin('/catalogue/new');
    expect(await screen.findByText(/No photos yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add photos' })).toBeInTheDocument();
  });
});
