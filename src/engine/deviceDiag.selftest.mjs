import assert from 'node:assert/strict';

globalThis.window = { __GL_DIAG: { errors: [] } };

const { diagUiRequested, runSceneBlackWatchdog } = await import('./deviceDiag.js');
const { debugModeRequested } = await import('../ui/perfHud.js');

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

console.log('deviceDiag.selftest: explicit UI gates + watchdog target restore passed');
