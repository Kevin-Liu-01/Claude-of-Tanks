import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';
import { vehicleMarkingAnchor } from '../vehicleMarkings.js';

for (const id of ['ariete_c1', 'ariete_c2']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const spec = getSpec(id);
  assert.equal(spec.visual.trackWidthM, 0.60, `${id}: source-width shoe course`);
  assert.equal(spec.armor.turretPivot[1], 1.40, `${id}: body and turret rise together`);
  const trackPlate = spec.armor.hullPlates.find((plate) => plate.name === 'track_R');
  assert.equal(Math.max(...trackPlate.verts.map((vertex) => vertex[1])), 1.06,
    `${id}: combat course follows the taller rendered track envelope`);

  const leftBand = tank.root.getObjectByName('gearTrackBandL');
  const turret = tank.root.getObjectByName('rig_turret');
  const hull = tank.root.getObjectByName('hull');
  const hullRig = tank.root.getObjectByName('rig_hull');
  assert.ok(leftBand?.geometry, `${id}: one native smart track band exists`);
  leftBand.geometry.computeBoundingBox();
  assert(leftBand.geometry.boundingBox.max.x - leftBand.geometry.boundingBox.min.x >= 0.59,
    `${id}: rendered band preserves the 0.60 m shoe width`);
  assert(Math.abs(turret.position.y - 1.40) < 1e-9,
    `${id}: articulated turret is seated on the raised hull`);
  hull.geometry.computeBoundingBox();
  assert(hull.geometry.boundingBox.min.y >= 0.49,
    `${id}: armor floor rises above the terrain-seated course`);
  assert.equal(hullRig.userData.nativeRoadWheelStations, 7,
    `${id}: exactly seven suspension-driven road-wheel stations`);
  const gear = hullRig.userData.runningGearReceipts.at(-1);
  const arieteGear = hullRig.userData.arieteRunningGearReceipt;
  assert.equal(gear.wheelR, 0.38, `${id}: slightly larger road wheels are installed`);
  assert.equal(gear.wheelY, 0.53, `${id}: enlarged road wheels remain terrain seated`);
  assert.equal(gear.sprocket.r, 0.25, `${id}: rear wheel uses the requested two-thirds profile`);
  assert.equal(gear.sprocket.y, 0.84, `${id}: rear wheel is raised into the return run`);
  assert(Math.abs(arieteGear.rearSprocketRadiusRatio - (0.25 / 0.37)) < 1e-9,
    `${id}: rear terminal reduction is recorded against the original wheel`);
  assert.equal(arieteGear.linkedCourseAdjusted, true, `${id}: linked track course was regenerated`);

  const equipment = turret.userData.arieteEquipmentReceipt;
  if (id === 'ariete_c1') {
    assert.equal(equipment.manualPintles, 2, 'C1 carries two manual machine-gun stations');
    assert.ok(turret.getObjectByName('arieteC1CommanderMg'), 'C1 commander MG is present');
    assert.ok(turret.getObjectByName('arieteC1LoaderMg'), 'C1 loader MG is present');
    assert.equal(turret.getObjectByName('arieteC2RemoteRws'), undefined,
      'C1 does not inherit the C2 remote tower');
  } else {
    assert.equal(equipment.remoteControlled, true, 'C2 roof weapon is remotely controlled');
    assert.equal(equipment.remoteWeaponSide, 'right', 'C2 remote tower is right mounted');
    assert.equal(equipment.rotatingShoulderModules, 4, 'all four marked shoulder modules are turret owned');
    assert.equal(equipment.rotatingApuAssembly, true, 'marked rear APU assembly is turret owned');
    const remoteRws = turret.getObjectByName('arieteC2RemoteRws');
    assert.ok(remoteRws, 'C2 T-90-style automated tower is present');
    for (const yaw of [0, Math.PI / 3]) {
      turret.rotation.y = yaw;
      tank.root.updateMatrixWorld(true);
      assert.equal(remoteRws.parent, turret, `C2 remote tower remains turret-owned through yaw ${yaw}`);
    }
  }
  const marking = vehicleMarkingAnchor(id);
  assert.equal(marking.owner, 'turret', `${id}: insignia is seated on the articulated turret`);
  assert.equal(marking.sizeM, 0.23, `${id}: insignia is scaled to clear adjacent equipment`);
  tank.dispose();
}

console.log('arieteProportions.selftest: C1/C2 source-width, taller single smart courses verified');
