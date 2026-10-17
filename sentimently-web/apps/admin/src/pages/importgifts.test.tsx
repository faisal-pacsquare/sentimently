import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiError, renderAdmin } from '../test/render';
import { BASE, server } from '../test/setup';

const csv = (name: string, body = 'a,b\n1,2') => new File([body], name, { type: 'text/csv' });
const report = (o: Record<string, unknown> = {}) => ({ saved: false, addedGifts: ['Ribbon rose', 'Gajray'], skippedGifts: ['Photo mug'], addedGroups: ['category: Ribbon flower bouquets'], warnings: [], ...o });

describe('add gifts from a spreadsheet', () => {
  it('is reachable from the catalogue', async () => {
    server.use(http.get(`${BASE}/admin/products`, () => HttpResponse.json([])));
    renderAdmin('/catalogue');
    expect(await screen.findByRole('link', { name: 'Add from a spreadsheet' })).toHaveAttribute('href', '/catalogue/import');
  });

  it('cannot check or add before a gifts file is chosen', async () => {
    renderAdmin('/catalogue/import');
    expect(await screen.findByRole('heading', { name: 'Add gifts from a spreadsheet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the files' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to the shop' })).toBeDisabled();
  });

  it('checks first without saving, then adds, and reports what was added and what was left alone', async () => {
    const calls: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/admin/catalogue/import`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push(body);
        return HttpResponse.json(report({ saved: body.dryRun === false }));
      }),
    );
    renderAdmin('/catalogue/import');
    await userEvent.upload(await screen.findByLabelText('Groups file (optional)'), csv('groups.csv', 'kind,slug\ncategory,x'));
    await userEvent.upload(screen.getByLabelText('Gifts file'), csv('gifts.csv', 'slug,name\nrose,Rose'));
    expect(await screen.findByText('Chosen: gifts.csv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to the shop' })).toBeDisabled(); // not before a check
    await userEvent.click(screen.getByRole('button', { name: 'Check the files' }));
    expect(await screen.findByText('The check passed')).toBeInTheDocument();
    expect(screen.getByText(/Gifts to add \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/category: Ribbon flower bouquets/)).toBeInTheDocument();
    expect(screen.getByText(/left as they are \(1\): Photo mug/)).toBeInTheDocument();
    expect(calls).toEqual([{ productsCsv: 'slug,name\nrose,Rose', taxonomyCsv: 'kind,slug\ncategory,x', dryRun: true }]);

    await userEvent.click(screen.getByRole('button', { name: 'Add to the shop' }));
    expect(await screen.findByRole('heading', { name: 'Added' })).toBeInTheDocument();
    expect(calls[1]).toMatchObject({ dryRun: false });
    expect(screen.getByRole('link', { name: 'See the catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to the shop' })).toBeDisabled(); // already saved
  });

  it('shows each wrong row and says nothing was added', async () => {
    server.use(
      http.post(`${BASE}/admin/catalogue/import`, () =>
        apiError(400, 'validation_error', 'The request is not valid.', ['products.csv line 3: category "x" is not in taxonomy.csv', 'products.csv line 5: price is required']),
      ),
    );
    renderAdmin('/catalogue/import');
    await userEvent.upload(await screen.findByLabelText('Gifts file'), csv('gifts.csv'));
    await userEvent.click(screen.getByRole('button', { name: 'Check the files' }));
    expect(await screen.findByText(/products\.csv line 3: category "x"/)).toBeInTheDocument();
    expect(screen.getByText(/products\.csv line 5: price is required/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was added/)).toBeInTheDocument();
    expect(screen.queryByText('The check passed')).toBeNull();
  });

  it('says when everything is already in the shop', async () => {
    server.use(http.post(`${BASE}/admin/catalogue/import`, () => HttpResponse.json(report({ addedGifts: [], addedGroups: [] }))));
    renderAdmin('/catalogue/import');
    await userEvent.upload(await screen.findByLabelText('Gifts file'), csv('gifts.csv'));
    await userEvent.click(screen.getByRole('button', { name: 'Check the files' }));
    expect(await screen.findByText(/already in the shop, so there is nothing to add/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to the shop' })).toBeDisabled();
  });

  it('does not call a lost connection a problem with the file', async () => {
    server.use(http.post(`${BASE}/admin/catalogue/import`, () => HttpResponse.error()));
    renderAdmin('/catalogue/import');
    await userEvent.upload(await screen.findByLabelText('Gifts file'), csv('gifts.csv'));
    await userEvent.click(screen.getByRole('button', { name: 'Check the files' }));
    await waitFor(() => expect(screen.getByText(/server could not be reached/)).toBeInTheDocument());
    expect(screen.queryByText(/Nothing was added. Fix these rows/)).toBeNull();
  });

  it('refuses a file that is too big before sending it', async () => {
    renderAdmin('/catalogue/import');
    await userEvent.upload(await screen.findByLabelText('Gifts file'), csv('huge.csv', 'x'.repeat(95_000)));
    expect(await screen.findByText(/huge\.csv is too big/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the files' })).toBeDisabled();
  });
});
