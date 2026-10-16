import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { apiError, BASE, makeProduct, seen, server } from '../test/server';

const lastProductsRequest = () => [...seen].reverse().find((r) => r.url.pathname.endsWith('/products'))!.url.searchParams;

describe('layout', () => {
  it('has the landmarks a keyboard or screen-reader user needs', async () => {
    renderApp('/');
    expect(screen.getByRole('link', { name: /skip to content/i })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Search the shop' })).toBeInTheDocument();
    expect(await screen.findByRole('note')).toHaveTextContent('Free delivery over Rs 5,000');
    expect(screen.getByRole('link', { name: /gift box, 0 items/i })).toBeInTheDocument();
  });

  it('still works when the store settings cannot be loaded', async () => {
    server.use(http.get(`${BASE}/store`, () => apiError(500, 'internal_error')));
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'I miss you' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('home', () => {
  it('starts from the feelings, and shows popular gifts', async () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: /every feeling deserves a gift/i })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'I miss you' })).toHaveAttribute('href', '/browse/feelings/i-miss-you');
    expect(await screen.findByRole('link', { name: 'Photo mug' })).toHaveAttribute('href', '/gifts/photo-mug');
  });

  it('says the shop is being stocked when there are no feelings yet', async () => {
    server.use(http.get(`${BASE}/taxonomy/sentiments`, () => HttpResponse.json([])), http.get(`${BASE}/products`, () => HttpResponse.json({ data: [], page: 1, pageSize: 8, total: 0 })));
    renderApp('/');
    expect((await screen.findAllByText(/our gifts are being added/i)).length).toBeGreaterThan(0);
  });

  it('shows a failure as a failure with a way to retry, not as an empty shop', async () => {
    server.use(http.get(`${BASE}/products`, () => apiError(500, 'internal_error')));
    renderApp('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(alert).toHaveTextContent('req-test-1'); // a reference to quote to support
    expect(screen.queryByText(/our gifts are being added/i)).toBeNull();

    server.resetHandlers();
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('link', { name: 'Photo mug' })).toBeInTheDocument();
  });
});

