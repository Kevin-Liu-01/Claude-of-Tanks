import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { initialTerrainLods, terrainLodForDistance, warmTerrainLodBuilds, chooseTerrainLodBuild } from './terrainLodPolicy.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';
import { createHeightField } from './terrain.ts';
import { installTerrainCraterMesh, TERRAIN_CRATER_LATTICE } from './terrainCraterMesh.ts';
import { createDeformedHeightField, createTerrainDeformation, stampBounds } from '../sim/terrainDeformation.ts';
import verdant from './maps/verdant.ts';

// Ground lane (2026-10-08, crater-render-spec §B; the owner's "destructive explosions that leave holes and craters"):
// the drawn terrain follows the battle's ground overlay. On Verdant's real height field, the actual chunk generators,
// LOD streamer and update pass (terrain.ts's chunk section, run as the streaming receipt runs it, its canvas material
// and horizon ring stubbed) with terrainCraterMesh.ts installed as the world installs it. Pins:
// 1. three craters (one across a chunk border) and one rubble mound: every built LOD vertex in a stamp's reach equals
//    base + offsetAt on the contact lattice within 1e-4 m; every vertex out of every reach keeps its bits; skirts follow;
// 2. at 500 random points in the stamps' bounds, the patched LOD0 surface (terrainNearMeshHeightAt over its vertices)
//    equals the simulation's contact height (createDeformedHeightField.getContactHeightAt) within 1 mm;
// 3. a terrain whose far levels are streamed in after the stamps holds the same vertices, bit for bit;
// 4. reset() restores every geometry, bit for bit (and its bounds);
// 5. the cost per crater: vertices rewritten, bytes marked for upload, and the CPU time (reported).
// No GPU or art claim.

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const chunkSource = source.slice(source.indexOf('const CHUNKS = 8'));
assert.ok(chunkSource.startsWith('const CHUNKS = 8'), 'chunk source boundary is exact');
// the crater mesh's lattice is terrain.ts's own
for (const line of ['const HALF = 512;', 'const MAP_SIZE = 1024;', 'const CHUNKS = 8, CHUNK_SIZE = MAP_SIZE / CHUNKS;',
  'const LOD_SEGS = [96, 48, 24];', 'const SKIRT_DROP = 6.5;']) assert.ok(source.includes(line), `terrain.ts: ${line}`);
assert.deepEqual([...TERRAIN_CRATER_LATTICE.lodSegs], [96, 48, 24]);
assert.deepEqual([TERRAIN_CRATER_LATTICE.chunkSize, TERRAIN_CRATER_LATTICE.half, TERRAIN_CRATER_LATTICE.skirtDrop], [128, 512, 6.5]);
const api = new Function('THREE', 'initialTerrainLods', 'terrainLodForDistance', 'warmTerrainLodBuilds',
  'chooseTerrainLodBuild', 'registerRetainedObject3DResources', 'performance', stripTypeScriptTypes(`
  const MAP_SIZE = 1024, HALF = 512;
  function* buildHorizonRingSteps() { return new THREE.Group(); }
  // (the ring worker, perf/ring-deferred: the chunk section reaches the ring through its hook and asks it for a supplied
  // build; here the ring is an empty group built where it stands, as terrainStreaming.selftest's sandbox has it)
  const horizonRing = () => ({
    HORIZON_SEGMENTS: 287,
    buildHorizonRingSteps: function* () { return new THREE.Group(); },
    horizonRingGeometrySteps: function* () { return null; },
  });
  function horizonRingSupplyFor() { return null; }
  function* createSplatMaterialSteps() {
    return { material: new THREE.MeshStandardMaterial(), textures: new Set() };
  }
  ${chunkSource.replace(/^export /gm, '')}
`) + 'return { terrainBuildSteps, terrainNearMeshHeightAt };')(THREE, initialTerrainLods, terrainLodForDistance,
  warmTerrainLodBuilds, chooseTerrainLodBuild, registerRetainedObject3DResources, performance);

function drain(generator) {
  let result = generator.next();
  while (!result.done) result = generator.next();
  return result.value;
}

const field = createHeightField(1337, verdant);
const build = (stream) => {
  const group = drain(api.terrainBuildSteps(field, {}, verdant, stream ? { streamFarLods: true, focus: { x: -400, z: -400 } } : undefined));
  const mesh = installTerrainCraterMesh(group);
  assert.ok(mesh, 'the terrain publishes its chunks and lattice for the crater mesh');
  return { group, mesh, chunks: group.userData.terrainChunks };
};
const eager = build(false);
const cam = new THREE.Vector3(-128, 40, 60);

const snapshot = (chunks) => chunks.map((c) => c.lods.map((g) => g && {
  pos: g.getAttribute('position').array.slice(), nrm: g.getAttribute('normal').array.slice(), radius: g.boundingSphere.radius,
}));
const before = snapshot(eager.chunks);

