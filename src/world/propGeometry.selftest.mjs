import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  box, gablePrism, jitterUV, makeTelephonePoleDistanceGeometry, scaleUV, slabBox,
} from './propGeometry.js';

const scaled = new THREE.PlaneGeometry(2, 2);
const scaledBefore = Array.from(scaled.attributes.uv.array);
assert.equal(scaleUV(scaled, 3, 5), scaled);
for (let i = 0; i < scaledBefore.length; i += 2) {
  assert.equal(scaled.attributes.uv.array[i], Math.fround(scaledBefore[i] * 3));
  assert.equal(scaled.attributes.uv.array[i + 1], Math.fround(scaledBefore[i + 1] * 5));
}

const ordinary = box(2, 3, 4, 0.5);
const ordinaryBase = new THREE.BoxGeometry(2, 3, 4);
for (let i = 0; i < ordinary.attributes.uv.count; i++) {
  assert.equal(ordinary.attributes.uv.getX(i), Math.fround(ordinaryBase.attributes.uv.getX(i) * 2));
  assert.equal(ordinary.attributes.uv.getY(i), Math.fround(ordinaryBase.attributes.uv.getY(i) * 1.5));
}

const slab = slabBox(2, 0.2, 6, 0.5);
assert.equal(slab.attributes.uv.getY(8), 3,
  'the first top-face UV uses slab depth rather than slab thickness');

const gable = gablePrism(4, 2, 0.6);
gable.computeBoundingBox();
assert.ok(Math.abs(gable.boundingBox.min.z + 0.3) < 1e-6);
assert.ok(Math.abs(gable.boundingBox.max.z - 0.3) < 1e-6);

const jittered = new THREE.PlaneGeometry(2, 2);
const jitterBefore = Array.from(jittered.attributes.uv.array);
const draws = [0.1, 0.2, 0.3, 0.4];
let drawIndex = 0;
assert.equal(jitterUV(jittered, () => draws[drawIndex++]), jittered);
assert.equal(drawIndex, 4, 'UV jitter consumes exactly four seeded random draws');
for (let i = 0; i < jitterBefore.length; i += 2) {
  assert.equal(jittered.attributes.uv.array[i], Math.fround(jitterBefore[i] * 0.95 + 0.731));
  assert.equal(jittered.attributes.uv.array[i + 1], Math.fround(jitterBefore[i + 1] * 0.98 + 1.034));
}

const poleDistance = makeTelephonePoleDistanceGeometry();
assert.equal((poleDistance.index?.count || poleDistance.attributes.position.count) / 3, 340,
  'distance pole has a fixed 340-triangle silhouette');
assert.equal(poleDistance.userData.distanceRepresentation, 'telephone-pole');
assert.equal(poleDistance.attributes.color.count, poleDistance.attributes.position.count,
  'every distance-pole vertex carries authored color');
assert.ok(poleDistance.boundingBox.min.y < 0 && poleDistance.boundingBox.min.y > -0.16,
  'distance pole retains the authored ground sink');
assert.ok(poleDistance.boundingBox.max.y > 7 && poleDistance.boundingBox.max.y < 7.02,
  'distance pole retains the full-height silhouette');
assert.ok(poleDistance.boundingBox.max.x - poleDistance.boundingBox.min.x >= 3.15,
  'distance pole retains the widest crossarm span');
for (const value of poleDistance.attributes.position.array) {
  assert.ok(Number.isFinite(value), 'distance pole positions stay finite');
}

for (const geometry of [scaled, ordinary, ordinaryBase, slab, gable, jittered, poleDistance]) geometry.dispose();

console.log('propGeometry.selftest: shared UV geometry contracts passed');
