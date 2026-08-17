import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { traceTank } from '../../sim/armor.js';
import { combatAnatomyCalibration } from '../combatAnatomy.js';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';
import { createType99Armor } from './type99Armor.js';

const pose = {
  pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
};

function plateHits(armor, from, to) {
  return traceTank(new Vector3(...from), new Vector3(...to), pose, armor, new Set())
    .filter((hit) => hit.kind === 'plate');
}

function assertPlanar(id, plate) {
  assert.equal(plate.verts.length, 4, `${id}/${plate.name}: quad contract`);
  const [a, b, c, d] = plate.verts.map((point) => new Vector3(...point));
  const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(d, a));
  assert(normal.lengthSq() > 1e-10, `${id}/${plate.name}: non-degenerate trace plane`);
  const deviationM = Math.abs(new Vector3().subVectors(c, a).dot(normal)) / normal.length();
  assert(deviationM < 1e-8, `${id}/${plate.name}: planar within tolerance (${deviationM} m)`);
}

for (const [id, authoredPivotY] of [['type99a', 1.40], ['ztz99a2', 1.56]]) {
  const armor = createType99Armor(id);
  assert(armor.hullPlates.length >= 30, `${id}: segmented hull envelope`);
  assert(armor.turretPlates.length >= 20, `${id}: segmented turret envelope`);
  for (const plate of [...armor.hullPlates, ...armor.turretPlates]) assertPlanar(id, plate);
  assert.equal(armor.modules.length, 9, `${id}: full module map`);
  assert.equal(armor.crew.length, 3, `${id}: three-person autoloader crew`);
  assert.equal(armor.turretPivot[1], authoredPivotY, `${id}: authored ring datum`);
}

{
  const armor = createType99Armor('type99a');
  const hull = plateHits(armor, [4, 1.40, 0], [-4, 1.40, 0]).map((hit) => hit.plate.name);
  assert.deepEqual(hull.slice(0, 2), ['skirt_front_R', 'hull_side_upper_center_R'],
    'Type 99A flank crosses the visible skirt and outer sponson before the interior');
  const turret = plateHits(armor, [4, 2.10, 0], [-4, 2.10, 0]).map((hit) => hit.plate.name);
  assert.deepEqual(turret.slice(0, 2), ['turret_stowage_screen_R', 'turret_side_forward_R'],
    'Type 99A turret flank carries a deep outer screen and welded main wall');
  const roof = plateHits(armor, [0, 4, -2.40], [0, -1, -2.40]);
  assert.equal(roof[0].plate.name, 'hull_roof_engine', 'Type 99A raised engine deck is the roof surface');
  assert(Math.abs(roof[0].point.y - 1.78) < 1e-8, 'Type 99A engine deck sits at the rendered 1.78 m line');
}

{
  const armor = createType99Armor('ztz99a2');
  const hull = plateHits(armor, [4, 1.40, 0], [-4, 1.40, 0]).map((hit) => hit.plate.name);
  assert.deepEqual(hull.slice(0, 3), ['skirt_era_R', 'skirt_front_R', 'hull_side_upper_forward_R'],
    'ZTZ-99A2 flank crosses cassette, skirt and deep lofted side in order');
  const roof = plateHits(armor, [0, 4, -3.20], [0, -1, -3.20]);
  assert.equal(roof[0].plate.name, 'hull_roof_rear', 'ZTZ-99A2 rear deck follows its raised loft course');
}

// Integration: registration uses each distinct envelope, keeps the A2 armor
// factor, and publishes the runtime-derived track prisms used by shell traces.
for (const id of ['type99a', 'ztz99a2']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const spec = getSpec(id);
  const calibration = combatAnatomyCalibration(id);
  const ring = spec.armor.modules.find((box) => box.module === 'turretRing');
  const ringCenterY = (ring.min[1] + ring.max[1]) / 2;
  const visibleTurretBaseY = spec.armor.turretPivot[1] + calibration.turret.min[1];
  assert(Math.abs(ringCenterY - visibleTurretBaseY) < 1e-8,
    `${id}: ring follows the measured turret underside`);
  assert(spec.armor.turretPivot[1] >= calibration.hull.min[1]
    && spec.armor.turretPivot[1] <= calibration.hull.max[1],
  `${id}: calibrated turret seat remains inside the measured hull`);
  assert(spec.armor.trackShapes?.length === 2, `${id}: two derived track prisms`);
  assert(spec.armor.trackShapes.every((shape) => shape.poly.length >= 6),
    `${id}: track prisms preserve the linked-course silhouette`);
  tank.dispose();
}
assert.equal(
  getSpec('ztz99a2').armor.hullPlates.find((plate) => plate.name === 'upper_glacis').keMm,
  560,
  'ZTZ-99A2 retains its 1.12 armor factor on the custom envelope',
);

console.log('type99Armor.selftest: segmented, planar, aligned Type 99 family combat envelopes verified');
