import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createTallGrass } from './tallGrass.ts';
import { createGroundLitter, groundLitterProfile } from './groundLitter.ts';
import { createGrassCarpetWork } from './grassCarpetWork.ts';
import {
  CRATER_COVER_CLEAR, createCraterFollower, createGroundCoverCraters, createStaticCoverPatcher, followCraters,
  reseatCraterTrees, restoreCraterTrees,
} from './groundCoverCraters.ts';
import { createTerrainDeformation } from '../sim/terrainDeformation.ts';
import verdant from './maps/verdant.ts';

// Ground lane (2026-10-08, crater-render-spec §C; the owner's "destructive explosions that leave holes and craters"):
// the ground cover in a crater's footprint. One law for every tier — inside 0.9 R of a crater the cover is gone, the
// rest of the overlay's reach stands on base + offsetAt, a rubble heap clears nothing. Pins, on Verdant's real height
// field where a tier needs one:
// 1. the law: holes, lifts, reaches, the epoch a reset or a rebind moves;
// 2. the tall grass (both rings): no visible blade inside 0.9 R; every rim blade at base + offsetAt within 1 cm; the
//    blades out of every reach keep their bits; a ring republished after the stamp agrees; a reset restores the set;
// 3. the litter: the same, through its republish;
// 4. the static meshes (grass chunks, bushes, the understorey): the patcher hides, lifts and restores, bit for bit;
// 5. trees: standing trunks root into the bowl's wall, a felled one stays, a reset restores;
// 6. the carpet: its writes drop the cleared bowl's tufts and lift the rim's;
// 7. the wiring: map.ts syncs the law after the terrain and every tier follows it.
// No GPU or art claim.

const field = createHeightField(1337, verdant);

// 1. the law
const overlay = createTerrainDeformation();
const law = createGroundCoverCraters();
law.sync(overlay);
assert.equal(law.active, false, 'no stamp, no law');
const C = { x: 74.5, z: -168.25, r: 3.4 };
assert.ok(overlay.addCrater(C.x, C.z, C.r, +(0.35 * C.r).toFixed(3), +(0.12 * C.r).toFixed(3), 4242));
overlay.addRubble(-60, 40, 5, 7, 0.3, 1.6);
law.sync(overlay);
assert.equal(law.count, 2);
assert.equal(law.holeAt(C.x + (CRATER_COVER_CLEAR - 0.01) * C.r, C.z), true, 'inside the bowl and its crest: cleared');
assert.equal(law.holeAt(C.x + (CRATER_COVER_CLEAR + 0.01) * C.r, C.z), false, 'past them: re-seated');
// crater round 3: round the cleared disc the tall grass lies low, 0.42 at its edge, whole by 1.6 times it
{
  const edge = CRATER_COVER_CLEAR * C.r;
  assert.ok(Math.abs(law.squashAt(C.x + edge, C.z) - 0.42) < 1e-9, 'the ring laid low at the cleared edge');
  assert.ok(law.squashAt(C.x + edge * 1.3, C.z) > 0.42 && law.squashAt(C.x + edge * 1.3, C.z) < 1, 'rising out through it');
  assert.equal(law.squashAt(C.x + edge * 1.6 + 0.01, C.z), 1, 'whole past 1.6 times the cleared radius');
  const b = law.bounds(0, [0, 0, 0, 0]);
  assert.ok(b[2] >= C.x + edge * 1.6 && b[0] <= C.x - edge * 1.6, 'the ring inside the stamp\'s reach (the followers re-read it)');
  assert.equal(law.squashAt(-60, 40), 1, 'a rubble heap lays nothing low');
}
assert.equal(law.holeAt(-60, 40), false, 'a rubble heap clears nothing');
for (const [x, z] of [[C.x + 3, C.z + 1], [C.x - 4.5, C.z], [-58, 42]]) assert.equal(law.liftAt(x, z), overlay.offsetAt(x, z), 'the lift is the overlay');
assert.ok(law.touches(C.x - 1, C.z - 1, C.x + 1, C.z + 1) && !law.touches(300, 300, 310, 310), 'touches reads the reaches');
const epoch0 = law.epoch;

