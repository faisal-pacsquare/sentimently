export interface Doc {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** Thrown by save() when another instance changed the collection since it was loaded. */
export class ConflictError extends Error {
  constructor(collection: string) {
    super(`Write conflict on ${collection}`);
  }
}

/** A storage driver loads and saves a whole collection. Swap it to change where data lives. */
export interface StorageDriver {
  /** How long JsonStore may serve reads from memory. Infinity for a single local process. */
  readonly cacheTtlMs: number;
  load(collection: string): Promise<Doc[]>;
  /** Must throw ConflictError if the collection changed since the last load() of it. */
  save(collection: string, docs: Doc[]): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** Collections kept as JSON files in data/. */
export const COLLECTIONS = [
  'taxonomy',
  'products',
  'extras',
  'customers',
  'reviews',
  'wishlists',
  'reminders',
  'promoCodes',
  'orders',
  'payments',
  'giftLinks',
  'digitalGifts',
  'contactMessages',
  'returns',
  'refunds',
  'storeConfig',
] as const;
export type Collection = (typeof COLLECTIONS)[number];
