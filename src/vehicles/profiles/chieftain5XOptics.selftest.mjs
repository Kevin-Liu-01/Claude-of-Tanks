import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildChieftain5XPhotoDraft } from './chieftain5XPhotoDraft.ts';

// Historical photo optic dimensions remain tested without retargeting them.
registerProfiledBuilders({ chieftain5_x: buildChieftain5XPhotoDraft });

const near = (a, b, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 2e-6,
  `${label}: ${a} versus ${b}`);

function check(root) {
  const turret = root.getObjectByName('rig_turret');
  const physical = [];
  root.traverse(m => {
    if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) physical.push(m);
  });
  // Fixed nominal world witnesses follow the actual turret owner through yaw.
  const transform = new THREE.Matrix4().multiplyMatrices(turret.matrixWorld,
    new THREE.Matrix4().makeTranslation(0, -1.61, -.53));
  const ray = (point, direction, far = 2) => new THREE.Raycaster(
    new THREE.Vector3(...point).applyMatrix4(transform),
    new THREE.Vector3(...direction).transformDirection(transform), 0, far)
    .intersectObjects(physical, false)[0];
  for (let i = 0; i < 9; i++) {
    const a = i * 2 * Math.PI / 9;
    const direction = [-Math.sin(a), 0, -Math.cos(a)];
    const from = [.45 + Math.sin(a) * .40, 2.564, -.30 + Math.cos(a) * .40];
    const hit = ray(from, direction);
    assert.equal(hit?.object.name, 'turretGlass', 'all nine real windows have transparent first backing');
    near(hit.distance, .035, 'window glass is recessed behind its frame');
    assert.equal(ray(from, direction, .030), undefined, 'window approach contains real air');
    const jamb = [.45 + Math.sin(a) * .40 + Math.cos(a) * .040,
      2.564, -.30 + Math.cos(a) * .40 - Math.sin(a) * .040];
    const edge = ray(jamb, direction);
    assert.equal(edge?.object.name, 'turretDetail', 'window jamb is physical equipment, not paint');
    near(edge.distance, .0265, 'original radial window-case envelope preserved');
  }
  for (const [x, y, z] of [[.405, 2.673, .0652], [.49, 2.696, .0813]]) {
    const hit = ray([x, y, .20], [0, 0, -1]);
    assert.equal(hit?.object.name, 'turretGlass', 'inclined commander reflector is not hidden inside the old box');
    near(hit.distance, .20 - z, 'fixed inferred inclined glass surface');
    assert.equal(ray([x, y, .20], [0, 0, -1], .20 - z - .003), undefined,
      'retaining frame has a genuine front recess');
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const expected = new THREE.Vector3(0, -.7, 1).normalize().transformDirection(transform);
    assert.ok(normal.dot(expected) > .999999, 'reflector is geometrically inclined, not a texture on a flat box');
  }
  assert.equal(ray([.339, 2.683, .20], [0, 0, -1])?.object.name, 'turretDetail',
    'inclined front is bounded by a solid supporting cheek');
  const lowerSeat = ray([.45, 2.58, -.01], [0, 1, 0]);
  near(lowerSeat?.distance, .0145, 'existing lower optic seat retained');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('chieftain5_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    check(tank.root);
    const hull = tank.root.getObjectByName('hull'), before = hull.matrixWorld.clone();
    for (const yaw of [-.8, .7]) {
      tank.root.getObjectByName('rig_turret').rotation.y = yaw;
      tank.root.getObjectByName('rig_gun').rotation.x = -.16;
      tank.root.getObjectByName('rig_recoil').position.z = -.11;
      tank.root.updateMatrixWorld(true);
      check(tank.root);
      assert.deepEqual(hull.matrixWorld.elements, before.elements, 'turret optics do not alter hull ownership');
    }
  } finally { tank.dispose(); }
}
console.log('chieftain5XOptics.selftest: high/low nine real window recesses, inclined framed reflector, support and yaw ownership passed');
