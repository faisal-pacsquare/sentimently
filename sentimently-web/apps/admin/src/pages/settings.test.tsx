import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const rate = (fee: number, sameDay = false) => ({ fee, minDays: sameDay ? 0 : 1, maxDays: sameDay ? 0 : 2, sameDay });
const store = {
  announcement: 'Free delivery over Rs 5,000', banner: null, freeDeliveryThreshold: 5000, sameDayCutoffHour: 13,
  deliveryRates: { Karachi: rate(350, true), Multan: rate(550) }, restOfPakistan: { fee: 650, minDays: 2, maxDays: 4, sameDay: false },
  sameDayCapacity: { Karachi: 40 }, contactPhone: null, contactEmail: null, socialLinks: { Instagram: 'https://instagram.com/sentimently' }, bankTransferInstructions: 'HBL 1234',
};

describe('who sees what', () => {
  it('hides settings and team from ordinary staff, and says why if they type the address', async () => {
    renderAdmin('/settings', 'staff');
    expect(await screen.findByText('Administrators only')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Team and tools' })).toBeNull();
  });

  it('shows them to administrators', async () => {
    server.use(http.get(`${BASE}/admin/store`, () => HttpResponse.json(store)));
    renderAdmin('/settings', 'admin');
    expect(await screen.findByLabelText('Announcement bar')).toHaveValue('Free delivery over Rs 5,000');
    expect(screen.getByRole('link', { name: 'Team and tools' })).toBeInTheDocument();
  });
});

describe('shop details', () => {
  it('saves the changed details, sending empty fields as nothing', async () => {
    let sent: Record<string, unknown> = {};
    server.use(
      http.get(`${BASE}/admin/store`, () => HttpResponse.json(store)),
      http.patch(`${BASE}/admin/store`, async ({ request }) => { sent = (await request.json()) as Record<string, unknown>; return HttpResponse.json({ ...store, ...sent }); }),
    );
    renderAdmin('/settings', 'admin');
    const threshold = await screen.findByLabelText('Free delivery over (Rs)');
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '6000');
    await userEvent.clear(screen.getByLabelText('Announcement bar'));
    await userEvent.click(screen.getByRole('button', { name: 'Save shop details' }));
    expect(await screen.findByText(/It is live on the shop now/)).toBeInTheDocument();
    expect(sent).toMatchObject({ freeDeliveryThreshold: 6000, announcement: null, sameDayCutoffHour: 13, contactEmail: null, socialLinks: { Instagram: 'https://instagram.com/sentimently' } });
  });

  it('checks the cut-off hour and email before sending', async () => {
    let calls = 0;
    server.use(http.get(`${BASE}/admin/store`, () => HttpResponse.json(store)), http.patch(`${BASE}/admin/store`, () => { calls++; return HttpResponse.json(store); }));
    renderAdmin('/settings', 'admin');
    const cutoff = await screen.findByLabelText('Same-day cut-off hour');
    await userEvent.clear(cutoff);
    await userEvent.type(cutoff, '25');
    await userEvent.type(screen.getByLabelText('Shop email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Save shop details' }));
    expect(await screen.findByText(/hour from 0 to 23/)).toBeInTheDocument();
    expect(screen.getByText(/valid email address/)).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('shows the reason when the server refuses, and does not claim it saved', async () => {
    server.use(http.get(`${BASE}/admin/store`, () => HttpResponse.json(store)), http.patch(`${BASE}/admin/store`, () => apiError(403, 'forbidden', 'Only administrators can change settings')));
    renderAdmin('/settings', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Save shop details' }));
    expect(await screen.findByText('Only administrators can change settings')).toBeInTheDocument();
    expect(screen.queryByText(/^Saved\./)).toBeNull();
  });

  it('shows a retry, not blank fields, when the settings fail to load', async () => {
    server.use(http.get(`${BASE}/admin/store`, () => apiError(500, 'internal')));
    renderAdmin('/settings', 'admin');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Announcement bar')).toBeNull();
  });
});

describe('delivery table', () => {
  const open = async () => {
    server.use(http.get(`${BASE}/admin/store`, () => HttpResponse.json(store)));
    renderAdmin('/settings', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Delivery' }));
  };

  it('sends the whole table, with same-day limits only for same-day cities', async () => {
    let sent: Record<string, unknown> = {};
    await open();
    server.use(http.patch(`${BASE}/admin/store`, async ({ request }) => { sent = (await request.json()) as Record<string, unknown>; return HttpResponse.json({ ...store, ...sent }); }));
    const fee = await screen.findByLabelText('Fee for Multan');
    await userEvent.clear(fee);
    await userEvent.type(fee, '600');
    await userEvent.click(screen.getByRole('button', { name: 'Save delivery' }));
    await waitFor(() => expect(sent.deliveryRates).toBeDefined());
    expect(sent.deliveryRates).toEqual({ Karachi: rate(350, true), Multan: { fee: 600, minDays: 1, maxDays: 2, sameDay: false } });
    expect(sent.sameDayCapacity).toEqual({ Karachi: 40 });
    expect(sent.restOfPakistan).toEqual({ fee: 650, minDays: 2, maxDays: 4, sameDay: false });
  });

  it('adds a city, and refuses a duplicate or a shortest time longer than the longest', async () => {
    let calls = 0;
    await open();
    server.use(http.patch(`${BASE}/admin/store`, () => { calls++; return HttpResponse.json(store); }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add a city' }));
    await userEvent.type(screen.getByLabelText('City 3'), 'karachi');
    await userEvent.click(screen.getByRole('button', { name: 'Save delivery' }));
    expect((await screen.findAllByText('This city is listed twice.')).length).toBe(2);
    await userEvent.clear(screen.getByLabelText('City 3'));
    await userEvent.type(screen.getByLabelText('City 3'), 'Quetta');
    const min = screen.getByLabelText('Shortest days for Quetta');
    await userEvent.clear(min);
    await userEvent.type(min, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Save delivery' }));
    expect(await screen.findByText(/shortest time cannot be longer/)).toBeInTheDocument();
    expect(calls).toBe(0);
  });
});

describe('promo codes and extras', () => {
  it('creates a code and lists it, turning one off', async () => {
    let created: unknown;
    let patched: unknown;
    let list = [{ id: 'HELLO10', code: 'HELLO10', percent: 10, minOrder: 3000, firstOrderOnly: true, isActive: true }];
    server.use(
      http.get(`${BASE}/admin/promo-codes`, () => HttpResponse.json(list)),
      http.post(`${BASE}/admin/promo-codes`, async ({ request }) => { created = await request.json(); return HttpResponse.json({}, { status: 201 }); }),
      http.patch(`${BASE}/admin/promo-codes/HELLO10`, async ({ request }) => { patched = await request.json(); list = [{ ...list[0]!, isActive: false }]; return HttpResponse.json(list[0]); }),
    );
    renderAdmin('/settings', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Promo codes' }));
    expect(await screen.findByText('HELLO10')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Code'), 'EID20');
    await userEvent.clear(screen.getByLabelText('Percent off'));
    await userEvent.type(screen.getByLabelText('Percent off'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Create code' }));
    await waitFor(() => expect(created).toEqual({ code: 'EID20', percent: 20, minOrder: 0, firstOrderOnly: false }));
    await userEvent.click(screen.getByRole('button', { name: 'Turn off HELLO10' }));
    await waitFor(() => expect(patched).toEqual({ isActive: false }));
    expect(await screen.findByText('Off')).toBeInTheDocument();
  });

  it('refuses a percentage over 100 and a code with spaces', async () => {
    server.use(http.get(`${BASE}/admin/promo-codes`, () => HttpResponse.json([])));
    renderAdmin('/settings', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Promo codes' }));
    await userEvent.type(await screen.findByLabelText('Code'), 'BAD CODE');
    await userEvent.clear(screen.getByLabelText('Percent off'));
    await userEvent.type(screen.getByLabelText('Percent off'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Create code' }));
    expect(await screen.findByText(/3 to 20 letters or digits/)).toBeInTheDocument();
    expect(screen.getAllByText('From 1 to 100.').length).toBeGreaterThan(0);
  });

  it('changes an extra price, but not the always-included classic wrap', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/admin/extras`, () => HttpResponse.json([{ id: 'classic_wrap', name: 'Classic wrap', price: 0, isActive: true }, { id: 'premium_wrap', name: 'Premium wrap', price: 350, isActive: true }])),
      http.patch(`${BASE}/admin/extras/premium_wrap`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({}); }),
    );
    renderAdmin('/settings', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Extras' }));
    expect(await screen.findByLabelText('Price of Classic wrap')).toBeDisabled();
    const price = screen.getByLabelText('Price of Premium wrap');
    await userEvent.clear(price);
    await userEvent.type(price, '400');
    await userEvent.click(screen.getByRole('button', { name: 'Save Premium wrap' }));
    await waitFor(() => expect(sent).toEqual({ name: 'Premium wrap', price: 400 }));
  });
});

describe('team and tools', () => {
  const people = [
    { id: 'u1', email: 'staff@studio.pk', name: 'Sana', role: 'staff', createdAt: '2026-10-01T00:00:00Z' },
    { id: 'a1', email: 'admin@studio.pk', name: 'Boss', role: 'admin', createdAt: '2026-09-01T00:00:00Z' },
  ];

  it('lists the team, with no remove button for yourself', async () => {
    server.use(http.get(`${BASE}/admin/staff`, () => HttpResponse.json(people)));
    renderAdmin('/team', 'admin'); // the signed-in test user has id "u1"
    expect(await screen.findByText('Boss')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove access for Boss' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove access for Sana' })).toBeNull();
  });

  it('adds someone, needing a 12 character password', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/admin/staff`, () => HttpResponse.json(people)),
      http.post(`${BASE}/admin/staff`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ id: 'n1' }, { status: 201 }); }),
    );
    renderAdmin('/team', 'admin');
    await userEvent.type(await screen.findByLabelText('Email'), 'new@studio.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the team' }));
    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(sent).toBeUndefined();
    await userEvent.clear(screen.getByLabelText('Password'));
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-password-1');
    await userEvent.selectOptions(screen.getByLabelText('Access'), 'admin');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the team' }));
    await waitFor(() => expect(sent).toEqual({ email: 'new@studio.pk', password: 'a-long-password-1', role: 'admin' }));
  });

  it('asks twice before removing access, and shows the server reason for the last admin', async () => {
    server.use(
      http.get(`${BASE}/admin/staff`, () => HttpResponse.json(people)),
      http.delete(`${BASE}/admin/staff/a1`, () => apiError(409, 'conflict', 'There must always be at least one admin')),
    );
    renderAdmin('/team', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove access for Boss' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(await screen.findByText('There must always be at least one admin')).toBeInTheDocument();
  });

  it('erases a person only after confirmation', async () => {
    let sent: unknown;
    server.use(
      http.get(`${BASE}/admin/staff`, () => HttpResponse.json(people)),
      http.post(`${BASE}/admin/privacy/erase`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ erased: true }); }),
    );
    renderAdmin('/team', 'admin');
    const box = await screen.findByLabelText('Their email address');
    await userEvent.type(box, 'zara@example.pk');
    await userEvent.click(screen.getByRole('button', { name: 'Erase…' }));
    expect(sent).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: /Yes, erase everything for zara@example.pk/ }));
    expect(await screen.findByText('Their data has been erased.')).toBeInTheDocument();
    expect(sent).toEqual({ email: 'zara@example.pk' });
  });

  it('runs the daily jobs on request', async () => {
    let ran = false;
    server.use(http.get(`${BASE}/admin/staff`, () => HttpResponse.json(people)), http.post(`${BASE}/admin/scheduler/run`, () => { ran = true; return HttpResponse.json({}); }));
    renderAdmin('/team', 'admin');
    const section = (await screen.findByRole('heading', { name: 'Run the daily jobs now' })).closest('section')!;
    await userEvent.click(within(section).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(ran).toBe(true));
    expect(await screen.findByText('Done.')).toBeInTheDocument();
  });
});
