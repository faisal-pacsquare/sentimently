#!/usr/bin/env node
// Uploads a folder of real photos to the shop's gifts, matching each file to a gift by its name.
//
//   STUDIO_EMAIL=you@example.com STUDIO_PASSWORD=... \
//   node scripts/upload-photos.mjs --api https://YOUR-API/api/v1 --folder ./photos [--mode replace|add] [--dry-run]
//
//   node scripts/upload-photos.mjs --api ... --checklist photos-needed.csv    (lists the gifts that still have no real photo)
//
// File names (the gift's slug is shown in the studio under its name, and in photo-checklist.csv):
//   ribbon-rose-bouquet-10_1.jpg    first photo (the main one)      also accepted: ribbon-rose-bouquet-10.jpg
//   ribbon-rose-bouquet-10_2.jpg    second photo
//   ribbon-rose-bouquet-10/1.jpg    or put them in a folder named after the gift
// JPEG, PNG, WebP and GIF. At most 10 per gift. Photos over 4 MB are shrunk if the optional `sharp` package is
// installed (npm i sharp), otherwise skipped with a message (the studio's Photos panel shrinks them for you).
// Your email and password are read from the environment, never from the command line.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS = 10;

function parseArgs(argv) {
  const out = { mode: 'replace', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

async function http(api, token, method, path, body) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${api}${path}`, { method, headers, body: payload });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const e = json?.error;
    throw new Error(`${res.status} ${[e?.message, ...(e?.details ?? [])].filter(Boolean).join(': ') || res.statusText}`);
  }
  return json;
}

/** Works out which gift and which position a file is for. Returns null if it matches no gift. */
function matchFile(relPath, slugs) {
  const parts = relPath.split(/[\\/]/);
  const file = parts.pop();
  const stem = basename(file, extname(file));
  if (parts.length === 1 && slugs.has(parts[0])) {
    const n = Number(stem.match(/^\d+/)?.[0] ?? NaN);
    return { slug: parts[0], order: Number.isFinite(n) ? n : 1, name: stem };
  }
  if (parts.length) return null;
  if (slugs.has(stem)) return { slug: stem, order: 1, name: stem };
  const m = stem.match(/^(.+?)[_-](\d{1,2})$/); // "slug_2" (or "slug-2" when "slug-2" is not itself a gift)
  if (m && slugs.has(m[1])) return { slug: m[1], order: Number(m[2]), name: stem };
  return null;
}

async function walk(dir, rel = '') {
  const out = [];
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? join(rel, e.name) : e.name;
    if (e.isDirectory()) out.push(...(await walk(dir, r)));
    else if (TYPES[extname(e.name).toLowerCase()]) out.push(r);
  }
  return out;
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const api = (args.api ?? process.env.BLOOMORA_API ?? '').replace(/\/+$/, '');
  const { STUDIO_EMAIL: email, STUDIO_PASSWORD: password } = process.env;
  if (!api || !email || !password || (!args.folder && !args.checklist)) {
    console.error('Usage: STUDIO_EMAIL=... STUDIO_PASSWORD=... node scripts/upload-photos.mjs --api https://YOUR-API/api/v1 --folder ./photos [--mode replace|add] [--dry-run]');
    console.error('       ... --api https://YOUR-API/api/v1 --checklist photos-needed.csv');
    process.exit(2);
  }
  if (!['replace', 'add'].includes(args.mode)) {
    console.error('--mode must be "replace" (default: the uploaded photos become the gift\'s photos) or "add" (put them after the current ones).');
    process.exit(2);
  }

  const { accessToken: token } = await http(api, null, 'POST', '/auth/login', { email, password });
  const products = await http(api, token, 'GET', '/admin/products');
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  if (args.checklist) {
    const needed = products.filter((p) => !(p.imageUrls ?? []).some((u) => !u.startsWith('/images/demo/')));
    const rows = ['slug,name,photo file name', ...needed.map((p) => `${p.slug},"${p.name.replace(/"/g, '""')}",${p.slug}_1.jpg`)];
    await writeFile(args.checklist, `${rows.join('\n')}\n`);
    console.log(`${needed.length} of ${products.length} gifts have no real photo yet. Written to ${args.checklist}`);
    if (!args.folder) return;
  }

  const folder = resolve(args.folder);
  const slugs = new Set(bySlug.keys());
  const groups = new Map();
  const unmatched = [];
  for (const rel of await walk(folder)) {
    const hit = matchFile(rel, slugs);
    if (!hit) unmatched.push(rel);
    else (groups.get(hit.slug) ?? groups.set(hit.slug, []).get(hit.slug)).push({ ...hit, rel });
  }
  for (const u of unmatched) console.warn(`skipped ${u}: its name is not the slug of any gift (see the studio, or --checklist)`);
  if (!groups.size) {
    console.error('No photo matched a gift. Nothing to do.');
    process.exit(1);
  }

  const sharp = await loadSharp();
  let failed = 0;
  let done = 0;
  for (const [slug, files] of groups) {
    const product = bySlug.get(slug);
    files.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const current = args.mode === 'add' ? product.imageUrls ?? [] : [];
    const room = MAX_PHOTOS - current.length;
    const picked = files.slice(0, Math.max(room, 0));
    if (files.length > picked.length) console.warn(`${slug}: only ${MAX_PHOTOS} photos per gift, ${files.length - picked.length} left out`);
    console.log(`${product.name} (${slug}): ${picked.length} photo${picked.length === 1 ? '' : 's'}, ${args.mode === 'add' ? 'added after the current ones' : 'replacing the current ones'}`);
    if (args.dryRun) continue;

    const urls = [];
    try {
      for (const f of picked) {
        const path = join(folder, f.rel);
        let bytes = await readFile(path);
        let type = TYPES[extname(f.rel).toLowerCase()];
        let name = basename(f.rel);
        if ((await stat(path)).size > MAX_BYTES) {
          if (!sharp) throw new Error(`${f.rel} is over 4 MB. Shrink it, or run "npm i sharp" so this tool can.`);
          bytes = await sharp(bytes).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
          type = 'image/jpeg';
          name = `${basename(name, extname(name))}.jpg`;
        }
        const form = new FormData();
        form.append('file', new Blob([bytes], { type }), name);
        urls.push((await http(api, token, 'POST', '/admin/images', form)).url);
      }
      if (urls.length) await http(api, token, 'PATCH', `/admin/products/${encodeURIComponent(product.id)}`, { imageUrls: [...current, ...urls] });
      done++;
    } catch (e) {
      failed++;
      console.error(`  FAILED ${slug}: ${e.message}${urls.length ? ` (${urls.length} uploaded photo${urls.length === 1 ? ' is' : 's are'} not attached; run again)` : ''}`);
    }
  }
  console.log(args.dryRun ? 'Dry run: nothing was uploaded.' : `Done: ${done} gift${done === 1 ? '' : 's'} updated, ${failed} failed.`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
