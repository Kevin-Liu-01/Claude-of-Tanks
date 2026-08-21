import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const near = (actual, expected, epsilon = 1e-6) => Math.abs(actual - expected) <= epsilon;

for (const id of ['pl01', 'pl01_105']) {
  const spec = getSpec(id);
  assert.equal(spec.dims.heightM, 2.94,
    `${id} dossier must follow the 20%-taller structural turret roof`);
  assert.deepEqual(spec.armor.gunPivot, [0, 0.312, 1.45],
    `${id} gun datum must follow the taller turret nose`);
  if (id === 'pl01_105') {
    assert.equal(spec.dims.silhouetteHeightM, 3.45,
      'PL-01 105 CROWS silhouette height must be explicit');
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
  assert.equal(turret.userData.pl01TurretHeightScale, 1.2,
    `${id} must publish the exact structural height scale`);
  assert.ok(near(turret.userData.pl01RoofLocalY, 0.864),
    `${id} roof must rise from 0.72 m to 0.864 m above the ring`);
  assert.ok(near(turret.userData.pl01RoofEquipmentLiftM, 0.144),
    `${id} roof equipment must follow the 144 mm lift intact`);
  assert.ok(turretShell?.isMesh, `${id} must retain one merged structural turret shell`);
  const shellPositions = turretShell.geometry.getAttribute('position');
  let liftedRoofVertices = 0;
  for (let index = 0; index < shellPositions.count; index++) {
    if (near(shellPositions.getY(index), 0.864, 0.001)) liftedRoofVertices += 1;
  }
  assert.ok(liftedRoofVertices >= 24,
    `${id} merged shell must retain a broad roof plane at the exact 20% height`);
  assert.ok(roofStowage?.parent === turret && near(roofStowage.position.y, 0.634),
    `${id} mission-bay rack must remain seated on the lifted rear roof`);
  assert.ok(smokeLeft?.parent === turret && smokeRight?.parent === turret,
    `${id} both smoke banks must remain turret-owned`);
  assert.ok(near(smokeLeft.position.y, 0.744) && near(smokeRight.position.y, 0.744),
    `${id} both smoke banks must follow the lifted roof symmetrically`);

  const trackBands = [];
  tank.root.traverse((node) => {
    if (node.name === 'gearTrackBandL' || node.name === 'gearTrackBandR') {
      trackBands.push(node.name);
    }
  });
  assert.deepEqual(trackBands.sort(), ['gearTrackBandL', 'gearTrackBandR'],
    `${id} must retain exactly one linked track course per side`);

  const spareLinks = tank.root.getObjectByName('pl01_105_glacis_spare_links');
  const crows = tank.root.getObjectByName('pl01_105_crows_weapon');
  const rws = tank.root.getObjectByName('pl01_rws_weapon');
  if (id === 'pl01_105') {
    assert.equal(hull.userData.pl01FrontGlacisPack,
      'seated-spare-links-and-camo-era',
      'PL-01 105 must carry the seated glacis protection pack');
    assert.ok(spareLinks && spareLinks.parent === hull,
      'PL-01 105 spare links must be attached to the fixed hull');
    assert.equal(turret.userData.pl01RemoteStation, 'forward-crows',
      'PL-01 105 must identify its forward CROWS station');
    assert.ok(crows && crows.parent === turret,
      'PL-01 105 CROWS weapon must traverse with the turret');
    assert.equal(crows.rotation.y, 0,
      'PL-01 105 CROWS must rest aimed forward');
    assert.ok(near(crows.position.y, 1.149),
      'PL-01 105 CROWS must translate with the lifted roof without stretching');
    assert.equal(rws, undefined, 'PL-01 105 must not inherit the base low-observable RWS');
  } else {
    assert.equal(spareLinks, undefined,
      'base PL-01 must not inherit the 105 glacis protection pack');
    assert.equal(crows, undefined,
      'base PL-01 keeps its original low-observable RWS');
    assert.ok(rws?.parent === turret && near(rws.position.y, 1.164),
      'base PL-01 RWS must translate with the lifted roof without stretching');
  }
  tank.dispose();
}

console.log('pl01GunGlacisCrows.selftest: 20%-taller turret, lifted roof equipment, gun seating, and track uniqueness pass');
