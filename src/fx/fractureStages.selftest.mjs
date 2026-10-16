// fractureStages.selftest.mjs — the fracture package on integ/226 end to end through the real structure stages (the
// destruction lane, 2026-10-15: feat/fracture-r2 ported; the owner: "make their collapses much more natural, not slow down
// the game so much", "use the same kind of physics engine [as the turret pops]"). A regional two-storey house:
//   - sections on (DESTRUCTION.md §3.4), the cascade drives it: a hole the sim opens breaks the wall there (no kit hole),
//     a fallen wall section comes down as its cells and keeps its stub, the roof's section comes down as its slabs onto
//     the upper floor, which lets them fall on when its storey drops; the final collapse lets the redrawn faces go;
//   - sections off: rounds break the walls, the collapse brings the whole house down as its own pieces;
//   - in both, every piece ends at rest on what is under it (the ground, the stub, a standing floor), never in the air;
//   - the same run twice lays the same poses; the reset stands the buckets up byte for byte;
// and a lift bridge's named pieces (the E12 contract: its leaves, its counterweights, its barrier arms) leave it at their
// stages as bodies and settle on the bed under the water or on the approach, never hanging.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from '../world/maps/regional/index.ts';
import { streamFrom } from '../world/maps/regional/geometry.ts';
import { structureDamageKitChain } from '../world/destructionKit.ts';
import { createStructureDamageSeam } from '../world/structureDamageSeam.ts';
import { createStructureMask } from './structureMask.ts';
import { createStructureDebris } from './structureDebris.ts';
import { createStructureStages } from './structureStages.ts';
import { createFractureStages } from './fractureStages.ts';

const IDX = 5;
const placement = { x: 30, y: 2, z: -20, yaw: 0.35 };
const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
const toWorld = (bx, by, bz) => [placement.x + bx * c + bz * s, placement.y + by, placement.z - bx * s + bz * c];
const GROUND = placement.y;

/** A regional cottage's parts as the world merges them: one geometry a bucket, world space, its spans by part. */
function house() {
  const style = ARCHITECTURE_STYLES.find((st) => st.id === 'hessian');
  const [w, d, h] = [8, 10, 7];
  const parts = buildRegionalParts(style, { structureId: 'cottage', info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: 'stone', rng: streamFrom(7), variant: streamFrom(52), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(26));
  const describe = structureDamageKitChain('cottage', 'hessian').find((k) => k.describe)?.describe;
  const anatomy = describe({ structureIdx: IDX, mapId: 'damage', builder: 'cottage', style: 'hessian', parts, w, d, h, placement,
    massClass: 'house', seed: 11, kitPlan: regionalKitPlanOf(parts) });
  assert.ok(anatomy?.storeys?.length >= 2, 'a two-storey cottage');
  const spans = [], meshes = [];
  for (const [bucket, list] of Object.entries(parts)) {
    if (!Array.isArray(list) || !list.length) continue;
    const pos = [], nrm = [], ranges = [];
    for (const g0 of list) {
      if (!g0?.attributes?.position) continue;
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position, n = g.attributes.normal;
      ranges.push([pos.length / 3, p.count]);
      for (let i = 0; i < p.count; i++) {
        pos.push(...toWorld(p.getX(i), p.getY(i), p.getZ(i)));
        const nx = n ? n.getX(i) : 0, ny = n ? n.getY(i) : 1, nz = n ? n.getZ(i) : 0;
        nrm.push(nx * c + nz * s, ny, -nx * s + nz * c);
      }
    }
    if (!pos.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: bucket }));
    meshes.push(mesh);
    const partClass = /roof|straw|thatch/i.test(bucket) ? 'roof' : bucket === 'glass' ? 'glass' : 'wall';
    for (const [first, count] of ranges) spans.push({ mesh, geometryId: null, instanceId: null, position: geometry.getAttribute('position'), bucket,
      partClass, first, count, piece: null });
  }
  return { anatomy, spans, meshes, seam: () => createStructureDamageSeam(IDX, 'cottage', 'hessian', anatomy, spans),
    snapshot: () => meshes.map((m) => Float32Array.from(m.geometry.getAttribute('position').array)) };
}

