import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createImageStore,
  detectImage,
  LocalDiskStore,
  NoImageStore,
  VercelBlobStore,
} from './image-store';

const pad = (head: number[]) =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(32, 1)]);
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(16),
]);

describe('detectImage', () => {
  it('recognises photos by their first bytes', () => {
    expect(detectImage(JPEG)).toEqual({
      ext: 'jpg',
      contentType: 'image/jpeg',
    });
    expect(detectImage(PNG)).toEqual({ ext: 'png', contentType: 'image/png' });
    expect(detectImage(GIF)).toEqual({ ext: 'gif', contentType: 'image/gif' });
    expect(detectImage(WEBP)).toEqual({
      ext: 'webp',
      contentType: 'image/webp',
    });
  });

  it('refuses SVG, scripts, documents and anything too short, whatever the file is called', () => {
    expect(
      detectImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
      ),
    ).toBeNull();
    expect(
      detectImage(Buffer.from('<?php echo 1; ?> padding padding')),
    ).toBeNull();
    expect(
      detectImage(Buffer.from('%PDF-1.7 padding padding padding')),
    ).toBeNull();
    expect(
      detectImage(Buffer.from('RIFFxxxxWAVE-not-webp-padding')),
    ).toBeNull();
    expect(detectImage(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('LocalDiskStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bloomora-img-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('saves a photo, gives back an address on this site, serves it, and deletes it', async () => {
    const store = new LocalDiskStore(dir);
    const url = await store.put(JPEG, 'jpg');
    expect(url).toMatch(/^\/api\/v1\/uploads\/[0-9a-f-]{36}\.jpg$/);
    expect(store.owns(url)).toBe(true);
    const name = url.split('/').pop()!;
    expect((await store.read(name))?.equals(JPEG)).toBe(true);
    await store.remove(url);
    expect(await store.read(name)).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it('never reads or deletes outside its folder, however the name is written', async () => {
    const store = new LocalDiskStore(dir);
    for (const evil of [
      '../../etc/passwd',
      '..%2f..%2fsecret.jpg',
      'a.jpg',
      '/etc/passwd',
      'x'.repeat(36) + '.jpg',
    ]) {
      expect(await store.read(evil)).toBeNull();
    }
    await expect(
      store.remove('/api/v1/uploads/../../package.json'),
    ).resolves.toBeUndefined();
    expect(store.owns('https://example.com/a.jpg')).toBe(false);
  });
});

describe('VercelBlobStore', () => {
  const calls: { put: unknown[][]; del: unknown[][] } = { put: [], del: [] };
  const api = {
    put: async (...a: unknown[]) => {
      calls.put.push(a);
      return {
        url: 'https://abc123.public.blob.vercel-storage.com/gifts/x.jpg',
      };
    },
    del: async (...a: unknown[]) => {
      calls.del.push(a);
    },
  };
  beforeEach(() => {
    calls.put = [];
    calls.del = [];
  });

  it('uploads publicly with a long cache time and the real content type, and returns the Blob address', async () => {
    const url = await new VercelBlobStore('tok', api as never).put(
      JPEG,
      'jpg',
      'image/jpeg',
    );
    expect(url).toBe(
      'https://abc123.public.blob.vercel-storage.com/gifts/x.jpg',
    );
    const [path, body, options] = calls.put[0]!;
    expect(path).toMatch(/^gifts\/[0-9a-f-]{36}\.jpg$/);
    expect(body).toBe(JPEG);
    expect(options).toMatchObject({
      access: 'public',
      contentType: 'image/jpeg',
      token: 'tok',
      cacheControlMaxAge: 31_536_000,
    });
  });

  it('only deletes photos that are really in its own store', async () => {
    const store = new VercelBlobStore('tok', api as never);
    expect(
      store.owns('https://abc123.public.blob.vercel-storage.com/gifts/x.jpg'),
    ).toBe(true);
    expect(store.owns('https://evil.example/a.jpg')).toBe(false);
    expect(
      store.owns('https://evil.example/?x=.public.blob.vercel-storage.com'),
    ).toBe(false);
    expect(store.owns('not a url')).toBe(false);
    await store.remove('https://evil.example/a.jpg');
    expect(calls.del).toHaveLength(0);
    await store.remove(
      'https://abc123.public.blob.vercel-storage.com/gifts/x.jpg',
    );
    expect(calls.del).toHaveLength(1);
  });
});

describe('createImageStore', () => {
  it('uses Vercel Blob when its token is present', () => {
    expect(createImageStore({ BLOB_READ_WRITE_TOKEN: 'x' }).kind).toBe('blob');
  });
  it('saves to a folder when developing on a computer', () => {
    expect(createImageStore({}).kind).toBe('local');
  });
  it('on Vercel with no Blob store, says how to set one up instead of failing mysteriously', async () => {
    const store = createImageStore({ VERCEL: '1' });
    expect(store).toBeInstanceOf(NoImageStore);
    await expect(
      store.put(Buffer.alloc(1), 'jpg', 'image/jpeg'),
    ).rejects.toThrow(/Blob store/);
  });
});
