import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/inter';
import '@sentimently/ui/src/styles.css';
import './app.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { BasketProvider } from './lib/basket';
import { makeQueryClient } from './lib/queries';

const queryClient = makeQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BasketProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </BasketProvider>
    </QueryClientProvider>
  </StrictMode>,
);
