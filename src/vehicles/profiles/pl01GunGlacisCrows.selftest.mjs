import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3 } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.js';

const near = (actual, expected, epsilon = 1e-6) => Math.abs(actual - expected) <= epsilon;
const driverSeatHullHashes = Object.freeze({
  pl01: '054a66219e3d38da4ba9ae0c6a11782e8d5d481b284e982113f9cf807edb8343',
  pl01_105: '86529bedccd94acb3ba75d95a99fa340372971f4d0f7d1e2f7f05b018f55ba49',
});

function geometryHash(group) {
  const hash = createHash('sha256');
  group.traverse((node) => {
    if (!node.isMesh) return;
    const positions = node.geometry.getAttribute('position');
    if (positions) {
      hash.update(Buffer.from(positions.array.buffer,
        positions.array.byteOffset, positions.array.byteLength));
    }
    node.updateMatrix();
    hash.update(node.matrix.toArray().join(','));
  });
  return hash.digest('hex');
}

for (const id of ['pl01', 'pl01_105']) {
  const spec = getSpec(id);
  assert.equal(spec.dims.heightM, 2.80,
    `${id} dossier must retain the published vehicle height`);
  assert.deepEqual(spec.armor.gunPivot, [0, 0.31104, 1.45],
    `${id} gun datum must follow the second 20%-taller turret nose`);
  if (id === 'pl01_105') {
    assert.equal(spec.dims.silhouetteHeightM, 3.22368,
      'PL-01 105 CROWS silhouette height must remain explicit');
  }

  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  const turretShell = turret.getObjectByName('turret');
  const roofStowage = tank.root.getObjectByName('pl01_roof_stowage');
  const smokeLeft = tank.root.getObjectByName('pl01_smoke_bank_left');
  const smokeRight = tank.root.getObjectByName('pl01_smoke_bank_right');
  const cupola = turret.getObjectByName('turretCupola');

  const hullBounds = new Box3().setFromObject(hull);
  assert.deepEqual(
    [...hullBounds.min.toArray(), ...hullBounds.max.toArray()]
      .map((value) => Number(value.toFixed(6))),
    [-1.922, -0.087, -3.565, 1.922, 2.203312, 3.44],
    `${id} driver-roof seating must not change the hull envelope`,
  );
  assert.equal(geometryHash(hull), driverSeatHullHashes[id],
    `${id} hull geometry must stay fixed at the approved driver-roof attachment revision`);
  const driverSeat = hull.userData.pl01DriverRoofSeat;
  assert.equal(driverSeat?.revision, 'flush-r1',
    `${id} must expose the driver roof attachment receipt`);
  assert.ok(near(driverSeat.hatchDeckY, 1.9885)
    && near(driverSeat.hatchBottomY, driverSeat.hatchDeckY),
  `${id} driver hatch underside must touch its local roof plane`);
  assert.equal(driverSeat.periscopeBottomYs.length, 3,
    `${id} must retain the three driver vision blocks`);
  for (const [index, expected] of [1.975, 1.9604588235294118, 1.975].entries()) {
    assert.ok(near(driverSeat.periscopeBottomYs[index], expected),
      `${id} driver vision block ${index + 1} must touch its local roof plane`);
  }
  assert.equal(driverSeat.attached, true,
    `${id} driver hatch and windows must be marked attached`);
  assert.deepEqual(turret.position.toArray(), [0, 2.07, -0.90],
    `${id} turret ring must remain on its existing hull seat`);

  assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot,
    `${id} rendered gun root must match its combat/anatomy datum`);
  assert.equal(turret.userData.pl01TurretHeightScale, 0.864,
    `${id} structural turret must be exactly 20% taller than its 0.72-scale predecessor`);
  assert.ok(near(turret.userData.pl01RoofLocalY, 0.62208),
    `${id} roof must receive the second 20% rise while the ring stays fixed`);
  assert.ok(turretShell?.isMesh, `${id} must retain one merged structural turret shell`);
  const shellPositions = turretShell.geometry.getAttribute('position');
  let roofVertices = 0;
  for (let index = 0; index < shellPositions.count; index++) {
    if (near(shellPositions.getY(index), 0.62208, 0.001)) roofVertices += 1;
  }
  assert.ok(roofVertices >= 24,
    `${id} merged shell must retain a broad 0.62208 m roof plane`);
  const cupolaBounds = new Box3().setFromObject(cupola);
  assert.ok(near(cupolaBounds.min.y, 2.69208),
    `${id} structural cupolas must contact the raised roof without a gap`);
  assert.ok(roofStowage?.parent === turret && near(roofStowage.position.y, 0.63208),
    `${id} mission-bay rack must be seated on the rebuilt rear roof`);
  assert.ok(smokeLeft?.parent === turret && smokeRight?.parent === turret,
    `${id} both smoke banks must remain turret-owned`);
  assert.ok(near(smokeLeft.position.y, 0.63208) && near(smokeRight.position.y, 0.63208),
    `${id} smoke banks must share the rebuilt roof datum`);

  assert.deepEqual(hull.userData.pl01GlacisReceipt, {
    revision: 'raised-wedge-r2', upperProwY: 1.46, lowerProwY: 1.29,
    skirtProwY: 1.46, shoulderBridges: 2, aligned: true,
  }, `${id} upper, middle, and lower glacis must share the raised skirt datum`);
  assert.deepEqual(turret.userData.pl01RoofSuiteReceipt, {
    revision: 'low-profile-r5', turretHeightScale: 0.864, roofY: 0.62208,
    cupolas: 2, periscopes: 10, lights: 4, machineGuns: 2,
    allEquipmentSeated: true,
  }, `${id} must carry the corrected roof suite`);
  const noseSeat = turret.userData.pl01NoseGunSeat;
  assert.equal(noseSeat?.revision, 'aligned-r1',
    `${id} nose cap must expose its gun-seat revision`);
  assert.ok(near(noseSeat.rearTopWorldY, 2.5452)
    && near(noseSeat.frontTopWorldY, 2.38104)
    && near(noseSeat.gunAxisWorldY, 2.38104)
    && near(noseSeat.frontTopWorldY, noseSeat.gunAxisWorldY),
  `${id} nose cap must terminate on the raised gun axis`);
  assert.equal(noseSeat.connected, true,
    `${id} nose cap and gun sleeve must remain connected`);
  assert.deepEqual(gun.userData.pl01MantletReceipt, {
    revision: 'low-profile-r5', axisWorldY: 2.38104,
    coverMinWorldY: 2.28204, coverMaxWorldY: 2.54304,
    turretRoofWorldY: 2.69208, aligned: true,
  }, `${id} gun-root prism must fit within the rebuilt turret envelope`);

  const trackBands = [];
  tank.root.traverse((node) => {
    if (node.name === 'gearTrackBandL' || node.name === 'gearTrackBandR') {
      trackBands.push(node.name);
    }
  });
  assert.deepEqual(trackBands.sort(), ['gearTrackBandL', 'gearTrackBandR'],
    `${id} must retain exactly one linked track course per side`);

  const loaderMG = tank.root.getObjectByName('pl01_loader_mg');
  assert.ok(loaderMG?.parent === turret,
    `${id} loader machine gun must traverse with the turret`);
  assert.ok(tank.root.getObjectByName('turretCupola'),
    `${id} must expose structural cupola geometry`);
  assert.ok(tank.root.getObjectByName('turretEquipment'),
    `${id} must expose non-armor roof equipment geometry`);

  const spareLinks = tank.root.getObjectByName('pl01_105_glacis_spare_links');
  const crows = tank.root.getObjectByName('pl01_105_crows_weapon');
  const rws = tank.root.getObjectByName('pl01_rws_weapon');
  if (id === 'pl01_105') {
    assert.equal(hull.userData.pl01FrontGlacisPack,
      'seated-spare-links-and-camo-era',
      'PL-01 105 must carry the seated glacis protection pack');
    assert.ok(spareLinks?.parent === hull,
      'PL-01 105 spare links must be attached to the fixed hull');
    assert.equal(turret.userData.pl01RemoteStation, 'forward-crows',
      'PL-01 105 must identify its forward CROWS station');
    assert.ok(crows?.parent === turret && near(crows.position.y, 0.78208),
      'PL-01 105 CROWS must be seated on the corrected roof');
    assert.equal(crows.rotation.y, 0,
      'PL-01 105 CROWS must rest aimed forward');
    assert.equal(rws, undefined,
      'PL-01 105 must not inherit the base low-observable RWS');
  } else {
    assert.equal(spareLinks, undefined,
      'base PL-01 must not inherit the 105 glacis protection pack');
    assert.equal(crows, undefined,
      'base PL-01 keeps its own low-observable RWS');
    assert.ok(rws?.parent === turret && near(rws.position.y, 0.76208),
      'base PL-01 RWS must be seated on the corrected roof');
  }
  tank.dispose();
}

console.log('pl01GunGlacisCrows.selftest: second 20% turret lift, aligned guns, roof suites, and seated driver stations pass');
