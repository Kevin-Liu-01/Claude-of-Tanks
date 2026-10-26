// Keep every shipped brand copy derived from its editable master: the boot card's lockup and the docs footers' mark.
// Usage:
//   node tools/sync-brand-marks.mjs
//   node tools/sync-brand-marks.mjs --check
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_MARK_LIVE_CSS, brandMarkLiveHTML } from '../src/ui/brandMarkMotion.ts';
import { BRAND_WORDMARK_HTML, brandMarkSVG } from '../src/ui/brandMark.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
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

// The boot card's lockup (owner, 2026-10-26: the name on one line, and a mark that keeps moving while the game loads): the
// living mark as compositor layers (src/ui/brandMarkMotion.ts) over the one-line wordmark, with the layers' rules in the
// boot sheet.
let index = replaceBetween(read('index.html'), '<!-- cot:boot-lockup -->', '<!-- /cot:boot-lockup -->',
  `\n        ${brandMarkLiveHTML()}\n        ${BRAND_WORDMARK_HTML}\n        `);
index = replaceBetween(index, '/* cot:brand-motion */', '/* /cot:brand-motion */',
  `\n${BRAND_MARK_LIVE_CSS.trim().split('\n').map((line) => `    ${line}`).join('\n')}\n    `);
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
