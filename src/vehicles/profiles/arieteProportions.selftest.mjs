import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

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
  tank.dispose();
}

console.log('arieteProportions.selftest: C1/C2 source-width, taller single smart courses verified');
