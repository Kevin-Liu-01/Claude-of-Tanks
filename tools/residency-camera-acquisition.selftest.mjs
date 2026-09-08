import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PerspectiveCamera } from 'three';
import {
  RESIDENCY_CAMERA_PROTOCOL, cameraManifestRecord, cameraManifestValid, cameraForMap,
  applyResidencyCamera, captureResidencyCameraState, isCameraStateReceipt,
} from './residency-camera-acquisition.mjs';

const saved = { mapId: 'verdant', position: [-60, 25, -140], quaternion: [0, 0, 0, 1], fov: 55, near: 0.5, far: 4000 };
const content = { schemaVersion: 1, protocol: RESIDENCY_CAMERA_PROTOCOL,
  source: { reportSha256: 'a'.repeat(64) }, maps: [saved] };
const manifest = cameraManifestRecord(content), viewport = { width: 1280, height: 720, deviceScaleFactor: 1 };
assert.equal(cameraManifestValid(manifest, ['verdant']), true);
assert.equal(cameraManifestValid(manifest, ['delta']), false);
assert.equal(cameraForMap(manifest, 'verdant'), saved);
assert.throws(() => cameraForMap(manifest, 'delta'), /missing/);
for (const damage of [
  record => { record.sha256 = 'b'.repeat(64); },
  record => { record.content.maps[0].position[0]++; },
  record => { record.content.maps[0].quaternion.pop(); },
  record => { record.content.maps.push(record.content.maps[0]); },
  record => { delete record.content.source; },
]) {
  const bad = structuredClone(manifest); damage(bad);
  assert.equal(cameraManifestValid(bad, ['verdant']), false, 'modified/missing manifest evidence fails');
}
for (const damage of [
  camera => { camera.near = 0; }, camera => { camera.far = 0.1; },
  camera => { camera.fov = 180; }, camera => { camera.quaternion[0] = 5; },
]) {
  const bad = structuredClone(content); damage(bad.maps[0]);
  assert.equal(cameraManifestValid(cameraManifestRecord(bad), ['verdant']), false);
}

const calls = [], camera = new PerspectiveCamera(60, 16 / 9, 0.1, 2000);
const D = {
  camera, rig: { externalActive: true }, world: { mapId: 'verdant', update: (...args) => calls.push(['world', ...args]) },
  lighting: { updateFrustums: () => calls.push(['frustum']), update: value => calls.push(['lighting', value]) },
  renderer: { getPixelRatio: () => 1, domElement: { width: 1280, height: 720,
    dataset: { renderScale: '1.000', postAa: 'smaa-high+fsr1' } } },
  post: { dynScale: 1, msaaSamples: 0, perfTrim: 0, gtao: { enabled: false }, bloom: { enabled: true } },
  quality: { resolvePresetName: () => 'high' },
};
const context = vm.createContext({ window: { __DEBUG: D } });
const invoke = (fn, value) => vm.runInContext(`(${fn.toString()})`, context)(value);
invoke(applyResidencyCamera, saved);
assert.deepEqual(camera.position.toArray(), saved.position);
assert.deepEqual(camera.quaternion.toArray(), saved.quaternion);
assert.deepEqual(calls.map(call => call[0]), ['world', 'frustum', 'lighting']);
const receipt = JSON.parse(JSON.stringify(invoke(captureResidencyCameraState)));
assert.equal(isCameraStateReceipt(receipt, saved, viewport), true);
for (const damage of [
  state => { state.camera.position[1] += 0.000001; },
  state => { state.camera.quaternion[0] += 0.000001; },
  state => { state.camera.fov = 54; }, state => { state.camera.far = 3999; },
  state => { state.render.canvas[0] = 640; }, state => { state.render.pixelRatio = 0.5; },
  state => { state.render.dynScale = 0.9; }, state => { state.render.perfTrim = 1; },
  state => { delete state.render.gtao; }, state => { delete state.render.postAA; },
]) {
  const bad = structuredClone(receipt); damage(bad);
  assert.equal(isCameraStateReceipt(bad, saved, viewport), false, 'camera/quality drift is not accepted');
}
D.rig.externalActive = false;
assert.throws(() => invoke(applyResidencyCamera, saved), /external shot/);
D.rig.externalActive = true; D.world.mapId = 'delta';
assert.throws(() => invoke(applyResidencyCamera, saved), /external shot/);
console.log('residency-camera-acquisition.selftest: immutable manifests, exact absolute pose, actual native render state and adversarial drift passed');
