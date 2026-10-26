#!/usr/bin/env node
// The Claude of Tanks mark set (owner, 2026-10-24: "make new logos for everything and all devices and all marks"): every
// master and raster of the commander mark, derived from its one source, src/ui/brandMark.ts (and the motion from
// src/ui/brandMarkMotion.ts). Copyright © 2026 Kevin B. Liu.
//   node tools/brand-marks.mjs          write public/brand/* (SVG masters, PNG and ICO rasters, manifest.json)
//   node tools/brand-marks.mjs --svg    the SVG masters only (no browser)
// The wordmark comes from tools/brand/wordmark.py's outputs (src/ui/brandWordmark.ts and public/brand/wordmark-stacked.svg).
// Rasters draw each master onto a canvas in one headless browser (3 GB heap), so only pure-path SVGs are size-faithful;
// the marks are pure paths by design. Run node tools/sync-brand-marks.mjs after this for the boot card.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND_BUST_VIEWBOX, BRAND_TANK_VIEWBOX, brandBustBody, brandTankBody,
} from '../src/ui/brandMark.ts';
import { BRAND_MOTION_CSS, brandMarkMotionSVG } from '../src/ui/brandMarkMotion.ts';
import { WORDMARK_OF, WORDMARK_VIEWBOX, WORDMARK_WORDS } from '../src/ui/brandWordmark.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/brand');
const NOTICE = 'Copyright (c) 2026 Kevin B. Liu. The commander is the Claude Code mascot (Anthropic), verbatim: docs/ATTRIBUTION.md.';
const PAPER = '#f6f3ec', TUNGSTEN = '#f0a030', GRAPHITE = '#11151a', GROUND = '#0b0e11', TUNGSTEN_600 = '#c97f1c';

