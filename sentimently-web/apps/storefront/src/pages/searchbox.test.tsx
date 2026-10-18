import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { BASE, apiError, server } from '../test/server';
import { renderApp } from '../test/render';

const RESULT = {
  products: [
    { slug: 'photo-mug', name: 'Photo mug', price: 999, onOffer: true, imageUrl: null },
    { slug: 'name-necklace', name: 'Name necklace', price: 3500, onOffer: false, imageUrl: null },
  ],
  groups: [{ kind: 'sentiment', slug: 'i-miss-you', name: 'I miss you', gifts: 2 }],
};

/** Answers the suggestion request and records every term asked for. */
const suggestions = (result: object = RESULT) => {
  const asked: { q: string | null; type: string | null }[] = [];
  server.use(
    http.get(`${BASE}/search/suggest`, ({ request }) => {
      const u = new URL(request.url);
      asked.push({ q: u.searchParams.get('q'), type: u.searchParams.get('type') });
      return HttpResponse.json(result);
    }),
  );
  return asked;
};

const box = () => screen.findByRole('combobox', { name: 'Search the shop' });
const list = () => screen.findByRole('listbox', { name: 'Suggestions' });
/** The list as it looks once the server has answered. */
const option = (text: string) =>
  waitFor(() => {
    const found = screen.getAllByRole('option').find((o) => o.textContent?.includes(text));
    if (!found) throw new Error(`no suggestion says "${text}" yet`);
    return found;
  });
const answered = async () => {
  await option('Photo mug');
  return list();
};

describe('search suggestions', () => {
  it('offers nothing, and asks the server nothing, until two letters are typed', async () => {
    const asked = suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'm');
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(asked).toEqual([]);
  });

  it('offers gifts and groups from the database as the person types, with prices', async () => {
    const asked = suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'mu');
    const options = within(await answered()).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'PPhoto mugRs 999', // the first letter is the picture's stand-in until a photo is uploaded
      'NName necklaceRs 3,500',
      'FeelingI miss you2 gifts',
      'See all results for “mu”',
    ]);
    expect(asked.at(-1)).toEqual({ q: 'mu', type: 'physical' }); // the shop sells posted gifts only
  });

  it('shows the typed letters in bold inside each name', async () => {
    suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'mug');
    const mug = await option('Photo mug');
    expect(within(mug).getByText('mug').tagName).toBe('MARK');
  });

  it('waits for a pause in typing instead of asking on every letter', async () => {
    const asked = suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'photo');
    await answered();
    expect(asked.map((a) => a.q)).toEqual(['photo']);
  });

  it('opening a gift suggestion goes to that gift', async () => {
    suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'mu');
    await userEvent.click(await option('Name necklace'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Name necklace' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opening a group suggestion goes to that group', async () => {
    suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'mi');
    await userEvent.click(await option('I miss you'));
    expect(await screen.findByRole('heading', { level: 1, name: 'I miss you' })).toBeInTheDocument();
  });

  it('works from the keyboard: arrows choose, Enter opens, Escape closes', async () => {
    suggestions();
    renderApp('/');
    const input = await box();
    await userEvent.type(input, 'mu');
    await answered();
    await userEvent.keyboard('{ArrowDown}');
    expect(await option('Photo mug')).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', (await option('Photo mug')).id);
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}'); // wraps round to the last row
    expect(await option('See all results')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.keyboard('{ArrowDown}'); // opens again, from the top
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Photo mug' })).toBeInTheDocument();
  });

  it('Enter with nothing chosen searches the whole shop for what was typed', async () => {
    suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'photo mug{Enter}');
    await waitFor(() => {
      const last = [...document.querySelectorAll('article')];
      expect(last.length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says so when nothing matches, and still offers the full search', async () => {
    suggestions({ products: [], groups: [] });
    renderApp('/');
    await userEvent.type(await box(), 'zzz');
    expect(await screen.findByText('Nothing matches “zzz” yet.')).toBeInTheDocument();
    expect(within(await list()).getByRole('option', { name: 'See all results for “zzz”' })).toBeInTheDocument();
  });

  it('says suggestions are unavailable when the server fails, and Enter still searches', async () => {
    server.use(http.get(`${BASE}/search/suggest`, () => apiError(500, 'internal_error')));
    renderApp('/');
    await userEvent.type(await box(), 'mug');
    expect(await screen.findByText(/Suggestions are not available right now/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing matches/)).toBeNull();
  });

  it('closes when the person clicks elsewhere', async () => {
    suggestions();
    renderApp('/');
    await userEvent.type(await box(), 'mu');
    await answered();
    await userEvent.click(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
