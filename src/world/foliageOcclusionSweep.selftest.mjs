// foliageOcclusionSweep.selftest.mjs — the chase camera's foliage fade sweep visits only the trees and bushes it can
// change (the capsule's broadphase box and the records still easing) and leaves every fade exactly where the full walk
// over the map's records would (2026-10-13, the perf stream).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFoliageFadeSweep, FOLIAGE_OCCLUSION_CELL_M } from './foliageOcclusionSweep.ts';

// a seeded scene: 6,000 trees over the square and its ring, a capsule from a pivot driving a looping route and a
// camera 12 m behind it; the tree rule and the bush rule are vegetation.ts's (a near tree in the capsule, a bush within
// 7 m of the pivot), eased with the walk's law
let seed = 9137;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const N = 6000;
const make = () => Array.from({ length: N }, (_, i) => ({
  x: (rand() - 0.5) * 1400, z: (rand() - 0.5) * 1400, cy: 6 + rand() * 6, cr: 2 + rand() * 4, near: rand() > 0.2,
  fade: 0, id: i,
}));
const base = make();
const walkTrees = base.map((t) => ({ ...t }));
const sweepTrees = base.map((t) => ({ ...t }));
const PAD = 2.6, BOX_PAD = 14, BUSH_R2 = 49;
const seg = { active: false, ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 0, lengthSq: 0, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
const treeTarget = (t) => {
  if (!seg.active || !t.near || t.x <= seg.minX || t.x >= seg.maxX || t.z <= seg.minZ || t.z >= seg.maxZ) return 0;
  let along = seg.lengthSq > 1e-6 ? ((t.x - seg.ax) * seg.dx + (t.cy - seg.ay) * seg.dy + (t.z - seg.az) * seg.dz) / seg.lengthSq : 0;
  along = Math.max(0, Math.min(1, along));
  const px = seg.ax + seg.dx * along - t.x, py = seg.ay + seg.dy * along - t.cy, pz = seg.az + seg.dz * along - t.z;
  const r = t.cr + PAD;
  return px * px + py * py + pz * pz < r * r ? 1 : 0;
};
const bushTarget = (b) => {
  const bx = b.x - seg.ax, bz = b.z - seg.az;
  return seg.active && bx * bx + bz * bz < BUSH_R2 ? 1 : 0;
};
let k = 1;
const writes = { walk: [], sweep: [] };
const easeWith = (target, log) => (r) => {
  const t = target(r);
  if (r.fade !== t) {
    r.fade += (t - r.fade) * k;
    if (Math.abs(r.fade - t) < 0.02) r.fade = t;
    log.push(r.id);
  }
};
const walkEase = easeWith(treeTarget, writes.walk);
let eases = 0;
const sweepEaseTree = easeWith(treeTarget, writes.sweep);
const treeSweep = createFoliageFadeSweep((r) => { eases++; sweepEaseTree(r); });
const walkBushes = base.slice(0, 3000).map((t) => ({ ...t }));
const sweepBushes = base.slice(0, 3000).map((t) => ({ ...t }));
const bushWrites = { walk: [], sweep: [] };
const walkBush = easeWith(bushTarget, bushWrites.walk);
const sweepBush = easeWith(bushTarget, bushWrites.sweep);
const bushSweep = createFoliageFadeSweep(sweepBush);
let maxEases = 0, fadedFrames = 0;
for (let f = 0; f < 2400; f++) {
  // the pivot drives a loop through the woods; the camera trails it; the capsule drops out now and then (killcam)
  const a = f * 0.004, px = Math.cos(a) * 380 + Math.sin(a * 3.1) * 60, pz = Math.sin(a * 1.3) * 380;
  const hx = -Math.sin(a), hz = Math.cos(a * 1.3);
  const cam = { x: px - hx * 12, y: 9, z: pz - hz * 12 };
  seg.active = (f % 600) < 540;
  Object.assign(seg, { ax: px, ay: 2.2, az: pz, dx: cam.x - px, dy: cam.y - 2.2, dz: cam.z - pz });
  seg.lengthSq = seg.dx * seg.dx + seg.dy * seg.dy + seg.dz * seg.dz;
  Object.assign(seg, { minX: Math.min(px, cam.x) - BOX_PAD, maxX: Math.max(px, cam.x) + BOX_PAD,
    minZ: Math.min(pz, cam.z) - BOX_PAD, maxZ: Math.max(pz, cam.z) + BOX_PAD });
  k = f % 97 === 0 ? 1 : 1 - Math.exp(-(1 / 60) / 0.13); // a snapped frame now and then (dt = 0)
  // the walk (the code before)
  let anyWalk = false;
  writes.walk.length = 0;
  for (const t of walkTrees) { walkEase(t); if (t.fade !== 0) anyWalk = true; }
  let anyBushWalk = false;
  bushWrites.walk.length = 0;
  for (const b of walkBushes) { walkBush(b); if (b.fade !== 0) anyBushWalk = true; }
  // the sweep
  writes.sweep.length = 0; eases = 0;
  const anySweep = treeSweep.run(sweepTrees, seg.active, seg.minX, seg.maxX, seg.minZ, seg.maxZ);
  bushWrites.sweep.length = 0;
  const anyBushSweep = bushSweep.run(sweepBushes, seg.active, seg.ax - 7, seg.ax + 7, seg.az - 7, seg.az + 7);
  assert.equal(anySweep, anyWalk, `frame ${f}: the walk's any`);
  assert.equal(anyBushSweep, anyBushWalk, `frame ${f}: the bushes' any`);
  assert.deepEqual([...writes.sweep].sort((x, y) => x - y), [...writes.walk].sort((x, y) => x - y), `frame ${f}: the same trees written`);
  assert.deepEqual([...bushWrites.sweep].sort((x, y) => x - y), [...bushWrites.walk].sort((x, y) => x - y), `frame ${f}: the same bushes written`);
  maxEases = Math.max(maxEases, eases);
  if (anyWalk) fadedFrames++;
}
for (let i = 0; i < N; i++) assert.equal(sweepTrees[i].fade, walkTrees[i].fade, `tree ${i}: the walk's fade`);
for (let i = 0; i < sweepBushes.length; i++) assert.equal(sweepBushes[i].fade, walkBushes[i].fade, `bush ${i}: the walk's fade`);
assert.ok(fadedFrames > 200, `the route crosses the woods (${fadedFrames} frames with a faded tree)`);
assert.ok(maxEases < N / 20, `a frame eases at most ${maxEases} of ${N} trees`);
assert.equal(FOLIAGE_OCCLUSION_CELL_M, 32);

// a list that grows (a later planting pass) is re-indexed
{
  const grown = [{ x: 0, z: 0, fade: 0 }];
  let seen = 0;
  const sweep = createFoliageFadeSweep((r) => { seen++; r.fade = 0; });
  sweep.run(grown, true, -1, 1, -1, 1);
  grown.push({ x: 0.5, z: 0.5, fade: 0 });
  seen = 0;
  sweep.run(grown, true, -1, 1, -1, 1);
  assert.equal(seen, 2, 'the grown list is indexed again');
}

// vegetation.ts runs both sweeps; no walk over every tree or bush is left in the per-frame fade
const veg = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const fadeBlock = veg.slice(veg.indexOf('function updateTreeOcclusionFades('), veg.indexOf('function flushTreeFadeUploads('));
assert.match(fadeBlock, /treeFadeSweep\.run\(trees, segment\.active, segment\.minX, segment\.maxX, segment\.minZ, segment\.maxZ\)/);
assert.match(fadeBlock, /bushFadeSweep\.run\(bushFadeReg, segment\.active,/);
assert.doesNotMatch(fadeBlock, /for \(const (tree|bush) of (trees|bushFadeReg)\)/, 'no full walk per frame');

console.log(`foliageOcclusionSweep.selftest: 2,400 frames, the walk's fades exactly; at most ${maxEases} of ${N} trees eased a frame`);
