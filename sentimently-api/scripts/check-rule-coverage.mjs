// Fails CI if a rule ID in Phase0/02_Business_Rules.md has no test mentioning it.
// Test files must include the rule ID (e.g. "DL-01") in a test name or comment.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Rules that deliberately have no backend test yet, and why. Remove an entry when its test exists. */
const DEFERRED = {
  'PZ-04': 'the on-screen read-back of the message is a frontend rule',
  'PZ-06': 'private storage of customer photos needs an object store, which is not chosen yet',
};

const rulesFile = new URL('../../Phase0/02_Business_Rules.md', import.meta.url);
const rules = [...readFileSync(rulesFile, 'utf8').matchAll(/^\|\s*([A-Z]{2}-\d{2})\s*\|/gm)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist') return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.spec.ts') || p.endsWith('.e2e-spec.ts') ? [p] : [];
  });
}

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const text = [...walk(join(root, 'src')), ...walk(join(root, 'test'))].map((f) => readFileSync(f, 'utf8')).join('\n');
const missing = rules.filter((id) => !text.includes(id));
const unexplained = missing.filter((id) => !(id in DEFERRED));
const staleDeferrals = Object.keys(DEFERRED).filter((id) => !missing.includes(id));

console.log(`${rules.length - missing.length}/${rules.length} rules covered; ${missing.length - unexplained.length} deferred on purpose`);
for (const id of missing) if (id in DEFERRED) console.log(`  deferred ${id}: ${DEFERRED[id]}`);
if (unexplained.length) {
  console.error('Rules without a test (and not deferred):', unexplained.join(', '));
  process.exit(1);
}
if (staleDeferrals.length) {
  console.error('These rules now have tests; remove them from DEFERRED:', staleDeferrals.join(', '));
  process.exit(1);
}
