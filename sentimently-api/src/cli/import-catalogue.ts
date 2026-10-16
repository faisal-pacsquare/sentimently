// Loads the studio's catalogue spreadsheets into the data files.
//   npm run import:catalogue -- --taxonomy taxonomy.csv --products products.csv [--out ./data] [--dry-run]
// Nothing is written unless every row is valid. Re-running with the same files updates instead of duplicating.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildCatalogue } from '../catalogue/catalogue-import';
import type { Product } from '../catalogue/product.types';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function main() {
  const taxonomyFile = arg('taxonomy');
  const productsFile = arg('products');
  if (!taxonomyFile || !productsFile) {
    console.error(
      'Usage: npm run import:catalogue -- --taxonomy taxonomy.csv --products products.csv [--out ./data] [--dry-run]',
    );
    process.exit(2);
  }
  const out = resolve(arg('out') ?? 'data');
  const read = (f: string) => readFileSync(resolve(f), 'utf8');
  const json = <T>(f: string): T[] =>
    existsSync(join(out, f))
      ? (JSON.parse(readFileSync(join(out, f), 'utf8')) as T[])
      : [];

  const result = buildCatalogue({
    taxonomyCsv: read(taxonomyFile),
    productsCsv: read(productsFile),
    extraCodes: json<{ id: string }>('extras.json').map((e) => e.id),
    existingProducts: json<Product>('products.json'),
  });

  for (const w of result.warnings) console.warn(`warning: ${w}`);
  for (const e of result.errors) console.error(`ERROR: ${e}`);
  console.log(
    `${result.taxonomy.length} groups, ${result.products.length} gifts, ${result.errors.length} errors, ${result.warnings.length} warnings`,
  );

  if (result.errors.length) {
    console.error('Nothing was written. Fix the rows above and run it again.');
    process.exit(1);
  }
  if (process.argv.includes('--dry-run')) {
    console.log('Dry run: nothing was written.');
    return;
  }
  writeFileSync(
    join(out, 'taxonomy.json'),
    `${JSON.stringify(result.taxonomy, null, 2)}\n`,
  );
  writeFileSync(
    join(out, 'products.json'),
    `${JSON.stringify(result.products, null, 2)}\n`,
  );
  console.log(
    `Wrote ${join(out, 'taxonomy.json')} and ${join(out, 'products.json')}`,
  );
}

main();
