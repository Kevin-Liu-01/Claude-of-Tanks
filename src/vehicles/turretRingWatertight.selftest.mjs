// The live ring cut keeps a dented hull watertight (wreck-cracks 243; found by the gun-hull lane's exterior probe on the
// vt4a1 at seed 77: rays that hit the hull of the uncut wreck passed through the cut one). Copyright © 2026 Kevin B. Liu;
// first-party Reserved Content (NOTICE.md). provenance: urn:claude-of-tanks:qa:turret-ring-watertight-selftest
//
//  - a synthetic dented pair: a long sloped face the cut splits on the sectors' lines, its neighbour across its lower
//    edge wholly under the prism's floor (the cut leaves it whole), a dent bowing that edge: in one mesh, and in two meshes
//    of a live rig (the kill's own path), every corner on the shared edge is a corner of both faces, so the dented seam
//    stays closed; the same pair cut without the dents (no corners given) cracks once bent, so the fixture sees the defect;
//  - the vt4a1's live wreck at seed 77 (its bot and its player build): no new corner of the cut lies inside an edge of
//    the hull's own (an unsplit neighbour's) without being a corner of a face on that edge, however the dents bend it;
//    and the cut is the same twice for the same kill;
//  - (244) a ring measured past the hull's own sides through the cut's depth (the MBT-70's, over its fender roofs) is
//    held inside them: the live seat takes its cap, the uncapped measure reaches past it.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../../tools/tank-surface-collect.mjs';
import { createTank, ensureTankBuilder } from './fleetFactory.ts';
import {
  TURRET_RING_SIDE_CAPS, createTurretRingPresentation, cutGeometryAtTurretRing, measureTurretRing, turretRingCut,
  turretRingRadius,
} from './turretRingWell.ts';
import { getSpec } from './specs.ts';