/** The stages and the fracture over one flat ground, stepped at 60 Hz on their own clock. */
function rig(ground = () => GROUND, records = []) {
  let now = 50;
  const mask = createStructureMask(64);
  const debris = createStructureDebris({ now: () => now, groundY: ground });
  const group = new THREE.Group();
  const env = {
    groundAt: ground,
    queryStatic: (minX, minZ, maxX, maxZ, out) => {
      out.length = 0;
      for (const r of records) if (!(r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ)) out.push(r);
      return out;
    },
    isSolid: (r) => !r.crushed && !r.dead,
  };
  const fx = createFractureStages({ group, now: () => now, environment: () => env, groundAt: ground, materialFor: () => null });
  const stages = createStructureStages({ mask, debris, now: () => now, materialFor: () => null, fracture: fx.attach });
  const step = (seconds) => {
    for (let k = Math.round(seconds * 60); k > 0; k--) { now += 1 / 60; stages.update(); fx.update(); debris.update(); }
  };
  return { mask, debris, group, fx, stages, step, get now() { return now; } };
}

/** The world box of a mesh's own vertices (through its matrix: a tilted slab's corners, not its box's). */
const _bv = new THREE.Vector3();
const boxOf = (m) => {
  const box = new THREE.Box3(), p = m.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) box.expandByPoint(_bv.fromBufferAttribute(p, i).applyMatrix4(m.matrix));
  return box;
};
const named = (r, prefix) => r.group.children.filter((m) => m.isMesh && m.name.startsWith(prefix) && m.geometry.getAttribute('position')?.count);
/** What rests: every fracture body and heap and every collapse piece and its baked heap (not the standing faces, the
 *  rooms, the remnant). */
const resting = (r) => [...named(r, 'fx-fracture-body'), ...named(r, 'fx-fracture-heap'),
  ...r.group.children.filter((m) => m.isMesh && m.name.startsWith('fx-collapse-') && !m.name.startsWith('fx-collapse-remnant'))];

const H = house();
const st0 = H.anatomy.storeys[0], st1 = H.anatomy.storeys[1];
const front = st0.faces.reduce((best, f) => (f.width > best.width ? f : best), st0.faces[0]);
const fi = st0.faces.indexOf(front);
const facePoint = (f, u, v, depth = 0.05) => toWorld(f.origin[0] + f.u[0] * u + f.out[0] * depth, f.origin[1] + v, f.origin[2] + f.u[2] * u + f.out[2] * depth);
const outW = [front.out[0] * c + front.out[2] * s, 0, -front.out[0] * s + front.out[2] * c];
const identity = { structureId: IDX, massClass: 'house', cx: placement.x, cz: placement.z, hw: H.anatomy.w / 2, hd: H.anatomy.d / 2, yaw: placement.yaw,
  baseY: placement.y, topY: placement.y + H.anatomy.h };
const stageEvent = (stage, previous, extra = {}) => {
  const [x, y, z] = facePoint(front, 0.6, 1.5);
  return { ...identity, stage, previous, cause: 'blast', munition: 'he', x, y, z, dirX: -outW[0], dirZ: -outW[2], points: 40, integrity: 0.4, ...extra };
};

