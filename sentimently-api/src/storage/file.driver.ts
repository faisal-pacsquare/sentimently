import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Doc, StorageDriver } from './storage.types';

/**
 * Reads seed data from `data/` and writes to a writable directory.
 * Locally the writable directory is `data/` itself. On Vercel the deployed files are read-only,
 * so writes go to the OS temp dir. That area is NOT durable (see Phase0/09_Decisions_Log.md).
 */
export class FileDriver implements StorageDriver {
  readonly cacheTtlMs = Infinity;
  private readonly seedDir: string;
  private readonly writeDir: string;

  constructor(
    seedDir = process.env.DATA_DIR ?? join(process.cwd(), 'data'),
    writeDir?: string,
  ) {
    this.seedDir = seedDir;
    this.writeDir =
      writeDir ??
      process.env.DATA_WRITE_DIR ??
      (process.env.VERCEL ? join(tmpdir(), 'sentimently-data') : seedDir);
  }

  private fileIn(dir: string, collection: string) {
    return join(dir, `${collection}.json`);
  }

  private async readFile(path: string): Promise<Doc[] | null> {
    try {
      return JSON.parse(await fs.readFile(path, 'utf8')) as Doc[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async load(collection: string): Promise<Doc[]> {
    const written = await this.readFile(this.fileIn(this.writeDir, collection));
    if (written) return written;
    return (await this.readFile(this.fileIn(this.seedDir, collection))) ?? [];
  }

  async save(collection: string, docs: Doc[]): Promise<void> {
    await fs.mkdir(this.writeDir, { recursive: true });
    const target = this.fileIn(this.writeDir, collection);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(docs, null, 2), 'utf8');
    await fs.rename(tmp, target); // atomic replace: readers never see a half-written file
  }
}
