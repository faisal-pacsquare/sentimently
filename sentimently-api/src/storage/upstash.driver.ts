import { ConflictError, Doc, StorageDriver } from './storage.types';

/**
 * Durable driver for Vercel: each collection is one JSON value in a free Upstash Redis
 * (Vercel Marketplace), reached over its REST API with fetch (no extra dependency).
 *
 * Stored value: {"v": <version>, "docs": [...]}. save() is a compare-and-set on the version
 * done inside Redis by a Lua script, so two serverless instances cannot overwrite each other:
 * the loser gets a ConflictError and JsonStore retries.
 * On first read of an empty key the collection is seeded from `seed` (the data/ JSON files).
 */
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
local v = 0
if cur then v = cjson.decode(cur).v end
if v ~= tonumber(ARGV[1]) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

export class UpstashDriver implements StorageDriver {
  readonly cacheTtlMs = 5000; // other instances may write, so memory copies expire quickly
  private versions = new Map<string, number>();

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly seed: StorageDriver,
    private readonly prefix = 'sentimently',
  ) {}

  private key(collection: string) {
    return `${this.prefix}:${collection}`;
  }

  private async command<T>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const body = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || body.error)
      throw new Error(`Upstash error: ${body.error ?? res.status}`);
    return body.result as T;
  }

  async load(collection: string): Promise<Doc[]> {
    const raw = await this.command<string | null>('GET', this.key(collection));
    if (raw === null) {
      this.versions.set(collection, 0);
      return this.seed.load(collection);
    }
    const stored = JSON.parse(raw) as { v: number; docs: Doc[] };
    this.versions.set(collection, stored.v);
    return stored.docs;
  }

  async save(collection: string, docs: Doc[]): Promise<void> {
    const expected = this.versions.get(collection) ?? 0;
    const value = JSON.stringify({ v: expected + 1, docs });
    const ok = await this.command<number>(
      'EVAL',
      CAS_SCRIPT,
      1,
      this.key(collection),
      expected,
      value,
    );
    if (ok !== 1) throw new ConflictError(collection);
    this.versions.set(collection, expected + 1);
  }
}
