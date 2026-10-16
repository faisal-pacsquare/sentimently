import { Doc, StorageDriver } from './storage.types';

/**
 * Default driver for now: data lives in process memory.
 * Collections start from the seed (the data/ JSON files, or a plain object in tests) and every
 * change is kept only until the process restarts. Nothing is written to disk.
 * On Vercel each instance has its own copy, so writes are not shared or durable
 * (accepted for now; see Phase0/09_Decisions_Log.md).
 */
export class MemoryDriver implements StorageDriver {
  readonly cacheTtlMs = Infinity;
  private store = new Map<string, Doc[]>();

  constructor(private readonly seed: StorageDriver | Record<string, Doc[]>) {}

  /**
   * JsonStore never changes an array it has loaded or saved (it copies before changing), so arrays are
   * handed over as they are. Only the seed is copied, once, so separate stores never share seed data.
   */
  async load(collection: string): Promise<Doc[]> {
    const held = this.store.get(collection);
    if (held) return held;
    const initial =
      'load' in this.seed && typeof this.seed.load === 'function'
        ? await (this.seed as StorageDriver).load(collection)
        : ((this.seed as Record<string, Doc[]>)[collection] ?? []);
    return structuredClone(initial);
  }

  async save(collection: string, docs: Doc[]): Promise<void> {
    this.store.set(collection, docs);
  }
}
