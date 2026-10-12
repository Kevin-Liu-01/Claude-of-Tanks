#!/usr/bin/env node
// The gameplay media the site fifty replaced (2026-10-12): in the tree given by --root, every file of the retired
// collections that nothing live references any more. Live means the pages, the code and its CSS, the selftests, the
// README and the other collections' manifests; the generators that wrote the retired collections (their publish
// tools) and the retired collections' own manifests do not count. Prints the list and its size; --apply removes the
// files (git history keeps them) and empties a retired manifest whose collection is gone.
//   node tools/media-r5/site-media/retire.mjs --root=<tree> [--apply]
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ROOT = resolve(arg('root') ?? '');
const apply = process.argv.includes('--apply');
const MEDIA = join(ROOT, 'public/media');

/** The collections the site fifty replaced, wholly or in part. */
const RETIRED = ['hero-rails-r2', 'promo-v13', 'featured', 'showcase-r1', 'presentation-r1', 'battle-reels-v3',
  'feature-loops-r1', 'director-r4', 'web-video-r1', 'home', 'production-r1'];
// Interface captures are not gameplay media: whatever references them, they stay (presentation-r1 and home keep theirs).
const KEPT_NAME = /^ui_/;
/** Producers of the retired collections: they name their outputs, they do not use them. */
const PRODUCERS = /^tools\/(marketing-shots\/(publish-[a-z0-9-]+|encode-featured|build-capture-recipes)\.mjs|media-production\/publishCampaign\.mjs|publish-gameplay-capture\.mjs)$/;
const SCAN_DIRS = ['site', 'src', 'tools', 'server', 'api', 'public'];
const SCAN_FILES = ['index.html', '404.html', 'README.md', 'vite.config.ts', 'vercel.json'];
const TEXT = /\.(html|ts|mts|mjs|js|css|json|md)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name.startsWith('.')) continue;
    const path = join(dir, name.name);
    if (name.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const sources = [];
for (const dir of SCAN_DIRS) if (existsSync(join(ROOT, dir))) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (!TEXT.test(rel) || PRODUCERS.test(rel)) continue;
    // a retired collection's own manifest, and the capture recipes (pruned with it), describe the old media
    // (a collection's nested manifests too: director-r4/gameplay/manifest.json named its own files)
    if (RETIRED.some((c) => rel.startsWith(`public/media/${c}/`) && rel.endsWith('/manifest.json')) || rel === 'public/media/capture-recipes-r1.json') continue;
    if (rel.startsWith('public/') && !rel.endsWith('.json') && !rel.endsWith('.css')) continue;
    sources.push(rel);
  }
}
for (const file of SCAN_FILES) if (existsSync(join(ROOT, file))) sources.push(file);
// every media path the live sources name, collected once (a per-file search of the joined sources took minutes)
const named = new Set();
const MEDIA_PATH = new RegExp(`media/((?:${RETIRED.join('|')})/[A-Za-z0-9_\\-./]+)`, 'g');
for (const rel of sources) {
  for (const match of readFileSync(join(ROOT, rel), 'utf8').matchAll(MEDIA_PATH)) named.add(match[1].replace(/[.,]+$/, ''));
}

const retire = [];
const keep = [];
for (const collection of RETIRED) {
  const dir = join(MEDIA, collection);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const rel = relative(MEDIA, file).split('\\').join('/');
    if (rel === `${collection}/manifest.json`) continue;
    (named.has(rel) || KEPT_NAME.test(rel.split('/').pop()) ? keep : retire).push({ rel, bytes: statSync(file).size });
  }
}
const mb = (list) => (list.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(1);
console.log(`retire ${retire.length} files (${mb(retire)} MB); keep ${keep.length} referenced (${mb(keep)} MB)`);
const byCollection = {};
for (const f of retire) byCollection[f.rel.split('/')[0]] = (byCollection[f.rel.split('/')[0]] ?? 0) + 1;
console.log(`  by collection: ${Object.entries(byCollection).map(([c, n]) => `${c} ${n}`).join(', ')}`);
for (const f of keep) console.log(`  keep ${f.rel}`);
// Manifests the live code still reads stay whatever their collection keeps: the archive and the capture recipes
// fetch production-r1's (its battlefield photographs), and the landing contract owns web-video-r1's.
const LIVE_MANIFESTS = new Set(['production-r1', 'web-video-r1']);
if (apply) {
  for (const f of retire) rmSync(join(MEDIA, f.rel));
  for (const collection of RETIRED) {
    const dir = join(MEDIA, collection);
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath) || LIVE_MANIFESTS.has(collection)) continue;
    const left = walk(dir).filter((file) => file !== manifestPath);
    if (!left.length) { rmSync(manifestPath); continue; }
    // a collection kept in part (presentation-r1's interface captures): its manifest lists only what remains
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.shots)) continue;
    const before = manifest.shots.length;
    manifest.shots = manifest.shots.filter((shot) => existsSync(join(ROOT, 'public', String(shot.src ?? '').replace(/^\//, ''))));
    for (const key of Object.keys(manifest)) {
      if (/^(battle|studio)ShotCount$/.test(key)) manifest[key] = manifest.shots.filter((s) => (s.kind ?? '').startsWith(key.slice(0, -9))).length;
    }
    if ('totalShotCount' in manifest) manifest.totalShotCount = manifest.shots.length;
    manifest.retired = 'The site fifty (public/media/site50-r14) replaced this collection\'s gameplay frames on 2026-10-12; its interface captures remain.';
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`pruned ${collection}/manifest.json: ${before} -> ${manifest.shots.length} shots`);
  }
  // the capture recipes (the archive's "copy Studio JSON"): only media that still ships, only recipes still named
  const recipesPath = join(MEDIA, 'capture-recipes-r1.json');
  if (existsSync(recipesPath)) {
    const catalog = JSON.parse(readFileSync(recipesPath, 'utf8'));
    const before = [Object.keys(catalog.media).length, Object.keys(catalog.recipes).length];
    catalog.media = Object.fromEntries(Object.entries(catalog.media).filter(([url]) => existsSync(join(ROOT, 'public', url.replace(/^\//, '')))));
    const named = new Set(Object.values(catalog.media));
    catalog.recipes = Object.fromEntries(Object.entries(catalog.recipes).filter(([id]) => named.has(id)));
    writeFileSync(recipesPath, `${JSON.stringify(catalog)}\n`); // compact, as build-capture-recipes.mjs writes it
    console.log(`capture recipes: media ${before[0]} -> ${Object.keys(catalog.media).length}, recipes ${before[1]} -> ${Object.keys(catalog.recipes).length}`);
  }
  console.log(`removed ${retire.length} files`);
}
