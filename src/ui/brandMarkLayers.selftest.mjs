// The living mark as compositor layers (brandMarkMotion.ts brandMarkMotionLayers; 2026-10-26, the boot census: the svg
// loop moved svg children, which Chrome runs on the main thread only, so every long task of a cold load froze the boot
// card's tank). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRAND_MOTION_CSS, BRAND_MOTION_LAYER_CSS, LOOP_S, brandMarkMotionLayers } from './brandMarkMotion.ts';
import { BRAND_TANK_VIEWBOX } from './brandMark.ts';

const layers = brandMarkMotionLayers();
const count = (pattern) => (layers.match(pattern) ?? []).length;
assert.equal(count(/class="mk-wheel"/g), 6, 'six road wheels, each its own box');
assert.equal(count(/class="mk-clip"/g), 2, 'the two track runs, each clipped to its run');
assert.equal(count(/class="mk-puff"/g), 3);
// the svg loop's painting order: the running gear, then the hull carrying the exhaust, the turret and on it the antenna,
// the crew and the turret's front
const order = ['mk-links--top', 'mk-links--low', 'mk-wheel', 'mk-g mk-hull', 'mk-puff', 'mk-g mk-turret', 'mk-g mk-antenna', 'mk-g mk-crew'];
assert.deepEqual(order.map((name) => layers.indexOf(`class="${name}`)), order.map((name) => layers.indexOf(`class="${name}`)).toSorted((a, b) => a - b),
  'the layers paint in the svg loop\'s order');
assert.ok(layers.indexOf('class="mk-g mk-crew"') < layers.lastIndexOf('<svg class="mk-l"'), 'the turret\'s front over the crew');

// the compositor's contract: every keyframe moves transform and opacity alone (no stroke-dashoffset, no svg child)
const keyframes = [...BRAND_MOTION_LAYER_CSS.matchAll(/@keyframes (mkl-[\w-]+)\{([^\n]*)\}\n/g)];
assert.equal(keyframes.length, 8);
for (const [, name, body] of keyframes) {
  const properties = [...body.matchAll(/[{;]\s*([a-z-]+):/g)].map((match) => match[1]);
  assert.ok(properties.length && properties.every((property) => property === 'transform' || property === 'opacity'), `${name}: ${properties}`);
}
// the same loop: each part's duration, easing and delay as in the svg loop's rule
const timing = (css, part) => new RegExp(`\\.${part}\\{[^}]*animation:mkl?-[\\w-]+ ([^}]+)\\}`).exec(css)?.[1];
for (const part of ['mk-wheel', 'mk-links--top', 'mk-links--low', 'mk-hull', 'mk-turret', 'mk-crew', 'mk-antenna', 'mk-puff']) {
  assert.ok(timing(BRAND_MOTION_CSS, part), part);
  assert.equal(timing(BRAND_MOTION_LAYER_CSS, part), timing(BRAND_MOTION_CSS, part), `${part}: the svg loop's timing`);
}
assert.ok(BRAND_MOTION_LAYER_CSS.includes(`--mk-loop:${LOOP_S}s`));
// the same pivots: the svg loop's origins (its ground's units) as shares of the mark's box
const [x0, y0, w, h] = BRAND_TANK_VIEWBOX.split(' ').map(Number);
for (const part of ['mk-turret', 'mk-antenna']) {
  const [px, py] = new RegExp(`\\.${part}\\{transform-origin:([\\d.]+)px ([\\d.]+)px`).exec(BRAND_MOTION_CSS).slice(1).map(Number);
  const [sx, sy] = new RegExp(`\\.${part}\\{transform-origin:([\\d.]+)% ([\\d.]+)%`).exec(BRAND_MOTION_LAYER_CSS).slice(1).map(Number);
  assert.ok(Math.abs(sx - (px - x0) / w * 100) < 1e-3 && Math.abs(sy - (py - y0) / h * 100) < 1e-3, part);
}
// reduced motion: the static frame (every moving part named, as the motion lint reads it)
const still = /prefers-reduced-motion:reduce\)\{\.cot-mark--layers :is\(([^)]+)\)\{animation:none\}/.exec(BRAND_MOTION_LAYER_CSS)?.[1].split(',') ?? [];
for (const part of ['mk-wheel', 'mk-links--top', 'mk-links--low', 'mk-hull', 'mk-turret', 'mk-crew', 'mk-antenna', 'mk-puff']) assert.ok(still.includes(`.${part}`), part);

// the boot card carries the layers (tools/sync-brand-marks.mjs), over the stacked wordmark, with their rules
const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const card = /<div class="cot-boot-mark" [^>]*>([\s\S]*?)\n {6}<\/div>\n/.exec(index)?.[1] ?? '';
assert.match(card, /<svg class="cot-boot-words" [^>]*aria-hidden="true"/);
assert.match(card, /<span class="cot-boot-tank" style="left:[\d.]+%;top:-?[\d.]+%;width:[\d.]+%"><span class="cot-mark cot-mark--layers"/);
assert.doesNotMatch(card, /cot-mark--motion/, 'no svg loop in the boot card: it froze under every long task');
assert.ok(index.includes(BRAND_MOTION_LAYER_CSS.trim().split('\n')[0]), 'the layers\' rules in the boot sheet');
assert.match(index, /:has\(\.cot-boot-retry\.on\) :is\(\.cot-mark--motion, \.cot-mark--layers\) \* \{ animation-play-state: paused; \}/);
console.log('brandMarkLayers.selftest: ok');
