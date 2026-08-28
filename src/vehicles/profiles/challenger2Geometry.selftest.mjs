import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('challenger2', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
await Promise.resolve();

function vertices(name) {
  const mesh = tank.root.getObjectByName(name);
  assert.ok(mesh?.geometry?.attributes?.position, `missing ${name} geometry`);
  const positions = mesh.geometry.attributes.position.array;
  const result = [];
  for (let index = 0; index < positions.length; index += 3) {
    result.push([positions[index], positions[index + 1], positions[index + 2]]);
  }
  return result;
}

const near = (value, target, epsilon = 1e-3) => Math.abs(value - target) < epsilon;
const hull = vertices('hull');
const hullDetail = vertices('hullDetail');
const turret = vertices('turret');
const turretDark = vertices('turretDark');
const turretEquipment = vertices('turretEquipment');

const fenderReceipt = tank.root.getObjectByName('rig_hull')?.userData.challenger2FenderReceipt;
assert.equal(fenderReceipt?.legacyHydrogasGapAssembliesRemoved, true,
  'obsolete inter-wheel proxy assemblies must stay removed');
assert.equal(fenderReceipt?.maximumRailGapM, 0,
  'longitudinal rails must remain seated on their fender carriers');
assert.ok(fenderReceipt?.carrierPitchRad > 0,
  'fender rails must follow the falling front deck rather than pitch away from it');

for (const bucket of ['hullRunningGearDark', 'hullRunningGearDetail']) {
  for (const [x, y, z] of vertices(bucket)) {
    const inLegacyLane = Math.abs(x) > 1.585 && Math.abs(x) < 1.67
      && y > 0.38 && y < 0.80
      && [2.05, 1.15, 0.25, -0.65, -1.55].some(station => Math.abs(z - station) < 0.20);
    assert.equal(inLegacyLane, false,
      `${bucket} must not rebuild the retired gap-station assembly`);
  }
}

assert.equal(tank.root.getObjectByName('hullRubber'), undefined,
  'former vertical fender bars must not remain as rubber track intrusions');

for (const [label, minX, maxX] of [
  ['left', -1.72, -1.55],
  ['right', 1.55, 1.75],
]) {
  assert.ok(hullDetail.some(([x, y, z]) => x > minX && x < maxX
    && y > 1.34 && y < 1.47 && Math.abs(z) < 0.85),
  `${label} metal rail must lie longitudinally on the fender`);
}

assert.equal(hull.filter(([x, y, z]) => near(Math.abs(x), 1.06)
  && y < 0.85 && z > -2.6 && z < 2.6).length, 0,
'side carrier must remain above the moving track course');

assert.equal(turret.filter(([x, y, z]) => x < -1.47
  && y < 0.40 && z > 1.36 && z < 1.44).length, 0,
'stray loader-side front block must not return');

const cheekReceipt = tank.root.getObjectByName('rig_turret')?.userData.challenger2CheekPanelReceipt;
assert.equal(cheekReceipt?.panels?.length, 2, 'both cheek panels need a seating receipt');
assert.ok(near(Math.atan2(-cheekReceipt.cheekSetbackM, cheekReceipt.cheekRiseM), -0.970681, 1e-5),
  'cheek rake must follow the measured lower-to-roof setback');
for (const panel of cheekReceipt.panels) {
  const label = panel.side < 0 ? 'left' : 'right';
  const normal = new THREE.Vector3(...panel.normal);
  const rotation = new THREE.Euler(...panel.rotation, 'XYZ');
  const expectedNormal = new THREE.Vector3(0, 0, 1).applyEuler(rotation);
  assert.ok(normal.dot(expectedNormal) > 0.999999,
    `${label} cheek panel must be parallel to the sovereign cheek plane`);
  assert.ok(panel.gasketInnerClearanceM > 0,
    `${label} cheek gasket must clear rather than intersect the casting`);
  assert.ok(panel.faceInnerClearanceM >= panel.gasketOuterClearanceM,
    `${label} cheek face must layer cleanly over its gasket`);
  assert.ok(panel.weldInnerClearanceM >= panel.faceOuterClearanceM,
    `${label} cheek welds must remain seated on the armor face`);

  for (const [bucket, center, dimensions] of [
    [turretDark, panel.gasketCenter, [0.72, 0.58, 0.030]],
    [turret, panel.faceCenter, [0.58, 0.45, 0.014]],
  ]) {
    const q = new THREE.Quaternion().setFromEuler(rotation);
    for (const x of [-dimensions[0] / 2, dimensions[0] / 2]) {
      for (const y of [-dimensions[1] / 2, dimensions[1] / 2]) {
        for (const z of [-dimensions[2] / 2, dimensions[2] / 2]) {
          const corner = new THREE.Vector3(x, y, z).applyQuaternion(q)
            .add(new THREE.Vector3(...center));
          assert.ok(bucket.some(vertex => vertex.every((value, axis) => near(value, corner.getComponent(axis)))),
            `${label} cheek layer corner must be present in the rendered mesh`);
        }
      }
    }
  }
}

for (const point of [
  [-0.84, 0.43, -0.64],
  [0.90, 0.38, -0.02],
  [1.34, 0.28, -1.18],
  [-1.34, 0.28, -1.18],
]) {
  assert.ok(turret.some(vertex => vertex.every((value, axis) => near(value, point[axis]))),
    `roof module must remain seated at ${point.join(',')}`);
}

const roofReceipt = tank.root.getObjectByName('rig_turret')?.userData.challenger2RoofSeatingReceipt;
assert.ok(roofReceipt, 'Challenger 2 exposes a roof seating receipt');
assert.equal(roofReceipt.maxRoofGapM, 0,
  'marked roof fittings permit no visible daylight below their carriers');
assert.equal(roofReceipt.armorEnvelopeExcluded, true,
  'optics, launcher tubes, and weapon-station fittings remain outside structural armor');
assert.ok(roofReceipt.roofSeats.length >= 19,
  'all marked roof fittings and both service-bridge endpoints are audited');
for (const seat of roofReceipt.roofSeats) {
  assert.ok(near(seat.carrierY - seat.bottomY, roofReceipt.contactEmbedM, 1e-4),
    `${seat.label} must overlap its roof carrier by 10 mm`);
}

for (const label of ['rear-left-roof-housing', 'right-roof-service-bridge']) {
  assert.ok(roofReceipt.roofSeats.some(seat => seat.label === label),
    `${label} must be included in the no-daylight roof audit`);
}

const cassetteReceipt = tank.root.getObjectByName('rig_turret')
  ?.userData.challenger2SideCassetteReceipt;
assert.equal(cassetteReceipt?.panels?.length, 2,
  'both Challenger 2 side cassettes expose attachment receipts');
assert.equal(cassetteReceipt.maxVisibleInnerGapM, 0,
  'side cassettes permit no visible void against the turret shell');
for (const panel of cassetteReceipt.panels) {
  assert.ok(panel.bodyJoinOverlapM >= 0.07,
    'cassette inner course must overlap the x=1.153 service body by at least 70 mm');
  assert.equal(panel.exteriorSilhouetteDeltaM, 0,
    'closing the cassette inner wall must not widen the turret silhouette');
  assert.ok(panel.innerCourseX <= 1.08 && panel.outerLipX >= 1.46,
    'cassette must bridge from the sovereign shell to the existing outer lip');
}

assert.ok(roofReceipt.station.planOverlapM >= 0.03,
  'weapon-station receiver cheeks must reach the trunnion ring in plan');
assert.ok(roofReceipt.station.verticalOverlapM >= 0.01,
  'weapon-station receiver cheeks must overlap the trunnion ring vertically');
assert.ok(roofReceipt.station.receiverSupportFrontZ < roofReceipt.station.ringRearZ,
  'weapon-station support and ring must form one connected assembly');
assert.ok(turretEquipment.some(([x, y, z]) => x > 0.58 && x < 0.63
  && y > 0.70 && y < 0.85 && z > 0.32 && z < 0.36),
'extended receiver cheek must visibly overlap the trunnion envelope');

assert.equal(roofReceipt.smokeMouths.length, 10,
  'every smoke canister carries one coaxial mouth');
for (const mouth of roofReceipt.smokeMouths) {
  const expected = new THREE.Vector3(0, 0, mouth.mouthOffsetZ)
    .applyEuler(new THREE.Euler(...mouth.rotation))
    .add(new THREE.Vector3(...mouth.tubeCenter));
  assert.ok(turretDark.some(([x, y, z]) => expected.distanceTo(new THREE.Vector3(x, y, z)) < 0.04),
    'smoke-canister mouth geometry must occupy its transformed tube end');
}

assert.equal(turret.filter(([x, y, z]) => Math.abs(Math.abs(x) - 1.327) < 0.025
  && y > 0.48 && y < 0.68 && z > 0.09 && z < 0.31).length, 0,
'former floating side heads must not enlarge structural turret armor');
assert.equal(turret.filter(([x, y, z]) => x > 1.10 && x < 1.20
  && y > 0.41 && y < 0.64 && z > -2.16 && z < -2.00).length, 0,
'former floating rear head must not remain in structural turret armor');

console.log('challenger2Geometry.selftest: fenders, parallel cheeks, roof seating, and track clearance pass');
