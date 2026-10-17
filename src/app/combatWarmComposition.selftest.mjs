import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombatWarmComposition } from './combatWarmComposition.ts';

const calls = {
  studio: 0,
  battleInvalidate: 0,
  forwardInvalidate: 0,
  pending: [],
  rareExecutions: [],
};
const game = { tanks: [], phase: 'garage', preBattleS: Infinity };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1000);
const battleWarm = {
  requireRuntime() {
    return {
      createCombatOpeningWarmSteps: function* () {},
      createCombatRareWarmSteps: function* (_context, execution) { calls.rareExecutions.push(execution); },
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
const hiddenRoot = new THREE.Group();
hiddenRoot.visible = false;
const sourceMaterial = new THREE.MeshStandardMaterial();
const hiddenMesh = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial);
hiddenRoot.add(hiddenMesh);
game.tanks.push({ team: 'enemy', networkVisible: false, visual: { root: hiddenRoot } });
let warmCalls = 0;
forwardProgramWarm.initializeSteps = function* (root) {
  assert.equal(root.parent, scene, 'detached enemies warm with the real scene');
  assert.equal(root.visible, true);
  assert.notEqual(hiddenMesh.material, sourceMaterial);
  warmCalls++; yield;
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

for (const _ of owner.warmVisionSteps()) {
  assert.equal(hiddenRoot.parent, null, 'unspotted enemies stay detached between warm slices');
  assert.equal(hiddenRoot.visible, false);
  assert.equal(hiddenMesh.material, sourceMaterial);
}
assert.equal(warmCalls, 1);
assert.equal([...owner.warmVisionSteps()].length, 0, 'owner reuses prepared roster');
scene.add(hiddenRoot); hiddenRoot.visible = true; game.tanks[0].networkVisible = true;
owner.thermalVehicles.begin(game.tanks, true, 'player');
assert.notEqual(hiddenMesh.material, sourceMaterial, 'live frame uses warmed owner');
owner.thermalVehicles.end();
scene.remove(hiddenRoot); hiddenRoot.visible = false;

await owner.warmStudioPipeline();
assert.equal(calls.studio, 1, 'Studio warm delegates through the shared typed owner');
assert.deepEqual(studioTrace, { totalMs: 1, stages: {} });

await owner.combatWarm.warmRareChunked(6, async () => {});
assert.equal(calls.rareExecutions.at(-1).cooperative, true,
  'composition forwards the cooperative execution context into the battle-only owner');
owner.combatWarm.reset();
owner.combatWarm.drain();
assert.equal(calls.rareExecutions.at(-1), undefined,
  'composition preserves fresh synchronous capture/drain mode');

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
// (2026-10-16, the perf lane: 226's game entry budget) the deferred warm's owner is its own chunk: a current battle's
// schedule loads it and runs it (here a Garage phase, so it releases the hold at once), and the composition imports it
// only lazily
{
  const before = calls.pending.length;
  await owner.scheduleDeferred(7);
  assert.deepEqual(calls.pending.slice(before), [false], 'a current schedule loads the owner and its warm releases the hold');
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./combatWarmComposition.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import \{[^}]*\} from '\.\.\/game\/deferredCombatWarmRuntime\.ts';/m, 'only its type is imported statically');
  assert.match(source, /import\('\.\.\/game\/deferredCombatWarmRuntime\.ts'\)/);
  assert.match(source, /if \(generation === getGeneration\(\)\) setPending\(false\);/, 'a module that fails to load releases the countdown\'s hold');
}
owner.dispose();
sourceMaterial.dispose(); hiddenMesh.geometry.dispose();

console.log('combatWarmComposition.selftest: shared warm ownership and reset passed');
