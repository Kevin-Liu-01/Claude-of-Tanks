// Release 264 (Main's ruling on the Challenger 3 TD's front hull, packet r12): the oracle draws a Hydrogas unit at every
// station (Object_17: a web from over the wheel to a 0.61 m sill ahead of it and the pivot block) and no arm under it,
// so the TD's units stand on that casting and the moving suspension keeps out from under them. On both ids at both
// qualities: every station carries its unit on both sides (the block's sill at the tub wall and at the track lane's
// inner edge), no vertex of the arms or their bosses inboard of the track lane (|x| 1.203) stands under the 0.61 m sill,
// and the fleet wheel audit, its measured arm-to-wheel clearance included, is clean. An arm moved 0.10 m inboard fails.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { auditTankWheelQuality } from '../wheelQuality.ts';
import { measureSpatialArmClearance } from '../suspensionClearance.ts';

const S = 1.10, DZ = 0.195;
const STATIONS = [-2.571, -1.448, -0.537, 0.540, 1.434, 2.363];
const SILL_Y = 0.555 * S, LANE_X = 1.094 * S + 0.0005, UNIT_X = [0.915 * S, 1.090 * S];

function lowestInboard(root) {
  const m = new THREE.Matrix4(), w = new THREE.Matrix4(), v = new THREE.Vector3();
  let lowest = Infinity;
  for (const name of ['gearSuspensionLinks', 'gearSuspensionJointBosses']) {
    const mesh = root.getObjectByName(name), pos = mesh.geometry.getAttribute('position');
    for (let k = 0; k < mesh.count; k++) {
      mesh.getMatrixAt(k, m); w.multiplyMatrices(mesh.matrixWorld, m);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(w);
        if (Math.abs(v.x) < LANE_X) lowest = Math.min(lowest, v.y);
      }
    }
  }
  return lowest;
}

function unitSills(root) {
  const found = new Set(), v = new THREE.Vector3();
  root.getObjectByName('rig_hull').traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
    const pos = o.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(v.y - SILL_Y) > 0.002 || !UNIT_X.some((x) => Math.abs(Math.abs(v.x) - x) < 0.002)) continue;
      const s = STATIONS.findIndex((z) => v.z > (z + DZ + 0.27) * S && v.z < (z + DZ + 0.57) * S);
      if (s >= 0) found.add(`${Math.sign(v.x)}:${s}:${Math.abs(Math.abs(v.x) - UNIT_X[0]) < 0.002 ? 'tub' : 'lane'}`);
    }
  });
  return found;
}

for (const id of ['challenger3_td', 'challenger3_td_rws']) for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { quality, proceduralOnly: true, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    assert.equal(unitSills(tank.root).size, STATIONS.length * 2 * 2, `${id}/${quality}: a unit at every station, both faces, both sides`);
    const lowest = lowestInboard(tank.root);
    assert.ok(lowest >= SILL_Y - 1e-4, `${id}/${quality}: the suspension inboard of the track lane reaches ${lowest.toFixed(3)} m, under the units' ${SILL_Y.toFixed(3)} m sill`);
    assert.deepEqual(auditTankWheelQuality(tank.root).issues, [], `${id}/${quality}: the fleet wheel audit`);
    const arm = tank.root.getObjectByName('gearSuspensionLinks');
    for (const side of ['left', 'right']) {
      assert.ok(measureSpatialArmClearance(arm, side).minimumM >= 0.02, `${id}/${quality}: ${side} arms clear their wheels by 2 cm`);
    }
    // negative control: the arms 0.10 m inboard reach under the sill
    const m = new THREE.Matrix4();
    for (let k = 0; k < arm.count; k++) {
      arm.getMatrixAt(k, m); m.elements[12] -= Math.sign(m.elements[12]) * 0.10; arm.setMatrixAt(k, m);
    }
    assert.ok(lowestInboard(tank.root) < SILL_Y - 0.05, `${id}/${quality}: an arm moved inboard is caught`);
    console.log(`${id}/${quality}: units at 6 stations a side; the suspension inboard of the track lane stays over ${lowest.toFixed(3)} m`);
  } finally { tank.dispose(); }
}
console.log('challenger3TdSuspension: the oracle\'s Hydrogas units, the arms in the track lane\'s shadow, wheel clearance and a moved-arm negative');