// 2. the tall grass on Verdant, at a field the crater lands in
const cam = new THREE.Vector3(C.x - 6, 2, C.z - 4);
const grass = createTallGrass(field, { seed: 11, tier: 'desktop', mapId: 'verdant', qualityScale: () => 1 });
const settle = (g, camera, n = 900) => {
  for (let i = 0; i < n; i++) {
    g.update(1 / 60, camera, null, null);
    const s = g.getState();
    if (s.near.publishes && s.far.publishes && !s.near.pending && !s.far.pending) break;
  }
};
const quiet = createGroundCoverCraters(); // an empty law until the snapshot is taken
grass.followCraters(quiet);
settle(grass, cam);
const ringSnap = (mesh) => ({ count: mesh.count, m: mesh.instanceMatrix.array.slice(0, mesh.count * 16),
  b: mesh.geometry.getAttribute('aBlade').array.slice(0, mesh.count * 4) });
const before = { near: ringSnap(grass.near), far: ringSnap(grass.far) };
assert.ok(before.near.count > 10000, `the near ring grew (${before.near.count} clumps)`);
grass.followCraters(law);
grass.update(1 / 60, cam, null, null);
// a stamp's reach (the crater's and the rubble heap's boxes): the rest keeps its bits
const reaches = [0, 1].map((i) => law.bounds(i, [0, 0, 0, 0]));
const reach = (x, z) => reaches.some((b) => x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]);
let cleared = 0, rim = 0, rimWorst = 0, kept = 0;
for (const name of ['near', 'far']) {
  const mesh = grass[name], snap = before[name];
  const m = mesh.instanceMatrix.array, b = mesh.geometry.getAttribute('aBlade').array;
  assert.equal(mesh.count, snap.count, `${name}: the patch keeps the instance count`);
  for (let i = 0; i < mesh.count; i++) {
    const x = m[i * 16 + 12], z = m[i * 16 + 14], d = Math.hypot(x - C.x, z - C.z);
    if (d < CRATER_COVER_CLEAR * C.r) {
      assert.equal(b[i * 4 + 1], 0, `${name}: no blade stands inside the cleared bowl and crest`);
      cleared++;
    } else if (reach(x, z)) {
      rimWorst = Math.max(rimWorst, Math.abs(m[i * 16 + 13] - (snap.m[i * 16 + 13] + overlay.offsetAt(x, z))));
      rim++;
    } else {
      assert.ok(Object.is(m[i * 16 + 13], snap.m[i * 16 + 13]) && Object.is(b[i * 4 + 1], snap.b[i * 4 + 1]), `${name}: out of reach, its bits`);
      kept++;
    }
  }
}
assert.ok(cleared >= 20 && rim >= 50, `the bowl cleared (${cleared}) and the rim re-seated (${rim})`);
assert.ok(rimWorst < 0.01, `rim blades at base + offsetAt within 1 cm (worst ${(rimWorst * 100).toFixed(3)} cm)`);
// a ring republished after the stamp (the camera steps a cell away and back: the cells are cached) agrees
const patched = { near: ringSnap(grass.near), far: ringSnap(grass.far) };
const away = new THREE.Vector3(cam.x + 30, 2, cam.z);
settle(grass, away); settle(grass, cam);
for (const name of ['near', 'far']) {
  const now = ringSnap(grass[name]);
  assert.equal(now.count, patched[name].count, `${name}: the republished ring holds the same clumps`);
  for (let i = 0; i < now.m.length; i++) assert.ok(Object.is(now.m[i], patched[name].m[i]), `${name}: republished = patched (matrix)`);
  for (let i = 0; i < now.b.length; i++) assert.ok(Object.is(now.b[i], patched[name].b[i]), `${name}: republished = patched (blade)`);
}
// reset: the original set
overlay.reset();
law.sync(overlay);
assert.ok(law.epoch > epoch0 && !law.active, 'a reset moves the epoch');
grass.followCraters(law);
settle(grass, cam, 5);
for (const name of ['near', 'far']) {
  const now = ringSnap(grass[name]);
  assert.equal(now.count, before[name].count);
  for (let i = 0; i < now.m.length; i++) assert.ok(Object.is(now.m[i], before[name].m[i]), `${name}: a reset restores the ring`);
  for (let i = 0; i < now.b.length; i++) assert.ok(Object.is(now.b[i], before[name].b[i]), `${name}: a reset restores the blades`);
}

