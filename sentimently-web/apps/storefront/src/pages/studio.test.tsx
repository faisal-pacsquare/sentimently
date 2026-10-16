import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { BASE, apiError, seen, server } from '../test/server';
import { renderApp } from '../test/render';

describe('personalisation studio', () => {
  it('asks for a name and a relationship before adding anything', async () => {
    renderApp('/studio/photo-mug');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to gift box' }));
    expect(await screen.findByText('Tell us who this gift is for.')).toBeInTheDocument();
    expect(screen.getByText('Choose how they are related to you.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /personalise photo mug/i })).toBeInTheDocument();
  });

  it('counts characters, refuses a message that is too long, and fills a starter line', async () => {
    renderApp('/studio/photo-mug');
    const box = await screen.findByLabelText('Your message');
    await userEvent.type(box, 'Happy birthday dear friend!!');
    expect(screen.getByText('28 / 20 characters')).toBeInTheDocument();
    expect(screen.getByText(/8 characters too long/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Help me write it'));
    await userEvent.click(screen.getByRole('button', { name: 'Thinking of you today.' }));
    expect(box).toHaveValue('Thinking of you today.');
  });

  it('adds a personalised line without sending a price, and shows the gift box', async () => {
    renderApp('/studio/photo-mug');
    await userEvent.type(await screen.findByLabelText('Who is it for?'), 'Ayesha');
    await userEvent.selectOptions(screen.getByLabelText('They are your…'), 'Friend');
    await userEvent.click(screen.getByLabelText(/gift wrap/i));
    await userEvent.click(screen.getByRole('button', { name: 'Add to gift box' }));
    expect(await screen.findByRole('heading', { name: 'Your gift box' })).toBeInTheDocument();
    const quotes = seen.filter((s) => s.url.pathname.endsWith('/quote'));
    expect(JSON.stringify(quotes.map((q) => q.body))).not.toMatch(/price/i);
    expect(screen.getByText(/For Ayesha/)).toBeInTheDocument();
  });

  it('does not offer personalisation for a digital gift', async () => {
    renderApp('/studio/egift-card');
    expect(await screen.findByRole('heading', { name: /could not find/i })).toBeInTheDocument();
  });

  it('shows a retry, not "not found", when the choices fail to load', async () => {
    server.use(http.get(`${BASE}/personalisation/options`, () => apiError(500, 'internal')));
    renderApp('/studio/photo-mug');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/could not find/i)).toBeNull();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
