// tools/map-thumbs.mjs — regenerate the garage map-picker thumbnails.
// Renders each map's deterministic battlefield view through the screenshot
// harness, downscales to 224x126 PNGs in public/maps/, and re-embeds them as
// data URIs in src/ui/mapThumbs.js (runtime stays 100% self-contained).
// Usage: node tools/screenshot.mjs && node tools/map-thumbs.mjs
// (expects shots/battlefield*.png to be fresh)

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const VIEWS = {
  verdant: 'battlefield',
  desert: 'battlefield_desert',
  winter: 'battlefield_winter',
  urban: 'battlefield_urban',
};
const W = 224, H = 126;

mkdirSync(resolve('public/maps'), { recursive: true });

const entries = {};
for (const [id, view] of Object.entries(VIEWS)) {
  const src = resolve(`shots/${view}.png`);
  if (!existsSync(src)) {
    console.error(`[thumbs] missing ${src} — run node tools/screenshot.mjs first`);
    process.exit(1);
  }
  const out = resolve(`public/maps/${id}.png`);
  // macOS sips: crop-scale to the thumb aspect, then resize
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(H), String(W), src, '--out', out],
    { stdio: 'pipe' });
  entries[id] = `data:image/png;base64,${readFileSync(out).toString('base64')}`;
  console.log(`[thumbs] ${id} <- ${view} (${entries[id].length} chars)`);
}

const mod = `// src/ui/mapThumbs.js — GENERATED map-picker thumbnails (data URIs so the
// build stays 100% self-contained; PNG copies live in public/maps/).
// Regenerate via: node tools/screenshot.mjs && node tools/map-thumbs.mjs
// Empty string = no thumbnail yet; the picker falls back to a CSS gradient.

export const MAP_THUMBS = {
${Object.entries(entries).map(([id, uri]) => `  ${id}:\n    '${uri}',`).join('\n')}
};
`;
writeFileSync(resolve('src/ui/mapThumbs.js'), mod);
console.log('[thumbs] wrote src/ui/mapThumbs.js');
