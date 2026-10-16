import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Collection,
  ConflictError,
  Doc,
  STORAGE_DRIVER,
  StorageDriver,
} from './storage.types';

type NewDoc<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<Doc, 'id'>>;

/** What a write decides: the collection's next contents (the same array means "no change") and a result. */
type Plan<R> = { next: Doc[]; result: R };

/**
 * Document store over a StorageDriver.
 *
 * Rules that keep it correct:
 * - A stored array is never changed in place. Every write builds a new array, so readers (and the cache)
 *   always see a complete, consistent version.
 * - Callers only ever receive copies of documents, never the stored objects.
 * - Writes to a collection are serialised within a process, so read-modify-write sequences (stock) are safe.
 * - Across serverless instances the driver's compare-and-set protects the data: on a ConflictError the
 *   collection is reloaded and the write function runs again. So write functions must be pure: they may
 *   only change what they are given and must not send emails or call other services.
 *
 * Cost: mutate() copies the whole collection. appendIf() and mutateByIds() copy only what they touch,
 * which matters for large collections (orders), so prefer them on busy paths.
 */
@Injectable()
export class JsonStore {
  private static readonly MAX_ATTEMPTS = 5;
  private cache = new Map<string, { docs: Doc[]; at: number }>();
  private locks = new Map<string, Promise<unknown>>();
  private index = new Map<string, { docs: Doc[]; byId: Map<string, Doc> }>();

  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  private async docs(collection: Collection, fresh = false): Promise<Doc[]> {
    const hit = this.cache.get(collection);
    if (hit && !fresh && Date.now() - hit.at < this.driver.cacheTtlMs) {
      return hit.docs;
    }
    const docs = await this.driver.load(collection);
    this.cache.set(collection, { docs, at: Date.now() });
    return docs;
  }

  /** The single place where a write happens: one at a time per collection, saved, retried on a conflict. */
  private commit<R>(
    collection: Collection,
    build: (live: Doc[]) => Plan<R> | Promise<Plan<R>>,
  ): Promise<R> {
    const previous = this.locks.get(collection) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        for (let attempt = 1; ; attempt++) {
          // shared stores: always start from the latest copy
          const fresh = this.driver.cacheTtlMs !== Infinity;
          const live = await this.docs(collection, fresh);
          const { next, result } = await build(live);
          if (next !== live) {
            try {
              await this.driver.save(collection, next); // throws before the cache changes if the save fails
            } catch (e) {
              if (
                e instanceof ConflictError &&
                attempt < JsonStore.MAX_ATTEMPTS
              ) {
                this.cache.delete(collection);
                continue;
              }
              throw e;
            }
            this.cache.set(collection, { docs: next, at: Date.now() });
          }
          return result;
        }
      });
    this.locks.set(collection, run);
    return run;
  }

  /** Run fn with exclusive access to a copy of the whole collection. fn changes the copy; it is then saved. */
  mutate<R>(
    collection: Collection,
    fn: (docs: Doc[]) => R | Promise<R>,
  ): Promise<R> {
    return this.commit(collection, async (live) => {
      const docs = structuredClone(live);
      return { next: docs, result: await fn(docs) };
    });
  }

  /**
   * Adds at most one document. `decide` looks at the current documents (read only) and returns the
   * document to add, if any, plus a result. Nothing already stored is copied.
   */
  appendIf<R>(
    collection: Collection,
    decide: (
      docs: readonly Doc[],
    ) => { add?: Doc; result: R } | Promise<{ add?: Doc; result: R }>,
  ): Promise<R> {
    return this.commit(collection, async (live) => {
      const { add, result } = await decide(live);
      return { next: add ? [...live, structuredClone(add)] : live, result };
    });
  }

  /**
   * Changes a few documents by id. `fn` gets copies of just those documents, changes them (or replaces an
   * entry in the map), and the rest of the collection is reused as it is. If fn throws, nothing is saved.
   */
  mutateByIds<R>(
    collection: Collection,
    ids: string[],
    fn: (touched: Map<string, Doc>) => R | Promise<R>,
  ): Promise<R> {
    return this.commit(collection, async (live) => {
      const wanted = new Set(ids);
      const touched = new Map<string, Doc>();
      for (const d of live)
        if (wanted.has(d.id)) touched.set(d.id, structuredClone(d));
      const result = await fn(touched);
      return {
        next: touched.size ? live.map((d) => touched.get(d.id) ?? d) : live,
        result,
      };
    });
  }

  async all<T extends Doc = Doc>(collection: Collection): Promise<T[]> {
    return structuredClone(await this.docs(collection)) as T[];
  }

  /**
   * Reads filter the stored documents first and copy only what matched, so a lookup does not pay for the whole
   * collection. The predicate must only read. Callers always get copies and can change them freely.
   */
  async find<T extends Doc = Doc>(
    collection: Collection,
    predicate: (d: T) => boolean,
  ): Promise<T[]> {
    const docs = (await this.docs(collection)) as T[];
    return structuredClone(docs.filter(predicate));
  }

  async findOne<T extends Doc = Doc>(
    collection: Collection,
    predicate: (d: T) => boolean,
  ): Promise<T | undefined> {
    const hit = ((await this.docs(collection)) as T[]).find(predicate);
    return hit ? structuredClone(hit) : undefined;
  }

  /**
   * For queries that filter, sort and page a large collection: `fn` works directly on the stored documents
   * (it must not change them) and only what it returns is copied. Use it instead of find() when the
   * result is much smaller than the collection.
   */
  async read<T extends Doc, R>(
    collection: Collection,
    fn: (docs: readonly T[]) => R,
  ): Promise<R> {
    return structuredClone(fn((await this.docs(collection)) as T[]));
  }

  /** By id, through an index that is rebuilt only after the collection changes. */
  async get<T extends Doc = Doc>(
    collection: Collection,
    id: string,
  ): Promise<T | undefined> {
    const docs = await this.docs(collection);
    let entry = this.index.get(collection);
    if (!entry || entry.docs !== docs) {
      entry = { docs, byId: new Map(docs.map((d) => [d.id, d])) };
      this.index.set(collection, entry);
    }
    const hit = entry.byId.get(id);
    return hit ? (structuredClone(hit) as T) : undefined;
  }

  async insert<T extends Doc = Doc>(
    collection: Collection,
    data: NewDoc<T>,
  ): Promise<T> {
    const now = new Date().toISOString();
    const doc = {
      ...data,
      id: data.id ?? randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as unknown as T;
    await this.appendIf(collection, (docs) => {
      if (docs.some((d) => d.id === doc.id))
        throw new Error(`Duplicate id ${doc.id} in ${collection}`);
      return { add: doc, result: undefined };
    });
    return structuredClone(doc);
  }

  async update<T extends Doc = Doc>(
    collection: Collection,
    id: string,
    patch: Partial<T>,
  ): Promise<T | undefined> {
    return this.mutateByIds(collection, [id], (touched) => {
      const current = touched.get(id);
      if (!current) return undefined;
      const next = {
        ...current,
        ...patch,
        id,
        updatedAt: new Date().toISOString(),
      } as Doc;
      touched.set(id, next);
      return structuredClone(next) as T;
    });
  }

  async remove(collection: Collection, id: string): Promise<boolean> {
    return this.mutate(collection, (docs) => {
      const i = docs.findIndex((d) => d.id === id);
      if (i < 0) return false;
      docs.splice(i, 1);
      return true;
    });
  }
}
