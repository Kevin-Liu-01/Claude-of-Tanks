import assert from 'node:assert/strict';
import * as THREE from 'three';
import { comparisonCameras } from './source-comparison-cameras.mjs';
const source = new THREE.Box3(new THREE.Vector3(-2, 0, -4), new THREE.Vector3(2, 4, 4));
const cameraFor = box => {
  const center = box.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100);
  camera.position.copy(center).add(new THREE.Vector3(0, 0, 20));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  return camera;
};
for (const shift of [-1.5, 0, 1.5]) {
  const candidate = source.clone().translate(new THREE.Vector3(shift, 0, 0));
  const fixed = comparisonCameras(cameraFor, source, candidate, true);
  const refPixel = source.getCenter(new THREE.Vector3()).project(fixed.reference);
  const procPixel = candidate.getCenter(new THREE.Vector3()).project(fixed.candidate);
  assert.ok(Math.abs(procPixel.x - refPixel.x - shift / 5) < 1e-12,
    'source-world comparison exposes actual candidate translation');
  const legacy = comparisonCameras(cameraFor, source, candidate, false);
  assert.ok(Math.abs(candidate.getCenter(new THREE.Vector3()).project(legacy.candidate).x) < 1e-12,
    'unregistered legacy presentation remains independently centered');
}
const invalidCandidate = new Proxy({}, {get() {throw new Error('candidate bounds inspected');}});
assert.doesNotThrow(() => comparisonCameras(cameraFor, source, invalidCandidate, true),
  'registered camera must not depend on any candidate dimension');
console.log('source-comparison-cameras: translated candidate remains displaced; source ruler and legacy controls pass');