// 2b. a presentation hole (the FX lane's explosive marks, kept out of the simulation's overlay): no overlay, no lift —
//     the blades inside r gone, the ring's out to 1.6 r laid low (0.42 at r, whole by 1.6 r), the rest their bits; the
//     battle's reset (resetHoles) restores the set; an overlay's own reset clears the holes with its stamps
let ringLow = 0, holeBlades = 0;
{
  const H = { x: C.x + 2.5, z: C.z + 1.5, r: 2.2 };
  const ph = createGroundCoverCraters();
  ph.sync(null);
  ph.addHole(H.x, H.z, H.r);
  assert.ok(ph.active && ph.count === 1, 'a hole is an entry of the law');
  assert.ok(ph.holeAt(H.x + 0.9 * H.r, H.z) && !ph.holeAt(H.x + 1.05 * H.r, H.z), 'cleared inside r only');
  assert.equal(ph.liftAt(H.x, H.z), 0, 'no lift: the ground is the overlay\'s');
  assert.ok(Math.abs(ph.squashAt(H.x + H.r, H.z) - 0.42) < 1e-9 && ph.squashAt(H.x + 1.6 * H.r, H.z) === 1 && ph.squashAt(H.x + 5 * H.r, H.z) === 1,
    'the ring laid low at r, whole by 1.6 r');
  let last = 0;
  for (let k = 0; k <= 12; k++) { const f = ph.squashAt(H.x + H.r * (1 + 0.05 * k), H.z); assert.ok(f >= last - 1e-12, 'rising out through the ring'); last = f; }
  const hb = ph.bounds(0, [0, 0, 0, 0]);
  assert.ok(Math.abs(hb[0] - (H.x - 1.6 * H.r)) < 1e-9 && Math.abs(hb[3] - (H.z + 1.6 * H.r)) < 1e-9, 'its reach is the ring\'s box');
  grass.followCraters(ph);
  grass.update(1 / 60, cam, null, null);
  for (const name of ['near', 'far']) {
    const mesh = grass[name], snap = before[name];
    const m = mesh.instanceMatrix.array, b = mesh.geometry.getAttribute('aBlade').array;
    for (let i = 0; i < mesh.count; i++) {
      const x = m[i * 16 + 12], z = m[i * 16 + 14], d = Math.hypot(x - H.x, z - H.z);
      assert.ok(Object.is(m[i * 16 + 13], snap.m[i * 16 + 13]), `${name}: no lift anywhere`);
      if (d < H.r) { assert.equal(b[i * 4 + 1], 0, `${name}: nothing stands inside r`); holeBlades++; }
      else if (d < 1.6 * H.r) {
        assert.ok(Math.abs(b[i * 4 + 1] - snap.b[i * 4 + 1] * ph.squashAt(x, z)) < 1e-5, `${name}: the ring's blade laid low by the law`);
        if (ph.squashAt(x, z) < 0.99) ringLow++;
      } else assert.ok(Object.is(b[i * 4 + 1], snap.b[i * 4 + 1]), `${name}: past the ring, its bits`);
    }
  }
  assert.ok(holeBlades >= 10 && ringLow >= 20, `the hole cleared (${holeBlades}) and the ring laid low (${ringLow})`);
  const e0 = ph.epoch;
  ph.resetHoles();
  assert.ok(ph.epoch > e0 && !ph.active && ph.squashAt(H.x + H.r, H.z) === 1, 'the battle\'s reset clears the holes');
  grass.followCraters(ph);
  settle(grass, cam, 5);
  for (const name of ['near', 'far']) {
    const now = ringSnap(grass[name]);
    for (let i = 0; i < now.b.length; i++) assert.ok(Object.is(now.b[i], before[name].b[i]), `${name}: the reset restores the blades`);
  }
  // with an overlay: its stamps and the holes are entries of one law, in arrival order; the overlay's reset clears both
  const ov2 = createTerrainDeformation();
  ph.sync(ov2);
  ph.addHole(H.x, H.z, H.r);
  assert.ok(ov2.addCrater(C.x, C.z, C.r, +(0.35 * C.r).toFixed(3), +(0.12 * C.r).toFixed(3), 4243));
  ph.sync(ov2);
  assert.equal(ph.count, 2, 'a hole and a stamp');
  assert.ok(ph.holeAt(H.x, H.z) && ph.holeAt(C.x, C.z), 'both clear');
  ov2.reset();
  ph.sync(ov2);
  assert.ok(!ph.active && !ph.holeAt(H.x, H.z), 'the overlay\'s reset (a new battle) clears the holes with its stamps');
  grass.followCraters(quiet);
  settle(grass, cam, 5);
}

