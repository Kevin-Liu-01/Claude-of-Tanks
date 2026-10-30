import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

// 2026-10-30 (lane t90-family-266; the owner: "for all of these we can just take inspirration annd update from the
// later t90s we added that have far more accurate models"): each earlier T-90 mark builds from its source-X twin.
// This receipt holds that wiring: every hull, turret and gun part of the earlier mark is the twin's own part, in the
// rig's own frame (the 1.05 installed size, camouflage, markings and fills are per id and stay out of the comparison).
// The Burlak prototype rides the T-90A X hull under its own turret; the BMPT T-90 rides the T-90M X hull under its
// station: their hulls are compared alone.
const TWINS = Object.freeze([
  ['t90_1992', 't90', ['hull', 'turret', 'gun']],
  ['t90a_2004', 't90a', ['hull', 'turret', 'gun']],
  ['t90a_2006', 't90a_vladimir', ['hull', 'turret', 'gun']],
  ['t90ms_2011', 't90ms_tagil', ['hull', 'turret', 'gun']],
  ['t90sm_2013', 't90sm', ['hull', 'turret', 'gun']],
  ['t90m_proryv', 't90m', ['hull', 'turret', 'gun']],
  ['t90a_burlak_proto', 't90a', ['hull']],
  ['bmpt_t90', 't90m', ['hull']],
]);
const RIGS = { hull: 'rig_hull', turret: 'rig_turret', gun: 'rig_gun' };
const options = { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true };

const owned = (node, rig, others) => {
  for (let p = node; p; p = p.parent) {
    if (p === rig) return true;
    if (others.includes(p)) return false;
  }
  return false;
};

// Sorted per-part summaries: vertex count and position sums, in the rig's frame, rounded to 0.1 mm. Running gear,
// per-id overlays (interior fills, markings, decals) and ERA/equipment clones keyed by id are excluded.
function parts(tank, which) {
  tank.root.updateMatrixWorld(true);
  const rigs = Object.fromEntries(Object.entries(RIGS).map(([k, name]) => [k, tank.root.getObjectByName(name)]));
  const rig = rigs[which], others = Object.values(rigs).filter((r) => r && r !== rig);
  assert.ok(rig, `${tank.root.name}: ${RIGS[which]} present`);
  const inv = new THREE.Matrix4().copy(rig.matrixWorld).invert();
  const out = [], v = new THREE.Vector3(), m = new THREE.Matrix4();
  rig.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh || !owned(node, rig, others)) return;
    if (node.userData.interiorFill || node.userData.vehicleMarking || node.userData.decal) return;
    for (let p = node; p && p !== rig; p = p.parent) if (p.userData?.runningGear) return;
    const pos = node.geometry.getAttribute('position');
    if (!pos) return;
    m.multiplyMatrices(inv, node.matrixWorld);
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); sx += v.x; sy += v.y; sz += v.z; }
    out.push(`${node.name}:${pos.count}:${(sx / pos.count).toFixed(4)},${(sy / pos.count).toFixed(4)},${(sz / pos.count).toFixed(4)}`);
  });
  return out.sort();
}

for (const [id, twin, rigs] of TWINS) {
  const a = createTank(id, null, options), b = createTank(twin, null, options);
  try {
    for (const which of rigs) {
      const pa = parts(a, which), pb = parts(b, which);
      assert.ok(pa.length > 0, `${id}: ${which} has parts`);
      assert.deepEqual(pa, pb, `${id}: every ${which} part is its source-X twin ${twin}'s own`);
    }
  } finally {
    a.dispose(); b.dispose();
  }
}

console.log('t90XTwins.selftest: the earlier T-90 marks build from their source-X twins part for part');
