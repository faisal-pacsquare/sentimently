import type { ApiClient, RequestOptions } from './client';
import type {
  CheckoutRequest, CheckoutResponse, CodeCheck, Customer, GiftLinkPreview, Hub, Kind, Order, Page,
  PersonalisationOptions, Product, ProductQuery, Quote, QuoteRequest, Reminder, Review, Session,
  StoreSettings, SuggestResult, TaxonomyItem, TrackResult,
} from './types';

type Opts = Pick<RequestOptions, 'signal'>;

/** Every storefront call, typed. Admin calls live in the admin app. */
export function createApi(c: ApiClient) {
  return {
    // ----- catalogue (public) -----
    products: (q: ProductQuery = {}, o?: Opts) => c.get<Page<Product>>('/products', { query: { ...q }, ...o }),
    /** Search-as-you-type: gifts and groups matching what has been typed so far. Posted gifts only: the shop does not sell digital gifts. */
    suggest: (q: string, o?: Opts) => c.get<SuggestResult>('/search/suggest', { query: { q, type: 'physical' }, ...o }),
    product: (slug: string, o?: Opts) => c.get<Product>(`/products/${encodeURIComponent(slug)}`, o),
    taxonomy: (kind: Kind, o?: Opts) => c.get<TaxonomyItem[]>(`/taxonomy/${kind}`, o),
    hub: (kind: Kind, slug: string, q: ProductQuery = {}, o?: Opts) =>
      c.get<Hub>(`/taxonomy/${kind}/${encodeURIComponent(slug)}`, { query: { ...q }, ...o }),
    store: (o?: Opts) => c.get<StoreSettings>('/store', o),
    options: (o?: Opts) => c.get<PersonalisationOptions>('/personalisation/options', o),
    reviews: (slug: string, o?: Opts) => c.get<Review[]>(`/products/${encodeURIComponent(slug)}/reviews`, o),
    addReview: (slug: string, body: { rating: number; text?: string }) =>
      c.post<{ id: string; rating: number; text?: string; verified: boolean }>(`/products/${encodeURIComponent(slug)}/reviews`, body),

    // ----- pricing and checkout -----
    quote: (body: QuoteRequest, o?: Opts) => c.post<Quote>('/quote', body, o),
    checkout: (body: CheckoutRequest, idempotencyKey: string) => c.post<CheckoutResponse>('/checkout', body, { idempotencyKey }),

    // ----- after the purchase (order number + email) -----
    track: (number: string, email: string) => c.post<TrackResult>('/orders/track', { number, email }),
    cancelOrder: (number: string, email: string, reason?: string) =>
      c.post<{ number: string; status: 'cancelled'; refund: { amount: number; dueBy: string; note: string } | null }>('/orders/cancel', { number, email, reason }),
    requestReturn: (body: {
      number: string; email: string; kind: 'return' | 'damaged'; reason: string;
      photoUrls?: string[]; lines?: number[]; confirmUnused?: boolean;
    }) => c.post<{ id: string; status: string; refundAmount: number }>('/orders/returns', body),
    checkGiftCard: (code: string) => c.post<CodeCheck>('/gift-cards/check', { code }),
    contact: (body: { name: string; email: string; phone?: string; orderNumber?: string; topic: string; subject: string; message: string }) =>
      c.post<{ id: string; message: string }>('/contact', body),

    // ----- gift links (recipient) -----
    giftLink: (token: string, o?: Opts) => c.get<GiftLinkPreview>(`/gift-links/${encodeURIComponent(token)}`, o),
    claimGiftLink: (token: string, body: { address: string; phone: string; name?: string }) =>
      c.post<{ message: string }>(`/gift-links/${encodeURIComponent(token)}/claim`, body),

    // ----- accounts -----
    register: (body: { email: string; password: string; name?: string }) => c.post<Session>('/auth/register', body, { auth: false }),
    login: (body: { email: string; password: string }) => c.post<Session>('/auth/login', body, { auth: false }),
    google: (idToken: string) => c.post<Session>('/auth/google', { idToken }, { auth: false }),
    verifyEmail: (token: string) => c.post<{ message: string; customer: Customer }>('/auth/verify-email', { token }, { auth: false }),
    resendVerification: () => c.post<{ message: string; sent: boolean }>('/auth/resend-verification'),
    forgotPassword: (email: string) => c.post<{ message: string }>('/auth/forgot-password', { email }, { auth: false }),
    resetPassword: (token: string, password: string) => c.post<{ message: string }>('/auth/reset-password', { token, password }, { auth: false }),

    me: (o?: Opts) => c.get<Customer>('/me', o),
    updateMe: (body: { name?: string; phone?: string }) => c.patch<Customer>('/me', body),
    claimOrder: (number: string, email: string) => c.post<{ number: string; added: boolean }>('/me/claim-order', { number, email }),
    myOrders: (o?: Opts) => c.get<Order[]>('/orders', o),
    myOrder: (number: string, o?: Opts) => c.get<Order>(`/orders/${encodeURIComponent(number)}`, o),
    wishlist: (o?: Opts) => c.get<Product[]>('/me/wishlist', o),
    addToWishlist: (productId: string) => c.put<void>(`/me/wishlist/${encodeURIComponent(productId)}`),
    removeFromWishlist: (productId: string) => c.delete<void>(`/me/wishlist/${encodeURIComponent(productId)}`),
    reminders: (o?: Opts) => c.get<Reminder[]>('/me/reminders', o),
    addReminder: (body: { label: string; date: string; recipientName?: string; notifyDaysBefore?: number }) => c.post<Reminder>('/me/reminders', body),
    updateReminder: (id: string, body: Partial<{ label: string; date: string; recipientName: string; notifyDaysBefore: number }>) =>
      c.patch<Reminder>(`/me/reminders/${encodeURIComponent(id)}`, body),
    deleteReminder: (id: string) => c.delete<void>(`/me/reminders/${encodeURIComponent(id)}`),
    exportMyData: () => c.get<Record<string, unknown>>('/me/export'),
    deleteAccount: (password?: string) => c.delete<void>('/me', { password }),
  };
}

export type Api = ReturnType<typeof createApi>;
