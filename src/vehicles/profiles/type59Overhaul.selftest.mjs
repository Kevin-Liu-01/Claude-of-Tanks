import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.js';

const near = (value, expected, epsilon = 1e-6) => Math.abs(value - expected) <= epsilon;
const scale = 0.855;

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
    spec.dims.widthM, spec.dims.heightM], [5.67, 8.14, 3.11, 2.23],
  'published dimensions are ten percent smaller than the prior live refit');
  assert.ok(near(hull.scale.x, scale) && near(hull.scale.y, scale) && near(hull.scale.z, scale),
    'complete hull and running gear use the requested ten-percent live reduction');
  assert.ok(near(turret.scale.x, scale) && near(turret.scale.y, scale)
    && near(turret.scale.z, scale),
  'turret, equipment and gun reduce together without breaking articulation');

  const hullReceipt = hull.userData.type59OverhaulReceipt;
  const turretReceipt = turret.userData.type59OverhaulReceipt;
  assert.equal(hullReceipt?.revision, 'type59-compact-twin-mg-r3',
    'hull publishes the compact twin-MG revision');
  assert.equal(hullReceipt?.linkedTrackCourseReseated, true,
    'single linked track course is explicitly re-seated');
  assert.equal(hullReceipt?.bowServiceAttached, true,
    'lower-glacis stiffeners and recovery fittings are attached to the bow');
  assert.equal(hullReceipt?.bowShoulderClosureCount, 2,
    'paired inboard bow bridges close the former idler-shoulder plan pockets');
  assert.equal(hullReceipt?.glacisAppliquePanels, 3,
    'three upper-glacis applique panels are installed');
  assert.equal(hullReceipt?.sideSkirtPanels, 14,
    'seven supported skirt panels protect each track lane');
  assert.equal(turretReceipt?.turretArmorPanels, 14,
    'seven modular applique panels protect each turret cheek and side');
  assert.deepEqual([...turretReceipt?.roofMachineGuns],
    ['Type 54 DShK', 'Type 59 7.62 mm'],
  'each cupola receives its own period-appropriate roof machine gun');
  assert.equal(turretReceipt?.roofMachineGunCount, 2,
    'receipt exposes the complete two-gun cupola census');
  assert.deepEqual([...turretReceipt?.roofMachineGunScales], [1.08, 1.12],
    'both crew-served cupola guns use the enlarged silhouettes');
  assert.ok(near(turretReceipt?.browDropM, 0.08)
    && near(turretReceipt?.gunRaiseM, 0.08),
  'cast brow lowers while the gun axis rises into the opening');

  const gear = hull.userData.runningGearReceipts?.[0];
  const bowService = hull.userData.t62BowServiceReceipt;
  assert.deepEqual(bowService, {
    stiffenerCount: 4,
    stiffenerY: 0.93,
    stiffenerZ: 3.53,
    recoveryCount: 2,
    recoveryY: 0.92,
    recoveryBodyZ: 3.51,
    recoveryEyeZ: 3.558,
  }, 'all six bow-service fittings sit inside the Type 59 lower-glacis section');
  assert.equal(hull.userData.nativeRoadWheelStations, 5,
    'Type 59 retains its five-station suspension');
  assert.deepEqual(gear?.wheelZs,
    [2.235, 1.08, 0.10, -0.92, -1.933],
  'road-wheel receipt stays in the shared hull-local gear frame');
  assert.ok(near(gear?.xcLeft, 1.45) && near(gear?.xcRight, 1.45),
    'both local track lanes use the widened, bow-clear gauge');
  assert.ok(near(gear?.sprocket.z, -2.795)
    && near(gear?.idler.z, 3.01),
  'local track receipt includes both seated terminal wraps');
  assert.ok(near(gear?.textureRepeatM, gear?.shoePitchM * 4),
    'belt texture cadence and shoe pitch stay in one local coordinate frame');
  for (const name of ['gearTrackBandL', 'gearTrackBandR']) {
    const band = tank.root.getObjectByName(name);
    assert.ok(band, `${name} exists as one continuous native course`);
    const bounds = new THREE.Box3().setFromObject(band);
    assert.ok(bounds.max.y > 1.0 && bounds.min.y < 0,
      `${name} spans the ground run and both elevated terminal returns`);
  }

  const hullArmor = hull.getObjectByName('hullExternalArmor');
  const turretArmor = turret.getObjectByName('turretExternalArmor');
  assert.ok(hullArmor?.geometry && turretArmor?.geometry,
    'glacis, skirt and turret applique use dedicated external-armor buckets');
  assert.ok(turret.getObjectByName('type59RearStowageRack'),
    'populated rear rack remains attached to the turret');
  const loaderMG = turret.getObjectByName('type59RoofDShK');
  const commanderMG = turret.getObjectByName('type59CommanderCupolaMG');
  assert.equal(loaderMG?.parent, turret,
    'loader DShK yaws with the turret');
  assert.equal(commanderMG?.parent, turret,
    'commander machine gun yaws with the turret');
  assert.deepEqual(loaderMG?.position.toArray(), [0.55, 1.021, 0.36],
    'loader DShK foot sits on the forward rim of the loader cupola');
  assert.deepEqual(commanderMG?.position.toArray(), [-0.605, 1.111, 0.13],
    'commander machine-gun foot sits on the forward rim of the commander cupola');
  assert.equal(loaderMG?.userData.cupolaSeat, 'loader');
  assert.equal(commanderMG?.userData.cupolaSeat, 'commander');
  const loaderEnvelope = loaderMG.userData.aabb;
  const commanderEnvelope = commanderMG.userData.aabb;
  assert.ok(loaderEnvelope.max[2] - loaderEnvelope.min[2] >= 1.25,
    'loader DShK retains a full-size heavy-machine-gun silhouette');
  assert.ok(commanderEnvelope.max[2] - commanderEnvelope.min[2] >= 0.84,
    'commander gun is visibly enlarged from the former compact fitting');
  assert.ok(loaderMG.position.z + loaderEnvelope.min[2] <= 0.15,
    'loader DShK grips reach aft over the loader opening');
  assert.ok(commanderMG.position.z + commanderEnvelope.min[2] <= 0.00,
    'commander gun grips reach aft over the commander opening');
  assert.ok(near(gun.position.y, 0.3666),
    'gun pivot preserves the raised local axis inside the scaled turret rig');
  assert.equal(turret.getObjectByName('type59RearRadioWhip')?.parent, turret,
    'new rear radio whip yaws with the turret');

  const dshkPosition = loaderMG.position.clone();
  const commanderPosition = commanderMG.position.clone();
  turret.rotation.y = Math.PI / 2;
  tank.root.updateMatrixWorld(true);
  assert.ok(loaderMG.position.equals(dshkPosition),
    'DShK preserves its turret-local seat through yaw');
  assert.ok(commanderMG.position.equals(commanderPosition),
    'commander MG preserves its turret-local seat through yaw');
} finally {
  tank.dispose();
}

console.log('type59Overhaul.selftest: 10% live scale, aligned gun brow and twin cupola MGs passed');
