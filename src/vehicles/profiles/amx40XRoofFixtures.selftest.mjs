import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const near = (value, target, tolerance, label) => assert.ok(Number.isFinite(value)
  && Math.abs(value - target) < tolerance, `${label}: ${value}; source ${target} ± ${tolerance}`);
const ray = (meshes, p, d, far = 5) => new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d), 0, far).intersectObjects(meshes, false)[0];

function gripChecks(all, detail, turret) {
  for (const [x, z, upper, lower] of [[1.18, .10, 2.387001, 2.3606212],
    [1.24, .09, 2.3642762, 2.3235372], [1.29, .085, 2.2999401, 2.2491257]]) {
    near(ray(all, [x, 3, z], [0, -1, 0])?.point.y, upper, .003, 'actual source grip crown');
    near(ray(all, [x, 2.22, z], [0, 1, 0])?.point.y, lower, .003, 'real curved grip underside');
  }
  near(ray([detail], [1.16, 2.3, .30], [0, 0, -1])?.point.z, .12945, .002,
    'actual source front support skin');
  assert.equal(ray(all, [1.24, 2.26, -.05], [0, 0, 1], .25), undefined,
    'large source outboard opening is genuinely empty');
  const foot = ray([detail], [1.104, 2.332, 0], [0, 0, 1])?.point.z;
  const core = ray([turret], [1.104, 2.332, .4], [0, 0, -1])?.point.z;
  assert.ok(core - foot > .004 && core - foot < .04, `actual grip root seats in retained casting: ${foot}/${core}`);
}

function sightChecks(all, detail, turret) {
  for (const [x, z, top] of [[.60, -.42, 2.5801868], [.70, -.42, 2.5892899]])
    near(ray(all, [x, 3, z], [0, -1, 0])?.point.y, top, .001, 'source oblique case crown/bevel');
  for (const [x, glassZ] of [[.70, -.4769755], [.72, -.4618933]]) {
    const hit = ray(all, [x, 2.54, -1], [0, 0, 1]);
    assert.equal(hit?.object.name, 'turretGlass', 'actual rear-facing recessed glass is first');
    near(hit?.point.z, glassZ, .001, 'source oblique glass plane');
    assert.equal(ray(all, [x, 2.54, glassZ - .020], [0, 0, 1], .017), undefined,
      'real approach air before the angled window');
  }
  near(ray(all, [.7, 2.5, -.8], [0, 0, 1])?.point.z, -.4793717, .003,
    'source solid wall below the rear window');
  const flange = ray([detail], [.70, 2.427, -.45], [0, -1, 0])?.point.y;
  const caseFoot = ray([detail], [.70, 2.419, -.45], [0, 1, 0])?.point.y;
  near(flange, 2.42229, .0001, 'actual source flange crown');
  near(caseFoot, 2.42129, .0001, 'case concealed engagement allowance');
  assert.ok(flange - caseFoot > .0009, 'case engages its actual flange');
  near(ray([detail], [.3, 3, -.4], [0, -1, 0])?.point.y, 2.40129, .0001, 'source service skin supports flange');
  const plateFoot = ray([detail], [.3, 2.38, -.4], [0, 1, 0])?.point.y;
  const roof = ray([turret], [.3, 2.41, -.4], [0, -1, 0])?.point.y;
  assert.ok(roof > plateFoot && roof - plateFoot < .005, 'source service skin seats on retained roof');
}

function weaponChecks(all, dark, detail) {
  near(ray(all, [-1.30, 3, .10], [0, -1, 0])?.point.y, 2.5784617, .0015,
    'source outer MG side roller crown');
  near(ray(all, [-1.28, 3, .23], [0, -1, 0])?.point.y, 2.6531415, .0015,
    'source MG adjusting disk crown');
  near(ray([detail], [-1.30, 2.54, .10], [0, -1, 0])?.point.y, 2.5327058, .001,
    'real thin tray floor beneath the rollers');
  assert.equal(ray(all, [-1.30, 2.60, .10], [0, 0, 1], .07), undefined,
    'source air above the side roller is not filled by the old equipment box');
  for (const x of [-1.30909, -1.25629]) {
    const floor = ray([detail], [x, 2.54, .276], [0, -1, 0])?.point.y;
    const stock = ray([dark], [x, 2.529, .276], [0, 1, 0])?.point.y;
    assert.ok(floor - stock > .0005, 'each actual roller end positively seats on its tray');
  }
  const rollerTop = ray([dark], [-1.27, 2.6, .23], [0, -1, 0])?.point.y;
  const diskBottom = ray([detail], [-1.27, 2.54, .23], [0, 1, 0])?.point.y;
  assert.ok(rollerTop > diskBottom + .001, 'actual adjusting disk engages the paired roller');
  const receiverLeft = ray([dark], [-1.4, 2.60, .01], [1, 0, 0])?.point.x;
  const wallLeft = ray([detail], [-1.4, 2.60, .01], [1, 0, 0])?.point.x;
  const wallRight = ray([detail], [-1.0, 2.60, .01], [-1, 0, 0])?.point.x;
  const receiverRight = ray([dark], [-1.0, 2.60, .01], [-1, 0, 0])?.point.x;
  assert.ok(receiverLeft < wallLeft && wallRight < receiverRight, 'thin tray web physically engages unchanged receiver');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('amx40_x', null, { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const all = [];
    tank.root.traverse(m => { if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) all.push(m); });
    const detail = tank.root.getObjectByName('turretDetail'), turret = tank.root.getObjectByName('turret');
    const weaponDetail = tank.root.getObjectByName('sourceMachineGun_turretDetail');
    const weaponDark = tank.root.getObjectByName('sourceMachineGun_turretDark');
    assert.ok(weaponDetail && weaponDark && weaponDetail.parent === weaponDark.parent,
      'all actual weapon-side solids retain the one real firing owner');
    gripChecks(all, detail, turret);
    sightChecks(all, detail, turret);
    weaponChecks(all, weaponDark, weaponDetail);
    const yaw = tank.root.getObjectByName('rig_turret');
    const before = ray(all, [-1.30, 3, .10], [0, -1, 0]).point.clone();
    yaw.rotation.y = .5; tank.root.getObjectByName('rig_gun').rotation.x = -.12;
    tank.root.updateMatrixWorld(true);
    const expected = before.clone().sub(yaw.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), .5).add(yaw.position);
    near(ray([weaponDark], [expected.x, 3, expected.z], [0, -1, 0])?.point.y,
      expected.y, .0001, 'real MG mechanism follows turret yaw independently of main gun pitch');
  } finally { tank.dispose(); }
}
console.log('amx40XRoofFixtures: actual high/low source grip, oblique optic, weapon tray/rollers, air, seating and owners pass');
