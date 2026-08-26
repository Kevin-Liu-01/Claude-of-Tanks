import assert from 'node:assert/strict';
import { Group, Object3D, PerspectiveCamera, Texture, Vector3 } from 'three';
import {
  invalidateBattleWarmRuntime,
  stageCombatFxProgramSubmission,
  warmStudioEffects,
} from './battleWarmRuntime.ts';

function createFxProbe() {
  const group = new Group();
  group.visible = false;
  group.userData.softParticles = { layer: 27 };
  const textured = new Object3D();
  textured.material = { map: new Texture() };
  group.add(textured);
  const calls = [];
  return {
    calls,
    group,
    warmTexturesChunked: async (yieldForBudget) => {
      calls.push('textures');
      await yieldForBudget();
    },
    warmOpeningEffects: () => calls.push('opening'),
    impact: (kind) => calls.push(`impact:${kind}`),
    dust: () => calls.push('dust'),
    exhaust: () => calls.push('exhaust'),
    destruction: (_position, _source, kind) => calls.push(`destruction:${kind}`),
    propBreak: (kind) => calls.push(`prop:${kind}`),
    propCrush: () => calls.push('crush'),
    update: (_dt, shells) => calls.push(`update:${shells.length}`),
    resetAll: () => calls.push('reset'),
  };
}

invalidateBattleWarmRuntime();
const studioFx = createFxProbe();
const studioCamera = new PerspectiveCamera();
const studioMask = studioCamera.layers.mask;
let prepared = 0;
let initializedPrograms = 0;
let initializedTextures = 0;
let clock = 0;
const progress = [];
const traces = [];
const studioOptions = {
  fx: studioFx,
  post: { prepareSoftParticles: () => { prepared += 1; } },
  renderer: { initTexture: () => { initializedTextures += 1; } },
  camera: studioCamera,
  * initializeForwardPrograms() {
    initializedPrograms += 1;
    yield;
  },
  isCombatPipelineWarmed: () => false,
  onProgress: (fraction, label) => progress.push([fraction, label]),
  onTrace: (trace) => traces.push(trace),
  now: () => clock += 10,
};

await Promise.all([
  warmStudioEffects(studioOptions),
  warmStudioEffects(studioOptions),
]);
assert.equal(studioFx.calls.filter((call) => call === 'textures').length, 1,
  'concurrent Studio callers share one exact warm');
assert.equal(initializedPrograms, 1);
assert.equal(initializedTextures, 1);
assert.equal(prepared, 1);
assert.equal(studioCamera.layers.mask, studioMask, 'Studio warm restores camera layers');
assert.equal(traces.length, 1);
assert.ok(progress.some(([fraction]) => fraction === 1));

await warmStudioEffects(studioOptions);
assert.equal(initializedPrograms, 1, 'a valid renderer receipt remains memoized');
invalidateBattleWarmRuntime();
await warmStudioEffects(studioOptions);
assert.equal(initializedPrograms, 2,
  'context invalidation forces Studio programs and textures through the owner again');

const combatFx = createFxProbe();
const combatCamera = new PerspectiveCamera();
combatCamera.layers.mask = 5;
const combatMask = combatCamera.layers.mask;
const game = {
  tanks: [],
  player: {
    state: { pos: { x: 12, y: 3, z: -8 } },
    spec: { gun: { shells: [{ caliberMm: 125 }] } },
    combat: { shellSlot: 0 },
  },
};
let shellOrigin = null;
const submission = stageCombatFxProgramSubmission({
  game,
  fx: combatFx,
  post: { prepareSoftParticles: () => combatFx.calls.push('soft') },
  camera: combatCamera,
  createShell: (_spec, _shooter, _isPlayer, position) => {
    shellOrigin = position.clone();
    return { pos: new Vector3(), prevPos: new Vector3() };
  },
});
assert.equal(submission.staged, true);
assert.deepEqual(shellOrigin?.toArray(), [12, 4.4, -4],
  'deployment FX stages around the exact player field');
assert.equal(combatFx.group.visible, true);
assert.ok(combatFx.calls.includes('update:1'), 'the live tracer ribbon is allocated');
assert.ok(combatFx.calls.includes('prop:drumblast'), 'rare prop pools are included');
submission.restore();
assert.equal(combatFx.group.visible, false, 'FX root visibility is restored exactly');
assert.equal(combatCamera.layers.mask, combatMask, 'combat staging restores camera layers');
assert.equal(combatFx.calls.at(-1), 'reset');

console.log('battleWarmRuntime.selftest: Studio invalidation and covered FX staging passed');