// the stamps: a howitzer crater across the chunk border at x = −128, a 6 m cap crater in a field, a 125 mm crater on a
// slope, a rubble heap; the overlay the battle binds (map.ts bindGroundOverlay leaves it in the terrain's userData)
const overlay = createTerrainDeformation();
eager.group.userData.groundOverlay = overlay;
eager.group.userData.updateLOD(cam);
assert.equal(eager.mesh.stats.applied, 0, 'an empty overlay changes nothing');
const stamps = [];
const crater = (x, z, r, seed) => {
  assert.ok(overlay.addCrater(x, z, r, +(0.35 * r).toFixed(3), +(0.12 * r).toFixed(3), seed), 'the crater lands');
  eager.group.userData.updateLOD(cam);
  stamps.push({ ms: eager.mesh.stats.lastStampMs, vertices: eager.mesh.stats.lastStampVertices, bytes: eager.mesh.stats.lastStampUploadBytes, r });
};
crater(-128, 60, 3.4, 4242);        // across the chunk border x = −128
crater(140, -210, 6, 911);           // the cap, in the open
crater(-300.3, 251.7, 1.65, 77);     // a 125 mm round
overlay.addRubble(40, 120, 6, 9, 0.4, 1.8);
eager.group.userData.updateLOD(cam);
assert.equal(eager.mesh.stats.applied, overlay.stamps.length, 'every stamp applied');

const lodSegs = [96, 48, 24], step = 128 / 96;
const boxes = overlay.stamps.map((s) => stampBounds(s, [0, 0, 0, 0]));
const inReach = (x, z, pad) => boxes.some((b) => x >= b[0] - pad && x <= b[2] + pad && z >= b[1] - pad && z <= b[3] + pad);

// 1. the law on every built vertex
let inside = 0, outside = 0, worst = 0, skirts = 0;
eager.chunks.forEach((c, ci) => c.lods.forEach((g, level) => {
  if (!g) return;
  const segs = lodSegs[level], n = segs + 1, stride = 96 / segs;
  const pos = g.getAttribute('position').array, nrm = g.getAttribute('normal').array;
  const base = before[ci][level];
  const lx = Math.round((c.cx0 + 512) / 128) * 96, lz = Math.round((c.cz0 + 512) / 128) * 96;
  for (let vz = 0; vz < n; vz++) for (let vx = 0; vx < n; vx++) {
    const vi = vz * n + vx;
    const x = -512 + (lx + vx * stride) * step, z = -512 + (lz + vz * stride) * step;
    if (inReach(x, z, 2 * step)) {
      const want = base.pos[vi * 3 + 1] + overlay.offsetAt(x, z);
      worst = Math.max(worst, Math.abs(pos[vi * 3 + 1] - want));
      inside++;
    } else {
      for (let k = 0; k < 3; k++) {
        assert.ok(Object.is(pos[vi * 3 + k], base.pos[vi * 3 + k]) && Object.is(nrm[vi * 3 + k], base.nrm[vi * 3 + k]),
          `chunk ${ci} level ${level} vertex ${vi} out of every reach keeps its bits`);
      }
      outside++;
    }
  }
  for (let k = 0; k < 4 * segs; k++) {
    const side = (k / segs) | 0, t = k - side * segs;
    const vx = side === 0 ? t : side === 1 ? segs : side === 2 ? segs - t : 0;
    const vz = side === 0 ? 0 : side === 1 ? t : side === 2 ? segs : segs - t;
    assert.equal(pos[(n * n + k) * 3 + 1], Math.fround(pos[(vz * n + vx) * 3 + 1] - 6.5), 'a skirt follows its source');
    skirts++;
  }
}));
assert.ok(inside > 1500 && worst < 1e-4, `every vertex in reach is base + offsetAt (${inside} vertices, worst ${worst.toExponential(2)} m)`);
assert.ok(outside > 100000, `the rest keep their bits (${outside} vertices)`);

// 2. the drawn LOD0 surface is the simulation's contact surface
const deformed = createDeformedHeightField(field, overlay);
const lod0At = (x, z) => {
  const ix = Math.round((x + 512) / step), iz = Math.round((z + 512) / step);
  const cx = Math.min(7, Math.floor(ix / 96)), cz = Math.min(7, Math.floor(iz / 96));
  const c = eager.chunks[cz * 8 + cx], g = c.lods[0];
  return g.getAttribute('position').array[((iz - cz * 96) * 97 + (ix - cx * 96)) * 3 + 1];
};
let rng = 0x5eed;
const rnd = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
let contactWorst = 0;
for (let k = 0; k < 500; k++) {
  const b = boxes[k % boxes.length];
  const x = b[0] + rnd() * (b[2] - b[0]), z = b[1] + rnd() * (b[3] - b[1]);
  contactWorst = Math.max(contactWorst, Math.abs(api.terrainNearMeshHeightAt(lod0At, x, z) - deformed.getContactHeightAt(x, z)));
}
assert.ok(contactWorst < 1e-3, `the patched LOD0 is the simulation's contact surface within 1 mm (worst ${(contactWorst * 1000).toFixed(4)} mm)`);
const bowl = deformed.getContactHeightAt(140, -210) - field.getContactHeightAt(140, -210);
assert.ok(bowl < -1.5, `the 6 m crater's floor lies ${bowl.toFixed(2)} m down`);

