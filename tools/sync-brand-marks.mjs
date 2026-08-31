// Keep every shipped crest copy derived from the three editable mark masters.
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

const favicon = metalMaster.replace(
  'aria-label="Claude of Tanks — embossed metal crest: Claude Code commander in a tank"',
  'aria-label="Claude of Tanks"',
);
syncFile('public/brand/favicon.svg', favicon);

const bootStart = '      <svg class="cot-boot-mark" viewBox="0 0 256 256" aria-label="Claude of Tanks">\n';
const bootEnd = '\n</svg>\n\n      <div class="cot-boot-word">';
const bootBody = `      <!-- GENERATED from public/brand/logo-mark.svg by tools/sync-brand-marks.mjs. -->\n${colorBody}`;
const index = replaceBetween(read('index.html'), bootStart, bootEnd, bootBody);
syncFile('index.html', index);

if (!process.exitCode) {
  console.log(`[brand-sync] ${CHECK ? 'all derived marks are current' : 'sync complete'}`);
}
