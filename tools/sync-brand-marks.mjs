// Keep every shipped brand copy derived from its editable master: the crest's lockups and the boot title card.
// Usage:
//   node tools/sync-brand-marks.mjs
//   node tools/sync-brand-marks.mjs --check
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// (brand-ui 242) The crest retired with the Premiere identity (src/ui/components/DIRECTION.md, "The identity"): its
// files above stay for the media kits, favicon.svg is the monogram tools/brand/wordmark.py writes, and the boot splash
// carries the title card, its body inlined so the registration sting can move the caps' top halves.
const titleCard = read('public/brand/title-card.svg');
const cardViewBox = /^<svg [^>]*viewBox="([^"]+)"/.exec(titleCard);
const cardBodyStart = titleCard.indexOf('-->') + 3;
const cardBodyEnd = titleCard.lastIndexOf('</svg>');
if (!cardViewBox || cardBodyStart < 3 || cardBodyEnd < cardBodyStart) throw new Error('invalid title-card master');
const indexSource = read('index.html');
const bootTag = /^ {6}<svg class="cot-boot-mark" [^>\n]*>\n/m.exec(indexSource);
if (!bootTag) throw new Error('missing derived-brand marker: the cot-boot-mark <svg> opening tag in index.html');
// the opening tag keeps whatever attributes the page gives it (its role and data-i18n-aria-label); only its frame follows
const bootStart = bootTag[0].replace(/viewBox="[^"]*"/, `viewBox="${cardViewBox[1]}"`);
const bootBody = '      <!-- GENERATED from public/brand/title-card.svg by tools/sync-brand-marks.mjs. -->\n'
  + titleCard.slice(cardBodyStart, cardBodyEnd);
const index = replaceBetween(indexSource.replace(bootTag[0], bootStart), bootStart, '\n      </svg>\n', bootBody);
syncFile('index.html', index);

if (!process.exitCode) {
  console.log(`[brand-sync] ${CHECK ? 'all derived marks are current' : 'sync complete'}`);
}
