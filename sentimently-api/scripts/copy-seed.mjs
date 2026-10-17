// Copies the seed data next to the compiled code, so it is deployed with it (Vercel only ships what the build points at).
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const from = resolve('data');
const to = resolve('dist', 'data');
if (!existsSync(from)) {
  console.error('copy-seed: data/ folder not found');
  process.exit(1);
}
cpSync(from, to, { recursive: true });
console.log(`copy-seed: ${from} -> ${to}`);