/** The burn hook's field at a hull-frame point, at full depth (materials.ts CRUMPLE_NORMAL_GLSL). */
function field(dents, x, y, z) {
  const out = [0, 0, 0];
  dents.centres.forEach((c, k) => {
    const d = dents.dirs[k];
    if (!d || !(c.w > 0)) return;
    const r2 = (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2;
    if (r2 >= c.w) return;
    const s = (1 - r2 / c.w) ** 2 * d.w;
    out[0] += d.x * s; out[1] += d.y * s; out[2] += d.z * s;
  });
  return out;
}

/**
 * The seams of hull-frame meshes under the dents: every vertex `isNew(mesh, i)` strictly inside a triangle's edge (to
 * 30 µm at rest) that is not a corner of a face on that edge (welded to 10 µm; a flat fan triangle closes its own
 * collinear corners), and its dented distance from that edge, dented. `ownEdges`: only edges between two of the meshes'
 * own vertices (an unsplit neighbour's).
 */
function seams(meshes, dents, isNew, { ownEdges = false, near = null } = {}) {
  const verts = [], tris = [];
  meshes.forEach((mesh, m) => {
    const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const offset = verts.length / 7;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), f = field(dents, x, y, z);
      verts.push(x, y, z, x + f[0], y + f[1], z + f[2], isNew(m, i) ? 1 : 0);
    }
    const n = index ? index.count : pos.count;
    for (let k = 0; k + 2 < n; k += 3) {
      tris.push(offset + (index ? index.getX(k) : k), offset + (index ? index.getX(k + 1) : k + 1), offset + (index ? index.getX(k + 2) : k + 2));
    }
  });
  const count = verts.length / 7;
  const weld = new Int32Array(count), ids = new Map();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(verts[i * 7] * 1e5)},${Math.round(verts[i * 7 + 1] * 1e5)},${Math.round(verts[i * 7 + 2] * 1e5)}`;
    let w = ids.get(key);
    if (w === undefined) ids.set(key, w = ids.size);
    weld[i] = w;
  }
  const thirds = new Map();
  const edgeKey = (a, b) => (weld[a] < weld[b] ? `${weld[a]}:${weld[b]}` : `${weld[b]}:${weld[a]}`);
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(tris[t + e], tris[t + (e + 1) % 3]);
      if (!thirds.has(k)) thirds.set(k, new Set());
      thirds.get(k).add(weld[tris[t + (e + 2) % 3]]);
    }
  }
  // the new vertices on a 5 cm grid
  const cell = 0.05, grid = new Map(), cellKey = (i, j, k) => `${i},${j},${k}`;
  for (let i = 0; i < count; i++) {
    if (!verts[i * 7 + 6]) continue;
    if (near && !near(verts[i * 7], verts[i * 7 + 1], verts[i * 7 + 2])) continue;
    const key = cellKey(Math.floor(verts[i * 7] / cell), Math.floor(verts[i * 7 + 1] / cell), Math.floor(verts[i * 7 + 2] / cell));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  // checked: the T-corners found (a vertex inside an edge without being a corner of a face on it)
  let checked = 0, worst = 0, worstAt = null;
  const seen = new Set();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + (e + 1) % 3], k = edgeKey(a, b);
      if (seen.has(k) || weld[a] === weld[b]) continue;
      seen.add(k);
      if (ownEdges && (verts[a * 7 + 6] || verts[b * 7 + 6])) continue;
      const A = a * 7, B = b * 7;
      const dx = verts[B] - verts[A], dy = verts[B + 1] - verts[A + 1], dz = verts[B + 2] - verts[A + 2];
      const l2 = dx * dx + dy * dy + dz * dz;
      const steps = Math.ceil(Math.sqrt(l2) / (cell / 2));
      const candidates = new Set();
      for (let s = 0; s <= steps; s++) {
        const px = verts[A] + dx * (s / steps), py = verts[A + 1] + dy * (s / steps), pz = verts[A + 2] + dz * (s / steps);
        const ci = Math.floor(px / cell), cj = Math.floor(py / cell), ck = Math.floor(pz / cell);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
          for (const v of grid.get(cellKey(ci + di, cj + dj, ck + dk)) ?? []) candidates.add(v);
        }
      }
      for (const v of candidates) {
        const V = v * 7;
        if (weld[v] === weld[a] || weld[v] === weld[b] || thirds.get(k).has(weld[v])) continue;
        const s = ((verts[V] - verts[A]) * dx + (verts[V + 1] - verts[A + 1]) * dy + (verts[V + 2] - verts[A + 2]) * dz) / l2;
        if (!(s > 1e-4 && s < 1 - 1e-4)) continue;
        if (Math.hypot(verts[V] - verts[A] - s * dx, verts[V + 1] - verts[A + 1] - s * dy, verts[V + 2] - verts[A + 2] - s * dz) > 3e-5) continue;
        checked++;
        // dented: the vertex's distance from the dented edge
        const ex = verts[B + 3] - verts[A + 3], ey = verts[B + 4] - verts[A + 4], ez = verts[B + 5] - verts[A + 5];
        const u = Math.min(1, Math.max(0, ((verts[V + 3] - verts[A + 3]) * ex + (verts[V + 4] - verts[A + 4]) * ey
          + (verts[V + 5] - verts[A + 5]) * ez) / (ex * ex + ey * ey + ez * ez || 1)));
        const gap = Math.hypot(verts[V + 3] - verts[A + 3] - u * ex, verts[V + 4] - verts[A + 4] - u * ey, verts[V + 5] - verts[A + 5] - u * ez);
        if (gap > worst) { worst = gap; worstAt = [verts[V], verts[V + 1], verts[V + 2]].map((q) => +q.toFixed(4)); }
      }
    }
  }
  return { checked, worst, worstAt };
}

const cornerSet = (geometry) => {
  const pos = geometry.getAttribute('position'), out = new Set();
  for (let i = 0; i < pos.count; i++) out.add([pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => Math.round(v * 1e5)).join(','));
  return out;
};

// ---- the synthetic pair -------------------------------------------------------------------------------------------
const SEAT = { cx: 0.1, cz: 0.2, deckY: 1.5, openR: 0.78, rimR: 0.84, skirt: 0.03, depth: 0.95, wellR: 0.762, skinR: Infinity,
  source: 'receipt', carousel: null };
/** F (a long sloped face from the deck down past the prism's floor) and N (across F's lower edge, wholly under the
 *  floor), in the hull frame of a seat at (cx, deckY, cz) whose rim is `rimR`. */
function pairCorners(cx, deckY, cz, rimR) {
  const d = rimR + 0.11;
  return {
    F: [[cx - 1.0, deckY - 0.3, cz + d], [cx + 1.0, deckY - 0.3, cz + d], [cx, deckY, cz + d + 0.65]],
    N: [[cx + 1.0, deckY - 0.3, cz + d], [cx - 1.0, deckY - 0.3, cz + d], [cx, deckY - 0.3, cz + d - 0.65]],
  };
}
const triangleGeometry = (corners) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(corners.flatMap(() => [0, 1, 0]), 3));
  geometry.setIndex(corners.map((_, i) => i));
  return geometry;
};
/** A dent centred on the shared edge, 0.3 m off its middle, pushing down (0.25 m deep, 0.6 m round). */
const pairDents = (cx, deckY, cz, rimR) => ({
  centres: [new THREE.Vector4(cx + 0.3, deckY - 0.3, cz + rimR + 0.11, 0.36)],
  dirs: [new THREE.Vector4(0, -1, 0, 0.25)],
});
{
  const { F, N } = pairCorners(SEAT.cx, SEAT.deckY, SEAT.cz, SEAT.rimR);
  const pair = triangleGeometry([...F, ...N]);
  const dents = pairDents(SEAT.cx, SEAT.deckY, SEAT.cz, SEAT.rimR);
  const cut = turretRingCut(SEAT, 48);
  assert.ok(F[0][1] < cut.yLo && N.every((p) => p[1] < cut.yLo), 'N lies wholly under the prism\'s floor, F reaches over it');
  const isNew = (_, i) => i >= 6;
  // the old cut's shape (no dents: no corners given), bent by the field: the seam opens
  const plain = cutGeometryAtTurretRing(pair, cut, null, null, true, null);
  const open = seams([{ geometry: plain }], dents, isNew);
  assert.ok(open.worst > 0.05, `the fixture sees the defect: the plain cut, dented, cracks along N's edge (${open.worst.toFixed(4)} m)`);
  // the dented cut: N takes F's corners on their edge, the seam stays shut
  const dented = cutGeometryAtTurretRing(pair, cut, null, null, true, dents);
  const index = dented.index;
  let nTriangles = 0;
  for (let k = 0; k < index.count; k += 3) {
    const c = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(dented.attributes.position, index.getX(k + j)));
    if (c.every((p) => Math.abs(p.y - (SEAT.deckY - 0.3)) < 1e-5) && c.some((p) => p.z < SEAT.cz + SEAT.rimR + 0.1)) nTriangles++;
  }
  assert.ok(nTriangles > 1, `N is split at the corners it was given (${nTriangles} triangles)`);
  // (every corner on the seam a corner of both faces: none lies inside an edge, or one that does stays on it)
  const shut = seams([{ geometry: dented }], dents, isNew);
  assert.ok(shut.worst < 1e-5, `the dented pair is watertight (${shut.checked} T-corners, worst ${shut.worst} m at ${shut.worstAt})`);
  // N's area is all there (the corners split it, they take nothing): its side of the shared edge, seen from above (the
  // dent pushes straight down, so placing a corner for it moves it only up or down)
  const edgeZ = SEAT.cz + SEAT.rimR + 0.11;
  let area = 0;
  for (let k = 0; k < index.count; k += 3) {
    const c = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(dented.attributes.position, index.getX(k + j)));
    if ((c[0].z + c[1].z + c[2].z) / 3 >= edgeZ) continue;
    area += Math.abs((c[1].x - c[0].x) * (c[2].z - c[0].z) - (c[2].x - c[0].x) * (c[1].z - c[0].z)) / 2;
  }
  assert.ok(Math.abs(area - new THREE.Triangle(...N.map((p) => new THREE.Vector3(...p))).getArea()) < 1e-6, `N keeps its whole area (${area})`);
  // no dents in the field (a kill whose planner made none): the cut gives nothing
  const still = cutGeometryAtTurretRing(pair, cut, null, null, true,
    { centres: [new THREE.Vector4(0, 0, 0, 0)], dirs: [new THREE.Vector4(0, 0, 0, 0)] });
  assert.equal(still.index.count, cutGeometryAtTurretRing(pair, cut, null, null, true, null).index.count, 'a dentless field gives no corners');
}

