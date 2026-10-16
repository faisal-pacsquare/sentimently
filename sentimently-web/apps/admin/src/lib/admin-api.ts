import type { Customer, OrderStatus, PaymentMethod, PersonalisationOptions, Product, Rate, Session, TaxonomyItem } from '@sentimently/api';
import { client } from './core';

type Opts = { signal?: AbortSignal };

export interface OrderRow {
  id: string; number: string; status: OrderStatus; createdAt: string;
  contactName?: string; contactEmail: string; city?: string; deliveryDate?: string;
  total: number; paymentMethod: PaymentMethod; itemCount: number; personalised: boolean;
}
export interface Paged<T> { data: T[]; page: number; pageSize: number; total: number }

export interface AdminLine {
  productId: string; slug: string; name: string; type: 'physical' | 'digital'; quantity: number; unitPrice: number; lineTotal: number;
  extras: { code: string; name: string; price: number }[];
  personalisation?: { recipientName: string; relationship: string; message?: string; cardDesign: string };
}
export interface OrderEvent { type: string; at: string; by?: string; from?: OrderStatus; to?: OrderStatus; note?: string }
export interface AdminOrder {
  id: string; number: string; status: OrderStatus; createdAt: string;
  contactEmail: string; contactName?: string; contactPhone?: string;
  paymentMethod: PaymentMethod; itemsTotal: number; extrasTotal: number; deliveryFee: number; discount: number; total: number;
  promoCode?: string; city?: string; deliveryDate?: string; estimatedBy?: string; sameDay?: boolean;
  delivery?: { method: 'address' | 'gift_link'; address?: string; city: string; phone?: string; courier?: string; trackingRef?: string; attempts: number; redeliveries?: number };
  redeliveryFeeDue?: number;
  lines: AdminLine[]; events: OrderEvent[];
}
export interface AdminOrderDetail {
  order: AdminOrder;
  payments: { id: string; method: PaymentMethod; status: string; amount: number; gatewayRef?: string }[];
  digitalGifts: { id: string; kind: string; recipientEmail: string; status: string; sendAt?: string; sentAt?: string; codeHint: string; attempts: number; lastError?: string }[];
  giftLink?: { isClaimed: boolean; expiresAt: string };
}

export interface ProductionView {
  id: string; number: string; status: OrderStatus; deliveryDate?: string; city?: string; sameDay?: boolean;
  lines: { name: string; quantity: number; extras: { code: string; name: string }[]; personalisation?: AdminLine['personalisation'] }[];
}
export interface Rota {
  date: string; total: number;
  cities: { city: string; orders: {
    id: string; number: string; status: OrderStatus; sameDay: boolean; recipientName: string | null; address: string | null; phone: string | null;
    waitingForRecipientAddress: boolean; courier: string | null; trackingRef: string | null; attempts: number; cashToCollect: number; items: string[];
  }[] }[];
}

export interface ReturnRequest {
  id: string; orderId: string; orderNumber: string; kind: 'return' | 'damaged'; reason: string; photoUrls: string[];
  status: 'requested' | 'approved' | 'rejected' | 'completed'; resolution?: 'refund' | 'replacement'; refundAmount: number; staffNote?: string; createdAt: string;
}
export interface Refund {
  id: string; orderNumber: string; reason: 'cancelled' | 'return' | 'damaged'; amount: number; method: PaymentMethod;
  status: 'pending' | 'processed'; dueBy: string; arrivalNote: string; processedAt?: string;
}
export interface AdminReview { id: string; productId: string; rating: number; text?: string; verified: boolean; status: 'published' | 'hidden'; createdAt: string }
export interface ContactMessage { id: string; name: string; email: string; phone?: string; orderNumber?: string; topic: string; subject: string; message: string; status: 'new' | 'in_progress' | 'closed'; createdAt: string }

export interface Summary {
  range: { from: string | null; to: string | null };
  sales: { orders: number; revenue: number; averageOrderValue: number; itemsSold: number };
  byStatus: Record<string, number>;
  byPaymentMethod: Record<string, { orders: number; revenue: number }>;
  byCity: Record<string, { orders: number; revenue: number }>;
  delivery: { delivered: number; onTimePercent: number | null; averageDaysToDeliver: number | null; ordersWithFailedAttempts: number };
  promoUse: Record<string, { orders: number; discountTotal: number }>;
  topProducts: { productId: string; name: string; quantity: number; revenue: number }[];
  refunds: { pending: { count: number; amount: number }; processed: { count: number; amount: number } };
}

/** A gift as the studio sees it: the stored record, with no shop-front price fields. */
export type AdminProduct = Omit<Product, 'effectivePrice' | 'onOffer'>;
export type ProductInput = Pick<AdminProduct, 'slug' | 'name' | 'description' | 'price' | 'type' | 'stock' | 'category'> & Partial<Pick<AdminProduct,
  'offerPrice' | 'digitalKind' | 'isMadeToOrder' | 'leadTimeMinDays' | 'leadTimeMaxDays' | 'isPerishable' | 'isActive' | 'sentiments' | 'occasions' | 'recipients' | 'allowedExtras' | 'imageUrls'>>;
export type GroupKind = 'sentiment' | 'occasion' | 'recipient' | 'category';
export type GroupInput = { kind: GroupKind; slug: string; name: string; blurb?: string; image?: string; sortOrder?: number };

