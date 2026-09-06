import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const SOURCE_AXES = [
  ['t90a_x', .632, 2.656, 1.527],
  ['t90a_vladimir_x', -.6125, 2.7254, 1.83385],
  ['t90m_x', -.154, 2.763, -.132],
  ['t90sm_x', .584, 3.035, -.533],
];
for (const quality of ['high', 'low']) for (const [id, x, y, muzzleZ] of SOURCE_AXES) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality });
  const disposals = [];
  try {
    tank.root.updateMatrixWorld(true);
    const fitting = tank.root.getObjectByName('fitting_pintleMG_exact');
    assert.ok(fitting?.userData.fittingRoot && fitting.userData.fittingExact, `${id}: actual exact weapon fitting`);
    assert.equal(fitting.parent.name, 'rig_turret');
    assert.deepEqual(fitting.userData.barrelAxisLocal, [0, 0, 1]);
    assert.equal(fitting.userData.barrelElevationRad, 0);
    let visibleMeshes = 0, triangles = 0;
    fitting.traverse(node => {
      if (!node.isMesh) return;
      visibleMeshes++;
      triangles += node.geometry.attributes.position.count/3;
      assert.equal(node.userData.fitting, 'pintleMG');
      assert.equal(node.userData.combatHitboxRole, 'equipment');
      assert.equal(node.visible, true);
      const counter = { calls: 0 };
      node.geometry.addEventListener('dispose', () => counter.calls++);
      disposals.push(counter);
    });
    assert.equal(visibleMeshes, 2, `${id}: merged receiver, tube and real support parts; no marker-only census`);
    assert.ok(triangles > 100);
    const hit = new THREE.Raycaster(new THREE.Vector3(x, y, 2.2), new THREE.Vector3(0, 0, -1))
      .intersectObject(fitting, true)[0];
    assert.ok(Math.abs(hit?.point.z-muzzleZ) < .001, `${id}: source tube endpoint remains seated on its actual axis`);
  } finally { tank.dispose(); }
  assert.ok(disposals.every(counter => counter.calls === 1), `${id}: each exact fitting geometry is disposed exactly once`);
}
console.log('sourceMachineGun: four visible exact weapons, source axes, real rig ownership and disposal pass high/low');
