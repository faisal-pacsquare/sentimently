import { existsSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Doc, StorageDriver } from './storage.types';

/**
 * Reads seed data from `data/` and writes to a writable directory.
 * Locally the writable directory is `data/` itself. On Vercel the deployed files are read-only,
 * so writes go to the OS temp dir. That area is NOT durable (see Phase0/09_Decisions_Log.md).
 */
/**
 * Where the seed files live. Locally and on a normal server that is ./data. On Vercel the function may not
 * have that folder, so the build also copies it next to the compiled code (dist/data), which is always deployed.
 * The first folder that holds the store settings wins.
 */
export function findSeedDir(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  compiledDir: string = __dirname,
  exists: (path: string) => boolean = existsSync,
): string {
  if (env.DATA_DIR) return env.DATA_DIR;
  const candidates = [
    join(cwd, 'data'),
    join(compiledDir, '..', 'data'), // dist/data, from dist/storage
    join(compiledDir, '..', '..', 'data'), // data, from src/storage in tests
  ];
  return (
    candidates.find((d) => exists(join(d, 'storeConfig.json'))) ?? candidates[0]
  );
}

export class FileDriver implements StorageDriver {
  readonly cacheTtlMs = Infinity;
  private readonly seedDir: string;
  private readonly writeDir: string;

  constructor(seedDir = findSeedDir(), writeDir?: string) {
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