// ---- sections on: the cascade drives the fracture ------------------------------------------------------------------
function sectionsRun() {
  const r = rig();
  const seam = H.seam();
  r.stages.stage(stageEvent('damaged', 'intact', { sections: true }), seam);
  r.step(1);
  // a hole the sim opened: the wall breaks there, no kit hole in the mask
  const [hx, hy, hz] = facePoint(front, -1.2, 1.6);
  r.stages.breach({ ...identity, section: fi, sectionKind: 'wall', y0: placement.y, y1: placement.y + st0.y1, hole: 0, x: hx, y: hy, z: hz,
    nx: outW[0], ny: 0, nz: outW[2], radiusM: 0.6, munition: 'he', sectionDown: false }, seam);
  r.step(0.6);
  const holes = r.mask.holes(IDX);
  const faces = named(r, 'fx-fracture-face').length;
  // the front section falls (the ground storey keeps its stub: a metre over the base)
  const [fx, fy, fz] = facePoint(front, 0, (st0.y1 - st0.y0) / 2);
  r.stages.breach({ ...identity, section: fi, sectionKind: 'wall', y0: placement.y + st0.y0, y1: placement.y + st0.y1, hole: 255, x: fx, y: fy, z: fz,
    nx: outW[0], ny: 0, nz: outW[2], radiusM: 0, munition: 'he', sectionDown: true }, seam);
  r.step(0.5);
  const thrown = r.fx.stats().bodies;
  r.step(8);
  const panel = resting(r).map(boxOf);
  // the stub stands as the face's own cells (its lowest metre)
  const stub = named(r, 'fx-fracture-face').map(boxOf).filter((b) => b.min.y < GROUND + 0.5);
  // the top storey's faces fall (the sim brings the roof down once three have)
  for (let k = 0; k < st1.faces.length; k++) {
    const f = st1.faces[k];
    const [px, py, pz] = facePoint(f, 0, (st1.y1 - st1.y0) / 2);
    const o = [f.out[0] * c + f.out[2] * s, -f.out[0] * s + f.out[2] * c];
    r.stages.breach({ ...identity, section: 4 + k, sectionKind: 'wall', y0: placement.y + st1.y0, y1: placement.y + st1.y1, hole: 255, x: px, y: py, z: pz,
      nx: o[0], ny: 0, nz: o[1], radiusM: 0, munition: 'he', sectionDown: true }, seam);
    r.step(0.4);
  }
  r.step(4);
  // the roof's section falls: its slabs come down onto the upper floor, which holds them until its storey drops
  const roofAt = toWorld(0, H.anatomy.roof.eaveY + 0.5, 0);
  r.stages.breach({ ...identity, section: H.anatomy.storeys.length * 4, sectionKind: 'roof', y0: placement.y + H.anatomy.roof.eaveY,
    y1: placement.y + H.anatomy.roof.ridgeY, hole: 255, x: roofAt[0], y: roofAt[1], z: roofAt[2], nx: 0, ny: 1, nz: 0, radiusM: 0, munition: 'he',
    sectionDown: true }, seam);
  r.step(0.3);
  const roofPieces = named(r, 'fx-collapse-roof').length;
  r.step(8);
  const onFloor = named(r, 'fx-collapse-roof').map(boxOf);
  // the upper storey drops: its floor lets go of what lay on it
  r.fx.breach({ ...identity, section: 4, sectionKind: 'wall', y0: placement.y + st1.y0, y1: placement.y + st1.y1, hole: 255, x: fx, y: fy + 3, z: fz,
    nx: 0, ny: 0, nz: 1, radiusM: 0, munition: 'he', sectionDown: true, storeyDown: true });
  r.step(8);
  // (by now its slabs lay still and were baked into the heap: one mesh)
  const down = [...named(r, 'fx-collapse-roof'), ...named(r, 'fx-collapse-baked')].map(boxOf);
  // the final collapse (after the cascade): the redrawn faces go with the building, the kit's remnant stands
  r.stages.stage(stageEvent('collapsed', 'breached', { sections: true }), seam);
  const facesAfter = named(r, 'fx-collapse-roof').length >= 0 ? r.group.children.filter((m) => m.userData.structureFractureFace).length : -1;
  const digest = resting(r).map((m) => Array.from(m.matrix.elements, (v) => v.toFixed(3)).join(',')).join('|');
  const stats = r.fx.stats();
  r.stages.reset(); r.fx.reset(); r.mask.reset(); r.debris.reset();
  return { holes, faces, thrown, panel, stub, roofPieces, onFloor, down, facesAfter, digest, stats, left: r.group.children.length };
}
const before = H.snapshot();
const A = sectionsRun();
assert.equal(A.holes, 0, 'sections on: the sim\'s hole breaks the wall itself (no kit hole in the mask)');
assert.ok(A.faces >= 1, `sections on: the struck face is drawn as its cells (${A.faces} meshes)`);
assert.ok(A.thrown >= 4, `the fallen section comes down as bodies (${A.thrown} in the pool)`);
assert.ok(A.stub.length >= 1, 'its stub stands as the face\'s own cells');
for (const b of A.panel) {
  assert.ok(b.min.y < GROUND + 1.3, `a piece of the section lies on the ground or the stub, not in the air (its foot ${(b.min.y - GROUND).toFixed(2)} m over the ground)`);
  assert.ok(b.min.y > GROUND - 0.4, `and not sunk in it (${(b.min.y - GROUND).toFixed(2)} m)`);
}
assert.ok(A.roofPieces >= 2, `the roof's section comes down as its slabs (${A.roofPieces} meshes)`);
const floorY = GROUND + st1.y0;
for (const b of A.onFloor) assert.ok(b.min.y < floorY + 0.9, `a roof slab lies on the upper floor or under it, never at the eaves (${(b.min.y - GROUND).toFixed(2)} m)`);
// (its slabs fall into the top storey: some rest on its floor, some slide off it over the fallen face to the ground)
assert.ok(A.onFloor.some((b) => b.min.y < floorY + 0.3 && b.max.y > floorY - 0.1), 'the upper floor holds slabs while its storey stands');
assert.ok(A.down.length >= 1, 'its slabs are still there, lying or baked');
const eaveWorld = GROUND + H.anatomy.roof.eaveY;
// (baked, a heap is one mesh a material: a piece stacked on others lies over the ground by their height)
assert.ok(Math.min(...A.down.map((b) => b.min.y)) < GROUND + 0.3, 'what fell lies on the ground');
for (const b of A.down) {
  assert.ok(b.min.y < GROUND + 2.0, `its storey dropped, nothing of it hovers (its lowest ${(b.min.y - GROUND).toFixed(2)} m over the ground)`);
  assert.ok(b.max.y < eaveWorld - 0.5, `it came down from the eaves (its top ${(b.max.y - GROUND).toFixed(2)} m, the eaves ${(eaveWorld - GROUND).toFixed(2)} m)`);
}
assert.equal(A.facesAfter, 0, 'the final collapse lets the redrawn faces go (the kit\'s remnant stands)');
H.snapshot().forEach((arr, i) => assert.deepEqual(arr, before[i], `the reset stands bucket ${i} up byte for byte`));
const B = sectionsRun();
assert.equal(B.digest, A.digest, 'the same cascade twice lays the same poses');
assert.equal(B.left, A.left, 'and leaves the same');

