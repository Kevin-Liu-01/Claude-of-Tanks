import assert from 'node:assert/strict';

globalThis.window = { __GL_DIAG: { errors: [] } };

const { runSceneBlackWatchdog } = await import('./deviceDiag.js');

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

console.log('deviceDiag.selftest: watchdog failure restores the display target');
