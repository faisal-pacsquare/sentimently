import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { BasketProvider } from '../lib/basket';
import { makeQueryClient } from '../lib/queries';

/** Renders the whole storefront at an address, with fresh caches, like a visitor arriving there. */
export function renderApp(path = '/') {
  const client = makeQueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <BasketProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </BasketProvider>
    </QueryClientProvider>,
  );
  return { ...utils, client };
}
