// 279 (slab-mirror): the end-of-build slab settle (slabDiagonalSettle.ts) on one id per call site the census ranked
// worst (the Challenger 2E's front wedge cheeks, challenger.ts; the Abrams hull slabs, abrams.ts; a KIT orientedSlab,
// kit.ts). Read on the drawn meshes: with the settle, no twisted slab quad draws the other diagonal from its mirror twin;
// with it off (the control), the same census finds the pairs. And the CR2's cheeks: inward rays at the cassette heights
// meet the turret shell at mirrored depths on both sides (the L side stood 7-14 mm out before; fleet-debt-279).
// The whole fleet runs as fleetPassHigh's slabMirrorDiagonal audit.
import assert from 'node:assert/strict';
import { Raycaster, Vector3 } from 'three';
import { slabMirrorCensus } from './slabDiagonalSettle.ts';
import { createTank } from './tankFactory.ts';

const BUILD = { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true, batchStatic: false };
const IDS = ['challenger2e', 'abramsx', 'fv510'];

function cheekDepths(root) {
  root.updateMatrixWorld(true);
  const turret = root.getObjectByName('rig_turret');
  const shells = [];
  turret.traverse((object) => { if (object.isMesh && object.name === 'turret') shells.push(object); });
  const toTurret = turret.matrixWorld.clone().invert(), ray = new Raycaster();
  const rows = [];
  for (const [y, z] of [[0.11, 1.5], [0.11, 1.63], [0.18, 1.55]]) {
    const depth = {};
    for (const side of [-1, 1]) {
      ray.set(new Vector3(side * 2.2, y, z).applyMatrix4(turret.matrixWorld), new Vector3(-side, 0, 0).transformDirection(turret.matrixWorld));
      ray.far = 2.2;
      const hit = ray.intersectObjects(shells, false)[0];
      assert.ok(hit, `challenger2e: a ray at y ${y} z ${z} meets the ${side < 0 ? 'L' : 'R'} cheek`);
      depth[side < 0 ? 'L' : 'R'] = Math.abs(hit.point.clone().applyMatrix4(toTurret).x);
    }
    rows.push({ y, z, ...depth });
  }
  return rows;
}

for (const id of IDS) {
  const results = {};
  for (const settle of [true, false]) {
    const tank = createTank(id, null, { ...BUILD, slabDiagonalSettle: settle });
    const census = slabMirrorCensus(tank.root);
    const meshes = [];
    tank.root.traverse((object) => { if (object.isMesh && object.geometry?.userData?.slabQuads) meshes.push(object); });
    results[settle ? 'on' : 'off'] = { pairs: census.pairs.length, census,
      drawn: meshes.map((mesh) => ({ name: mesh.name, position: Float32Array.from(mesh.geometry.attributes.position.array) })), worstMm: Math.max(0, ...census.pairs.map((pair) => pair.gapMm)),
      agreeing: census.agreeingPairs, nonConvex: census.nonConvex, settled: tank.root.userData.slabDiagonalSettle?.pairs ?? 0,
      cheeks: id === 'challenger2e' ? cheekDepths(tank.root) : null };
    tank.dispose?.();
  }
  const brief = ({ pairs, worstMm, agreeing, nonConvex, settled }) => JSON.stringify({ pairs, worstMm, agreeing, nonConvex, settled });
  console.log(`slabMirrorDiagonal ${id}: settle ${brief(results.on)}, control ${brief(results.off)}`);
  // every vertex of a slab-tagged mesh (what the settle may edit) that moved lies in a quad of a class the control finds;
  // the rest are byte-identical (meshes seated on the drawn skin later, the markings, follow the settled surface)
  assert.deepEqual(results.on.drawn.map((mesh) => mesh.name), results.off.drawn.map((mesh) => mesh.name), `${id}: same meshes`);
  const allowed = new Map();
  for (const pair of results.off.census.pairs) {
    const set = allowed.get(pair.mesh) ?? new Set();
    for (const start of pair.starts) for (let k = 0; k < 6; k++) set.add(start + k);
    allowed.set(pair.mesh, set);
  }
  let moved = 0;
  results.on.drawn.forEach((mesh, m) => {
    const before = results.off.drawn[m].position;
    assert.equal(mesh.position.length, before.length, `${id}/${mesh.name}: same vertex count`);
    for (let i = 0; i < before.length; i++) {
      if (mesh.position[i] === before[i]) continue;
      const vertex = Math.floor(i / 3);
      assert.ok(allowed.get(mesh.name)?.has(vertex), `${id}/${mesh.name}: vertex ${vertex} moved outside every mirror-disagreeing pair`);
      if (i % 3 === 0) moved++;
    }
  });
  assert.ok(moved > 0, `${id}: the settle moved drawn vertices`);
  assert.equal(results.on.pairs, 0, `${id}: no twisted slab quad draws the other diagonal from its mirror twin`);
  assert.ok(results.off.pairs > 0, `${id}: the control (settle off) finds the mirror-disagreeing pairs`);
  assert.equal(results.on.settled, results.off.pairs, `${id}: the settle turned the pairs the control finds`);
  assert.equal(results.on.agreeing, results.off.agreeing + results.off.pairs,
    `${id}: the settled pairs now agree, beside the ones that already did`);
  assert.equal(results.on.nonConvex, results.off.nonConvex, `${id}: non-convex faces are left as built`);
  if (results.on.cheeks) {
    for (const row of results.on.cheeks) {
      assert.ok(Math.abs(row.L - row.R) < 1e-3, `challenger2e: cheek shell at y ${row.y} z ${row.z} mirrored (L ${row.L.toFixed(4)} R ${row.R.toFixed(4)})`);
    }
    assert.ok(results.off.cheeks.some((row) => Math.abs(row.L - row.R) > 5e-3), 'challenger2e: the control keeps the 7-14 mm cheek asymmetry');
  }
}
console.log('slabMirrorDiagonal: PASS');
