import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const tank = createTank('merkava4b', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

const near = (value, target, epsilon = 1e-5) => Math.abs(value - target) <= epsilon;
const turret = tank.root.getObjectByName('rig_turret');
const hull = tank.root.getObjectByName('rig_hull');

const eraReceipt = turret?.userData.merkava4bEraReceipt;
assert.ok(eraReceipt, 'Merkava 4B exposes its conformal ERA seating receipt');
assert.equal(eraReceipt.revision, 'conformal-cheek-r1');
assert.equal(eraReceipt.totalCassettes, 20, 'two rows of five cassettes cover each cheek');
assert.equal(eraReceipt.seats.length, 20, 'every cassette has an audited surface seat');
assert.equal(eraReceipt.maxSurfaceGapM, 0, 'ERA permits no visible gap from the cheek skin');
assert.ok(near(eraReceipt.contactEmbedM, 0.014), 'ERA inner faces overlap the cheek by 14 mm');
assert.deepEqual(eraReceipt.visualTurretPivot, [0, 1.78, -0.55],
  'ERA uses the visual Mk 4B turret pivot');
assert.deepEqual(eraReceipt.combatTurretPivot, [0, 1.62, -0.35],
  'combat-data pivot remains explicit instead of silently offsetting ERA');

for (const seat of eraReceipt.seats) {
  const center = new THREE.Vector3(...seat.center);
  const surface = new THREE.Vector3(...seat.surface);
  const normal = new THREE.Vector3(...seat.normal);
  assert.ok(near(normal.length(), 1), 'cassette surface normal stays normalized');
  assert.ok(center.x * normal.x > 0,
    'left and right cassette normals point outward from the turret centerline');
  assert.ok(near(center.clone().sub(surface).dot(normal), seat.centerProudM),
    'cassette center follows the ruled cheek surface along its own normal');
  assert.ok(near(seat.cassetteDepthM / 2 - seat.centerProudM, seat.innerFaceOverlapM),
    'cassette inner face is embedded rather than floating above the cheek');
}

const eraLayers = [];
turret.traverse((object) => {
  const dimensions = object.geometry?.parameters;
  if (object.isInstancedMesh && object.count === 20
    && near(dimensions?.width ?? 0, 0.28)
    && near(dimensions?.height ?? 0, 0.13)
    && near(dimensions?.depth ?? 0, 0.07)) eraLayers.push(object);
});
assert.equal(eraLayers.length, 1, 'all twenty cheek cassettes share one instanced ERA layer');

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const normal = new THREE.Vector3();
let leftCount = 0;
let rightCount = 0;
for (let instance = 0; instance < eraLayers[0].count; instance++) {
  eraLayers[0].getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  normal.set(0, 0, 1).transformDirection(matrix);
  if (position.x < 0) leftCount++; else rightCount++;
  assert.ok(position.x * normal.x > 0,
    `rendered ERA cassette ${instance} faces away from the centerline`);
}
assert.equal(leftCount, 10, 'ten rendered cassettes cover the left cheek');
assert.equal(rightCount, 10, 'ten rendered cassettes cover the right cheek');

const chassisReceipt = hull?.userData.merkava4bChassisReceipt;
assert.ok(chassisReceipt, 'Merkava 4B exposes its shortened-bow running-gear receipt');
assert.equal(chassisReceipt.revision, 'short-bow-raised-sprocket-course-r3');
assert.ok(near(chassisReceipt.hullNoseZ, 3.18), 'upper hull nose is 15 cm shorter');
assert.ok(near(chassisReceipt.lowerGlacisToeZ, 2.56),
  'lower glacis toe is shortened by another 30 cm');
assert.ok(near(chassisReceipt.previousLowerGlacisToeZ, 2.86),
  'receipt records the prior lower-glacis station');
assert.ok(near(chassisReceipt.lowerGlacisKneeZ, 2.44),
  'lower-glacis knee retreats with the toe instead of letting the plate invert');
assert.ok(near(chassisReceipt.previousLowerGlacisKneeZ, 2.74));
assert.ok(near(chassisReceipt.additionalLowerGlacisShorteningM, 0.30));
assert.ok(near(chassisReceipt.totalLowerGlacisShorteningM, 0.75));
assert.ok(near(chassisReceipt.glacisFurnitureToeZ, 3.12),
  'glacis furniture remains seated on the shortened bow');
assert.ok(near(chassisReceipt.trackRearShiftM, 0.20),
  'road wheels, return rollers, idlers, and track course move 20 cm rearward');
assert.ok(near(chassisReceipt.sprocketZ, 2.90), 'front sprocket keeps its original station');
assert.ok(near(chassisReceipt.sprocketY, 0.896875), 'front sprocket rises 20 cm');
assert.ok(near(chassisReceipt.previousSprocketY, 0.696875));
assert.ok(near(chassisReceipt.sprocketRaiseM, 0.20));
assert.ok(near(chassisReceipt.idlerZ, -3.25), 'rear idler follows the shifted course');

const tireLayer = tank.root.getObjectByName('gearRoadWheelTires');
assert.ok(tireLayer?.isInstancedMesh, 'road wheels remain on the suspension-driven layer');
const wheelStations = new Set();
for (let instance = 0; instance < tireLayer.count; instance++) {
  tireLayer.getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  wheelStations.add(Number(position.z.toFixed(6)));
}
assert.deepEqual([...wheelStations].sort((a, b) => b - a),
  chassisReceipt.roadWheelZs.map(value => Number(value.toFixed(6))).sort((a, b) => b - a),
  'all six suspension stations use the rear-shifted course');

const endWheelCenters = [];
hull.traverse((object) => {
  if (object.name === 'gearEndWheelBody') {
    endWheelCenters.push([
      Number(object.position.y.toFixed(6)),
      Number(object.position.z.toFixed(6)),
    ]);
  }
});
assert.deepEqual([...new Map(endWheelCenters.map(center => [center.join(':'), center])).values()]
  .sort((a, b) => b[1] - a[1]), [[0.896875, 2.9], [0.845625, -3.25]],
  'front sprocket rises without moving fore/aft while the rear idler remains unchanged');

tank.dispose?.();
console.log('merkava4bGeometry.selftest: flush cheek ERA and shortened rear-shifted chassis passed');
