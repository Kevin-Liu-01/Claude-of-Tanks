// The collapse as bodies end to end (dcore 2026-10-10; fx/collapseBodies.ts over the physics lane's debris pool), with
// a building's own triangles as the world's merged bucket holds them:
//   - a shaft is taken: one body of its drums (wave cb-3 filmed the scripted topple on both arms — the bodies declined
//     every plan of fewer than three pieces, and a shaft's plan is one glued piece);
//   - a house is taken, and a building with no storeys is left to the scripted collapse;
//   - each taken collapse stands its pieces in its place (ready runs), draws them in the fx group, comes down and lies
//     low: the shaft's top drum on the ground toward the blow, the house's upper pieces off its upper storeys.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from '../world/maps/regional/index.ts';
import { streamFrom } from '../world/maps/regional/geometry.ts';
import { structureDamageKitChain } from '../world/destructionKit.ts';
import { createCollapseBodies } from './collapseBodies.ts';
import { createDebrisPhysics } from './debrisPhysics.ts';

const material = new THREE.MeshStandardMaterial();

/** A regional building's seam at the origin: its anatomy and its triangles as one merged bucket (world space). */
function seamOf(styleId, id, [w, d, h], structureIdx) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  assert.ok(style?.builders[id], `${styleId}/${id}: a builder`);
  const seed = 7;
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
  const describe = structureDamageKitChain(id, styleId).find((k) => k.describe)?.describe;
  const anatomy = describe?.({ structureIdx, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 5, kitPlan: regionalKitPlanOf(parts) });
  assert.ok(anatomy?.storeys?.length, `${styleId}/${id}: an anatomy with storeys`);
  const pos = [], nrm = [];
  for (const geos of Object.values(parts)) {
    if (!Array.isArray(geos)) continue;
    for (const g0 of geos) {
      if (!g0?.attributes?.position) continue;
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return { structureIdx, anatomy, spans: [{ mesh: new THREE.Mesh(geometry, material), bucket: 'stone', first: 0, count: pos.length / 3 }], touchShadows() {} };
}

function bodiesOver() {
  const group = new THREE.Group();
  const bodies = createCollapseBodies({
    pool: createDebrisPhysics({ capacity: 96 }), group, materialFor: () => material, groundAt: () => 0, environment: () => null,
    // the budget never runs out here: the clock stands still (a frame's preparation is the whole cut)
    now: () => 0,
  });
  return { bodies, group };
}
/** Where a collapse's pieces are drawn, world space (a live piece's mesh through its pose; a baked one is world space). */
function fallenBox(group, idx) {
  const box = new THREE.Box3(), one = new THREE.Box3();
  let n = 0;
  for (const m of group.children) {
    if (!m.name.startsWith('fx-collapse-') || m.name.startsWith('fx-collapse-remnant') || !m.name.includes(`-${idx}`)) continue;
    m.geometry.computeBoundingBox();
    one.copy(m.geometry.boundingBox).applyMatrix4(m.matrix);
    box.union(one);
    n++;
  }
  return { box, n };
}
/** The mean height of a collapse's drawn triangles, world space (what came down, weighted by how much of it there is). */
function meanHeight(group, idx) {
  let sum = 0, count = 0;
  const v = new THREE.Vector3();
  for (const m of group.children) {
    if (!m.name.startsWith('fx-collapse-') || m.name.startsWith('fx-collapse-remnant') || !m.name.includes(`-${idx}`)) continue;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrix); sum += v.y; count++; }
  }
  return count ? sum / count : NaN;
}

// a shaft: taken whole, toppled toward the blow (the rounds come from -x, travelling +x: it goes over toward -x)
{
  const seam = seamOf('breton', 'tower', [5, 5, 18], 6);
  const { bodies, group } = bodiesOver();
  let ready = 0;
  const e = { structureId: 6, cause: 'blast', x: -4, y: 2, z: 0, dirX: 1, dirZ: 0 };
  assert.equal(bodies.collapse(seam, e, [], () => material, () => { ready++; }), true, 'a shaft comes down as bodies (one body of its drums)');
  for (let i = 0; i < 6; i++) bodies.update(1 / 60);
  assert.equal(ready, 1, 'its pieces stand in its place once');
  assert.ok(bodies.took(6), 'it is taken (its dust is the pieces\')');
  const stats = bodies.stats();
  assert.ok(stats.pieces >= 1 && stats.meshes >= 2, `its body and its meshes (${JSON.stringify(stats)})`);
  const before = fallenBox(group, 6);
  assert.ok(before.n >= 2 && before.box.max.y > 15, `it stands in its place first (${before.n} meshes, top ${before.box.max.y.toFixed(1)} m)`);
  for (let i = 0; i < 60 * 9; i++) bodies.update(1 / 60);
  const after = fallenBox(group, 6);
  assert.ok(after.n >= 1 && after.box.max.y < 7, `it lies on the ground (top ${before.box.max.y.toFixed(1)} m -> ${after.box.max.y.toFixed(1)} m)`);
  assert.ok(after.box.min.x < -8 && after.box.max.x < 6, `toward the blow (x ${after.box.min.x.toFixed(1)}..${after.box.max.x.toFixed(1)})`);
  console.log(`  breton/tower: taken, ${stats.meshes} meshes, top ${before.box.max.y.toFixed(1)} m -> ${after.box.max.y.toFixed(1)} m, lying x ${after.box.min.x.toFixed(1)}..${after.box.max.x.toFixed(1)}`);
}
// a house: taken, its upper pieces come down
{
  const seam = seamOf('hessian', 'cottage', [8, 10, 6.5], 7);
  const { bodies, group } = bodiesOver();
  let ready = 0;
  assert.equal(bodies.collapse(seam, { structureId: 7, cause: 'blast', x: 0, y: 2, z: 6, dirX: 0, dirZ: -1 }, [], () => material, () => { ready++; }), true,
    'a house comes down as bodies');
  for (let i = 0; i < 12; i++) bodies.update(1 / 60);
  assert.equal(ready, 1, 'its pieces stand in its place once');
  const standing = meanHeight(group, 7);
  for (let i = 0; i < 60 * 10; i++) bodies.update(1 / 60);
  // (its heap rises under its pieces in the pool's ground, the drawn ground here flat: pieces lie in it as in the heap)
  const lying = meanHeight(group, 7);
  assert.ok(standing > 3 && lying < standing * 0.45, `it came down (its pieces' mean height ${standing.toFixed(2)} m standing, ${lying.toFixed(2)} m after 10 s)`);
  console.log(`  hessian/cottage: taken, its pieces' mean height ${standing.toFixed(2)} m standing -> ${lying.toFixed(2)} m after 10 s`);
}
// no storeys: the scripted collapse
{
  const { bodies } = bodiesOver();
  const seam = seamOf('hessian', 'cottage', [8, 10, 6.5], 8);
  const bare = { ...seam, anatomy: { ...seam.anatomy, storeys: [] } };
  assert.equal(bodies.collapse(bare, { structureId: 8, cause: 'blast', x: 0, y: 2, z: 6, dirX: 0, dirZ: -1 }, [], () => material), false,
    'a building with no storeys keeps its scripted collapse');
  assert.equal(bodies.took(8), false, 'and is not taken');
}
console.log('collapseBodies: a shaft (one body of its drums) and a house come down as bodies, stand in their place and lie low; '
  + 'a building with no storeys keeps the scripted collapse PASS');
