import { Global, Module } from '@nestjs/common';
import { FileDriver } from './file.driver';
import { JsonStore } from './json-store.service';
import { MemoryDriver } from './memory.driver';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import { UpstashDriver } from './upstash.driver';

/**
 * Driver choice (first match wins):
 * 1. Upstash variables set (UPSTASH_REDIS_REST_* or the older KV_REST_API_*): durable, for later.
 * 2. STORAGE_DRIVER=file: read and write the JSON files in data/ (local development).
 * 3. Otherwise: in memory, seeded from data/. This is the current default.
 */
export function createDriver(
  env: NodeJS.ProcessEnv = process.env,
): StorageDriver {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const files = new FileDriver();
  if (url && token) return new UpstashDriver(url, token, files);
  if (env.STORAGE_DRIVER === 'file') return files;
  return new MemoryDriver(files);
}

@Global()
@Module({
  providers: [
    { provide: STORAGE_DRIVER, useFactory: () => createDriver() },
    JsonStore,
  ],
  exports: [JsonStore, STORAGE_DRIVER],
})
export class StorageModule {}
