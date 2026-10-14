// latticeGround.selftest.mjs — the landing solves' ground from its lattice's vertices (destruction stream, 2026-10-13):
// the same surface as the sampler it caches (the terrain's contact surface plus the overlay's craters and heaps, lattice
// linear on the same split), each vertex read once until the ground changes, and the collapse frame's reads cheap.
import assert from 'node:assert/strict';
import { createTerrainContactSampler } from '../world/terrainContactSurface.ts';
import { createTerrainDeformation } from '../sim/terrainDeformation.ts';
import { createLatticeGround } from './latticeGround.ts';
import { ballisticLanding } from './ballisticLanding.ts';

// the ground as drawn: a rolling terrain's contact surface plus a dug overlay (a heap and the craters of a volley)
const terrain = createTerrainContactSampler((x, z) => 4 + 2.5 * Math.sin(x * 0.07) * Math.cos(z * 0.05) + 0.3 * Math.sin(x * 0.9 + z * 0.4));
const overlay = createTerrainDeformation();
overlay.addRubble(12, -8, 6, 9, 0.4, 2.2);
for (let i = 0; i < 8; i++) overlay.addCrater(8 + i * 1.7, -14 + (i % 3) * 2.1, 1.6, 0.6, 0.22, 100 + i);
let reads = 0;
const drawn = (x, z) => { reads++; return terrain(x, z) + overlay.contactOffsetAt(x, z); };
const ground = createLatticeGround(drawn, () => overlay.revision);

// ---- the same surface (to float rounding: the sampler's Float32 vertex coordinates)
let worst = 0;
for (let i = 0; i < 4000; i++) {
  const x = -10 + ((i * 7919) % 4000) / 4000 * 45, z = -30 + ((i * 104729) % 4000) / 4000 * 40;
  worst = Math.max(worst, Math.abs(ground(x, z) - drawn(x, z)));
}
assert.ok(worst < 2e-4, `the lattice's interpolation is the sampler's surface (worst ${worst.toExponential(2)} m)`);

// ---- each vertex once: a collapse's thousand landings read a few hundred vertices
ground.clear();
reads = 0;
const out = new Float64Array(4);
let rs = 7;
const r = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
for (let i = 0; i < 1000; i++) ballisticLanding(6 + r() * 12, 7 + r() * 6, -16 + r() * 16, (r() - 0.5) * 8, r() * 4, (r() - 0.5) * 8, 0.35, 0.1, ground, out);
const cached = reads;
reads = 0;
for (let i = 0; i < 1000; i++) ballisticLanding(6 + r() * 12, 7 + r() * 6, -16 + r() * 16, (r() - 0.5) * 8, r() * 4, (r() - 0.5) * 8, 0.35, 0.1, drawn, out);
const direct = reads;
assert.ok(cached * 10 < direct, `a thousand landings read ${cached} vertices from the ground, not ${direct} points`);
assert.equal(ground.size, cached, 'every vertex held once');

// ---- the ground changes (a new heap): the vertices are read again
const before = ground(40, 20);
overlay.addRubble(40, 20, 4, 4, 0, 2.6);
assert.ok(ground(40, 20) > before + 1, `a new stamp is seen at once (${before.toFixed(2)} -> ${ground(40, 20).toFixed(2)} m)`);
assert.ok(Math.abs(ground(40, 20) - drawn(40, 20)) < 2e-4, 'and read from the new ground');

console.log(`latticeGround selftest: the ground as drawn to ${worst.toExponential(1)} m, a thousand landings on ${cached} vertex reads instead of ${direct}, a new stamp seen at once — ok`);
