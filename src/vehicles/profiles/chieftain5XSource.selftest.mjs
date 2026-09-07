import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { auditTankWheelQuality } from '../wheelQuality.ts';
import { CHIEFTAIN5_X_DATUMS } from './chieftain5X.ts';
import { chieftain5SourceSmokeMouths } from './chieftain5XSourceApplique.ts';

// This tests the CURRENT actual-ID supplied-file construction, not the
// historical photo fixture. Canonical source SHA2a781a79…268e79 retained all
// eleven material-batch owners. Fixed scalar witnesses came from that source.
// Warped source axes/cup banks are explicitly regularized construction, and
// these focused checks do not assert whole-model silhouette qualification.
const D = CHIEFTAIN5_X_DATUMS.chieftain5_x;
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a)
  && Math.abs(a - b) <= tolerance, `${label}: ${a}; expected ${b} ±${tolerance}`);
const cast = (objects, origin, direction, far = 12) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize(), 0, far)
  .intersectObjects(objects, false)[0];
function physical(root) {
  const parts = [];
  root.traverse(m => { if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) parts.push(m); });
  return parts;
}

function sourceScalars(tank, all) {
  near(cast(all, [0, 0, 0], [0, 1, 0])?.point.y, .4992064265, .00015,
    'complete-source centerline dished belly witness');
  near(tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3()).z,
    6.8120532036, .000002, 'source physical muzzle, not an inner stock');
  const barrel = all.filter(m => m.name === 'gunDark');
  near(cast(barrel, [-.008067, 1.859441, 7.1], [0, 0, -1])?.point.z,
    6.24935, .000003, 'measured recessed source bore floor');
  for (const [r, x] of [[.19, 1.334176], [.22, 1.334176], [.29, 1.392437], [.31, 1.392437]]) {
    const positive = cast(all, [1.58, .4481615 + r, -2.230051], [-1, 0, 0]);
    assert.equal(positive?.object.name, 'gearMk5SourceDishR');
    near(positive?.point.x, x, .00002, 'held-out source radial dish surface with outward winding');
    assert.equal(cast(all, [1.58, .4481615 + r, -2.230051], [-1, 0, 0], 1.58 - x - .001),
      undefined, 'genuine approach air before the recessed dish');
  }
  assert.equal(cast(all, [0, 2.25, 1.8], [0, 0, -1], .38), undefined,
    'complete source has genuine upper gun-root approach air');
  assert.equal(cast(all, [-1.45, 2.02, -.80], [1, 0, 0], .35), undefined,
    'source open port basket cells are not a filled block');
  near(cast(all, [0, 1.50, 2.1], [0, 0, -1])?.point.z, 1.9378498793, .0002,
    'source driver glazing plane remains exposed');
}

function upperAir(tank, all) {
  const turret = tank.root.getObjectByName('rig_turret');
  const frame = turret.matrixWorld.clone().multiply(new THREE.Matrix4()
    .makeTranslation(-D.turretPivot[0], -D.turretPivot[1], -D.turretPivot[2]));
  const hit = (p, d, far = 2) => cast(all, new THREE.Vector3(...p).applyMatrix4(frame).toArray(),
    new THREE.Vector3(...d).transformDirection(frame).toArray(), far);
  for (const [x, y, start, depth] of [[-.8129645, 2.6204, 0, .15864908695],
    [-.668209, 2.25649, .5, .10965136899]]) {
    const lens = hit([x, y, start], [0, 0, -1]);
    assert.equal(lens?.object.name, 'turretGlass', 'source first visible surface is glass, not case');
    near(lens?.distance, depth, .000003, 'actual source projector/gunner lens depth');
    assert.equal(hit([x, y, start], [0, 0, -1], depth - .004), undefined,
      'source optical approach remains geometric air during yaw');
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, s = Math.sin(a), c = Math.cos(a);
    const origin = [-.476844 + s * .455, 2.4008, -.45533 + c * .455];
    const lens = hit(origin, [-s, 0, -c]);
    assert.equal(lens?.object.name, 'turretGlass', 'eight regularized source cupola windows are physically visible');
    near(lens.distance, .041, .000003, 'documented nominal window recess');
    assert.equal(hit(origin, [-s, 0, -c], .036), undefined, 'cupola window has real approach air');
  }
  const mouths = chieftain5SourceSmokeMouths();
  assert.equal(mouths.length, 16, 'supplied source eight-mouth banks supersede photo six-cup fixture');
  for (const { center, axis } of mouths) {
    const u = new THREE.Vector3(0, 1, 0).cross(axis).normalize(), v = axis.clone().cross(u).normalize();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const origin = center.clone().addScaledVector(axis, .025)
        .addScaledVector(u, .022 * Math.cos(a)).addScaledVector(v, .022 * Math.sin(a));
      const stock = hit(origin.toArray(), axis.clone().negate().toArray());
      assert.equal(stock?.object.name, 'turretDark', 'each radial bore ray reaches its own stock');
      near(stock.distance, .204, .000004, 'nominal regularized source launcher depth');
      assert.equal(hit(origin.toArray(), axis.clone().negate().toArray(), .198), undefined,
        'carrier and main cheek cannot fill any launcher mouth');
    }
  }
}

for (const quality of ['high', 'low']) {
  let gear;
  const original = KIT.buildRunningGear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  let tank;
  try { tank = createTank('chieftain5_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false }); } finally { KIT.buildRunningGear = original; }
  try {
    tank.root.updateMatrixWorld(true);
    const all = physical(tank.root);
    sourceScalars(tank, all);
    assert.deepEqual(auditTankWheelQuality(tank.root).issues, [], 'unmodified strict wheel mechanics audit');
    assert.deepEqual(gear.roadWheelLayout.wheelZs, [-2.230051, -1.339106, -.420375, .470570, 1.491482, 2.382427],
      'all six independently measured source road stations are retained');
    near(gear.roadWheelLayout.wheelY, .4481615, .000001, 'source road-axis height');
    assert.ok(!all.some(m => m.name.startsWith('sourceMachineGun_')),
      'source projector is not mislabeled as an absent complete weapon');
    const yaw = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const recoil = tank.root.getObjectByName('rig_recoil'), hull = tank.root.getObjectByName('hull');
    assert.equal(tank.root.getObjectByName('gunMount').parent, gun);
    assert.equal(tank.root.getObjectByName('gun').parent, recoil);
    const fixedHull = hull.matrixWorld.elements.slice();
    for (const angle of [0, -.7, .65]) {
      yaw.rotation.y = angle; gun.rotation.x = -.14;
      gear.update(.18, -.24, 0); tank.root.updateMatrixWorld(true);
      upperAir(tank, all);
      assert.deepEqual(hull.matrixWorld.elements, fixedHull, 'turret attachments do not move the hull');
      const before = tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.105; tank.root.updateMatrixWorld(true);
      near(before.distanceTo(tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3())),
        .105, .000002, 'physical bore/muzzle remain attached during recoil');
      recoil.position.z = 0;
    }
  } finally { tank.dispose(); }
}
console.log('chieftain5XSource.selftest: actual-ID high/low source scalars, dish winding/air, 128 bore rays, optics, native axles and moving ownership pass; whole-source qualification remains separate');
