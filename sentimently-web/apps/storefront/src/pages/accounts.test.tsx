import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { session } from '../lib/session';
import { renderApp } from '../test/render';
import { BASE, apiError, server } from '../test/server';
import { safeNext } from './Auth';

const customer = { id: 'c1', email: 'zara@example.pk', name: 'Zara Khan', role: 'customer', authProvider: 'email', emailVerified: true };
const sessionBody = { accessToken: 'tok-1', customer };
const order = { id: 'o1', number: 'SN-AAA111', statusLabel: 'On its way', status: 'dispatched', total: 1349, itemsTotal: 999, extrasTotal: 0, deliveryFee: 350, discount: 0, createdAt: '2026-10-10T08:00:00.000Z', lines: [{ slug: 'photo-mug', name: 'Photo mug', quantity: 1, lineTotal: 999, extras: [] }], timeline: [{ status: 'placed', label: 'Order placed', at: '2026-10-10T08:00:00.000Z' }] };

const signedIn = () => {
  session.set('tok-1');
  server.use(http.get(`${BASE}/me`, () => HttpResponse.json(customer)));
};

describe('signing in', () => {
  it('signs in and lands on the account page', async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(sessionBody)),
      http.get(`${BASE}/me`, () => HttpResponse.json(customer)),
      http.get(`${BASE}/orders`, () => HttpResponse.json([order])),
    );
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'zara@example.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Hello, Zara Khan' })).toBeInTheDocument();
    expect(await screen.findByText('SN-AAA111')).toBeInTheDocument();
    expect(session.get()).toBe('tok-1');
  });

  it('shows the server reason for a wrong password, and stays on the page', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => apiError(401, 'unauthorized', 'Email or password is not right')));
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'zara@example.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is not right')).toBeInTheDocument();
    expect(session.get()).toBeNull();
  });

  it('offers a retry, not a wrong-password message, when the server is down', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => apiError(503, 'unavailable')));
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'zara@example.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('only follows a next address that stays on this site', () => {
    expect(safeNext('/checkout')).toBe('/checkout');
    expect(safeNext('//evil.example/x')).toBe('/account');
    expect(safeNext('https://evil.example')).toBe('/account');
    expect(safeNext('/\\evil.example')).toBe('/account');
    expect(safeNext(null)).toBe('/account');
  });

  it('sends a signed-out visitor from the account to sign in', async () => {
    renderApp('/account/wishlist');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('registering', () => {
  it('needs a valid email and an 8 character password before asking the server', async () => {
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Email'), 'nope');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
  });

  it('creates the account, signs in, and asks them to confirm their email', async () => {
    server.use(
      http.post(`${BASE}/auth/register`, () => HttpResponse.json({ accessToken: 'tok-1', customer: { ...customer, emailVerified: false } })),
      http.get(`${BASE}/me`, () => HttpResponse.json({ ...customer, emailVerified: false })),
      http.get(`${BASE}/orders`, () => HttpResponse.json([])),
    );
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Email'), 'zara@example.pk');
    await userEvent.type(screen.getByLabelText('Password'), 'long enough');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/Please confirm your email/)).toBeInTheDocument();
    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });
});

describe('email links', () => {
  it('uses the confirmation link once', async () => {
    let calls = 0;
    server.use(http.post(`${BASE}/auth/verify-email`, () => { calls++; return HttpResponse.json({ message: 'Your email is confirmed.', customer }); }));
    renderApp('/verify-email?token=abc');
    expect(await screen.findByText('Your email is confirmed.')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('says so when the link has expired', async () => {
    server.use(http.post(`${BASE}/auth/verify-email`, () => apiError(400, 'bad_request', 'This link has expired')));
    renderApp('/verify-email?token=old');
    expect(await screen.findByText('This link has expired')).toBeInTheDocument();
  });

  it('checks the two new passwords match, then changes it', async () => {
    let sent: unknown;
    server.use(http.post(`${BASE}/auth/reset-password`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ message: 'Your password has been changed.' }); }));
    renderApp('/reset-password?token=t1');
    await userEvent.type(await screen.findByLabelText('New password'), 'brand new pw');
    await userEvent.type(screen.getByLabelText('New password again'), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('The two passwords are not the same.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('New password again'));
    await userEvent.type(screen.getByLabelText('New password again'), 'brand new pw');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Your password has been changed.')).toBeInTheDocument();
    expect(sent).toEqual({ token: 't1', password: 'brand new pw' });
  });

  it('gives the same answer for forgot-password whatever the address', async () => {
    server.use(http.post(`${BASE}/auth/forgot-password`, () => HttpResponse.json({ message: 'If that email has an account, a reset link is on its way.' }, { status: 202 })));
    renderApp('/forgot-password');
    await userEvent.type(await screen.findByLabelText('Email'), 'anyone@example.pk');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/reset link is on its way/)).toBeInTheDocument();
  });
});

