import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

const near = (value, expected, tolerance, label) => assert.ok(Number.isFinite(value)
  && Math.abs(value - expected) <= tolerance, `${label}: ${value}; source ${expected} ± ${tolerance}`);
const ray = (meshes, origin, direction, far = 10) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far).intersectObjects(meshes, false)[0];

function heldOutSurfaces(all) {
  // These first-surface witnesses are independent of the assembly's loft
  // stations and include the complete source across its material islands.
  for (const [x, z, y, tolerance] of [[-1.2, -1.45, 2.208147, .001],
    [-1.1, -1.2, 2.2498553, .001], [-1.2, -.55, 2.1958403, .001],
    [-1.3, -.55, 2.1431332, .001], [-1.02, -.25, 2.3637141, .0001],
    [-.85, -.22, 2.3643522, .0001], [-.52, -.12, 2.2083974, .0001],
    [-.45, -.08, 2.207749, .0001], [-.98, .245, 2.1975135, .003],
    [-.985, .55, 2.2042692, .0001], [-.975, .67, 2.213315, .0001],
    [-.53, .73, 2.1979363, .0002], [-.95, .34, 2.1831245, .0001],
    [-1, -.08, 2.2946935, .0001], [-.94, -.06, 2.2747094, .0001],
    [-.85, .02, 2.1931528, .0001], [-1.4, -1.52, 2.2260103, .0001],
    [-1.4, -1.38, 2.1441387, .0001]])
    near(ray(all, [x, 3, z], [0, -1, 0])?.point.y, y, tolerance,
      'actual source port roof/canted rim/attached case/forward cover');
  for (const [z, x] of [[-.3, -1.1946293], [0, -1.1960231], [.3, -1.1974169],
    [.6, -1.1988108], [.8, -1.1345711], [.95, -1.0821652]])
    near(ray(all, [-1.5, 2.196, z], [1, 0, 0])?.point.x, x, .001,
      'separate folded low outboard lip stays at the source plane');
}

function wellAirAndContact(all, turret, detail) {
  for (const [x, z] of [[-.72, .4], [-.43, .54], [-.6, .22], [-.78, .11]]) {
    near(ray(all, [x, 2.4, z], [0, -1, 0])?.point.y, 2.0741854, .000001,
      'actual source depressed floor is not obscured by old armor or lid');
    assert.equal(ray(all, [x, 2.10, z], [0, 1, 0], .07), undefined,
      'real air above the floor remains open below the rim');
    const low = ray([detail], [x, 1.9, z], [0, 1, 0])?.point.y;
    const roof = ray([turret], [x, 2.2, z], [0, -1, 0])?.point.y;
    assert.ok(low <= 2.004 && roof > low + .03, 'closed floor physically engages retained core');
  }
  const caseLeft = ray([detail], [-.8, 2.18, -.12], [1, 0, 0])?.point.x;
  const platformRight = ray([turret], [-.5, 2.18, -.12], [-1, 0, 0])?.point.x;
  assert.ok(caseLeft < platformRight && platformRight - caseLeft < .002,
    'concealed sub-2mm case wall extension positively seats on actual platform');
  const coverLow = ray([detail], [-.94, 2.24, -.06], [0, 1, 0])?.point.y;
  const coreTop = ray([turret], [-.94, 2.4, -.06], [0, -1, 0])?.point.y;
  assert.ok(coreTop > coverLow && coreTop - coverLow < .003,
    'actual thin forward cover seats on its retained slope without a floating lid');
  near(ray(all, [-1.4, 1.7, -1.52], [0, 1, 0])?.point.y, 1.7965186, .000001,
    'separate material underside closes the true clipped rear case');
  const caseCore = ray([turret], [-1.4, 2.3, -1.52], [0, -1, 0])?.point.y;
  assert.ok(caseCore > 1.83, 'rear case penetrates existing body and supported basket floor');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('leclerc_x', null, {quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false});
  try {
    tank.root.updateMatrixWorld(true);
    const all = [];
    tank.root.traverse(m => {if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) all.push(m);});
    heldOutSurfaces(all);
    const turret = tank.root.getObjectByName('turret'), detail = tank.root.getObjectByName('turretDetail');
    wellAirAndContact(all, turret, detail);
    near(tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).z,
      6.239235, .000001, 'cannon endpoint preserved');
    const yaw = tank.root.getObjectByName('rig_turret'), pivot = yaw.position.clone();
    const p = new THREE.Vector3(-.72, 2.0741854, .4).sub(pivot)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -.5).add(pivot);
    yaw.rotation.y = -.5; tank.root.getObjectByName('rig_gun').rotation.x = .1;
    tank.root.updateMatrixWorld(true);
    near(ray(all, [p.x, 2.4, p.z], [0, -1, 0])?.point.y, p.y, .000001,
      'actual well follows turret yaw independently of gun elevation');
  } finally {tank.dispose();}
}
console.log('leclercXPortRoof: high/low held-out source surfaces, genuine recessed floor/air, actual support and yaw ownership pass');
