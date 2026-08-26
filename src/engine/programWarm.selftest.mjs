import assert from 'node:assert/strict';
import {
  compileForRenderTarget,
  snapshotRendererPrograms,
  warmNewRendererProgramUniforms,
} from './programWarm.ts';

const calls = [];
const oldProgram = { getUniforms: () => calls.push('old') };
const firstNew = { getUniforms: () => calls.push('first') };
const brokenNew = { getUniforms: () => { calls.push('broken'); throw new Error('driver'); } };
const renderer = { info: { programs: [oldProgram] } };
const baseline = snapshotRendererPrograms(renderer);
renderer.info.programs.push(firstNew, brokenNew, {});

let ticks = 0;
let clock = 0;
const receipt = await warmNewRendererProgramUniforms(
  renderer,
  baseline,
  async () => { ticks += 1; },
  () => { clock += 3; return clock; },
);

assert.deepEqual(calls, ['first', 'broken'], 'only newly linked uniform tables are consumed');
assert.equal(ticks, 2, 'each eligible program gives the scheduler a checkpoint');
assert.equal(receipt.programs, 2);
assert.equal(receipt.failures, 1, 'a driver-specific failure keeps the real-render fallback');
assert.equal(receipt.maxMs, 3);
assert.equal(receipt.totalMs, 15);

const targetCalls = [];
const targetRenderer = {
  target: 'default',
  face: 3,
  mip: 2,
  getRenderTarget() { return this.target; },
  getActiveCubeFace() { return this.face; },
  getActiveMipmapLevel() { return this.mip; },
  setRenderTarget(target, face = 0, mip = 0) {
    this.target = target;
    this.face = face;
    this.mip = mip;
    targetCalls.push(['target', target, face, mip]);
  },
  compile(root, camera, targetScene) {
    targetCalls.push(['compile', root, camera, targetScene, this.target]);
  },
};
compileForRenderTarget({
  renderer: targetRenderer,
  root: 'vehicle',
  camera: 'deployment-camera',
  targetScene: 'battle-scene',
  target: 'composer-hdr',
});
assert.deepEqual(targetCalls, [
  ['target', 'composer-hdr', 0, 0],
  ['compile', 'vehicle', 'deployment-camera', 'battle-scene', 'composer-hdr'],
  ['target', 'default', 3, 2],
], 'compile uses the production target and restores the complete prior state');

console.log('programWarm.selftest: target compile and scoped uniform-table draining passed');
