// tools/map-lqip.mjs — regenerate the battle loading screen's frame-0 art (2026-10-13, the perf stream; owner:
// "loading into some maps still shows a black screen at first").
//
// For every battlefield in src/ui/mapThumbs.ts MAP_HEROES, from the art the loading screen finally shows (its
// 1280x720 card, else its hero; both are the same frame) it writes:
// - src/ui/mapLqip.ts: a 48x27 WebP placeholder per map, blurred (Gaussian sigma 1.2 px) before a q90 encode, as a
//   data URL (about 0.3-0.5 kB each). The loading screen imports it lazily (the Garage loads it in idle time), so the
//   first loading frame shows the map's own picture with no request, and the boot bundle does not grow. 48 px, not
//   32: at 32x18 WebP's 4:2:0 chroma (16x9) washed the colour out at the same byte size.
// - src/ui/mapArtTones.ts: the same picture's mean colour in three horizontal bands (sky, horizon, ground) and their
//   mean over every map, the gradient the screen shows before the placeholder module is resident. It is small enough
//   for the boot graph (replacing the hand-picked per-biome gradients that left most maps near-black).
//
// Usage: node tools/map-lqip.mjs [--only id1,id2]
// Run after tools/map-thumbs.mjs or after the media pipeline publishes new cards (tools/media-production/publish.mjs).
// Needs ffmpeg and cwebp on PATH (as tools/map-thumbs.mjs does).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const W = 48, H = 27;
const BLUR_SIGMA = 1.2;
const QUALITY = 90;
/** Three horizontal bands of the 27 rows: sky, horizon, ground. */
const BANDS = [[0, 9], [9, 18], [18, 27]];

const args = process.argv.slice(2);
const onlyIx = args.indexOf('--only');
const only = onlyIx >= 0 ? new Set((args[onlyIx + 1] || '').split(',').filter(Boolean)) : null;

function mapIds() {
  const source = readFileSync(resolve('src/ui/mapThumbs.ts'), 'utf8');
  const block = source.match(/export const MAP_HEROES = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!block) throw new Error('map-lqip: MAP_HEROES not found in src/ui/mapThumbs.ts');
  return [...block[1].matchAll(/^\s*([a-z0-9_]+):\s*'\/maps\/[a-z0-9_]+\.webp',?$/gm)].map((m) => m[1]);
}

function artFor(id) {
  const card = resolve(`public/maps/cards/${id}.webp`);
  if (existsSync(card)) return card;
  const hero = resolve(`public/maps/${id}.webp`);
  if (existsSync(hero)) return hero;
  throw new Error(`map-lqip: no card or hero for ${id}`);
}

const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The picture's mean colour per band, from an area-filtered W x H frame (no blur: the means are the picture's own). */
function tones(art) {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', art,
    '-vf', `scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  if (raw.length !== W * H * 3) throw new Error(`map-lqip: ${art} decoded to ${raw.length} bytes`);
  return BANDS.map(([y0, y1]) => {
    const sum = [0, 0, 0];
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) sum[c] += raw[(y * W + x) * 3 + c];
    const n = (y1 - y0) * W;
    return sum.map((v) => v / n);
  });
}

function placeholder(art, scratch, id) {
  const png = join(scratch, `${id}.png`), webp = join(scratch, `${id}.webp`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', art,
    '-vf', `scale=${W}:${H}:flags=area,gblur=sigma=${BLUR_SIGMA}`, '-frames:v', '1', png]);
  execFileSync('cwebp', ['-quiet', '-m', '6', '-sharp_yuv', '-q', String(QUALITY), png, '-o', webp]);
  return `data:image/webp;base64,${readFileSync(webp).toString('base64')}`;
}

/** Entries already generated, kept for ids outside --only. */
function previous(file, pattern) {
  const out = new Map();
  if (!existsSync(file)) return out;
  for (const m of readFileSync(file, 'utf8').matchAll(pattern)) out.set(m[1], m[2]);
  return out;
}

const ids = mapIds();
const lqipFile = resolve('src/ui/mapLqip.ts');
const tonesFile = resolve('src/ui/mapArtTones.ts');
const prevLqip = previous(lqipFile, /^ {2}([a-z0-9_]+): '(data:image\/webp;base64,[A-Za-z0-9+/=]+)',$/gm);
const prevTones = previous(tonesFile, /^ {2}([a-z0-9_]+): (\['#[0-9a-f]{6}', '#[0-9a-f]{6}', '#[0-9a-f]{6}'\]),$/gm);
const scratch = mkdtempSync(join(tmpdir(), 'map-lqip-'));
const lqip = new Map(), tone = new Map(), toneRgb = new Map();
for (const id of ids) {
  if (only && !only.has(id)) {
    if (!prevLqip.has(id) || !prevTones.has(id)) throw new Error(`map-lqip: --only skips ${id}, which has no previous entry`);
    lqip.set(id, prevLqip.get(id));
    tone.set(id, prevTones.get(id));
    toneRgb.set(id, [...prevTones.get(id).matchAll(/#([0-9a-f]{6})/g)].map((m) => [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))));
    continue;
  }
  const art = artFor(id);
  lqip.set(id, placeholder(art, scratch, id));
  const bands = tones(art);
  toneRgb.set(id, bands);
  tone.set(id, `[${bands.map((b) => `'${hex(b)}'`).join(', ')}]`);
  console.log(`[map-lqip] ${id}: ${lqip.get(id).length} chars, tones ${tone.get(id)}`);
}
const mean = BANDS.map((_, b) => [0, 1, 2].map((c) => ids.reduce((s, id) => s + toneRgb.get(id)[b][c], 0) / ids.length));

const header = (what) => `// ${what} — GENERATED by tools/map-lqip.mjs from each battlefield's card (public/maps/cards/<id>.webp,
// else its hero). Regenerate: node tools/map-lqip.mjs (after new map art is published). Do not edit by hand.
`;
writeFileSync(lqipFile, `${header('src/ui/mapLqip.ts')}
/**
 * Each battlefield's ${W}x${H} placeholder (blurred, WebP q${QUALITY}) as a data URL: the loading screen's first frame
 * shows it, with no request, until the map's card or hero has decoded. Imported lazily only (src/ui/battleLoad.ts
 * primeMapLqip), never from the boot graph.
 */
export const MAP_LQIP: Readonly<Record<string, string>> = Object.freeze({
${ids.map((id) => `  ${id}: '${lqip.get(id)}',`).join('\n')}
});
`);
writeFileSync(tonesFile, `${header('src/ui/mapArtTones.ts')}
/**
 * Each battlefield art's mean colour in three horizontal bands (sky, horizon, ground): the loading screen's gradient
 * under its art, so the screen carries the map's own mid-tones before any picture is resident.
 */
export const MAP_ART_TONES: Readonly<Record<string, readonly [string, string, string]>> = Object.freeze({
${ids.map((id) => `  ${id}: ${tone.get(id)},`).join('\n')}
});

/** The bands' mean over every battlefield: the gradient before the battlefield is known. */
export const MAP_ART_TONE_DEFAULT: readonly [string, string, string] = [${mean.map((b) => `'${hex(b)}'`).join(', ')}];
`);
const total = [...lqip.values()].reduce((s, v) => s + v.length, 0);
console.log(`[map-lqip] wrote ${ids.length} maps: placeholders ${(total / 1024).toFixed(1)} kB (lazy), tones ${tonesFile}`);
