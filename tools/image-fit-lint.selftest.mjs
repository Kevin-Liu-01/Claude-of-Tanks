// No letterbox bars (owner 2026-10-26, on the battle load screen: "there are still black bars above and below the images
// here!!! fix that!!! no more object containns LOL"). Copyright © 2026 Kevin B. Liu.
// The scanner's own laws on fixtures, then the census of the source (tools/image-fit-lint.mjs):
// - every contain site is a registered cutout (src/ui/imageFitRegistry.ts): a picture of the world takes cover;
// - every cutout row's site is still there;
// - a cover rule declares its focal point (object-position or background-position), or is in the ratchet baseline
//   (tools/image-fit-baseline.json), which only shrinks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scanFits, scanImageFits } from './image-fit-lint.mjs';
import { IMAGE_FIT_CUTOUTS } from '../src/ui/imageFitRegistry.ts';

// --- the scanner ---
const keys = (path, text) => {
  const found = scanFits(path, text);
  return { contain: found.contain.map((site) => site.key), unfocused: found.unfocused.map((site) => site.key) };
};
assert.deepEqual(keys('a.css', '.hero img{object-fit:contain;width:100%}'), { contain: ['.hero img'], unfocused: [] });
assert.deepEqual(keys('a.css', '.bg{background-size:contain}\n.art{background-size:cover;background-position:50% 40%}'),
  { contain: ['.bg'], unfocused: [] }, 'background-size counts; a declared position is a focal point');
assert.deepEqual(keys('a.css', '.clip{object-fit:cover}'), { contain: [], unfocused: ['.clip'] }, 'cover without a focal point');
assert.deepEqual(keys('a.css', '/* .x{object-fit:contain} */ .y{object-fit:fill}'), { contain: [], unfocused: [] }, 'comments and other fits');
assert.deepEqual(keys('a.css', '.d :is(.pf,.sil){background-size:contain;mask-size:contain}'), { contain: ['.d :is(.pf,.sil)'], unfocused: [] },
  'a selector may end in a parenthesis; mask-size is no picture');
assert.deepEqual(keys('a.ts', 'const CSS = `${WIDE} .cot-bl .map img{object-fit:cover}\n.a{x:1}`;'), { contain: [], unfocused: ['${WIDE} .cot-bl .map img'] },
  'a CSS-in-TS selector keeps its interpolation');
assert.deepEqual(keys('a.ts', "img.style.cssText = 'display:block;object-fit:contain';"), { contain: ['inline:img.style.cssText'], unfocused: [] });
assert.deepEqual(keys('a.ts', "drawImageFit(ctx, image, w, h, 'contain');\nmakeInfo({ src, fit: 'contain' });").contain,
  ["js:drawImageFit(ctx, image, w, h, 'contain');", "js:makeInfo({ src, fit: 'contain' });"], 'a script asking for contain');
assert.deepEqual(keys('a.html', '<!-- <style>.x{object-fit:contain}</style> --><img style="object-fit:cover">'), { contain: [], unfocused: [] });

// --- the census ---
const { contain, unfocused } = scanImageFits();
const problems = [];
const cutouts = new Set(IMAGE_FIT_CUTOUTS.map((row) => `${row.owner} ${row.key}`));
for (const row of IMAGE_FIT_CUTOUTS) assert.ok(row.holds, `${row.owner} ${row.key}: a cutout row says what it holds`);
const found = new Set(contain.map((site) => `${site.path} ${site.key}`));
for (const site of contain) {
  if (!cutouts.has(`${site.path} ${site.key}`)) {
    problems.push(`${site.path}:${site.line} contain on ${site.key}: a picture fills its box (cover with an object-position focal point); `
      + 'contain is only for a transparent cutout, registered in src/ui/imageFitRegistry.ts');
  }
}
for (const key of cutouts) if (!found.has(key)) problems.push(`IMAGE_FIT_CUTOUTS ${key}: a stale row (the source no longer fits it with contain)`);

const baseline = JSON.parse(readFileSync(new URL('./image-fit-baseline.json', import.meta.url), 'utf8')).unfocused;
const allowed = new Set(Object.entries(baseline).flatMap(([path, list]) => list.map((key) => `${path} ${key}`)));
const unfocusedNow = new Set(unfocused.map((site) => `${site.path} ${site.key}`));
for (const site of unfocused) {
  if (!allowed.has(`${site.path} ${site.key}`)) {
    problems.push(`${site.path}:${site.line} ${site.key} covers with no focal point: declare object-position (or background-position)`);
  }
}
for (const key of allowed) {
  if (!unfocusedNow.has(key)) problems.push(`tools/image-fit-baseline.json: ${key} declares its focal point now (or is gone): remove it (the ratchet shrinks)`);
}
assert.deepEqual(problems, [], `image-fit lint:\n  ${problems.join('\n  ')}`);
console.log(`image-fit-lint.selftest: ${contain.length} contain sites, every one a registered cutout; ${unfocused.length} cover rules without a focal point, `
  + `all in the shrinking baseline`);
