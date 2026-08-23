import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const near = (value, expected, epsilon = 1e-6) => Math.abs(value - expected) <= epsilon;
const scale = 0.95;

const tank = createTank('type59', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const spec = getSpec('type59');
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  assert.ok(hull && turret && gun, 'Type 59 keeps independent hull, turret and gun rigs');
  assert.deepEqual([spec.dims.hullLengthM, spec.dims.overallLengthM,
    spec.dims.widthM, spec.dims.heightM], [6.30, 9.04, 3.45, 2.48],
  'published dimensions follow the compact refit');
  assert.ok(near(hull.scale.x, scale) && near(hull.scale.y, scale) && near(hull.scale.z, scale),
    'complete hull and running gear use the restrained five-percent reduction');
  assert.ok(near(turret.scale.x, scale) && near(turret.scale.y, scale)
    && near(turret.scale.z, scale),
  'turret, equipment and gun reduce together without breaking articulation');

  const hullReceipt = hull.userData.type59OverhaulReceipt;
  const turretReceipt = turret.userData.type59OverhaulReceipt;
  assert.equal(hullReceipt?.revision, 'type59-compact-field-refit-r1',
    'hull publishes the compact field-refit revision');
  assert.equal(hullReceipt?.linkedTrackCourseReseated, true,
    'single linked track course is explicitly re-seated');
  assert.equal(hullReceipt?.glacisAppliquePanels, 3,
    'three upper-glacis applique panels are installed');
  assert.equal(hullReceipt?.sideSkirtPanels, 14,
    'seven supported skirt panels protect each track lane');
  assert.equal(turretReceipt?.turretArmorPanels, 14,
    'seven modular applique panels protect each turret cheek and side');
  assert.equal(turretReceipt?.roofMachineGun, 'Type 54 DShK',
    'roof weapon remains the correct Type 54 DShK family');
  assert.ok(turretReceipt?.roofMachineGunScale >= 0.90,
    'roof DShK is large enough to read clearly at gallery distance');

  const gear = hull.userData.runningGearReceipts?.[0];
  assert.equal(hull.userData.nativeRoadWheelStations, 5,
    'Type 59 retains its five-station suspension');
  assert.deepEqual(gear?.wheelZs,
    [2.235, 1.08, 0.10, -0.92, -1.933].map((z) => z * scale),
  'road-wheel station receipt follows the reduced linked course');
  assert.ok(near(gear?.xcLeft, 1.45 * scale) && near(gear?.xcRight, 1.45 * scale),
    'both track lanes use the widened, bow-clear gauge');
  assert.ok(near(gear?.sprocket.z, -2.795 * scale)
    && near(gear?.idler.z, 3.01 * scale),
  'track receipt includes both seated terminal wraps');
  for (const name of ['gearTrackBandL', 'gearTrackBandR']) {
    const band = tank.root.getObjectByName(name);
    assert.ok(band, `${name} exists as one continuous native course`);
    const bounds = new THREE.Box3().setFromObject(band);
    assert.ok(bounds.max.y > 1.05 && bounds.min.y < 0,
      `${name} spans the ground run and both elevated terminal returns`);
  }

  const hullArmor = hull.getObjectByName('hullExternalArmor');
  const turretArmor = turret.getObjectByName('turretExternalArmor');
  assert.ok(hullArmor?.geometry && turretArmor?.geometry,
    'glacis, skirt and turret applique use dedicated external-armor buckets');
  assert.ok(turret.getObjectByName('type59RearStowageRack'),
    'populated rear rack remains attached to the turret');
  assert.equal(turret.getObjectByName('type59RoofDShK')?.parent, turret,
    'enlarged roof DShK yaws with the turret');
  assert.equal(turret.getObjectByName('type59RearRadioWhip')?.parent, turret,
    'new rear radio whip yaws with the turret');

  const dshkPosition = turret.getObjectByName('type59RoofDShK').position.clone();
  turret.rotation.y = Math.PI / 2;
  tank.root.updateMatrixWorld(true);
  assert.ok(turret.getObjectByName('type59RoofDShK').position.equals(dshkPosition),
    'DShK preserves its turret-local seat through yaw');
} finally {
  tank.dispose();
}

console.log('type59Overhaul.selftest: compact scale, seated tracks, armor and equipment passed');
