import assert from 'node:assert/strict';
import * as THREE from 'three';

await import('./resourceLifetime.selftest.mjs');
await import('./csmShaderRelease.selftest.mjs');

globalThis.window = { __GL_DIAG: { errors: [] } };

const {
  diagUiRequested, reclaimShadows, runDeviceDiag, runSceneBlackWatchdog,
} = await import('./deviceDiag.ts');
const { debugModeRequested } = await import('../dev/debugIntent.ts');

assert.equal(diagUiRequested('?diag'), true);
assert.equal(diagUiRequested('?diag=1'), true);
assert.equal(diagUiRequested('?diag=true'), true);
assert.equal(diagUiRequested('?diag=0'), false);
assert.equal(diagUiRequested('?debug=1'), false);
assert.equal(diagUiRequested('?diagforce=noshadow'), false,
  'a forced rescue must remain silent unless the diagnostic UI was requested');
assert.equal(debugModeRequested('?debug'), true);
assert.equal(debugModeRequested('?debug=1'), true);
assert.equal(debugModeRequested('?debug=0'), false);
assert.equal(debugModeRequested('?diag=1'), false);

const originalTarget = { name: 'screen' };
let currentTarget = originalTarget;
const renderer = {
  shadowMap: { enabled: true },
  getRenderTarget: () => currentTarget,
  getActiveCubeFace: () => 0,
  getActiveMipmapLevel: () => 0,
  setRenderTarget: (target) => { currentTarget = target; },
  clear() {},
  render() {},
  readRenderTargetPixels() { throw new Error('simulated GPU readback failure'); },
};
const scene = {
  environment: null,
  fog: null,
  traverse() {},
};

const result = runSceneBlackWatchdog(renderer, scene, {});
assert.equal(currentTarget, originalTarget,
  'black-scene readback failure restores the display render target');
assert.equal(result.rescued, false);
assert.ok(window.__GL_DIAG.errors.some((message) => message.includes('watchdog threw')));

let disposedGeometries = 0;
let disposedMaterials = 0;
const disposeGeometry = THREE.BufferGeometry.prototype.dispose;
const disposeMaterial = THREE.Material.prototype.dispose;
THREE.BufferGeometry.prototype.dispose = function disposeCheckedGeometry() {
  disposedGeometries++;
  return disposeGeometry.call(this);
};
THREE.Material.prototype.dispose = function disposeCheckedMaterial() {
  disposedMaterials++;
  return disposeMaterial.call(this);
};
try {
  currentTarget = originalTarget;
  const diagResult = runDeviceDiag(renderer);
  assert.equal(diagResult.basic, false);
  assert.equal(currentTarget, originalTarget,
    'boot diagnostic readback failure restores the display render target');
  assert.ok(disposedGeometries > 0 && disposedMaterials > 0,
    'boot diagnostic readback failure disposes temporary scene resources');
} finally {
  THREE.BufferGeometry.prototype.dispose = disposeGeometry;
  THREE.Material.prototype.dispose = disposeMaterial;
}

const reclaimTarget = { name: 'screen' };
let reclaimCurrentTarget = reclaimTarget;
const probeTargets = new Set();
const reclaimRenderer = {
  shadowMap: { enabled: false },
  getRenderTarget: () => reclaimCurrentTarget,
  getActiveCubeFace: () => 0,
  getActiveMipmapLevel: () => 0,
  setRenderTarget: (target) => {
    reclaimCurrentTarget = target;
    if (target !== reclaimTarget) probeTargets.add(target);
  },
  clear() {},
  render() {},
  readRenderTargetPixels(_target, _x, _y, _width, _height, buffer) { buffer.fill(12); },
};
const reclaimScene = { traverse() {} };
assert.deepEqual(reclaimShadows(reclaimRenderer, reclaimScene, {}), {
  reclaimed: true,
  reason: 'healthy',
});
assert.equal(reclaimCurrentTarget, reclaimTarget,
  'shadow reclaim restores the display render target');
assert.equal(probeTargets.size, 1,
  'shadow reclaim reuses one GPU readback target for all measurements');

const savedPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
let clock = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });
try {
  const original = { target: new THREE.WebGLCubeRenderTarget(8), face: 4, mip: 2 };
  let bound = { ...original };
  let failReadback = false;
  const timedRenderer = {
    shadowMap: { enabled: true }, info: { programs: [{}, {}] },
    getRenderTarget: () => bound.target,
    getActiveCubeFace: () => bound.face,
    getActiveMipmapLevel: () => bound.mip,
    setRenderTarget(target, face = 0, mip = 0) { clock += 1; bound = { target, face, mip }; },
    clear() { clock += 2; },
    render() { clock += 13; this.info.programs.push({}); },
    readRenderTargetPixels(target, x, y, width, height, buffer) {
      clock += 21;
      assert.deepEqual([x, y, width, height], [0, 0, 64, 22]);
      assert.equal(target, bound.target);
      if (failReadback) throw new Error('readback failed');
      buffer.fill(18);
      for (let i = 3; i < buffer.length; i += 4) buffer[i] = 0;
    },
  };
  const timed = runSceneBlackWatchdog(timedRenderer, scene, {}, { measureTimings: true });
  assert.deepEqual(bound, original, 'probe restores exact cube face and mip, not only target');
  assert.deepEqual(timed, { before: 18, after: null, rescued: false, stage: null,
    measurements: [{ startTime: 0, endTime: 38, setupMs: 3, renderMs: 13, readbackMs: 21,
      reduceMs: 0, restoreMs: 1, programsBeforeRender: 2, programsAfterRender: 3 }] });
  failReadback = true;
  const failed = runSceneBlackWatchdog(timedRenderer, scene, {}, { measureTimings: true });
  assert.deepEqual(bound, original, 'failure restores cube face and mip too');
  assert.equal(failed.measurements[0].endTime, 76);
  assert.equal(failed.measurements[0].readbackMs, 21, 'failed operation retains elapsed work');
  assert.equal(failed.measurements[0].reduceMs, undefined, 'unexecuted operation is not zero');
  assert.equal(Object.hasOwn(result, 'measurements'), false, 'ordinary watchdog avoids timing output');
  original.target.dispose();
} finally {
  Object.defineProperty(globalThis, 'performance', savedPerformance);
}

console.log('deviceDiag.selftest: UI gates + reusable readback ownership and stage timing passed');
