#!/usr/bin/env node
// The catalog keys the site fifty's wiring orphaned (2026-10-12): in the namespaces the replaced media used (the
// landing page's and the manual's image alts, the featured stills' captions, the old reel and contact-sheet copy),
// every key that no page, module, selftest or tool in the tree still names. Both locales lose the same keys; --apply
// writes them (formatting kept), otherwise the keys are listed.
//   node tools/media-r5/site-media/prune-keys.mjs --root=<tree> [--apply]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ROOT = resolve(arg('root') ?? '');
const apply = process.argv.includes('--apply');
const CATALOGS = ['src/ui/i18nCatalog.en-US.json', 'src/ui/i18nCatalog.zh-CN.json'];
// the namespaces whose keys only the replaced media used; a key outside them is never touched
const NAMESPACES = [/^home\./, /^docs\.media\.alt\./, /^garage\.featuredShot\./, /^aria\./,
  /^docs\.hero\.reel(Caption|Approved)$/, /^docs\.studio\.(action|foreground)(Head|Sheets|Note)$/];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(html|ts|mts|mjs|js|json|md)$/.test(entry.name)) out.push(path);
  }
  return out;
}
const files = ['site', 'src', 'tools', 'server', 'api', 'docs'].filter((d) => existsSync(join(ROOT, d)))
  .flatMap((d) => walk(join(ROOT, d))).concat(['index.html', '404.html'].map((f) => join(ROOT, f)).filter(existsSync))
  .filter((file) => !CATALOGS.includes(relative(ROOT, file)) && !/i18nCatalog/.test(file));
// every key-shaped token the sources mention, collected in one pass (a per-key search of the joined sources took minutes)
const mentioned = new Set();
for (const file of files) for (const match of readFileSync(file, 'utf8').matchAll(/[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+/g)) mentioned.add(match[0]);

const en = JSON.parse(readFileSync(join(ROOT, CATALOGS[0]), 'utf8'));
const orphans = Object.keys(en).filter((key) => NAMESPACES.some((ns) => ns.test(key)) && !mentioned.has(key));
console.log(`${orphans.length} orphaned keys in the replaced media's namespaces`);
for (const key of orphans) console.log(`  ${key}: ${String(en[key]).slice(0, 70)}`);
if (apply) {
  const drop = new Set(orphans);
  for (const path of CATALOGS) {
    const catalog = JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
    for (const key of drop) delete catalog[key];
    writeFileSync(join(ROOT, path), `${JSON.stringify(catalog, null, 2)}\n`);
  }
  console.log(`removed ${drop.size} keys from both catalogs`);
}