// ---- sections off: rounds break the walls, the collapse brings the house down as its own pieces ----------------------
{
  const r = rig();
  const seam = H.seam();
  r.stages.stage(stageEvent('damaged', 'intact'), seam);
  for (const [u, v] of [[-1.5, 1.4], [1.6, 2.2], [0, 1.0]]) {
    const [x, y, z] = facePoint(front, u, v);
    r.stages.strike(IDX, seam, x, y, z, -outW[0], -outW[2], 'he', 2.9, 125);
    r.step(0.5);
  }
  assert.equal(r.mask.holes(IDX), 0, 'sections off: a round breaks the wall itself (no kit hole)');
  assert.ok(named(r, 'fx-fracture-face').length >= 1, 'the struck face is drawn as its cells');
  r.step(3);
  r.stages.stage(stageEvent('collapsed', 'breached'), seam);
  r.step(0.6);
  assert.ok(r.fx.took(IDX), 'the collapse is taken as bodies');
  assert.equal(named(r, 'fx-fracture-face').length, 0, 'its redrawn faces were cut with it');
  r.step(14);
  const pieces = r.group.children.filter((m) => m.isMesh && m.name.startsWith('fx-collapse-') && !m.name.startsWith('fx-collapse-remnant'));
  assert.ok(pieces.length >= 3, `its pieces lie where they fell (${pieces.length} meshes)`);
  for (const m of pieces) {
    const b = boxOf(m);
    assert.ok(b.min.y < GROUND + 1.6, `${m.name}: on the ground or the heap, not in the air (${(b.min.y - GROUND).toFixed(2)} m)`);
  }
  r.stages.reset(); r.fx.reset(); r.mask.reset(); r.debris.reset();
  H.snapshot().forEach((arr, i) => assert.deepEqual(arr, before[i], `sections off: the reset stands bucket ${i} up`));
}

