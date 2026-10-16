import { ApiClient, createApi } from '@sentimently/api';
import { session } from './session';

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

export const client = new ApiClient({
  baseUrl: API_BASE,
  getToken: () => session.get(),
  // The token was refused (expired, or the account was removed): forget it so the app shows signed-out state.
  onUnauthorized: () => session.clear(),
});

export const api = createApi(client);
