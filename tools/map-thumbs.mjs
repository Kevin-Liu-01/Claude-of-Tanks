// tools/map-thumbs.mjs — regenerate the garage map-picker thumbnails.
// Renders each map's deterministic battlefield view through the screenshot
// harness and publishes both crisp 1280x720 picker WebPs and native 4K hero
// WebPs in public/maps/. The generated module keeps list/card consumers on the
// lightweight derivatives while wide briefing and Studio surfaces request only
// the currently selected 4K frame.
// Usage: node tools/screenshot.mjs --width 3840 --height 2160 --dyn-scale 1 &&
//   node tools/map-thumbs.mjs [--only id1,id2]
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
const THUMB_W = 1280, THUMB_H = 720;
const HERO_W = 3840, HERO_H = 2160;
const QUALITY = 88;

const args = process.argv.slice(2);
const onlyIx = args.indexOf('--only');
const only = onlyIx >= 0 ? args[onlyIx + 1].split(',') : null;
const shotsIx = args.indexOf('--shots-dir');
const shotsDir = resolve(shotsIx >= 0 ? args[shotsIx + 1] : 'shots');

mkdirSync(resolve('public/maps/thumbs'), { recursive: true });

const entries = {};
const heroes = {};
for (const [id, view] of Object.entries(VIEWS)) {
  const heroOut = resolve(`public/maps/${id}.webp`);
  const thumbOut = resolve(`public/maps/thumbs/${id}.webp`);
  if (only && !only.includes(id)) {
    for (const preserved of [heroOut, thumbOut]) {
      if (!existsSync(preserved)) throw new Error(`[thumbs] missing preserved asset ${preserved}`);
    }
    entries[id] = `/maps/thumbs/${id}.webp`;
    heroes[id] = `/maps/${id}.webp`;
    console.log(`[thumbs] ${id} preserved`);
    continue;
  }
  const src = resolve(shotsDir, `${view}.png`);
  if (!existsSync(src)) {
    console.error(`[thumbs] missing ${src} — run node tools/screenshot.mjs first`);
    process.exit(1);
  }
  // Encode the selected-map hero at the exact source dimensions. The separate
  // picker derivative prevents the twenty-card garage list from decoding or
  // transferring twenty 4K images just to draw small previews.
  execFileSync('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(QUALITY),
    '-resize', String(HERO_W), String(HERO_H),
    src, '-o', heroOut], { stdio: 'pipe' });
  execFileSync('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(QUALITY),
    '-resize', String(THUMB_W), String(THUMB_H),
    src, '-o', thumbOut], { stdio: 'pipe' });
  entries[id] = `/maps/thumbs/${id}.webp`;
  heroes[id] = `/maps/${id}.webp`;
  console.log(`[thumbs] ${id} <- ${view} (${HERO_W}x${HERO_H} hero + ${THUMB_W}x${THUMB_H} picker, WebP q${QUALITY})`);
}

const mod = `// src/ui/mapThumbs.ts — GENERATED map art served from public/maps/.
// Regenerate via: node tools/screenshot.mjs --width 3840 --height 2160 --dyn-scale 1 && node tools/map-thumbs.mjs
// Empty string = no thumbnail yet; the picker falls back to a CSS gradient.

export const MAP_THUMBS = Object.freeze({
${Object.entries(entries).map(([id, uri]) => `  ${id}: '${uri}',`).join('\n')}
});

export const MAP_HEROES = Object.freeze({
${Object.entries(heroes).map(([id, uri]) => `  ${id}: '${uri}',`).join('\n')}
});

export type MapThumbnailId = keyof typeof MAP_THUMBS;
`;
writeFileSync(resolve('src/ui/mapThumbs.ts'), mod);
console.log('[thumbs] wrote src/ui/mapThumbs.ts');
