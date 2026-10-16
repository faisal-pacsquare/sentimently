import type { Product, TaxonomyItem, TaxonomyKind } from './product.types';

/** The plan lists this many of each. A different count is reported as a warning, not an error. */
export const EXPECTED_COUNTS: Record<TaxonomyKind, number> = {
  sentiment: 14,
  occasion: 8,
  recipient: 6,
  category: 11,
};

/** Reads CSV (commas, quotes, quoted line breaks, Windows or Unix line ends, a leading byte-order mark). */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      endRow();
    } else field += c;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

function records(
  csv: string,
  label: string,
  errors: string[],
): { line: number; [column: string]: string | number }[] {
  const rows = parseCsv(csv);
  if (!rows.length) {
    errors.push(`${label}: the file is empty`);
    return [];
  }
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r, i) => {
    const rec: { line: number; [column: string]: string | number } = {
      line: i + 2,
    };
    header.forEach((h, j) => (rec[h] = (r[j] ?? '').trim()));
    return rec;
  });
}

const text = (r: Record<string, string | number>, key: string) =>
  String(r[key] ?? '').trim();
const list = (v: string) =>
  v
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function bool(v: string): boolean | undefined {
  const x = v.toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(x)) return true;
  if (['false', 'no', 'n', '0'].includes(x)) return false;
  return undefined;
}