// 3. the litter on Verdant (its ring republishes from its base cells)
{
  const ov = createTerrainDeformation(), lw = createGroundCoverCraters();
  const litter = createGroundLitter(field, { seed: 11, config: groundLitterProfile('verdant') });
  litter.followCraters(lw);
  const lcam = { x: C.x, z: C.z };
  for (let i = 0; i < 200; i++) litter.update(lcam);
  const snap = litter.meshes.map((mesh) => ({ count: mesh.count, m: mesh.instanceMatrix.array.slice(0, mesh.count * 16) }));
  const total = snap.reduce((s, x) => s + x.count, 0);
  assert.ok(total > 20, `Verdant's litter lies there (${total})`);
  ov.addCrater(C.x, C.z, 6, 2.1, 0.72, 99);
  lw.sync(ov);
  litter.followCraters(lw);
  for (let i = 0; i < 3; i++) litter.update(lcam);
  let inBowl = 0, lifted = 0, worst = 0;
  litter.meshes.forEach((mesh) => {
    const m = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i++) {
      const x = m[i * 16 + 12], z = m[i * 16 + 14];
      if (Math.hypot(x - C.x, z - C.z) < CRATER_COVER_CLEAR * 6) inBowl++;
    }
  });
  assert.equal(inBowl, 0, 'no litter inside 0.9 R');
  // every surviving piece within the reach stands at its base + offsetAt (matched by position to the base set)
  const baseAt = new Map();
  snap.forEach((s, k) => { for (let i = 0; i < s.count; i++) baseAt.set(`${k}:${s.m[i * 16 + 12]},${s.m[i * 16 + 14]}`, s.m[i * 16 + 13]); });
  litter.meshes.forEach((mesh, k) => {
    const m = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i++) {
      const x = m[i * 16 + 12], z = m[i * 16 + 14], by = baseAt.get(`${k}:${x},${z}`);
      assert.ok(by !== undefined, 'a surviving piece is one of the base set');
      const want = by + ov.offsetAt(x, z);
      if (Math.abs(ov.offsetAt(x, z)) > 1e-6) { worst = Math.max(worst, Math.abs(m[i * 16 + 13] - want)); lifted++; }
    }
  });
  assert.ok(lifted > 0 && worst < 0.01, `rim litter at base + offsetAt (${lifted}, worst ${(worst * 100).toFixed(3)} cm)`);
  ov.reset(); lw.sync(ov); litter.followCraters(lw); litter.update(lcam);
  litter.meshes.forEach((mesh, k) => {
    assert.equal(mesh.count, snap[k].count, 'a reset restores the litter count');
    const m = mesh.instanceMatrix.array;
    for (let i = 0; i < snap[k].m.length; i++) assert.ok(Object.is(m[i], snap[k].m[i]), 'a reset restores the litter');
  });
  litter.dispose();
}

