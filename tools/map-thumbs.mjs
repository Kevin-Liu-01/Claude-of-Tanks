// tools/map-thumbs.mjs — regenerate the garage map-picker thumbnails.
// Renders each map's deterministic battlefield view through the screenshot
// harness and downsamples to crisp 960x540 WebPs in public/maps/. The generated
// module references those public assets instead of embedding multi-megabyte
// data URIs in boot-critical JavaScript.
// Usage: node tools/screenshot.mjs && node tools/map-thumbs.mjs [--only id1,id2]
// (expects shots/battlefield*.png to be fresh)
// --only regenerates just those ids and requires every other public asset to
// exist, keeping the generated map registry complete.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const VIEWS = {
  verdant: 'battlefield',
  desert: 'battlefield_desert',
  winter: 'battlefield_winter',
  urban: 'battlefield_urban',
  // maps r1 — the second four battlefields
  coastal: 'battlefield_coastal',
  autumn: 'battlefield_autumn',
  steppe: 'battlefield_steppe',
  railyard: 'battlefield_railyard',
  frontier: 'battlefield_frontier',
  fjord: 'battlefield_fjord',
  delta: 'battlefield_delta',
  badlands: 'battlefield_badlands',
  monsoon: 'battlefield_monsoon',
  alpine: 'battlefield_alpine',
  caldera: 'battlefield_caldera',
  foundry: 'battlefield_foundry',
};
const W = 960, H = 540;
const QUALITY = 88;

const args = process.argv.slice(2);
const onlyIx = args.indexOf('--only');
const only = onlyIx >= 0 ? args[onlyIx + 1].split(',') : null;

mkdirSync(resolve('public/maps'), { recursive: true });

const entries = {};
for (const [id, view] of Object.entries(VIEWS)) {
  const out = resolve(`public/maps/${id}.webp`);
  if (only && !only.includes(id)) {
    if (!existsSync(out)) throw new Error(`[thumbs] missing preserved asset ${out}`);
    entries[id] = `/maps/${id}.webp`;
    console.log(`[thumbs] ${id} preserved`);
    continue;
  }
  const src = resolve(`shots/${view}.png`);
  if (!existsSync(src)) {
    console.error(`[thumbs] missing ${src} — run node tools/screenshot.mjs first`);
    process.exit(1);
  }
  // High-quality WebP holds the 4.3x linear-resolution improvement without
  // making the garage download sixteen near-megabyte lossless PNGs.
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), '-resize', String(W), String(H),
    src, '-o', out], { stdio: 'pipe' });
  entries[id] = `/maps/${id}.webp`;
  console.log(`[thumbs] ${id} <- ${view} (${W}x${H}, WebP q${QUALITY})`);
}

const mod = `// src/ui/mapThumbs.js — GENERATED map art served from public/maps/.
// Regenerate via: node tools/screenshot.mjs && node tools/map-thumbs.mjs
// Empty string = no thumbnail yet; the picker falls back to a CSS gradient.

export const MAP_THUMBS = {
${Object.entries(entries).map(([id, uri]) => `  ${id}: '${uri}',`).join('\n')}
};
`;
writeFileSync(resolve('src/ui/mapThumbs.js'), mod);
console.log('[thumbs] wrote src/ui/mapThumbs.js');