// 3. levels streamed in after the stamps equal the same levels streamed in before them and patched in place, bit for
//    bit: two streaming terrains (the same focus, camera and warm order) — one warms every level first and is stamped
//    after, the other is stamped first and warms after (its later levels go through adoptTerrainGeometry)
const replay = (target) => {
  for (const s of overlay.stamps) {
    if (s.kind === 'crater') target.addCrater(s.x, s.z, s.radiusM, s.depthM, s.rimM, s.seed);
    else target.addRubble(s.cx, s.cz, s.hw, s.hd, s.yaw, s.heightM);
  }
};
const first = build(true), later = build(true);
const overlayFirst = createTerrainDeformation();
first.group.userData.groundOverlay = overlayFirst;
first.group.userData.updateLOD(cam);
while (first.group.userData.warmStreaming(cam, 4) > 0) { /* every level this camera wants, before any stamp */ }
replay(overlayFirst);
first.group.userData.updateLOD(cam);
const overlayLater = createTerrainDeformation();
replay(overlayLater);
later.group.userData.groundOverlay = overlayLater;
later.group.userData.updateLOD(cam);
const builtBefore = later.chunks.reduce((s, c) => s + c.lods.filter(Boolean).length, 0);
while (later.group.userData.warmStreaming(cam, 4) > 0) { /* the same levels, built after the stamps */ }
const builtAfter = later.chunks.reduce((s, c) => s + c.lods.filter(Boolean).length, 0);
assert.ok(builtAfter - builtBefore >= 40, `the streamer built ${builtAfter - builtBefore} levels after the stamps`);
let compared = 0, deformedLater = 0;
later.chunks.forEach((c, ci) => c.lods.forEach((g, level) => {
  if (!g) return;
  const e = first.chunks[ci].lods[level];
  assert.ok(e, `chunk ${ci} level ${level} exists in both`);
  const a = g.getAttribute('position').array, b = e.getAttribute('position').array;
  const na = g.getAttribute('normal').array, nb = e.getAttribute('normal').array;
  for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]) && Object.is(na[i], nb[i]), `chunk ${ci} level ${level}: built later = patched in place`);
  if (g.userData.craterBase) deformedLater++;
  compared++;
}));
assert.equal(compared, builtAfter, 'every streamed terrain level compared');
assert.ok(deformedLater > 0, 'some of them carry the stamps');

// 5. the cost per crater (the first stamp pays its base copies; the CPU time is reported, the budget is the hold's)
const cost = stamps.map((s) => `R ${s.r} m: ${s.vertices} vertices, ${(s.bytes / 1024).toFixed(1)} KB, ${s.ms.toFixed(3)} ms`).join('; ');
for (const s of stamps) assert.ok(s.vertices > 0 && s.bytes > 0, 'a crater rewrites and uploads its reach');

// 4. reset(): every geometry back, bit for bit
overlay.reset();
eager.group.userData.updateLOD(cam);
const after = snapshot(eager.chunks);
after.forEach((levels, ci) => levels.forEach((g, level) => {
  if (!g) return;
  const b = before[ci][level];
  for (let i = 0; i < g.pos.length; i++) assert.ok(Object.is(g.pos[i], b.pos[i]) && Object.is(g.nrm[i], b.nrm[i]), `chunk ${ci} level ${level} restored`);
  assert.equal(g.radius, b.radius, 'its bounds restored');
}));
assert.equal(eager.mesh.stats.touched, 0, 'no base copy kept after a reset');
// unbinding restores too, and a new battle's overlay starts flat
const second = createTerrainDeformation();
second.addCrater(0, 0, 2, 0.7, 0.24, 5);
eager.group.userData.groundOverlay = second;
eager.group.userData.updateLOD(cam);
assert.ok(eager.mesh.stats.touched > 0);
eager.group.userData.groundOverlay = null;
eager.group.userData.updateLOD(cam);
assert.equal(eager.mesh.stats.touched, 0, 'an unbound overlay leaves the base');

console.log(`terrainCraterMesh: Verdant, 3 craters + 1 rubble heap — ${inside} vertices in reach at base + offsetAt (worst ${worst.toExponential(1)} m), ${outside} untouched, ${skirts} skirts follow; LOD0 = contact surface within ${(contactWorst * 1000).toFixed(4)} mm (500 points); ${builtAfter - builtBefore} levels streamed after the stamps bit-identical; reset bit-identical; ${cost} PASS; no GPU/art claim`);
