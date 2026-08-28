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

console.log('deviceDiag.selftest: UI gates + reusable readback ownership passed');
