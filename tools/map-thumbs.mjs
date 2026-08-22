// tools/map-thumbs.mjs — regenerate the garage map-picker thumbnails.
// Renders each map's deterministic battlefield view through the screenshot
// harness and downsamples to crisp 1280x720 WebPs in public/maps/. The generated
// module references those public assets instead of embedding multi-megabyte
// data URIs in boot-critical JavaScript.
// Usage: node tools/screenshot.mjs && node tools/map-thumbs.mjs [--only id1,id2]
//   [--shots-dir shots]
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
  ruinspires: 'battlefield_ruinspires',
  blackglass: 'battlefield_blackglass',
  titan_gorge: 'battlefield_titan_gorge',
  skybridge: 'battlefield_skybridge',
};
const W = 1280, H = 720;
const QUALITY = 88;

const args = process.argv.slice(2);
const onlyIx = args.indexOf('--only');
const only = onlyIx >= 0 ? args[onlyIx + 1].split(',') : null;
const shotsIx = args.indexOf('--shots-dir');
const shotsDir = resolve(shotsIx >= 0 ? args[shotsIx + 1] : 'shots');

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
  const src = resolve(shotsDir, `${view}.png`);
  if (!existsSync(src)) {
    console.error(`[thumbs] missing ${src} — run node tools/screenshot.mjs first`);
    process.exit(1);
  }
  // A 1280-wide, sharp-YUV WebP remains inexpensive enough for the twenty-
  // map picker while staying crisp in the large briefing and Studio hero
  // surfaces on high-DPI displays. Source captures are native 4K, so this is
  // a single high-quality downsample rather than an upscaled thumbnail.
  execFileSync('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(QUALITY),
    '-resize', String(W), String(H),
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