// 4. the static meshes: grass chunks, bushes, the understorey (the patcher on a real InstancedMesh)
{
  const ov = createTerrainDeformation(), lw = createGroundCoverCraters();
  const n = 4000, mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), n);
  let s = 3;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = C.x - 64 + rnd() * 128, z = C.z - 64 + rnd() * 128;
    mesh.setMatrixAt(i, mat.compose(v.set(x, field.getHeightAt(x, z), z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), sc.setScalar(0.5 + rnd())));
  }
  const base = mesh.instanceMatrix.array.slice();
  ov.addCrater(C.x, C.z, 6, 2.1, 0.72, 7);
  lw.sync(ov);
  const patcher = createStaticCoverPatcher();
  mesh.instanceMatrix.clearUpdateRanges();
  const moved = patcher.reseat(lw, mesh, n, C.x - 64, C.z - 64, 128, ...lw.bounds(0, [0, 0, 0, 0]));
  const m = mesh.instanceMatrix.array;
  let hidden = 0, lifted = 0, worst = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 16, x = base[o + 12], z = base[o + 14], d = Math.hypot(x - C.x, z - C.z);
    if (d < CRATER_COVER_CLEAR * 6) { assert.ok(m[o] === 0 && m[o + 5] === 0 && m[o + 10] === 0, 'a cleared instance shrinks to nothing'); hidden++; }
    else if (Math.abs(ov.offsetAt(x, z)) > 0) { worst = Math.max(worst, Math.abs(m[o + 13] - (base[o + 13] + ov.offsetAt(x, z)))); lifted++; }
    else for (let e = 0; e < 16; e++) assert.ok(Object.is(m[o + e], base[o + e]), 'an untouched instance keeps its bits');
  }
  assert.ok(hidden > 10 && lifted > 10 && worst < 0.01 && moved === hidden + lifted, `static: ${hidden} hidden, ${lifted} lifted (worst ${(worst * 100).toFixed(3)} cm)`);
  assert.equal(mesh.instanceMatrix.updateRanges.length, moved, 'one upload range per moved instance');
  patcher.restore();
  for (let i = 0; i < base.length; i++) assert.ok(Object.is(m[i], base[i]), 'a restore puts every instance back');
  assert.equal(patcher.touched, 0);
}

// 5. trees: standing trunks root into the bowl's wall; a felled one stays where it fell
{
  const ov = createTerrainDeformation(), lw = createGroundCoverCraters();
  ov.addCrater(C.x, C.z, 3.4, 1.19, 0.408, 11);
  lw.sync(ov);
  const tree = (x, z, crushed = false) => ({ x, z, crushed, mat: new THREE.Matrix4().makeTranslation(x, field.getHeightAt(x, z), z) });
  const trees = [tree(C.x + 3.6, C.z), tree(C.x - 2.8, C.z + 1.5), tree(C.x + 1, C.z - 1, true), tree(C.x + 30, C.z)];
  const before = trees.map((t) => t.mat.elements.slice());
  const written = [];
  const moved = reseatCraterTrees(lw, trees, ...lw.bounds(0, [0, 0, 0, 0]), (t) => written.push(t));
  assert.equal(moved, 2, 'the two standing trunks in reach move');
  for (const t of trees.slice(0, 2)) assert.ok(Math.abs(t.mat.elements[13] - (field.getHeightAt(t.x, t.z) + ov.offsetAt(t.x, t.z))) < 1e-4, 'a trunk roots at base + offsetAt');
  assert.deepEqual(trees[2].mat.elements, before[2], 'a felled trunk is the simulation\'s');
  assert.deepEqual(trees[3].mat.elements, before[3], 'out of reach, untouched');
  restoreCraterTrees(trees, () => {});
  trees.forEach((t, i) => assert.deepEqual(t.mat.elements, before[i], 'a reset restores every trunk'));
}

