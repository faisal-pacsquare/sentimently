/**
 * Response shapes of the Sentimently API v1 (see Frontend_Integration_Guide.md).
 * The OpenAPI file describes requests; responses are written here by hand and kept in step by the tests.
 * Money is whole rupees (PKR). Dates are ISO 8601 UTC; "delivery dates" are plain YYYY-MM-DD in Pakistan time.
 */

export type Kind = 'sentiments' | 'occasions' | 'recipients' | 'categories';
export type ProductType = 'physical' | 'digital';
export type Sort = 'popularity' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
export type PaymentMethod = 'cod' | 'bank_transfer' | 'card';
export type Role = 'customer' | 'staff' | 'admin';

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  offerPrice?: number | null;
  /** The price to show and sort by: the offer price when there is one. */
  effectivePrice: number;
  onOffer: boolean;
  type: ProductType;
  digitalKind?: 'egift' | 'greeting';
  stock: number;
  isMadeToOrder?: boolean;
  leadTimeMinDays?: number | null;
  leadTimeMaxDays?: number | null;
  isPerishable?: boolean;
  isActive?: boolean;
  /** null until there are verified reviews: never invent stars. */
  rating?: number | null;
  reviewCount?: number;
  imageUrls?: string[];
  category: string;
  sentiments?: string[];
  occasions?: string[];
  recipients?: string[];
  allowedExtras?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SuggestResult {
  products: { slug: string; name: string; price: number; onOffer: boolean; imageUrl: string | null }[];
  groups: { kind: 'sentiment' | 'occasion' | 'recipient' | 'category'; slug: string; name: string; gifts: number }[];
}

export interface TaxonomyItem {
  id: string;
  kind: 'sentiment' | 'occasion' | 'recipient' | 'category';
  slug: string;
  name: string;
  blurb?: string;
  image?: string;
  sortOrder?: number;
  productCount?: number;
}

export interface Hub {
  hub: TaxonomyItem;
  products: Page<Product>;
}

export interface Rate {
  fee: number;
  minDays: number;
  maxDays: number;
  sameDay: boolean;
}

export interface StoreSettings {
  announcement: string | null;
  banner: string | null;
  freeDeliveryThreshold: number;
  sameDayCutoffHour: number;
  deliveryRates: Record<string, Rate>;
  restOfPakistan: Rate;
  digitalFee: number;
  contact: { phone: string | null; email: string | null };
  socialLinks: Record<string, string>;
  paymentMethods: PaymentMethod[];
  currency: 'PKR';
}

export interface PersonalisationOptions {
  relationships: string[];
  cardDesigns: string[];
  messageMaxLength: number;
  starterLines: string[];
  extras: { code: string; name: string; price: number }[];
}

export interface Review {
  id: string;
  rating: number;
  text?: string;
  verified: boolean;
  author: string;
  createdAt: string;
}

// ---------- quote and checkout ----------

export interface PersonalisationInput {
  recipientName: string;
  relationship: string;
  cardDesign: string;
  message?: string;
  extras?: string[];
}

export interface QuoteLineInput {
  productId: string;
  quantity: number;
  personalisation?: PersonalisationInput;
}

export interface QuoteRequest {
  lines: QuoteLineInput[];
  delivery?: { city?: string; method?: 'address' | 'gift_link'; date?: string; country?: 'PK' };
  promoCode?: string;
  email?: string;
}

export interface QuoteLine {
  productId: string;
  slug: string;
  name: string;
  type: ProductType;
  quantity: number;
  unitPrice: number;
  itemsTotal: number;
  extras: { code: string; name: string; price: number }[];
  extrasTotal: number;
  lineTotal: number;
  personalised: boolean;
}

export interface Quote {
  lines: QuoteLine[];
  itemsTotal: number;
  extrasTotal: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  currency: 'PKR';
  delivery: {
    city: string;
    method: 'address' | 'gift_link';
    fee: number;
    freeDelivery: boolean;
    sameDay: boolean;
    earliestDate: string;
    estimatedBy: string;
    requestedDate: string | null;
    perishable: boolean;
  } | null;
  promo: { code: string; applied: boolean; percent?: number; discount: number; reason?: string } | null;
  quotedAt: string;
}

export interface CheckoutLineInput extends QuoteLineInput {
  digital?: { recipientEmail: string; message?: string; sendAt?: string };
}

export interface CheckoutRequest {
  lines: CheckoutLineInput[];
  delivery?: { city?: string; method?: 'address' | 'gift_link'; date?: string; address?: string; phone?: string };
  promoCode?: string;
  contact?: { email?: string; name?: string; phone?: string };
  paymentMethod: PaymentMethod;
}

export type OrderStatus =
  | 'awaiting_payment' | 'placed' | 'paid' | 'preparing' | 'in_production' | 'dispatched'
  | 'delivered' | 'failed_delivery' | 'returned' | 'refunded' | 'cancelled';

export interface TimelineEntry {
  status: OrderStatus;
  label: string;
  at: string;
}

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  statusLabel: string;
  paymentMethod: PaymentMethod;
  currency: 'PKR';
  itemsTotal: number;
  extrasTotal: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  promoCode?: string;
  city?: string;
  deliveryDate?: string;
  estimatedBy?: string;
  sameDay?: boolean;
  contactEmail: string;
  contactName?: string;
  delivery?: { method: 'address' | 'gift_link'; address?: string; city: string; phone?: string; courier?: string; trackingRef?: string; claimed?: boolean };
  lines: {
    productId: string; slug: string; name: string; type: ProductType; quantity: number; unitPrice: number; lineTotal: number;
    extras: { code: string; name: string; price: number }[];
    personalisation?: { recipientName: string; relationship: string; message?: string; cardDesign: string };
  }[];
  timeline: TimelineEntry[];
  createdAt: string;
}

export interface CheckoutResponse {
  order: Order;
  payment: { method: PaymentMethod; instructions?: string; redirectUrl?: string };
  giftLink?: { url: string };
  replayed: boolean;
}

export interface TrackResult {
  number: string;
  status: OrderStatus;
  statusLabel: string;
  placedAt: string;
  deliveryDate: string | null;
  estimatedBy: string | null;
  timeline: TimelineEntry[];
}

// ---------- accounts ----------

export interface Customer {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  role: Role;
  authProvider: 'email' | 'google';
  emailVerified: boolean;
}

export interface Session {
  accessToken: string;
  customer: Customer;
}

export interface Reminder {
  id: string;
  label: string;
  date: string;
  recipientName?: string;
  notifyDaysBefore: number;
}

export interface GiftLinkPreview {
  status: 'ready' | 'claimed' | 'expired';
  recipientName: string | null;
  city: string | null;
}

export interface CodeCheck {
  valid: boolean;
  kind?: 'egift' | 'greeting';
  amount?: number;
  expiresAt?: string | null;
  reason?: 'expired' | 'not_found';
}

export interface ProductQuery {
  sentiment?: string;
  occasion?: string;
  recipient?: string;
  category?: string;
  type?: ProductType;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  sort?: Sort;
  page?: number;
  pageSize?: number;
}
