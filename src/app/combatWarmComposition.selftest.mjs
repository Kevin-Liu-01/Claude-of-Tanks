import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombatWarmComposition } from './combatWarmComposition.ts';

const calls = {
  studio: 0,
  battleInvalidate: 0,
  forwardInvalidate: 0,
  pending: [],
};
const game = { tanks: [], phase: 'garage', preBattleS: Infinity };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1000);
const battleWarm = {
  requireRuntime() {
    return {
      createCombatOpeningWarmSteps: function* () {},
      createCombatRareWarmSteps: function* () {},
    };
  },
  warmBattleTerrainTiles: async () => {},
  async warmStudioEffects(options) {
    calls.studio += 1;
    assert.equal(options.isCombatPipelineWarmed(), false);
    options.onTrace?.({ totalMs: 1, stages: {} });
  },
  invalidate() { calls.battleInvalidate += 1; },
};
const forwardProgramWarm = {
  compile() {},
  *initializeSteps() {},
  *linkerBreathingSlices() {},
  invalidate() { calls.forwardInvalidate += 1; },
};
let studioTrace = null;
const owner = createCombatWarmComposition({
  game,
  renderer: {},
  scene,
  camera,
  post: { prepareSoftParticles() {} },
  lighting: { updateFov() {}, update() {}, preservePrimedCascadesForNextFrame() {} },
  battleWarm,
  forwardProgramWarm,
  getFx: () => ({}),
  getWorld: () => null,
  getBattleVisuals: () => ({ stream: async () => 0 }),
  getGeneration: () => 7,
  setPending: (pending) => calls.pending.push(pending),
  prepareNextOpeningRoute: () => false,
  ensureStagedVisuals: () => true,
  prebakeBurntSteps: function* () {},
  warmWreckTextures() {},
  createIsolatedForwardWarmBatches: function* () {},
  scratch1: new THREE.Vector3(),
  scratch2: new THREE.Vector3(),
  scratch3: new THREE.Vector3(),
  anisotropy: 4,
  noteFovPrimed() {},
  simDt: 1 / 60,
  publishStudioTrace: (trace) => { studioTrace = trace; },
});

await owner.warmStudioPipeline();
assert.equal(calls.studio, 1, 'Studio warm delegates through the shared typed owner');
assert.deepEqual(studioTrace, { totalMs: 1, stages: {} });

owner.combatWarm.markOpeningReady();
owner.combatWarm.markRareReady();
owner.setDestructionWarmed(true);
owner.resetRendererWarmState();
assert.equal(owner.combatWarm.isOpeningReady(), false);
assert.equal(owner.combatWarm.isRareReady(), false);
assert.equal(owner.isDestructionWarmed(), false);
assert.equal(calls.battleInvalidate, 1);
assert.equal(calls.forwardInvalidate, 1);
assert.equal(calls.pending.at(-1), false,
  'context restoration clears any deferred warm pending receipt');

await owner.scheduleDeferred(-1);
assert.equal(calls.pending.at(-1), false,
  'stale generations cannot start a deferred renderer warm');
owner.dispose();

console.log('combatWarmComposition.selftest: shared warm ownership and reset passed');