// 6. the carpet: its writes drop the cleared bowl's tufts and lift the rim's (the cached cells stay the base)
{
  const ov = createTerrainDeformation(), lw = createGroundCoverCraters();
  ov.addCrater(8, 8, 6, 2.1, 0.72, 5);
  lw.sync(ov);
  const cache = new Map();
  const targets = [0, 1].map(() => ({ matrices: new Float32Array(4000 * 16), colors: new Float32Array(4000 * 3) }));
  let published = null;
  const work = createGrassCarpetWork({
    seed: 1, cellSize: 16, ring: 1, candidatesPerCell: 300, capacity: 4000, cache, cacheCapacity: 50, scratch: new Float32Array(1024 * 10),
    random: (seed) => { let t = seed >>> 0; return () => { t = (Math.imul(t, 1664525) + 1013904223) >>> 0; return t / 4294967296; }; },
    makeTuft: (x, z, r) => [x, 0.5, z, r() * 6, 1, 1, 0.3, 0.4, 0.2, r() < 0.5 ? 0 : 1],
    targets: () => targets, publish: (counts) => { published = [...counts]; },
    reseat: (x, z) => (lw.holeAt(x, z) ? NaN : lw.liftAt(x, z)),
  });
  work.request(0, 0);
  while (!work.complete) work.step();
  let inBowl = 0, rimOk = 0, rimBad = 0;
  for (let v = 0; v < 2; v++) {
    const m = targets[v].matrices;
    for (let i = 1; i < published[v]; i++) {
      const x = m[i * 16 + 12], z = m[i * 16 + 14], y = m[i * 16 + 13];
      if (Math.hypot(x - 8, z - 8) < CRATER_COVER_CLEAR * 6) inBowl++;
      else if (Math.abs(y - Math.fround(0.5 + ov.offsetAt(x, z))) < 1e-6) rimOk++; else rimBad++;
    }
  }
  assert.ok(inBowl === 0 && rimBad === 0 && rimOk > 100, `the carpet: none in the bowl, ${rimOk} on base + offsetAt`);
  for (const cell of cache.values()) for (let k = 1; k < cell.length; k += 10) assert.equal(cell[k], 0.5, 'the cached cells stay the base');
  // refresh rebuilds the same ring (a crater changed the ground under it)
  work.refresh();
  assert.equal(work.complete, false);
  while (!work.complete) work.step();
}

// 7. the wiring
{
  const compact = (t) => t.replace(/\s+/g, ' ');
  const map = compact(readFileSync(new URL('./map.ts', import.meta.url), 'utf8'));
  for (const line of ['terrain.userData.updateLOD(cameraPos);', 'groundCoverCraters.sync(boundGroundOverlay);',
    'vegetation.followCraters?.(groundCoverCraters);', 'tallGrass.followCraters?.(groundCoverCraters);',
    'litter.followCraters?.(groundCoverCraters);']) assert.ok(map.includes(line), `map.ts: ${line}`);
  // (the update's own sync: the Studio's export steps run the same pair through world.syncGround, defined earlier)
  assert.ok(map.indexOf('groundCoverCraters.sync(boundGroundOverlay);', map.indexOf('terrain.userData.updateLOD(cameraPos);')) > 0,
    'the cover follows after the terrain took the stamps');
  const veg = compact(readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8'));
  assert.ok(veg.includes('reseat: (x, z) => (craterLaw?.active ? (craterLaw.holeAt(x, z) ? NaN : craterLaw.liftAt(x, z)) : 0),'), 'the carpet writes by the law');
  assert.ok(veg.includes('reseatCraterTrees(law, trees, x0, z0, x1, z1, writeCraterTree);'), 'the trees follow');
  assert.ok(veg.includes("(c.userData.bush === true || c.userData.understorey === true)"), 'the bushes and the understorey follow');
  assert.ok(map.includes('clearCoverAt: (x, z, r) => { groundCoverCraters.addHole(x, z, r); },')
    && map.includes('groundCoverCraters.resetHoles(); // ground lane: the battle\'s presentation holes go with it'),
    'the world takes the FX lane\'s holes and clears them with the battle');
  const tg = compact(readFileSync(new URL('./tallGrass.ts', import.meta.url), 'utf8'));
  assert.ok(tg.includes('blades[i * 4 + 1] = seg.data[at + 4] * law.squashAt(x, z);'), 'the tall grass lays its ring low by the law');
}

console.log(`groundCoverCraters: the law (0.9 R cleared, base + offsetAt, rubble clears nothing, epochs); Verdant's tall grass — ${cleared} blades cleared, ${rim} re-seated (worst ${(rimWorst * 100).toFixed(3)} cm), ${kept} untouched, republish = patch, reset restores; a presentation hole — ${holeBlades} cleared, ${ringLow} laid low in its ring, reset restores; litter, static meshes, trees and the carpet by the same law; map.ts wiring PASS; no GPU/art claim`);
