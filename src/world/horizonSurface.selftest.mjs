// The ring's own surface helpers (horizonSurface.ts): the drawn ring's height at a world point (the tall grass past the
// edge stands on it) and the metres landward of the ring's own waterline (the strand runs on round a headland the ring
// draws in a sea opening).
import assert from 'node:assert/strict';
import { ringMeshSurfaceSampler, ringWaterlineMetres } from './horizonSurface.ts';

// a synthetic ring: 360 columns, rows every 6 m from 500 to 980 m; a beach rising 0.08 m a metre from 2 m under the
// water's floor at 560 m, flat ground past 760 m; the sea sector's weight faded over the metre above the water's floor,
// as maps/horizon.ts writes it into the uv's V
const columns = 360, stride = columns + 1;
const radii = []; for (let r = 500; r <= 980; r += 6) radii.push(r);
const rows = radii.length;
const level = -8.2;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const groundAt = (r) => level - 2 + 0.08 * Math.min(Math.max(0, r - 560), 200);
const marineAt = (y) => 1 - smooth(level + 0.04, level + 1.0, y);
const pos = new Float32Array(rows * stride * 3), uv = new Float32Array(rows * stride * 2);
for (let j = 0; j < rows; j++) for (let k = 0; k <= columns; k++) {
  const a = ((k % columns) / columns) * Math.PI * 2, r = radii[j], i = j * stride + k;
  const y = groundAt(r);
  pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
  const m = marineAt(y);
  uv[i * 2] = k / columns; uv[i * 2 + 1] = m > 0 ? -m : 0.25;
}
const position = { array: pos, count: rows * stride };

// the surface sampler: exact on the rows, linear in the radius between them
const at = ringMeshSurfaceSampler(position, columns);
for (const r of [503, 600, 641.5, 700, 777]) {
  const got = at(r * Math.cos(0.7), r * Math.sin(0.7));
  assert.ok(Math.abs(got - groundAt(r)) < 0.02, `the ring's surface at ${r} m: ${got.toFixed(3)} vs ${groundAt(r).toFixed(3)}`);
}
assert.ok(Number.isNaN(at(10, 10)), 'no surface off the ring');

// the waterline: where the weight crosses 0.4 (the ground ~0.58 m over the water's floor), 0 seaward of it, the metres
// up the beach to 32, 32 beyond
const metres = ringWaterlineMetres(position, { array: uv }, columns);
assert.equal(metres.length, position.count);
let yLine = level + 0.04; while (marineAt(yLine) > 0.4) yLine += 0.001;
const crossing = 560 + (yLine - (level - 2)) / 0.08;
let checked = 0;
for (let j = 0; j < rows; j++) {
  const r = radii[j], m = metres[j * stride + 17];
  if (marineAt(groundAt(r)) >= 0.4) { assert.equal(m, 0, `under the sea at ${r} m`); continue; }
  const want = Math.min(32, r - crossing);
  // (the relaxation runs over the grid's edges, so a few metres of slack where it turns the corner of a row)
  assert.ok(Math.abs(m - want) <= 1.5, `${(r).toFixed(0)} m: ${m.toFixed(2)} m from the waterline (want ${want.toFixed(2)})`);
  checked++;
}
assert.ok(checked > 40, 'the beach and the ground behind it are measured');
for (let j = 0; j < rows; j++) assert.equal(metres[j * stride + columns], metres[j * stride], 'the seam column repeats the first');

// no marine weight, no shore: ground the sea's sector does not cover keeps no strand, however low it lies
const dry = new Float32Array(uv); for (let i = 1; i < dry.length; i += 2) dry[i] = 0.25;
const none = ringWaterlineMetres(position, { array: dry }, columns);
assert.ok(none.every((m) => m === 32), 'a ring without a sea opening keeps no strand');

console.log(`horizonSurface.selftest: ok (surface sampler exact on the rows; ${checked} beach vertices within 1.5 m of their waterline distance)`);
