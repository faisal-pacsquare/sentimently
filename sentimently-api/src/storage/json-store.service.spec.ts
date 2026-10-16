import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileDriver } from './file.driver';
import { JsonStore } from './json-store.service';

async function makeStore(seed?: Record<string, unknown[]>) {
  const dir = await mkdtemp(join(tmpdir(), 'store-'));
  for (const [name, docs] of Object.entries(seed ?? {})) {
    await writeFile(join(dir, `${name}.json`), JSON.stringify(docs));
  }
  return { dir, store: new JsonStore(new FileDriver(dir, dir)) };
}

describe('JsonStore', () => {
  it('returns an empty list for a missing collection', async () => {
    const { store } = await makeStore();
    expect(await store.all('products')).toEqual([]);
  });

  it('reads seed data', async () => {
    const { store } = await makeStore({
      extras: [{ id: 'premium_wrap', price: 350 }],
    });
    expect((await store.get('extras', 'premium_wrap'))?.price).toBe(350);
  });

  it('inserts, updates and removes, persisting to disk', async () => {
    const { store, dir } = await makeStore();
    const doc = await store.insert('customers', { email: 'a@b.pk' });
    await store.update('customers', doc.id, { name: 'Ayesha' });
    const onDisk = JSON.parse(
      await readFile(join(dir, 'customers.json'), 'utf8'),
    );
    expect(onDisk[0]).toMatchObject({ email: 'a@b.pk', name: 'Ayesha' });
    expect(await store.remove('customers', doc.id)).toBe(true);
    expect(await store.all('customers')).toEqual([]);
  });

  it('PY-03 does not oversell when two orders race for the last item', async () => {
    const { store } = await makeStore({ products: [{ id: 'p1', stock: 1 }] });
    const take = () =>
      store.mutate('products', (docs) => {
        const p = docs.find((d) => d.id === 'p1')!;
        if ((p.stock as number) < 1) return false;
        p.stock = (p.stock as number) - 1;
        return true;
      });
    const results = await Promise.all([take(), take()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await store.get('products', 'p1'))?.stock).toBe(0);
  });

  it('leaves no temp files and keeps old data when a save fails', async () => {
    const { store, dir } = await makeStore({ extras: [{ id: 'e1' }] });
    await store.all('extras');
    await expect(
      store.mutate('extras', (docs) => {
        docs.push({ id: 'e2' } as never);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await store.all('extras')).map((d) => d.id)).toEqual(['e1']);
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