const [tx, ty, tw, th] = BRAND_TANK_VIEWBOX.split(' ').map(Number);
const [bx, by, bw, bh] = BRAND_BUST_VIEWBOX.split(' ').map(Number);
const [wx, wy, ww, wh] = WORDMARK_VIEWBOX.split(' ').map(Number);
const stackedSource = readFileSync(join(OUT, 'wordmark-stacked.svg'), 'utf8');
const [sx, sy, sw, sh] = /viewBox="([^"]+)"/.exec(stackedSource)[1].split(' ').map(Number);
const [stackedWords, stackedOf] = [...stackedSource.matchAll(/<path fill="[^"]+" d="([^"]+)"\/>/g)].map((match) => match[1]);

const svg = (viewBox, body, label = 'Claude of Tanks') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" `
  + `aria-label="${label}"><!-- The Claude of Tanks mark (tools/brand-marks.mjs from src/ui/brandMark.ts). ${NOTICE} -->${body}</svg>\n`;
const place = (body, [vx, vy, vw, vh], x, y, w) => {
  const k = w / vw;
  return `<g transform="translate(${(x - vx * k).toFixed(2)} ${(y - vy * k).toFixed(2)}) scale(${k.toFixed(5)})">${body}</g>`;
};
const tank = (ink, accent, keyline = false, id = 'mk') => brandTankBody({ ink, accent, keyline, id });
const bust = (ink, accent, keyline = false, id = 'bk') => brandBustBody({ ink, accent, keyline, id });
const TANK = [tx, ty, tw, th], BUST = [bx, by, bw, bh];
const words = (ink, accent) => `<path fill="${ink}" d="${WORDMARK_WORDS}"/><path fill="${accent}" d="${WORDMARK_OF}"/>`;
const stacked = (ink, accent) => `<path fill="${ink}" d="${stackedWords}"/><path fill="${accent}" d="${stackedOf}"/>`;

/** The horizontal lockup: the tank 3.8 cap heights tall, a gap of one cap, the wordmark centred on the tank. */
function lockup(ink, accent) {
  const height = wh * 3.8, width = height * tw / th, gap = wh;
  const top = wy + wh / 2 - height / 2;
  const x0 = wx - width - gap;
  return svg(`${x0.toFixed(0)} ${top.toFixed(0)} ${(ww + width + gap).toFixed(0)} ${height.toFixed(0)}`,
    place(tank(ink, accent), TANK, x0, top, width) + words(ink, accent));
}
/** The stacked lockup: the tank over the stacked wordmark, as wide as the words' block. */
function lockupStacked(ink, accent, body = null) {
  const width = sw * 0.92, height = width * th / tw, gap = sh * 0.1;
  const x = sx + (sw - width) / 2, top = sy - height - gap;
  return svg(`${sx} ${top.toFixed(0)} ${sw} ${(sh + height + gap).toFixed(0)}`,
    (body ?? place(tank(ink, accent), TANK, x, top, width)) + stacked(ink, accent));
}
/** A square tile: `ground` behind, the full mark `share` of the side wide, centred on its box. A `crew` above 1 draws the
 *  commander and the helmet that much larger about the cupola's top, as the tab's pixel masters do, where the mark is
 *  too small for the commander's eyes. */
function markTile(size, ground, share, radius = 0, crew = 1) {
  const top = 68.2 - (68.2 - ty) * crew, box = [tx, Math.min(ty, top), tw, ty + th - Math.min(ty, top)];
  const w = size * share, h = w * box[3] / box[2];
  const body = tank(PAPER, TUNGSTEN).replace('<g class="mk-crew">',
    crew === 1 ? '<g class="mk-crew">' : `<g class="mk-crew" transform="translate(106 68.2) scale(${crew}) translate(-106 -68.2)">`);
  const back = `<rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ''} fill="${ground}"/>`;
  return svg(`0 0 ${size} ${size}`, back + place(body, box, (size - w) / 2, (size - h) / 2, w));
}

/** The tab's pixel masters (owner, 2026-10-26: "make the favicon the proper claude on tank"): the full mark hand-hinted
 *  on a 16 and a 32 cell grid. The crew is drawn about 1.6 times the tank's scale so the commander keeps its own orange
 *  block (its eyes from 32), the gun keeps its rise, and the running gear is one band at 16 (its wheels from 32). Cells:
 *  p paper, t tungsten, a and h paper at 50 and 70 % over graphite (the thin antenna, the track's round ends). */
const FAVICON_16 = [
  '................',
  '................',
  '..t.............',
  '.tt..pppp.......',
  '..t.pppppp......',
  '..a..tttt.......',
  '..a.tttttt...pp.',
  '...pppppppppp...',
  '...pppppppp.....',
  '.pppppppppp.....',
  '.ppppppppppppp..',
  '................',
  '..hppppppppph...',
  '..hppppppppph...',
  '................',
  '................',
];
const FAVICON_32 = [
  '................................',
  '................................',
  '................................',
  '................................',
  '....tt..........................',
  '..tttt..........................',
  '..tttt.....pppppp...............',
  '....tt....p.a..a.p..............',
  '.....a....pppppppp..............',
  '.....a...pppppppppp.............',
  '.....a....t.tttt.t..............',
  '......a...t.tttt.t..............',
  '......a.tttttttttttt.......ppp..',
  '......a.tttttttttttt....pppppp..',
  '.......pppppppppppppppppppp.....',
  '......pppppppppppppppppp........',
  '......ppppppppppppppp...........',
  '.......pppppppppppppp...........',
  '...ppppppppppppppppppp..........',
  '..ppppppppppppppppppppppp.......',
  '..ppppppppppppppppppppppppp.....',
  '..ppppppppppppppppppppppppppp...',
  '................................',
  '................................',
  '..appppppppppppppppppppppppa....',
  '..pp..pp..pp..pp..pp..pp..pp....',
  '..pp..pp..pp..pp..pp..pp..pp....',
  '..appppppppppppppppppppppppa....',
  '................................',
  '................................',
  '................................',
  '................................',
];
const over = (share) => `#${[[0x11, 0xf6], [0x15, 0xf3], [0x1a, 0xec]].map(([g, p]) => Math.round(g + (p - g) * share).toString(16).padStart(2, '0')).join('')}`;
const CELL_INK = { p: PAPER, t: TUNGSTEN, a: over(0.5), h: over(0.7) };
/** A pixel master on its graphite tile: one path per ink, a rectangle per run of cells, every edge on the grid. */
function pixelTile(cells, radius) {
  const n = cells.length;
  const runs = {};
  cells.forEach((row, y) => {
    if (row.length !== n || [...row].some((cell) => cell !== '.' && !CELL_INK[cell])) throw new Error(`pixel master row ${y}: ${row}`);
    for (const { 0: run, index } of row.matchAll(/([^.])\1*/g)) (runs[run[0]] ??= []).push(`M${index} ${y}h${run.length}v1h-${run.length}Z`);
  });
  return svg(`0 0 ${n} ${n}`, `<rect width="${n}" height="${n}" rx="${radius}" fill="${GRAPHITE}"/>`
    + Object.entries(runs).map(([cell, d]) => `<path fill="${CELL_INK[cell]}" d="${d.join('')}"/>`).join(''));
}

/** A square tile: `ground` behind, the bust `share` of the side wide, centred (a little low, for its optical centre). */
function tile(size, ground, share, radius = 0, ink = PAPER, accent = TUNGSTEN) {
  const w = size * share, h = w * bh / bw;
  const back = ground ? `<rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ''} fill="${ground}"/>` : '';
  return svg(`0 0 ${size} ${size}`, back + place(bust(ink, accent), BUST, (size - w) / 2, (size - h) / 2 + size * 0.015, w));
}

const masters = {
  'mark.svg': svg(BRAND_TANK_VIEWBOX, tank(PAPER, TUNGSTEN)),
  'mark-paper.svg': svg(BRAND_TANK_VIEWBOX, tank(GRAPHITE, TUNGSTEN_600)),
  'mark-mono.svg': svg(BRAND_TANK_VIEWBOX, tank(PAPER, PAPER, true)),
  'mark-mono-ink.svg': svg(BRAND_TANK_VIEWBOX, tank(GRAPHITE, GRAPHITE, true)),
  'mark-motion.svg': svg(BRAND_TANK_VIEWBOX, `<style>${BRAND_MOTION_CSS.replace(/\.cot-mark--motion/g, ':root')}</style>`
    + brandMarkMotionSVG(106, PAPER, TUNGSTEN).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')),
  // the hover roll's drawing (src/ui/brandMarkRoll.ts inlines its body into a still mark): the host's ink and accent, the
  // loop's rules scoped to .cot-mark--motion. A file, not a module, so the roll adds no script to any page's graph.
  'mark-motion-inline.svg': svg(BRAND_TANK_VIEWBOX, `<style>${BRAND_MOTION_CSS.trim()}</style>`
    + brandMarkMotionSVG(106).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')),
  'bust.svg': svg(BRAND_BUST_VIEWBOX, bust(PAPER, TUNGSTEN)),
  'bust-paper.svg': svg(BRAND_BUST_VIEWBOX, bust(GRAPHITE, TUNGSTEN_600)),
  'bust-mono.svg': svg(BRAND_BUST_VIEWBOX, bust(PAPER, PAPER, true)),
  'bust-mono-ink.svg': svg(BRAND_BUST_VIEWBOX, bust(GRAPHITE, GRAPHITE, true)),
  // a browser tab: the 32 cell master on a graphite tile, so it reads on light and dark tab strips alike (a 2x tab draws
  // it cell for cell; the 16 px rasters take the 16 cell master)
  'favicon.svg': pixelTile(FAVICON_32, 6),
  'favicon-16.svg': pixelTile(FAVICON_16, 3),
  // the tab's tile at 48 and 192 px: the vector mark, its crew drawn half again as large as the pixel masters draw it
  'favicon-mark.svg': markTile(64, GRAPHITE, 0.875, 12, 1.5),
  // the app icon: full bleed (the system rounds it); the maskable keeps the mark inside the 80 % safe circle
  'app-icon.svg': markTile(1024, GRAPHITE, 0.78),
  'maskable.svg': markTile(1024, GRAPHITE, 0.66),
  'social-avatar.svg': tile(400, GROUND, 0.66),
  'lockup.svg': lockup(PAPER, TUNGSTEN),
  'lockup-paper.svg': lockup(GRAPHITE, TUNGSTEN_600),
  'lockup-mono.svg': lockup(PAPER, PAPER).replace(tank(PAPER, PAPER), tank(PAPER, PAPER, true, 'lm')),
  'lockup-stacked.svg': lockupStacked(PAPER, TUNGSTEN),
  'lockup-stacked-paper.svg': lockupStacked(GRAPHITE, TUNGSTEN_600),
};
// the boot title card: the living tank over the stacked wordmark (tools/sync-brand-marks.mjs inlines it into index.html)
{
  const width = sw * 0.92, height = width * th / tw, gap = sh * 0.1;
  const x = sx + (sw - width) / 2, top = sy - height - gap;
  const motion = brandMarkMotionSVG(106, PAPER, TUNGSTEN).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  masters['title-card.svg'] = lockupStacked(PAPER, TUNGSTEN, `<g class="cot-mark--motion">${place(motion, TANK, x, top, width)}</g>`);
}
mkdirSync(OUT, { recursive: true });
for (const [name, text] of Object.entries(masters)) writeFileSync(join(OUT, name), text);
console.log('brand-marks:', Object.keys(masters).length, 'SVG masters');
if (process.argv.includes('--svg')) process.exit(0);

// ---- rasters: [file, master, width, height, ground]
const IOS = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];
const MACOS = [16, 32, 64, 128, 256, 512, 1024];
const rasters = [
  ['favicon-16.png', 'favicon-16.svg', 16], ['favicon-32.png', 'favicon.svg', 32], ['favicon-48.png', 'favicon-mark.svg', 48],
  ['favicon-192.png', 'favicon-mark.svg', 192],
  ['apple-touch-icon.png', 'app-icon.svg', 180], ['../apple-touch-icon.png', 'app-icon.svg', 180],
  ['icon-192.png', 'app-icon.svg', 192], ['icon-512.png', 'app-icon.svg', 512],
  ['maskable-192.png', 'maskable.svg', 192], ['maskable-512.png', 'maskable.svg', 512],
  ['mstile-150.png', 'maskable.svg', 150], ['mstile-310.png', 'maskable.svg', 310],
  ...IOS.map((size) => [`app-icons/ios/icon-${size}.png`, 'app-icon.svg', size]),
  ...MACOS.map((size) => [`app-icons/macos/icon-${size}.png`, 'app-icon.svg', size]),
  ['social-avatar-400.png', 'social-avatar.svg', 400],
  ['mark-1024.png', 'mark.svg', 1024], ['mark-paper-1024.png', 'mark-paper.svg', 1024], ['bust-512.png', 'bust.svg', 512],
  ['lockup-2400.png', 'lockup.svg', 2400], ['lockup-paper-2400.png', 'lockup-paper.svg', 2400],
];
const { default: puppeteer } = await import('puppeteer');
const browser = await puppeteer.launch({ headless: 'shell', args: ['--js-flags=--max-old-space-size=3072'] });
const png = new Map();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const draw = (uri, width, height) => page.evaluate(async (src, w, h) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h || Math.round(w * img.naturalHeight / img.naturalWidth);
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, uri, width, height ?? 0);
  const uriOf = (name) => `data:image/svg+xml;base64,${Buffer.from(masters[name]).toString('base64')}`;
  for (const [file, master, width, height] of rasters) {
    const bytes = Buffer.from(await draw(uriOf(master), width, height), 'base64');
    mkdirSync(dirname(join(OUT, file)), { recursive: true });
    writeFileSync(join(OUT, file), bytes);
    png.set(file, bytes);
  }
  // the OG brand card (1200x630): the stacked lockup on graphite, a tungsten glow from the foot
  const card = svg('0 0 1200 630', '<defs><radialGradient id="g" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="#f0a030" stop-opacity=".18"/>'
    + `<stop offset="1" stop-color="#f0a030" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="${GROUND}"/>`
    + '<rect width="1200" height="630" fill="url(#g)"/>'
    + `<image href="data:image/svg+xml;base64,${Buffer.from(masters['lockup-stacked.svg']).toString('base64')}" x="330" y="96" width="540" height="438"/>`);
  writeFileSync(join(OUT, 'og-logo.svg'), card);
  writeFileSync(join(OUT, 'og-logo.png'), Buffer.from(await draw(`data:image/svg+xml;base64,${Buffer.from(card).toString('base64')}`, 1200, 630), 'base64'));
} finally {
  await browser.close();
}

// ---- favicon.ico (16, 32, 48) and the Windows tile's ico: ICONDIR, one ICONDIRENTRY per image, then the PNG payloads
const ico = (files) => {
  const images = files.map((file) => png.get(file));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  files.forEach((file, index) => {
    const size = Number(/-(\d+)\.png$/.exec(file)[1]);
    const entry = 6 + 16 * index;
    header.writeUInt8(size % 256, entry); header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  return Buffer.concat([header, ...images]);
};
writeFileSync(join(ROOT, 'public/favicon.ico'), ico(['favicon-16.png', 'favicon-32.png', 'favicon-48.png']));
writeFileSync(join(OUT, 'favicon.ico'), ico(['favicon-16.png', 'favicon-32.png', 'favicon-48.png']));
writeFileSync(join(ROOT, 'public/browserconfig.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${NOTICE} -->\n<browserconfig><msapplication><tile>`
  + '<square150x150logo src="/brand/mstile-150.png"/><square310x310logo src="/brand/mstile-310.png"/>'
  + `<TileColor>${GRAPHITE}</TileColor></tile></msapplication></browserconfig>\n`);

// ---- the set's manifest: every file, its size, what it is for
const purpose = {
  'mark.svg': 'the mark on dark', 'mark-paper.svg': 'the mark on paper', 'mark-mono.svg': 'one colour, paper', 'mark-mono-ink.svg': 'one colour, ink',
  'mark-motion.svg': 'the living mark (CSS loop)', 'bust.svg': 'the icon on dark', 'bust-paper.svg': 'the icon on paper',
  'bust-mono.svg': 'icon, one colour, paper', 'bust-mono-ink.svg': 'icon, one colour, ink', 'favicon.svg': 'browser tab (32 cell master)', 'favicon-16.svg': 'browser tab at 16 px (16 cell master)',
  'favicon-mark.svg': 'the mark on the tab tile (48 and 192 px)',
  'app-icon.svg': 'app icon master (full bleed)', 'maskable.svg': 'maskable and tile master (80 % safe zone)',
  'social-avatar.svg': 'X / GitHub avatar', 'lockup.svg': 'horizontal lockup on dark', 'lockup-paper.svg': 'horizontal lockup on paper',
  'lockup-mono.svg': 'horizontal lockup, one colour', 'lockup-stacked.svg': 'stacked lockup on dark', 'lockup-stacked-paper.svg': 'stacked lockup on paper',
  'title-card.svg': 'the boot card (living mark over the stacked wordmark)', 'og-logo.svg': 'OG brand card',
};
const items = [...Object.keys(masters), 'og-logo.svg'].map((file) => ({ file, use: purpose[file] ?? '' }))
  .concat(rasters.map(([file, master, width, height]) => ({ file: file.replace(/^\.\.\//, '../'), from: master, size: `${width}x${height ?? width}` })))
  .concat([{ file: 'og-logo.png', from: 'og-logo.svg', size: '1200x630' }, { file: 'favicon.ico', sizes: '16,32,48' },
    { file: '../favicon.ico', sizes: '16,32,48' }, { file: '../browserconfig.xml', use: 'Windows tile' }]);
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
  libraryId: 'claude-of-tanks-brand-245', author: 'Kevin B. Liu', copyright: 'Copyright © 2026 Kevin B. Liu',
  license: 'LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0',
  thirdParty: 'The commander figure is the Claude Code mascot glyph (Anthropic), verbatim; see docs/ATTRIBUTION.md.',
  generatedBy: 'node tools/brand-marks.mjs (src/ui/brandMark.ts, src/ui/brandMarkMotion.ts)', count: items.length, items,
}, null, 1)}\n`);
console.log('brand-marks:', rasters.length + 1, 'rasters, 2 ico, browserconfig.xml, manifest.json');
