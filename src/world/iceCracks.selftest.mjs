// iceCracks.selftest.mjs — the ice atlas's cracks (src/world/iceCracks.ts, the looks lane's own file; 2026-10-15, the 226
// reeds pair's critics: "flat bright crack decals"): drawn on a recording canvas, the painter lays
//   - three seams, one of each kind: a refrozen pressure seam (a bright core over a dark stress shadow), an open crack
//     (a dark core inside a faint pale rim) and a hairline (a faint pale line), each segment by segment;
//   - each seam tapered: its middle segments wider than its ends; its tone wandering from segment to segment;
//   - four short crazes, at most one short fork a seam, and no stroke longer than one segment;
//   - the same strokes for the same stream (the atlas is seeded), different ones for another.
// (iceSurfaceDetail.selftest holds the atlas itself: its tone shares, its stroke budget at the wrap offsets, its relief.)
import assert from 'node:assert/strict';
import { drawIceCracks } from './iceCracks.ts';

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const css = (h, s, l) => `hsl(${h},${s},${l})`;
const lightness = (style) => Number(style.split(',')[2].replace(')', ''));
function record(seed) {
  const strokes = [];
  let segments = 0;
  const ctx = {
    lineCap: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    beginPath() { segments = 0; }, moveTo() {}, lineTo() { segments++; },
    stroke() { strokes.push({ segments, style: ctx.strokeStyle, width: ctx.lineWidth, alpha: ctx.globalAlpha }); },
  };
  drawIceCracks(ctx, 256, 1, mulberry32(seed), (_c, _s, fn) => fn(), css);
  return strokes;
}
for (const seed of [3003, 7, 1337, 11]) {
  const strokes = record(seed);
  assert.ok(strokes.every((s) => s.segments === 1), `${seed}: every stroke one segment`);
  assert.deepEqual(record(seed), strokes, `${seed}: the same stream, the same strokes`);
  // the kinds: a bright core, a dark core, faint pale hair
  assert.ok(strokes.some((s) => lightness(s.style) >= 0.86 && s.alpha >= 0.72), `${seed}: a bright refrozen core`);
  assert.ok(strokes.some((s) => lightness(s.style) <= 0.24 && s.alpha >= 0.55), `${seed}: an open crack's dark core`);
  assert.ok(strokes.some((s) => lightness(s.style) >= 0.78 && s.alpha <= 0.52), `${seed}: a faint hairline`);
  // tapered: the widest stroke at least twice the narrowest of the main seams' cores
  const cores = strokes.filter((s) => lightness(s.style) >= 0.78 || lightness(s.style) <= 0.24);
  const widths = cores.map((s) => s.width);
  assert.ok(Math.max(...widths) >= 2 * Math.min(...widths), `${seed}: the seams taper`);
  // the budget: three seams (29 strokes), four crazes (8), at most one short fork a seam (4 strokes at most)
  assert.ok(strokes.length >= 37 && strokes.length <= 37 + 12, `${seed}: ${strokes.length} strokes`);
  // no bright stroke as wide as the old seams' cores all along (2.6-3.4 texels at 0.86 alpha, three a tile)
  const brightLong = strokes.filter((s) => lightness(s.style) >= 0.86 && s.width >= 2.6);
  assert.ok(brightLong.length <= 4, `${seed}: the bright core full width only near its middle (${brightLong.length} segments)`);
}
assert.notDeepEqual(record(3003), record(7), 'another stream, other cracks');
console.log('iceCracks.selftest: three seams of three kinds (refrozen, open, hairline) tapered segment by segment, four crazes, seeded PASS');