// ---- a lift bridge's named pieces (the E12 contract) -----------------------------------------------------------------
{
  const BI = 9;
  const bridge = { x: -158, y: 0, z: 265, yaw: 0.2 };
  const bc = Math.cos(bridge.yaw), bs = Math.sin(bridge.yaw);
  const W = (bx, by, bz) => [bridge.x + bx * bc + bz * bs, bridge.y + by, bridge.z - bx * bs + bz * bc];
  // the channel: the bed 2.5 m under the banks across the lift span (|z| < 6.5 in the bridge's frame)
  const ground = (x, z) => { const bz = (x - bridge.x) * bs + (z - bridge.z) * bc; return Math.abs(bz) < 6.5 ? bridge.y - 2.5 : bridge.y; };
  const deckY = 1.5;
  const boxes = [];
  const box = (piece, bucket, x0, y0, z0, x1, y1, z1) => boxes.push({ piece, bucket, g: new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) });
  for (const [n, z0, z1] of [['deck-0', -6, -0.02], ['deck-1', 0.02, 6]]) {
    box(n, 'structureWood', -2.75, deckY - 0.5, z0, 2.75, deckY, z1);
    box(n, 'structureWood', -2.75, deckY, z0, -2.6, deckY + 1.05, z1);
    box(n, 'structureWood', 2.6, deckY, z0, 2.75, deckY + 1.05, z1);
  }
  for (const [n, zs] of [['counterweight-0', -1], ['counterweight-1', 1]]) box(n, 'structureWood', -3.2, 6.8, zs * 11.6, 3.2, 7.3, zs * 12.1);
  for (const [i, zs] of [[0, -1], [1, 1]]) for (let k = 0; k < 4; k++) box(`barrier-arm-${i}-${k}`, 'structureWood', zs * 3.3 - 0.06, deckY + 1.15 + k * 1.1, zs * 15 - 0.06, zs * 3.3 + 0.06, deckY + 2.25 + k * 1.1, zs * 15 + 0.06);
  // the rest of it: the piers and the approaches (no piece of the bodies')
  box(null, 'stone', -3.6, -3, -7.5, 3.6, deckY - 0.5, -6.05); box(null, 'stone', -3.6, -3, 6.05, 3.6, deckY - 0.5, 7.5);
  const pos = [], ranges = [];
  for (const b of boxes) {
    const g = b.g.toNonIndexed(), p = g.getAttribute('position');
    ranges.push([pos.length / 3, p.count, b.piece, b.bucket]);
    for (let i = 0; i < p.count; i++) pos.push(...W(p.getX(i), p.getY(i), p.getZ(i)));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'structureWood' }));
  const spans = ranges.map(([first, count, piece, bucket]) => ({ mesh, geometryId: null, instanceId: null, position: geometry.getAttribute('position'),
    bucket, partClass: 'wall', first, count, piece }));
  const bridgeBefore = Float32Array.from(geometry.getAttribute('position').array);
  const anatomy = { structureIdx: BI, kit: 'liftBridge', massClass: 'landmark', seed: 77, placement: bridge, w: 7, d: 32, h: 9, storeys: [], roof: null,
    chimneys: [], plinth: null, interior: { color: [0.02, 0.02, 0.02], open: false }, rubble: [], remnant: { stubHeightM: 0, corners: false, chimneys: false } };
  const seam = { structureIdx: BI, builder: 'liftBridge', style: null, anatomy, spans, touchShadows() {} };
  // its records: the lift span's deck (no longer holding the leaves once they go) and the approaches (they hold)
  const obb = (x0, y0, z0, x1, y1, z1) => {
    const [cx, , cz] = W((x0 + x1) / 2, 0, (z0 + z1) / 2), hw = (x1 - x0) / 2, hl = (z1 - z0) / 2;
    const ex = Math.abs(bc) * hw + Math.abs(bs) * hl, ez = Math.abs(bs) * hw + Math.abs(bc) * hl;
    return { min: [cx - ex, y0, cz - ez], max: [cx + ex, y1, cz + ez], shape2: { kind: 'obb', cx, cz, hw, hl, yaw: bridge.yaw, y0, y1 }, structureIdx: BI };
  };
  const records = [obb(-2.75, deckY - 1, -6, 2.75, deckY - 0.5, 6), obb(-2.75, deckY - 1, -16, 2.75, deckY, -7.5), obb(-2.75, deckY - 1, 7.5, 2.75, deckY, 16)];
  const r = rig(ground, records);
  const kept = [];
  const host = { o: { mask: r.mask, debris: r.debris, now: () => r.now }, keep: (span) => kept.push(span), dropRuns: () => false, clampPanel: () => false,
    finishFalls() {}, run() {}, worldMaterial: () => null, spanMaterials: () => new Map(), roomMaterialFor: (m) => m ?? new THREE.MeshStandardMaterial() };
  const hook = r.fx.attach(host);
  const lm = { ...identity, structureId: BI, massClass: 'landmark', cx: bridge.x, cz: bridge.z, hw: 3.5, hd: 16, yaw: bridge.yaw, baseY: -3, topY: 9,
    cause: 'blast', munition: 'he', x: bridge.x, y: deckY, z: bridge.z, dirX: 0, dirZ: 0, points: 40, integrity: 0.6 };
  const spanFlat = (name) => spans.filter((sp) => sp.piece?.startsWith(name)).every((sp) => {
    const a = sp.position.array;
    for (let i = sp.first; i < sp.first + sp.count; i++) if (a[i * 3] !== a[sp.first * 3] || a[i * 3 + 1] !== a[sp.first * 3 + 1]) return false;
    return true;
  });
  hook.stage({ ...lm, stage: 'damaged', previous: 'intact' }, seam);
  assert.ok(spanFlat('barrier-arm') && !spanFlat('deck') && !spanFlat('counterweight'), 'the damaged stage takes the barrier arms, the deck and the counterweights stand');
  r.step(6);
  hook.stage({ ...lm, stage: 'breached', previous: 'damaged' }, seam);
  assert.ok(spanFlat('deck') && spanFlat('counterweight'), 'the breach stage takes the leaves and the counterweights out of the buckets');
  r.step(10);
  const pieces = named(r, 'fx-landmark-piece-');
  assert.equal(pieces.length, 6, `two arms, two leaves, two counterweights as bodies (${pieces.length})`);
  const localOf = (b) => { const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    return [(cx - bridge.x) * bc - (cz - bridge.z) * bs, (cx - bridge.x) * bs + (cz - bridge.z) * bc]; };
  const local = (b) => localOf(b)[1];
  for (const m of pieces) {
    const b = boxOf(m), [bx, bz] = localOf(b);
    // under it: the bed in the channel, an approach's boards over |x| ≤ 2.75 past the piers, else the bank
    const ground0 = Math.abs(bz) < 6.5 ? bridge.y - 2.5 : bridge.y;
    const deck = Math.abs(bz) >= 7.5 && Math.abs(bz) <= 16 && Math.abs(bx) <= 2.75 ? deckY : -Infinity;
    const ok = Math.abs(b.min.y - ground0) < 0.45 || Math.abs(b.min.y - deck) < 0.45;
    assert.ok(ok, `${m.name} rests on what is under it (its foot ${b.min.y.toFixed(2)}, the ground ${ground0}, x ${bx.toFixed(1)} z ${bz.toFixed(1)})`);
    assert.ok(b.max.y - b.min.y < 3, `${m.name} lies down (${(b.max.y - b.min.y).toFixed(2)} m tall)`);
  }
  const leaves = pieces.filter((m) => Math.abs(local(boxOf(m))) < 6.5);
  assert.equal(leaves.length, 2, 'the two leaves lie in the channel, on its bed under the water');
  assert.ok(r.fx.stats().landmark >= 6, 'counted as the fracture\'s landmark bodies');
  r.fx.reset();
  for (const sp of kept) sp.position.array.set(bridgeBefore.subarray(sp.first * 3, (sp.first + sp.count) * 3), sp.first * 3);
  assert.equal(named(r, 'fx-landmark-piece-').length, 0, 'the reset takes the pieces away');
}

console.log(`fractureStages.selftest: sections on — a sim hole broke the wall (${A.faces} faces drawn, no kit hole), the fallen section threw `
  + `${A.thrown} bodies that lie on the ground or the stub, the roof's ${A.roofPieces} slabs lay on the upper floor until its storey dropped; `
  + 'sections off — rounds broke the walls and the house came down as its own pieces; the same twice, the reset byte for byte; '
  + 'the lift bridge\'s arms, leaves and counterweights fell at their stages and lie on the bed and the approach PASS');
