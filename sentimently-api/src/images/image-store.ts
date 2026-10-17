import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export const IMAGE_STORE = Symbol('IMAGE_STORE');

export type ImageStoreKind = 'blob' | 'local' | 'none';

/** Where gift photos live. In production that is Vercel Blob; while developing, a folder on this computer. */
export interface ImageStore {
  readonly kind: ImageStoreKind;
  /** Saves the photo and returns the address the shop should use for it. */
  put(data: Buffer, ext: string, contentType: string): Promise<string>;
  /** True for a photo this store holds (so a link to someone else's site is never deleted from here). */
  owns(url: string): boolean;
  remove(url: string): Promise<void>;
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};
export const mimeFor = (file: string) =>
  MIME[file.split('.').pop()?.toLowerCase() ?? ''];

/**
 * What a file really is, from its first bytes, not from its name or the type the browser claimed.
 * Only JPEG, PNG, WebP and GIF are accepted. SVG is refused on purpose: it can carry scripts.
 */
export function detectImage(
  buf: Buffer,
): { ext: string; contentType: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { ext: 'jpg', contentType: 'image/jpeg' };
  if (
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { ext: 'png', contentType: 'image/png' };
  const head = buf.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a')
    return { ext: 'gif', contentType: 'image/gif' };
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return { ext: 'webp', contentType: 'image/webp' };
  return null;
}

/** The two calls we use from @vercel/blob, so tests can stand in for it. */
export interface BlobApi {
  put(
    pathname: string,
    body: Buffer,
    options: Record<string, unknown>,
  ): Promise<{ url: string }>;
  del(url: string, options: Record<string, unknown>): Promise<void>;
}

export class VercelBlobStore implements ImageStore {
  readonly kind = 'blob' as const;

  constructor(
    private readonly token: string,
    private readonly api: BlobApi = require('@vercel/blob') as BlobApi, // eslint-disable-line @typescript-eslint/no-require-imports
  ) {}

  async put(data: Buffer, ext: string, contentType: string) {
    const blob = await this.api.put(`gifts/${randomUUID()}.${ext}`, data, {
      access: 'public',
      contentType,
      token: this.token,
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000, // a photo never changes: the address is new for every upload
    });
    return blob.url;
  }

  owns(url: string) {
    try {
      return new URL(url).hostname.endsWith('.public.blob.vercel-storage.com');
    } catch {
      return false;
    }
  }

  async remove(url: string) {
    if (this.owns(url)) await this.api.del(url, { token: this.token });
  }
}

/** Development: photos go in a folder and are served by the API itself. Not for production (Vercel's disk is temporary). */
export class LocalDiskStore implements ImageStore {
  readonly kind = 'local' as const;

  constructor(
    readonly dir: string,
    private readonly publicPath = '/api/v1/uploads',
  ) {}

  async put(data: Buffer, ext: string) {
    await fs.mkdir(this.dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await fs.writeFile(join(this.dir, name), data);
    return `${this.publicPath}/${name}`;
  }

  owns(url: string) {
    return url.startsWith(`${this.publicPath}/`);
  }

  /** A file name that is exactly what we would have made: never a path. */
  static safeName(name: string) {
    return /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(name) ? name : null;
  }

  async read(name: string): Promise<Buffer | null> {
    const safe = LocalDiskStore.safeName(name);
    if (!safe) return null;
    try {
      return await fs.readFile(join(this.dir, safe));
    } catch {
      return null;
    }
  }

  async remove(url: string) {
    const safe = LocalDiskStore.safeName(url.slice(url.lastIndexOf('/') + 1));
    if (!this.owns(url) || !safe) return;
    await fs.rm(join(this.dir, safe), { force: true });
  }
}

/** Production without a photo store: say what to do instead of failing mysteriously. */
export class NoImageStore implements ImageStore {
  readonly kind = 'none' as const;

  async put(): Promise<string> {
    throw new ServiceUnavailableException(
      'Photo uploads are not set up yet. In Vercel, create a Blob store and connect it to the API project (see DEPLOYMENT.md), then redeploy. You can still add photos by link.',
    );
  }

  owns() {
    return false;
  }

  async remove() {}
}

export function createImageStore(
  env: NodeJS.ProcessEnv = process.env,
): ImageStore {
  if (env.BLOB_READ_WRITE_TOKEN)
    return new VercelBlobStore(env.BLOB_READ_WRITE_TOKEN);
  if (env.VERCEL) return new NoImageStore();
  return new LocalDiskStore(env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));
}
