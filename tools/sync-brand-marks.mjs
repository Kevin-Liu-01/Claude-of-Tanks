// Keep every shipped brand copy derived from its editable master: the crest's lockups and the boot title card.
// Usage:
//   node tools/sync-brand-marks.mjs
//   node tools/sync-brand-marks.mjs --check
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_MOTION_LAYER_CSS, brandMarkMotionLayers } from '../src/ui/brandMarkMotion.ts';
import { BRAND_TANK_VIEWBOX, brandMarkSVG } from '../src/ui/brandMark.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function svgBody(svg) {
  const openEnd = svg.indexOf('\n');
  const closeStart = svg.lastIndexOf('\n</svg>');
  if (openEnd < 0 || closeStart < 0) throw new Error('invalid SVG master');
  return svg.slice(openEnd + 1, closeStart);
}

function replaceBetween(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`missing derived-brand marker: ${startMarker}`);
  }
  return source.slice(0, start + startMarker.length) + replacement + source.slice(end);
}

function syncFile(relativePath, expected) {
  const absolutePath = join(ROOT, relativePath);
  const current = readFileSync(absolutePath, 'utf8');
  if (current === expected) return false;
  if (CHECK) {
    console.error(`[brand-sync] stale: ${relativePath}`);
    process.exitCode = 1;
    return true;
  }
  writeFileSync(absolutePath, expected);
  console.log(`[brand-sync] updated: ${relativePath}`);
  return true;
}

const colorMaster = read('public/brand/logo-mark.svg');
const metalMaster = read('public/brand/logo-mark-metal.svg');
const colorBody = svgBody(colorMaster);
const metalBody = svgBody(metalMaster);

const fullStart = '  <g transform="translate(5 5) scale(0.78125)">\n';
const fullEnd = '\n  </g>\n  <text class="wm1"';
const fullMetalEnd = '\n</g>\n  <text class="wm1"';

const fullColor = replaceBetween(
  read('public/brand/logo-full.svg'),
  fullStart,
  fullEnd,
  colorBody,
);
syncFile('public/brand/logo-full.svg', fullColor);

const fullMetal = replaceBetween(
  read('public/brand/logo-full-metal.svg'),
  fullStart,
  fullMetalEnd,
  metalBody,
);
syncFile('public/brand/logo-full-metal.svg', fullMetal);

// (brand-ui 245) The commander mark (the owner's pick): tools/brand-marks.mjs writes every master from src/ui/brandMark.ts;
// the retired crest's files above stay for the media kits, and the boot splash carries the title card (the living tank
// over the stacked wordmark), its body inlined with the loop's rules.
const titleCard = read('public/brand/title-card.svg');
const cardViewBox = /^<svg [^>]*viewBox="([^"]+)"/.exec(titleCard);
const cardBodyStart = titleCard.indexOf('-->') + 3;
const cardBodyEnd = titleCard.lastIndexOf('</svg>');
if (!cardViewBox || cardBodyStart < 3 || cardBodyEnd < cardBodyStart) throw new Error('invalid title-card master');
const indexSource = read('index.html');
const bootTag = /^ {6}<div class="cot-boot-mark" [^>\n]*>\n/m.exec(indexSource);
if (!bootTag) throw new Error('missing derived-brand marker: the cot-boot-mark <div> opening tag in index.html');
// (2026-10-26, the boot census) the card's tank is the living mark as compositor layers (brandMarkMotionLayers), placed
// where the master places its svg loop, over the master's stacked wordmark: the svg loop's track links (a
// stroke-dashoffset) moved on the main thread only, so every long task of a cold load stopped the tracks under the
// turning wheels
const [vx, vy, vw, vh] = cardViewBox[1].split(' ').map(Number);
const cardBody = titleCard.slice(cardBodyStart, cardBodyEnd);
const placed = /^<g class="cot-mark--motion"><g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)">/.exec(cardBody);
const words = /(?:<path fill="[^"]+" d="[^"]+"\/>){2}$/.exec(cardBody);
if (!placed || !words) throw new Error('invalid title-card master: its living tank group, then its stacked wordmark');
const [ax, ay, k] = placed.slice(1).map(Number);
const [tx, ty, tw] = BRAND_TANK_VIEWBOX.split(' ').map(Number);
const share = (n) => `${Number((n * 100).toFixed(4))}%`;
const ink = /class="mk-run" fill="([^"]+)"/.exec(cardBody)?.[1], accent = /style="fill:([^"]+)"/.exec(cardBody)?.[1];
if (!ink || !accent) throw new Error('invalid title-card master: its ink and accent');
// the opening tag keeps whatever attributes the page gives it (its role and data-i18n-aria-label); only its frame follows
const bootStart = bootTag[0].replace(/ style="aspect-ratio:[^"]*"/, '').replace('>\n', ` style="aspect-ratio:${vw}/${vh}">\n`);
const bootBody = '      <!-- GENERATED from public/brand/title-card.svg by tools/sync-brand-marks.mjs. -->\n'
  + `<svg class="cot-boot-words" viewBox="${cardViewBox[1]}" aria-hidden="true" focusable="false">${words[0]}</svg>`
  + `<span class="cot-boot-tank" style="left:${share((ax + k * tx - vx) / vw)};top:${share((ay + k * ty - vy) / vh)};width:${share(k * tw / vw)}">`
  + `${brandMarkMotionLayers(ink, accent)}</span>`;
let index = replaceBetween(indexSource.replace(bootTag[0], bootStart), bootStart, '\n      </div>\n', bootBody);
// the layers' rules, from src/ui/brandMarkMotion.ts, in the boot sheet
index = replaceBetween(index, '/* cot:brand-motion */', '/* /cot:brand-motion */',
  `\n${BRAND_MOTION_LAYER_CSS.trim().split('\n').map((line) => `    ${line}`).join('\n')}\n    `);
syncFile('index.html', index);

// (brand-ui 247) the Field Manual's static pages carry the mark in their footer: the drawing src/ui/brandMark.ts gives at
// the footer's height (the hatch fix of 2026-10-24 found these copies a version behind)
for (const name of readdirSync(join(ROOT, 'site')).filter((file) => /^docs.*\.html$/.test(file)).sort()) {
  const path = `site/${name}`;
  const source = read(path);
  const footer = /(<footer class="docs-footer">[\s\S]*?<a class="brand" href="\/home"[^>]*>)<svg class="cot-mark" [^>]*height="(\d+)"[^>]*>[\s\S]*?<\/svg>/;
  if (!footer.test(source)) throw new Error(`missing derived-brand marker: the footer mark in ${path}`);
  syncFile(path, source.replace(footer, (_, open, height) => open + brandMarkSVG(Number(height))));
}

if (!process.exitCode) {
  console.log(`[brand-sync] ${CHECK ? 'all derived marks are current' : 'sync complete'}`);
}
