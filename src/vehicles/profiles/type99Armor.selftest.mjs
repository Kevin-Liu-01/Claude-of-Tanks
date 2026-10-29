import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { traceTank } from '../../sim/armor.ts';
import { combatAnatomyCalibration } from '../combatAnatomy.ts';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createType99Armor } from './type99Armor.ts';

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

for (const [id, authoredPivotY, authoredPivotZ] of [
  ['ztz99_longwei', 1.57, 0.64], ['ztz99a', 1.56, -0.15],
  ['ztz99a2', 1.56, 0.12], ['vt4a1', 1.56, 0.40],
]) {
  const armor = createType99Armor(id);
  assert(armor.hullPlates.length >= 30, `${id}: segmented hull envelope`);
  assert(armor.turretPlates.length >= 20, `${id}: segmented turret envelope`);
  for (const plate of [...armor.hullPlates, ...armor.turretPlates]) assertPlanar(id, plate);
  assert.equal(armor.modules.length, 9, `${id}: full module map`);
  assert.equal(armor.crew.length, 3, `${id}: three-person autoloader crew`);
  assert.equal(armor.turretPivot[1], authoredPivotY, `${id}: authored ring datum`);
  assert.equal(armor.turretPivot[2], authoredPivotZ, `${id}: authored fore/aft ring datum`);
  if (id !== 'ztz99a') {
    const ring = armor.modules.find((box) => box.module === 'turretRing');
    assert(Math.abs((ring.min[2] + ring.max[2]) / 2 - authoredPivotZ) < 1e-8,
      `${id}: combat turret-ring volume follows the fore/aft pivot`);
  }
}

{
  const armor = createType99Armor('ztz99_longwei');
  const hull = plateHits(armor, [4, 1.40, 0], [-4, 1.40, 0]).map((hit) => hit.plate.name);
  assert.deepEqual(hull.slice(0, 2), ['skirt_front_R', 'hull_side_upper_center_R'],
    'Type 99A flank crosses the visible skirt and outer sponson before the interior');
  // 262 (cn-type59-longwei lane, 2026-10-27): plates trace one-sided (sim/armor.ts intersectQuad culls back faces), so
  // a flank ray meets only the side it enters; the old [R, L] pair was red on main 260 too. Each side is traced inward.
  for (const [from, to, plate] of [[[4, 2.10, 0.40], [-4, 2.10, 0.40], 'turret_side_forward_R'],
    [[-4, 2.10, 0.40], [4, 2.10, 0.40], 'turret_side_forward_L']]) {
    assert.equal(plateHits(armor, from, to)[0]?.plate.name, plate,
      'Longwei turret flank crosses its side modules (release 262: the arrowhead cheeks stand ahead of this line)');
  }
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
for (const id of ['ztz99_longwei', 'ztz99a', 'ztz99a2', 'vt4a1']) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const spec = getSpec(id);
  const calibration = combatAnatomyCalibration(id);
  const ring = spec.armor.modules.find((box) => box.module === 'turretRing');
  const ringCenterY = (ring.min[1] + ring.max[1]) / 2;
  // release 240 (combatAnatomy.ts alignTurretRing): the ring volume centres on the drawn ring's deck (the anatomy's
  // turretRing receipt) where the generator publishes one, else at the measured turret underside on the pivot's axis.
  // Release 264 (main-reds 261): this receipt still held every ring to the turret underside, red on all four since the
  // 240 regen published their rings.
  const drawn = calibration.turretRing;
  const expectedRingY = drawn && Number.isFinite(drawn.deckY) ? drawn.deckY
    : spec.armor.turretPivot[1] + calibration.turret.min[1];
  assert(Math.abs(ringCenterY - expectedRingY) < 1e-8,
    `${id}: ring follows the drawn ring's deck (or the measured turret underside without one)`);
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
