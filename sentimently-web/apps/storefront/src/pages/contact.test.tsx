import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';
import { BASE, apiError, server } from '../test/server';

describe('every page opens at the top', () => {
  it('scrolls to the top when you follow a link, so a footer link does not open the next page scrolled to its footer', async () => {
    renderApp('/shop');
    await screen.findByRole('heading', { name: 'All gifts' });
    const scroll = window.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scroll.mockClear();
    await userEvent.click(screen.getByRole('link', { name: 'Track an order' }));
    await screen.findByRole('heading', { name: 'Track an order' });
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });
});

describe('track an order: getting help', () => {
  it('offers a way to write to us, passing the order number on but never the email', async () => {
    renderApp('/track');
    await userEvent.type(await screen.findByLabelText('Order number'), 'SN-ABC12345');
    await userEvent.type(screen.getByLabelText('Email address'), 'zara@example.pk');
    const help = screen.getByRole('link', { name: 'write to us' });
    expect(help).toHaveAttribute('href', '/contact?topic=order&order=SN-ABC12345');
    expect(help.getAttribute('href')).not.toContain('zara');
  });

  it('points to it when the order cannot be found, and the contact form opens ready to fill in', async () => {
    server.use(http.post(`${BASE}/orders/track`, () => apiError(404, 'not_found')));
    renderApp('/track');
    await userEvent.type(await screen.findByLabelText('Order number'), 'SN-NOPE0001');
    await userEvent.type(screen.getByLabelText('Email address'), 'zara@example.pk');
    await userEvent.click(screen.getByRole('button', { name: 'Track' }));
    await screen.findByText(/could not find an order/);
    await userEvent.click(screen.getAllByRole('link', { name: 'write to us' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Contact us' })).toBeInTheDocument();
    expect(screen.getByLabelText('Order number (optional)')).toHaveValue('SN-NOPE0001');
    expect(screen.getByLabelText('What is it about?')).toHaveValue('order');
  });
});

describe('contact form', () => {
  const fill = async () => {
    await userEvent.type(await screen.findByLabelText('Your name'), 'Zara Khan');
    await userEvent.type(screen.getByLabelText('Email'), 'zara@example.pk');
    await userEvent.type(screen.getByLabelText('Subject'), 'Where is my order?');
    await userEvent.type(screen.getByLabelText('Message'), 'It was due yesterday.');
  };

  it('sends the message and says who will reply to which address', async () => {
    let sent: unknown;
    server.use(http.post(`${BASE}/contact`, async ({ request }) => { sent = await request.json(); return HttpResponse.json({ id: 'm1', message: 'Thank you. We will get back to you soon.' }, { status: 201 }); }));
    renderApp('/contact?topic=order&order=SN-ABC12345');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Thank you. We will get back to you soon.')).toBeInTheDocument();
    expect(screen.getByText('zara@example.pk')).toBeInTheDocument();
    expect(sent).toMatchObject({ name: 'Zara Khan', email: 'zara@example.pk', topic: 'order', orderNumber: 'SN-ABC12345', subject: 'Where is my order?' });
  });

  it('ignores a made-up topic in the address', async () => {
    renderApp('/contact?topic=hacked');
    expect(await screen.findByLabelText('What is it about?')).toHaveValue('other');
  });

  it('keeps what was typed and offers a retry when the server is down', async () => {
    server.use(http.post(`${BASE}/contact`, () => apiError(503, 'unavailable')));
    renderApp('/contact');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('It was due yesterday.');
  });

  it('shows the reasons when the server rejects the form', async () => {
    server.use(http.post(`${BASE}/contact`, () => apiError(400, 'validation_error', 'The request is not valid.', ['email must be an email'])));
    renderApp('/contact');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByText('email must be an email')).toBeInTheDocument());
  });
});
