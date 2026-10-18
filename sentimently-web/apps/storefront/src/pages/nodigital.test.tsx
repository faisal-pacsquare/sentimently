import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE, server } from '../test/server';
import { renderApp } from '../test/render';

const group = (slug: string, name: string) => ({ id: `category-${slug}`, kind: 'category', slug, name, productCount: 3, sortOrder: 0 });

describe('digital gifts are not on the shop', () => {
  it('has no "Digital gifts" link in the menu, and no gift-card check link in the footer', async () => {
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Shop all' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /digital/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /gift card/i })).toBeNull();
  });

  it('has no digital call to action or promise on the home page', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /digital gift/i })).toBeNull();
    expect(screen.queryByText(/e-gift|greeting card|digital in minutes/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Browse by category' })).toHaveAttribute('href', '/browse/categories');
  });

  describe('what the shop asks the server for', () => {
    const asked: (string | null)[] = [];
    beforeEach(() => {
      asked.length = 0;
      server.events.on('request:start', ({ request }) => {
        const url = new URL(request.url);
        if (url.pathname.endsWith('/products')) asked.push(url.searchParams.get('type'));
      });
    });
    afterEach(() => server.events.removeAllListeners());

    it('posted gifts only on the shop page, including a search', async () => {
      renderApp('/shop?q=mug');
      await screen.findAllByRole('article');
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((t) => t === 'physical')).toBe(true);
    });

    it('posted gifts only on the home page', async () => {
      renderApp('/');
      await screen.findAllByRole('article');
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((t) => t === 'physical')).toBe(true);
    });
  });

  it('the shop filters have no "Digital" or "Posted gifts" choice', async () => {
    renderApp('/shop');
    await screen.findAllByRole('article');
    expect(screen.queryByRole('button', { name: 'Digital' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Posted gifts' })).toBeNull();
  });

  it('the categories list leaves out the "Digital gifts" category', async () => {
    server.use(http.get(`${BASE}/taxonomy/categories`, () => HttpResponse.json([group('home', 'Home and living'), group('digital', 'Digital gifts'), group('flowers', 'Flowers')])));
    renderApp('/browse/categories');
    expect(await screen.findByText('Home and living')).toBeInTheDocument();
    expect(screen.getByText('Flowers')).toBeInTheDocument();
    expect(screen.queryByText('Digital gifts')).toBeNull();
  });

  it('the old gift-card check address is just not found', async () => {
    renderApp('/gift-card');
    expect(await screen.findByRole('heading', { name: /could not find that page/i })).toBeInTheDocument();
  });

  it('delivery help no longer lists digital gifts', async () => {
    renderApp('/delivery');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Digital gifts')).toBeNull();
    expect(screen.queryByText(/digital gifts cannot be returned/i)).toBeNull();
  });
});