// ---- the same pair in two meshes of a live rig (the kill's path: the hull's dented meshes cut together) -----------------
{
  const root = new THREE.Group();
  const hull = new THREE.Group(); hull.name = 'rig_hull';
  const turret = new THREE.Group(); turret.name = 'rig_turret';
  root.add(hull, turret);
  const centres = [new THREE.Vector4(), new THREE.Vector4()], dirs = [new THREE.Vector4(), new THREE.Vector4()];
  const material = new THREE.MeshStandardMaterial();
  material.userData.__burnU = { uCrHull: { value: centres }, uCrHullDir: { value: dirs } };
  // the deck the ring is measured on, and the turret on it
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.5).rotateX(-Math.PI / 2).translate(0, 1.5, 0.2), material);
  hull.add(deck);
  turret.position.set(0, 1.5, 0.2);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.7, 48), material);
  shell.position.y = 0.35;
  turret.add(shell);
  root.updateMatrixWorld(true);
  const ring = createTurretRingPresentation({ specId: 'ring_watertight_fixture', root, hull, turret, armor: { modules: [] },
    engineCtx: null, high: false, rendered: true, dents: () => ({ centres, dirs }) });
  const seat = ring.seat();
  assert.ok(seat, 'the rig has its ring');
  const { F, N } = pairCorners(seat.cx, seat.deckY, seat.cz, seat.rimR);
  const fMesh = new THREE.Mesh(triangleGeometry(F), material), nMesh = new THREE.Mesh(triangleGeometry(N), material);
  hull.add(fMesh, nMesh);
  const planned = pairDents(seat.cx, seat.deckY, seat.cz, seat.rimR);
  centres[0].copy(planned.centres[0]); dirs[0].copy(planned.dirs[0]);
  const fBefore = fMesh.geometry, nBefore = nMesh.geometry;
  ring.show();
  assert.ok(fMesh.geometry !== fBefore, 'F is cut');
  assert.ok(nMesh.geometry !== nBefore, 'N, under the prism, takes F\'s corners on their edge (its own cut copy)');
  const fCorners = cornerSet(fMesh.geometry), nCorners = cornerSet(nMesh.geometry);
  const zone = seat.rimR + 0.36;
  let shared = 0;
  for (const key of fCorners) {
    const [x, y, z] = key.split(',').map((v) => Number(v) / 1e5);
    if (Math.abs(y - (seat.deckY - 0.3)) > 1e-4 || Math.abs(z - (seat.cz + seat.rimR + 0.11)) > 1e-4) continue;
    if (Math.hypot(x - seat.cx, z - seat.cz) > zone + 0.5) continue;
    shared++;
    assert.ok(nCorners.has(key), `F's corner on the shared edge at ${[x, y, z]} is N's too`);
  }
  assert.ok(shared > 2, `the shared edge holds F's corners (${shared})`);
  const isNew = (m, i) => i >= 3;
  const result = seams([fMesh, nMesh], { centres, dirs }, isNew);
  assert.ok(result.worst < 1e-5, `two meshes, one seam, watertight (${result.checked} T-corners, worst ${result.worst} m)`);
  ring.hide();
  assert.ok(fMesh.geometry === fBefore, 'the rematch puts F back');
  assert.ok(nMesh.geometry === nBefore, 'and N');
  ring.dispose();
}

