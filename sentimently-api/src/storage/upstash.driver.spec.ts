import { JsonStore } from './json-store.service';
import { createDriver } from './storage.module';
import { ConflictError, Doc, StorageDriver } from './storage.types';
import { UpstashDriver } from './upstash.driver';
import { FileDriver } from './file.driver';
import { MemoryDriver } from './memory.driver';

/** Minimal in-memory stand-in for the Upstash REST endpoint: GET, and the compare-and-set EVAL. */
function fakeUpstash() {
  const data = new Map<string, string>();
  const fetchMock = jest.fn(async (_url: unknown, init?: RequestInit) => {
    const [cmd, ...args] = JSON.parse(init!.body as string) as (
      string | number
    )[];
    let result: unknown = null;
    if (cmd === 'GET') {
      result = data.get(args[0] as string) ?? null;
    } else if (cmd === 'EVAL') {
      const [, , key, expected, value] = args as [
        string,
        number,
        string,
        number,
        string,
      ];
      const cur = data.get(key);
      const v = cur ? (JSON.parse(cur) as { v: number }).v : 0;
      if (v !== Number(expected)) result = 0;
      else {
        data.set(key, value);
        result = 1;
      }
    }
    return { ok: true, json: async () => ({ result }) } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { data, fetchMock };
}

const seed = (docs: Doc[]): StorageDriver => ({
  cacheTtlMs: Infinity,
  load: async () => structuredClone(docs),
  save: async () => undefined,
});

describe('UpstashDriver', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('seeds an empty collection from the seed driver', async () => {
    fakeUpstash();
    const d = new UpstashDriver(
      'http://x',
      't',
      seed([{ id: 'e1' } as unknown as Doc]),
    );
    expect((await d.load('extras')).map((x) => x.id)).toEqual(['e1']);
  });

  it('persists a write that a second instance can read', async () => {
    fakeUpstash();
    const a = new JsonStore(new UpstashDriver('http://x', 't', seed([])));
    await a.insert('customers', { id: 'c1', email: 'a@b.pk' });
    const b = new JsonStore(new UpstashDriver('http://x', 't', seed([])));
    expect((await b.get('customers', 'c1'))?.email).toBe('a@b.pk');
  });

  it('PY-03 two instances racing for the last item: one wins, none oversell', async () => {
    fakeUpstash();
    const mk = () =>
      new JsonStore(
        new UpstashDriver(
          'http://x',
          't',
          seed([{ id: 'p1', stock: 1 } as unknown as Doc]),
        ),
      );
    const a = mk();
    const b = mk();
    const take = (s: JsonStore) =>
      s.mutate('products', (docs) => {
        const p = docs.find((d) => d.id === 'p1')!;
        if ((p.stock as number) < 1) return false;
        p.stock = (p.stock as number) - 1;
        return true;
      });
    const results = await Promise.all([take(a), take(b)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await a.get('products', 'p1'))?.stock).toBe(0);
  });

  it('throws ConflictError when the stored version moved on', async () => {
    fakeUpstash();
    const a = new UpstashDriver('http://x', 't', seed([]));
    const b = new UpstashDriver('http://x', 't', seed([]));
    await a.load('orders');
    await b.load('orders');
    await a.save('orders', []);
    await expect(b.save('orders', [])).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('createDriver', () => {
  it('Upstash when its variables are set, files when asked, memory by default', () => {
    expect(
      createDriver({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' }),
    ).toBeInstanceOf(UpstashDriver);
    expect(
      createDriver({
        UPSTASH_REDIS_REST_URL: 'u',
        UPSTASH_REDIS_REST_TOKEN: 't',
      }),
    ).toBeInstanceOf(UpstashDriver);
    expect(createDriver({})).toBeInstanceOf(MemoryDriver);
    expect(createDriver({ STORAGE_DRIVER: 'file' })).toBeInstanceOf(FileDriver);
  });
});