describe('my account', () => {
  it('does not sign anyone out because the server hiccuped', async () => {
    session.set('tok-1');
    server.use(http.get(`${BASE}/me`, () => apiError(500, 'internal')));
    renderApp('/account');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(session.get()).toBe('tok-1');
  });

  it('opens an order with its progress', async () => {
    signedIn();
    server.use(http.get(`${BASE}/orders/SN-AAA111`, () => HttpResponse.json(order)));
    renderApp('/account/orders/SN-AAA111');
    expect(await screen.findByRole('heading', { name: 'Order SN-AAA111' })).toBeInTheDocument();
    expect(screen.getByText('Order placed')).toBeInTheDocument();
  });

  it('shows the wishlist and removes a gift from it', async () => {
    signedIn();
    let removed = '';
    server.use(
      http.get(`${BASE}/me/wishlist`, () => HttpResponse.json(removed ? [] : [{ id: 'id-photo-mug', slug: 'photo-mug', name: 'Photo mug', price: 1200, effectivePrice: 1200, type: 'physical', stock: 5, imageUrls: [], reviewCount: 0, rating: null }])),
      http.delete(`${BASE}/me/wishlist/:id`, ({ params }) => { removed = String(params.id); return new HttpResponse(null, { status: 204 }); }),
    );
    renderApp('/account/wishlist');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Photo mug from wishlist' }));
    await waitFor(() => expect(removed).toBe('id-photo-mug'));
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('adds a guest order using its number and email', async () => {
    signedIn();
    let sent: unknown;
    server.use(http.post(`${BASE}/me/claim-order`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ number: 'SN-OLD1', added: true }); }));
    renderApp('/account/details');
    await userEvent.type(await screen.findByLabelText('Order number'), 'SN-OLD1');
    await userEvent.click(screen.getByRole('button', { name: 'Add order' }));
    expect(await screen.findByText('Order SN-OLD1 is now in your account.')).toBeInTheDocument();
    expect(sent).toEqual({ number: 'SN-OLD1', email: 'zara@example.pk' });
  });

  it('signs out and forgets the account', async () => {
    signedIn();
    renderApp('/account/details');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(session.get()).toBeNull();
    expect(await screen.findByRole('link', { name: /Sign in/ })).toBeInTheDocument();
  });
});

describe('gift page extras', () => {
  it('saves a gift to the wishlist when signed in', async () => {
    signedIn();
    let saved = '';
    server.use(
      http.get(`${BASE}/me/wishlist`, () => HttpResponse.json(saved ? [{ id: saved }] : [])),
      http.put(`${BASE}/me/wishlist/:id`, ({ params }) => { saved = String(params.id); return new HttpResponse(null, { status: 204 }); }),
    );
    renderApp('/gifts/photo-mug');
    await userEvent.click(await screen.findByRole('button', { name: /Save for later/ }));
    await waitFor(() => expect(saved).toBe('id-photo-mug'));
    expect(await screen.findByRole('button', { name: /Saved/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('invites signed-out visitors to sign in instead, and shows no review form', async () => {
    renderApp('/gifts/photo-mug');
    expect(await screen.findByRole('link', { name: /Save for later/ })).toHaveAttribute('href', expect.stringContaining('/login?next='));
    expect(screen.queryByRole('form', { name: 'Write a review' })).toBeNull();
  });

  it('posts a review with a rating', async () => {
    signedIn();
    let sent: unknown;
    server.use(
      http.get(`${BASE}/me/wishlist`, () => HttpResponse.json([])),
      http.post(`${BASE}/products/photo-mug/reviews`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ id: 'r1', rating: 5, verified: true }, { status: 201 }); }),
    );
    renderApp('/gifts/photo-mug');
    await userEvent.click(await screen.findByRole('button', { name: 'Post review' }));
    expect(await screen.findByText('Choose a rating from 1 to 5.')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('5 ★'));
    await userEvent.type(screen.getByLabelText('Your review (optional)'), 'Lovely');
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByText('Thank you for your review.')).toBeInTheDocument();
    expect(sent).toEqual({ rating: 5, text: 'Lovely' });
  });
});