export interface AdminStore {
  announcement?: string | null; banner?: string | null;
  freeDeliveryThreshold: number; sameDayCutoffHour: number;
  deliveryRates: Record<string, Rate>; restOfPakistan: Rate; sameDayCapacity: Record<string, number>;
  contactPhone?: string | null; contactEmail?: string | null; socialLinks: Record<string, string>;
  bankTransferInstructions?: string | null;
}
export type StorePatch = Partial<AdminStore>;
export interface Promo { id: string; code: string; percent: number; minOrder: number; firstOrderOnly: boolean; startsAt?: string | null; endsAt?: string | null; isActive: boolean }
export type PromoInput = Partial<Omit<Promo, 'id' | 'code'>>;
export interface Extra { id: string; name: string; price: number; isActive: boolean }
export interface TeamMember { id: string; email: string; name?: string; role: 'staff' | 'admin'; createdAt: string }

export interface OrderQuery { status?: string; q?: string; city?: string; from?: string; to?: string; page?: number; pageSize?: number }

export const adminApi = {
  login: (body: { email: string; password: string }) => client.post<Session>('/auth/login', body, { auth: false }),
  me: (o?: Opts) => client.get<Customer>('/me', o),

  orders: (q: OrderQuery, o?: Opts) => client.get<Paged<OrderRow>>('/admin/orders', { query: { ...q }, ...o }),
  order: (id: string, o?: Opts) => client.get<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(id)}`, o),
  move: (id: string, body: { status: OrderStatus; note?: string; courier?: string; trackingRef?: string }) =>
    client.post<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(id)}/status`, body),
  production: (o?: Opts) => client.get<{ preparing: ProductionView[]; inProduction: ProductionView[] }>('/admin/production', o),
  dispatch: (date?: string, o?: Opts) => client.get<Rota>('/admin/dispatch', { query: { date }, ...o }),
  retryDigital: (id: string) => client.post<unknown>(`/admin/digital-gifts/${encodeURIComponent(id)}/retry`),

  returns: (status?: string, o?: Opts) => client.get<ReturnRequest[]>('/admin/returns', { query: { status }, ...o }),
  decide: (id: string, body: { decision: 'approve' | 'reject'; resolution?: 'refund' | 'replacement'; note?: string }) =>
    client.post<ReturnRequest>(`/admin/returns/${encodeURIComponent(id)}/decision`, body),
  completeReturn: (id: string, body: { faulty?: boolean }) => client.post<ReturnRequest>(`/admin/returns/${encodeURIComponent(id)}/complete`, body),
  refunds: (o?: Opts) => client.get<Refund[]>('/admin/refunds', o),
  processRefund: (id: string) => client.post<Refund>(`/admin/refunds/${encodeURIComponent(id)}/process`),

  reviews: (o?: Opts) => client.get<AdminReview[]>('/admin/reviews', o),
  moderate: (id: string, status: 'published' | 'hidden') => client.patch<AdminReview>(`/admin/reviews/${encodeURIComponent(id)}`, { status }),
  inbox: (o?: Opts) => client.get<ContactMessage[]>('/admin/contact', o),
  setMessageStatus: (id: string, status: ContactMessage['status']) => client.patch<ContactMessage>(`/admin/contact/${encodeURIComponent(id)}`, { status }),

  products: (o?: Opts) => client.get<AdminProduct[]>('/admin/products', o),
  createProduct: (body: ProductInput) => client.post<AdminProduct>('/admin/products', body),
  updateProduct: (id: string, body: Partial<ProductInput>) => client.patch<AdminProduct>(`/admin/products/${encodeURIComponent(id)}`, body),
  hideProduct: (id: string) => client.delete<void>(`/admin/products/${encodeURIComponent(id)}`),
  /** The shop's group lists are cached for a minute at the edge; the extra query value makes the studio always see the latest. */
  groups: (kind: 'sentiments' | 'occasions' | 'recipients' | 'categories', o?: Opts) =>
    client.get<TaxonomyItem[]>(`/taxonomy/${kind}`, { query: { fresh: Date.now() }, ...o }),
  createGroup: (body: GroupInput) => client.post<TaxonomyItem>('/admin/taxonomy', body),
  updateGroup: (id: string, body: Partial<GroupInput>) => client.patch<TaxonomyItem>(`/admin/taxonomy/${encodeURIComponent(id)}`, body),
  options: (o?: Opts) => client.get<PersonalisationOptions>('/personalisation/options', o),

  store: (o?: Opts) => client.get<AdminStore>('/admin/store', o),
  saveStore: (body: StorePatch) => client.patch<AdminStore>('/admin/store', body),
  promos: (o?: Opts) => client.get<Promo[]>('/admin/promo-codes', o),
  createPromo: (body: PromoInput & { code: string; percent: number }) => client.post<Promo>('/admin/promo-codes', body),
  updatePromo: (code: string, body: PromoInput) => client.patch<Promo>(`/admin/promo-codes/${encodeURIComponent(code)}`, body),
  extras: (o?: Opts) => client.get<Extra[]>('/admin/extras', o),
  updateExtra: (id: string, body: Partial<Pick<Extra, 'name' | 'price' | 'isActive'>>) => client.patch<Extra>(`/admin/extras/${encodeURIComponent(id)}`, body),
  team: (o?: Opts) => client.get<TeamMember[]>('/admin/staff', o),
  addTeamMember: (body: { email: string; name?: string; password: string; role: 'staff' | 'admin' }) => client.post<TeamMember>('/admin/staff', body),
  removeTeamMember: (id: string) => client.delete<TeamMember>(`/admin/staff/${encodeURIComponent(id)}`),
  erasePerson: (email: string) => client.post<{ erased: boolean }>('/admin/privacy/erase', { email }),
  runJobs: () => client.post<Record<string, unknown>>('/admin/scheduler/run'),

  summary: (q: { from?: string; to?: string }, o?: Opts) => client.get<Summary>('/admin/reports/summary', { query: { ...q }, ...o }),
};
