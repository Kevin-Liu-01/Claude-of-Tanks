import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const near = (actual, expected, epsilon = 1e-6) => Math.abs(actual - expected) <= epsilon;

for (const id of ['pl01', 'pl01_105']) {
  const spec = getSpec(id);
  assert.equal(spec.dims.heightM, 2.80,
    `${id} dossier must retain the published vehicle height`);
  assert.deepEqual(spec.armor.gunPivot, [0, 0.216, 1.45],
    `${id} gun datum must follow the 60%-height turret nose`);
  if (id === 'pl01_105') {
    assert.equal(spec.dims.silhouetteHeightM, 3.03,
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

  assert.deepEqual(gun.position.toArray(), spec.armor.gunPivot,
    `${id} rendered gun root must match its combat/anatomy datum`);
  assert.equal(turret.userData.pl01TurretHeightScale, 0.60,
    `${id} must publish the corrected structural height scale`);
  assert.ok(near(turret.userData.pl01RoofLocalY, 0.432),
    `${id} roof must be 20% taller than the half-height 0.36 m roof`);
  assert.ok(turretShell?.isMesh, `${id} must retain one merged structural turret shell`);
  const shellPositions = turretShell.geometry.getAttribute('position');
  let roofVertices = 0;
  for (let index = 0; index < shellPositions.count; index++) {
    if (near(shellPositions.getY(index), 0.432, 0.001)) roofVertices += 1;
  }
  assert.ok(roofVertices >= 24,
    `${id} merged shell must retain a broad 0.432 m roof plane`);
  assert.ok(roofStowage?.parent === turret && near(roofStowage.position.y, 0.442),
    `${id} mission-bay rack must be seated on the rebuilt rear roof`);
  assert.ok(smokeLeft?.parent === turret && smokeRight?.parent === turret,
    `${id} both smoke banks must remain turret-owned`);
  assert.ok(near(smokeLeft.position.y, 0.442) && near(smokeRight.position.y, 0.442),
    `${id} smoke banks must share the rebuilt roof datum`);

  assert.deepEqual(hull.userData.pl01GlacisReceipt, {
    revision: 'raised-wedge-r2', upperProwY: 1.46, lowerProwY: 1.29,
    skirtProwY: 1.46, shoulderBridges: 2, aligned: true,
  }, `${id} upper, middle, and lower glacis must share the raised skirt datum`);
  assert.deepEqual(turret.userData.pl01RoofSuiteReceipt, {
    revision: 'low-profile-r3', turretHeightScale: 0.60, roofY: 0.432,
    cupolas: 2, periscopes: 10, lights: 4, machineGuns: 2,
    allEquipmentSeated: true,
  }, `${id} must carry the corrected roof suite`);
  assert.deepEqual(gun.userData.pl01MantletReceipt, {
    revision: 'low-profile-r3', axisWorldY: 2.286,
    coverMinWorldY: 2.187, coverMaxWorldY: 2.448,
    turretRoofWorldY: 2.502, aligned: true,
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
    assert.ok(crows?.parent === turret && near(crows.position.y, 0.592),
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
    assert.ok(rws?.parent === turret && near(rws.position.y, 0.572),
      'base PL-01 RWS must be seated on the corrected roof');
  }
  tank.dispose();
}

console.log('pl01GunGlacisCrows.selftest: raised glacis, 60%-height turret, roof suite, mantlet, and tracks pass');