// ---- the vt4a1's live wreck at seed 77 ----------------------------------------------------------------------------
await ensureTankBuilder('vt4a1');
for (const [build, options] of [
  ['bot', { camoSeed: 77, quality: 'low', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false }],
  ['player', { camoSeed: 77, quality: 'low', geometryQuality: 'high', batchStatic: true, battleDetailLod: false, eraVisualBindingReceipt: false }],
]) {
  const visual = createTank('vt4a1', null, options);
  const root = visual.root, hull = root.getObjectByName('rig_hull');
  const held = new Map();
  root.traverse((o) => { if (o.isMesh) held.set(o, o.geometry); });
  visual.setDestroyed({ pop: true, ageS: 1000 });
  root.updateMatrixWorld(true);
  let burnU = null, plate = null;
  root.traverse((o) => {
    if (o.userData?.turretRingPlate) plate = o;
    if (!burnU && o.isMesh) for (const m of [].concat(o.material)) if (m?.userData?.__burnU) burnU = m.userData.__burnU;
  });
  assert.ok(plate && burnU?.uCrOn.value, `vt4a1 ${build}: the kill seats a plate and dents the hull`);
  const dents = { centres: burnU.uCrHull.value, dirs: burnU.uCrHullDir.value };
  const seat = plate.userData.turretRingSeat;
  // the hull's dented meshes as drawn (LOD level 0, visible), in the hull frame
  const meshes = [];
  const stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (o.visible === false || o.name === 'rig_turret') continue;
    if (o.isLOD && o.levels?.length) { stack.push(o.levels[0].object); continue; }
    stack.push(...o.children);
    if (!o.isMesh || o.isInstancedMesh || o.userData.turretRingPlate) continue;
    const same = o.matrixWorld.elements.every((v, i) => Math.abs(v - hull.matrixWorld.elements[i]) < 1e-4);
    if (same && [].concat(o.material).some((m) => m?.userData?.__burnU === burnU)) meshes.push(o);
  }
  const bases = meshes.map((o) => (held.get(o) !== o.geometry ? held.get(o).getAttribute('position').count : Infinity));
  assert.ok(bases.some(Number.isFinite), `vt4a1 ${build}: the kill cut the hull`);
  const near = (x, y, z) => Math.hypot(x - seat.cx, z - seat.cz) <= seat.rimR + 0.36 + 0.01;
  const result = seams(meshes, dents, (m, i) => i >= bases[m], { ownEdges: true, near });
  assert.ok(result.worst < 1e-4, `vt4a1 ${build} seed 77: no crack along an unsplit neighbour's edge (${result.checked} T-corners, worst ${result.worst.toFixed(5)} m at ${result.worstAt})`);
  // the same kill cuts the same hull: a rematch frees the cut copies, the next kill makes them again
  const first = meshes.map((o) => o.geometry.getAttribute('position').array.slice());
  visual.resetDestroyed();
  visual.setDestroyed({ pop: true, ageS: 1000 });
  meshes.forEach((o, m) => assert.deepEqual(o.geometry.getAttribute('position').array, first[m], `vt4a1 ${build}: ${o.name} cut the same again`));
  visual.dispose();
}
// ---- (244) the MBT-70's ring held inside its hull's sides ------------------------------------------------------------
{
  await ensureTankBuilder('mbt70');
  const cap = TURRET_RING_SIDE_CAPS.mbt70;
  assert.ok(cap > 0, 'the MBT-70 carries a side cap');
  const visual = createTank('mbt70', null, { camoSeed: 77, quality: 'low', geometryQuality: 'low', batchStatic: true,
    battleDetailLod: true, eraVisualBindingReceipt: false });
  const hull = visual.root.getObjectByName('rig_hull'), turret = visual.root.getObjectByName('rig_turret');
  const uncapped = measureTurretRing(hull, turret, turretRingRadius(getSpec('mbt70').armor));
  assert.ok(uncapped.rimR > cap + 0.1, `the uncapped race runs out past the hull's sides (${uncapped.rimR})`);
  // 247: the MBT-70's calibration row carries its ring receipt now (triangle-guns' seated rows; gen-combat-anatomy
  // measures it under the same cap), so the live seat reads the receipt; a build without one measures, capped alike
  const seat = visual.turretRingSeat();
  assert.equal(seat.source, 'receipt', 'the calibration receipt, measured under the cap');
  assert.ok(seat.rimR <= cap + 1e-9, `the live seat is held inside them (${seat.rimR} <= ${cap})`);
  const measured = measureTurretRing(hull, turret, turretRingRadius(getSpec('mbt70').armor), { rimCap: cap });
  assert.ok(measured.rimR <= cap + 1e-9, `the receiptless measure takes the cap too (${measured.rimR} <= ${cap})`);
  visual.setDestroyed({ pop: true, ageS: 1000 });
  let plate = null;
  visual.root.traverse((o) => { if (o.userData?.turretRingPlate) plate = o; });
  assert.ok(plate && plate.userData.turretRingSeat.rimR <= cap + 1e-9, 'and the kill\'s plate and cut with it');
  visual.dispose();
}
console.log('turretRingWatertight selftest: ok');