describe('shop', () => {
  it('lists the gifts and says how many', async () => {
    renderApp('/shop');
    expect(await screen.findAllByRole('article')).toHaveLength(5);
    expect(screen.getByText('Showing 1 to 5 of 5 gifts')).toBeInTheDocument();
  });

  it('filters by feeling through the address, so the result can be shared', async () => {
    renderApp('/shop');
    await screen.findAllByRole('article');
    await userEvent.selectOptions(await screen.findByLabelText('Feeling'), 'i-miss-you');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(lastProductsRequest().get('sentiment')).toBe('i-miss-you');
    expect(lastProductsRequest().get('page')).toBe('1'); // changing a filter always starts again at page 1
  });

  it('starts filtered when the address already says so', async () => {
    renderApp('/shop?type=digital&sort=price_desc');
    expect(await screen.findAllByRole('article')).toHaveLength(1);
    expect(lastProductsRequest().get('type')).toBe('digital');
    expect(lastProductsRequest().get('sort')).toBe('price_desc');
    expect(screen.getByRole('button', { name: 'Digital' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores nonsense in the address instead of breaking', async () => {
    renderApp('/shop?type=banana&sort=bogus&page=-3&minPrice=abc');
    expect(await screen.findAllByRole('article')).toHaveLength(5);
    const q = lastProductsRequest();
    expect(q.get('type')).toBeNull();
    expect(q.get('sort')).toBeNull();
    expect(q.get('minPrice')).toBeNull();
  });

  it('budget chips filter by the price people actually pay', async () => {
    renderApp('/shop');
    await screen.findAllByRole('article');
    await userEvent.click(screen.getByRole('button', { name: 'Under Rs 1,000' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(lastProductsRequest().get('maxPrice')).toBe('999');
    expect(screen.getByRole('link', { name: 'Photo mug' })).toBeInTheDocument(); // Rs 999 offer price
    await userEvent.click(screen.getByRole('button', { name: 'Under Rs 1,000' })); // toggles off
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
  });

  it('searches, and offers to clear when nothing matches', async () => {
    renderApp('/shop');
    await screen.findAllByRole('article');
    await userEvent.type(screen.getByLabelText('Search these gifts'), 'zzzz{Enter}');
    expect(await screen.findByRole('heading', { name: 'No gifts match' })).toBeInTheDocument();
    expect(screen.getByText('No gifts match', { selector: 'p' })).toBeInTheDocument(); // the live count
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findAllByRole('article')).toHaveLength(5);
  });

  it('pages through long results', async () => {
    const many = Array.from({ length: 30 }, (_, i) => makeProduct({ slug: `g-${i}`, name: `Gift ${i}`, price: 1000 + i }));
    server.use(
      http.get(`${BASE}/products`, ({ request }) => {
        const u = new URL(request.url);
        const page = Number(u.searchParams.get('page') ?? 1);
        seen.push({ method: 'GET', url: u });
        return HttpResponse.json({ data: many.slice((page - 1) * 12, page * 12), page, pageSize: 12, total: many.length });
      }),
    );
    renderApp('/shop');
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(lastProductsRequest().get('page')).toBe('2');
    expect(await screen.findByText('Showing 13 to 24 of 30 gifts')).toBeInTheDocument();
  });

  it('a failed search is an error with a retry, never "no gifts match"', async () => {
    server.use(http.get(`${BASE}/products`, () => apiError(503, 'internal_error')));
    renderApp('/shop?q=mug');
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/no gifts match/i)).toBeNull();
  });

  it('says plainly when the shop cannot be reached at all', async () => {
    server.use(http.get(`${BASE}/products`, () => HttpResponse.error()));
    renderApp('/shop');
    expect(await screen.findByText(/can't reach the shop/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/no gifts match/i)).toBeNull();
  });

  it('when the server asks us to wait a long time, says so and does not hammer it', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/products`, () => {
        calls++;
        return HttpResponse.json({ error: { code: 'rate_limited', message: 'slow down', requestId: 'r' } }, { status: 429, headers: { 'retry-after': '60' } });
      }),
    );
    renderApp('/shop');
    expect(await screen.findByText(/lots of people are shopping/i)).toBeInTheDocument();
    expect(calls).toBe(1);
  });
});

describe('browse groups', () => {
  it('lists the groups with their gift counts', async () => {
    renderApp('/browse/occasions');
    const link = await screen.findByRole('link', { name: /birthday/i });
    expect(link).toHaveAttribute('href', '/browse/occasions/birthday');
    expect(link).toHaveTextContent('1 gift');
  });

  it('a group page is the shop with one filter fixed', async () => {
    renderApp('/browse/feelings/i-miss-you');
    expect(await screen.findByRole('heading', { level: 1, name: 'I miss you' })).toBeInTheDocument();
    expect(screen.getByText('For someone far away')).toBeInTheDocument();
    expect(await screen.findAllByRole('article')).toHaveLength(2);
    expect(lastProductsRequest().get('sentiment')).toBe('i-miss-you');
    expect(await screen.findByLabelText('Feeling')).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Digital' }));
    await waitFor(() => expect(lastProductsRequest().get('sentiment')).toBe('i-miss-you')); // the fixed filter stays
  });

  it('an unknown group is a real "not found"', async () => {
    renderApp('/browse/feelings/nope');
    expect(await screen.findByRole('heading', { name: /could not find that page/i })).toBeInTheDocument();
  });

  it('but a group list that fails to load is an error, not "not found"', async () => {
    server.use(http.get(`${BASE}/taxonomy/sentiments`, () => apiError(500, 'internal_error')));
    renderApp('/browse/feelings/i-miss-you');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/could not find/i)).toBeNull();
  });

  it('an unknown kind of group is not found', async () => {
    renderApp('/browse/colours');
    expect(await screen.findByRole('heading', { name: /could not find that page/i })).toBeInTheDocument();
  });
});
