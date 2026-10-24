// surface-element-resets.selftest.mjs — no page sheet resets an element's colour inside the surfaces layer.
// Copyright © 2026 Kevin B. Liu.
//
// A cascade layer declared later wins whatever the specificity, so a bare `a{color:inherit}` or
// `button,input{color:inherit}` in @layer surfaces outranks every component in @layer components: the 247 public-site
// audit found the primary buttons' dark ink (--btn-primary-ink) replaced by the page's light ink on /docs, /home and
// /gallery, a 1.93:1 label on the accent. Element resets belong in @layer base (src/docs/docs.css shows the form).
//
// 1. The scan finds a bare element selector that sets colour inside @layer surfaces, and nothing else.
// 2. No stylesheet under src/ holds more of them than ALLOWED (a ratchet: the count may only fall; at zero the entry
//    leaves).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const postcss = createRequire(import.meta.url)('postcss');
const ELEMENTS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary', 'label']);

/** The bare element selectors that set colour inside @layer surfaces, as "selector" strings. */
export function surfaceElementResets(css) {
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    let inSurfaces = false;
    for (let node = rule.parent; node; node = node.parent) {
      if (node.type === 'atrule' && node.name === 'layer' && node.params.trim() === 'surfaces') inSurfaces = true;
    }
    if (!inSurfaces) return;
    const bare = rule.selectors.map((selector) => selector.trim()).filter((selector) => ELEMENTS.has(selector));
    if (!bare.length) return;
    let sets = false;
    rule.walkDecls(/^(?:color|-webkit-text-fill-color)$/, () => { sets = true; });
    if (sets) found.push(bare.join(','));
  });
  return found;
}

// 1. the scan, on fixtures
assert.deepEqual(surfaceElementResets('@layer surfaces{a{color:inherit}button,input{color:inherit;font:inherit}}'), ['a', 'button,input']);
assert.deepEqual(surfaceElementResets('@layer base{a{color:inherit}}@layer surfaces{.x a{color:red}a.b{color:red}a{text-decoration:none}}'), [],
  'base-layer resets, scoped or classed anchors and resets without colour pass');
assert.deepEqual(surfaceElementResets('@layer surfaces{@media(min-width:1px){a{color:inherit}}}'), ['a'], 'a reset inside a media query still counts');

// 2. the tree
/** The resets left when this receipt landed (247), to fall to zero: the landing lead's sheets. */
const ALLOWED = Object.freeze({
  'src/presentation/home.css': 2,
  'src/gallery/gallery.css': 1,
});
const sheets = execFileSync('git', ['ls-files', 'src/**/*.css', 'src/*.css'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const over = [];
const counts = {};
for (const sheet of sheets) {
  const found = surfaceElementResets(readFileSync(join(ROOT, sheet), 'utf8'));
  if (found.length) counts[sheet] = found.length;
  if (found.length > (ALLOWED[sheet] ?? 0)) over.push(`${sheet}: ${found.join(' | ')} (allowed ${ALLOWED[sheet] ?? 0})`);
}
assert.deepEqual(over, [], 'element resets that set colour belong in @layer base, under the components');
for (const [sheet, allowed] of Object.entries(ALLOWED)) {
  assert.ok((counts[sheet] ?? 0) === allowed || (counts[sheet] ?? 0) < allowed, `${sheet}: ${counts[sheet] ?? 0} of ${allowed}`);
  if ((counts[sheet] ?? 0) < allowed) assert.fail(`${relative(ROOT, join(ROOT, sheet))} fell to ${counts[sheet] ?? 0}: lower its ALLOWED entry (the ratchet only falls)`);
}
console.log(`surface-element-resets.selftest: ${sheets.length} sheets, ${Object.values(counts).reduce((a, b) => a + b, 0)} pinned surface resets left`);
