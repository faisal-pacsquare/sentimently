import { Doc } from '../storage/storage.types';

export type TaxonomyKind = 'sentiment' | 'occasion' | 'recipient' | 'category';

export interface TaxonomyItem extends Doc {
  kind: TaxonomyKind;
  slug: string;
  name: string;
  blurb?: string;
  image?: string;
  sortOrder?: number;
}

export interface Product extends Doc {
  slug: string;
  name: string;
  description: string;
  price: number;
  offerPrice?: number | null;
  type: 'physical' | 'digital';
  stock: number;
  leadTimeMinDays?: number | null;
  leadTimeMaxDays?: number | null;
  isMadeToOrder?: boolean;
  isPerishable?: boolean;
  isActive?: boolean;
  rating?: number | null;
  reviewCount?: number;
  imageUrls?: string[];
  category: string; // category slug
  sentiments?: string[]; // sentiment slugs
  occasions?: string[]; // occasion slugs
  recipients?: string[]; // recipient group slugs
  allowedExtras?: string[]; // extra codes
  /** Digital gifts only: an e-gift card (12-month code) or a greeting card. */
  digitalKind?: 'egift' | 'greeting';
}

export type ProductView = Product & {
  effectivePrice: number;
  onOffer: boolean;
};

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
