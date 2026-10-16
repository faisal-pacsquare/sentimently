// Writes (or, with --check, verifies) openapi/openapi.v1.json: the frozen API contract the frontend builds against.
//   npm run openapi         regenerate the file after an intended API change
//   npm run openapi:check   fail if the running code no longer matches the committed file (used in CI)
import { NestFactory } from '@nestjs/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { buildOpenApi, sortKeys } from './openapi';
import { setupApp } from './setup';

async function main() {
  // The document must not depend on the machine it was made on.
  for (const k of [
    'CORS_ORIGINS',
    'ADMIN_EMAIL',
    'UPSTASH_REDIS_REST_URL',
    'KV_REST_API_URL',
  ])
    delete process.env[k];
  process.env.NODE_ENV = 'development';

  const app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  await app.init();
  const json = `${JSON.stringify(sortKeys(buildOpenApi(app)), null, 2)}\n`;
  await app.close();

  const dir = join(process.cwd(), 'openapi');
  const file = join(dir, 'openapi.v1.json');
  if (process.argv.includes('--check')) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== json) {
      console.error(
        'openapi/openapi.v1.json does not match the code. If the API change is intended, run: npm run openapi',
      );
      process.exit(1);
    }
    console.log('OpenAPI contract matches the code.');
    return;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, json);
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