/** "Rs 3,500", "3500" and "3,500" all mean 3500. */
function rupees(v: string): number | undefined {
  const cleaned = v.replace(/rs\.?|pkr|,|\s/gi, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : undefined;
}

export interface ImportResult {
  taxonomy: TaxonomyItem[];
  products: Product[];
  errors: string[];
  warnings: string[];
}

/**
 * Turns the studio's two spreadsheets into catalogue data and checks every row.
 * Re-running it with the same files gives the same ids, so a re-import updates instead of duplicating.
 * Products already present keep their rating, review count and creation date.
 */
export function buildCatalogue(input: {
  taxonomyCsv: string;
  productsCsv: string;
  extraCodes: string[];
  existingProducts?: Product[];
  now?: string;
}): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const now = input.now ?? new Date().toISOString();

  // ---------- taxonomy ----------
  const taxonomy: TaxonomyItem[] = [];
  const seenGroups = new Set<string>();
  for (const r of records(input.taxonomyCsv, 'taxonomy.csv', errors)) {
    const where = `taxonomy.csv line ${r.line}`;
    const kind = text(r, 'kind').toLowerCase() as TaxonomyKind;
    const slug = text(r, 'slug');
    if (!['sentiment', 'occasion', 'recipient', 'category'].includes(kind))
      errors.push(
        `${where}: kind must be sentiment, occasion, recipient or category (got "${text(r, 'kind')}")`,
      );
    if (!SLUG.test(slug))
      errors.push(
        `${where}: slug "${slug}" must be lower-case words joined by hyphens`,
      );
    if (!text(r, 'name')) errors.push(`${where}: name is required`);
    const key = `${kind}/${slug}`;
    if (seenGroups.has(key)) errors.push(`${where}: ${key} appears twice`);
    seenGroups.add(key);
    const order = text(r, 'sortOrder');
    taxonomy.push({
      id: `${kind}-${slug}`,
      kind,
      slug,
      name: text(r, 'name'),
      ...(text(r, 'blurb') ? { blurb: text(r, 'blurb') } : {}),
      ...(text(r, 'image') ? { image: text(r, 'image') } : {}),
      sortOrder: order ? Number(order) || 0 : taxonomy.length,
      createdAt: now,
      updatedAt: now,
    });
  }
  const has = (kind: TaxonomyKind, slug: string) =>
    seenGroups.has(`${kind}/${slug}`);
  for (const [kind, expected] of Object.entries(EXPECTED_COUNTS)) {
    const found = taxonomy.filter((t) => t.kind === kind).length;
    if (found !== expected)
      warnings.push(
        `The plan lists ${expected} ${kind} groups; this file has ${found}`,
      );
  }

  // ---------- products ----------
  const existing = new Map(
    (input.existingProducts ?? []).map((p) => [p.id, p]),
  );
  const seenSlugs = new Set<string>();
  const products: Product[] = [];
  const used = new Set<string>();

  for (const r of records(input.productsCsv, 'products.csv', errors)) {
    const where = `products.csv line ${r.line}`;
    const slug = text(r, 'slug');
    if (!SLUG.test(slug))
      errors.push(
        `${where}: slug "${slug}" must be lower-case words joined by hyphens`,
      );
    if (seenSlugs.has(slug))
      errors.push(`${where}: slug "${slug}" appears twice`);
    seenSlugs.add(slug);
    if (!text(r, 'name')) errors.push(`${where}: name is required`);
    const description = text(r, 'description');
    if (!description) errors.push(`${where}: description is required`);
    else if (description.length < 20)
      warnings.push(`${where}: the description is very short`);

    const price = rupees(text(r, 'price'));
    if (price === undefined)
      errors.push(
        `${where}: price must be a whole number of rupees (got "${text(r, 'price')}")`,
      );
    const offerRaw = text(r, 'offerPrice');
    const offerPrice = offerRaw ? rupees(offerRaw) : undefined;
    if (offerRaw && offerPrice === undefined)
      errors.push(`${where}: offerPrice must be a whole number of rupees`);
    if (offerPrice !== undefined && price !== undefined && offerPrice >= price)
      errors.push(`${where}: offerPrice must be lower than price`);

    const type = text(r, 'type').toLowerCase();
    if (type !== 'physical' && type !== 'digital')
      errors.push(
        `${where}: type must be physical or digital (got "${text(r, 'type')}")`,
      );
    const digitalKind = text(r, 'digitalKind').toLowerCase();
    if (
      type === 'digital' &&
      digitalKind !== 'egift' &&
      digitalKind !== 'greeting'
    )
      errors.push(
        `${where}: a digital gift needs digitalKind egift or greeting`,
      );
    if (type === 'physical' && digitalKind)
      warnings.push(`${where}: digitalKind is ignored for a physical gift`);

    const stockRaw = text(r, 'stock');
    const stock =
      stockRaw === ''
        ? 0
        : /^\d+$/.test(stockRaw)
          ? Number(stockRaw)
          : undefined;
    if (stock === undefined)
      errors.push(`${where}: stock must be a whole number`);

    const category = text(r, 'category');
    if (!has('category', category))
      errors.push(`${where}: category "${category}" is not in taxonomy.csv`);
    const tags = {
      sentiments: list(text(r, 'sentiments')),
      occasions: list(text(r, 'occasions')),
      recipients: list(text(r, 'recipients')),
    };
    for (const [field, kind] of [
      ['sentiments', 'sentiment'],
      ['occasions', 'occasion'],
      ['recipients', 'recipient'],
    ] as const) {
      for (const slugValue of tags[field]) {
        if (!has(kind, slugValue))
          errors.push(
            `${where}: ${kind} "${slugValue}" is not in taxonomy.csv`,
          );
        else used.add(`${kind}/${slugValue}`);
      }
    }
    used.add(`category/${category}`);
    const allowedExtras = list(text(r, 'allowedExtras'));
    for (const code of allowedExtras)
      if (!input.extraCodes.includes(code))
        errors.push(
          `${where}: extra "${code}" does not exist (known: ${input.extraCodes.join(', ')})`,
        );

    const madeToOrder = bool(text(r, 'isMadeToOrder'));
    const minDays = text(r, 'leadTimeMinDays');
    const maxDays = text(r, 'leadTimeMaxDays');
    if (text(r, 'isMadeToOrder') && madeToOrder === undefined)
      errors.push(`${where}: isMadeToOrder must be yes or no`);
    if (madeToOrder && !maxDays)
      errors.push(`${where}: a made-to-order gift needs leadTimeMaxDays`);
    if (
      (minDays && !/^\d+$/.test(minDays)) ||
      (maxDays && !/^\d+$/.test(maxDays))
    )
      errors.push(`${where}: lead times must be whole numbers of days`);
    if (minDays && maxDays && Number(minDays) > Number(maxDays))
      errors.push(`${where}: leadTimeMinDays is greater than leadTimeMaxDays`);

    const perishable = bool(text(r, 'isPerishable'));
    const active = text(r, 'isActive') ? bool(text(r, 'isActive')) : true;
    if (active === undefined)
      errors.push(`${where}: isActive must be yes or no`);
    const imageUrls = list(text(r, 'imageUrls'));
    for (const u of imageUrls)
      if (!/^(https?:\/\/|\/)\S+$/.test(u))
        errors.push(
          `${where}: image "${u}" must be a web address or a path starting with /`,
        );
    if (!imageUrls.length) warnings.push(`${where}: no image for "${slug}"`);

    const id = `p-${slug}`;
    const before = existing.get(id);
    products.push({
      id,
      slug,
      name: text(r, 'name'),
      description,
      price: price ?? 0,
      ...(offerPrice !== undefined ? { offerPrice } : {}),
      type: type === 'digital' ? 'digital' : 'physical',
      ...(type === 'digital' && digitalKind
        ? { digitalKind: digitalKind as 'egift' | 'greeting' }
        : {}),
      stock: stock ?? 0,
      category,
      ...tags,
      allowedExtras: allowedExtras.length ? allowedExtras : undefined,
      isMadeToOrder: madeToOrder ?? false,
      ...(minDays ? { leadTimeMinDays: Number(minDays) } : {}),
      ...(maxDays ? { leadTimeMaxDays: Number(maxDays) } : {}),
      isPerishable: perishable ?? false,
      isActive: active ?? true,
      imageUrls,
      rating: before?.rating ?? null,
      reviewCount: before?.reviewCount ?? 0,
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
    });
  }

  for (const t of taxonomy)
    if (!used.has(`${t.kind}/${t.slug}`))
      warnings.push(
        `${t.kind} "${t.slug}" has no gifts yet, so its page would be empty`,
      );
  const thin = products.filter((p) => p.isActive !== false).length;
  if (thin < 18)
    warnings.push(`Only ${thin} active gifts; the prototype had 18`);

  return { taxonomy, products, errors, warnings };
}
