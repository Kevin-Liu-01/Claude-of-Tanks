// battleEntryLoadFailure.selftest.mjs — two optional battle chunks no longer stop every later battle after one failed
// load (2026-11-02 audit R6/F2). Copyright © 2026 Kevin B. Liu.
//
// The deferred combat warm's chunk was kept as `deferredModule ??= import(...)`: one failed idle prefetch at boot, which
// the player never asked for, made warmFirstBattleCovered reject, and the solo entry awaits it with no catch, so every
// later solo entry failed at "Preparing effects" though the warm is optional. The mission-attachment visual was kept the
// same way, and the FX gate that every battle, Studio and shot frame waits on awaits it. Both are now one
// app/lazyChunk.ts: the covered warm skips on a load failure (the deferred warm does it in play) and the attachment
// resolves without a mount, and the next ask past the backoff loads each. A chunk "fails" as a browser's does when the
// network drops: its resolve throws once.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

let clock = 0;
performance.now = () => clock; // the lazy chunks' default clock

const failing = new Set();
const asked = [];
const blip = (specifier) => new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
const ATTACHMENT_STUB = `data:text/javascript,${encodeURIComponent('export function syncMissionAttachment() {}')}`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (failing.has(specifier)) { failing.delete(specifier); asked.push(`${specifier} (failed)`); throw blip(specifier); }
    if (specifier === './missionAttachmentVisual.ts' && context.parentURL?.endsWith('/src/game/battlePresentationRuntime.ts')) {
      asked.push(specifier);
      return { url: ATTACHMENT_STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const warnings = [];
const warn = console.warn;
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };

// ---- the first battle's covered warm: a failed chunk skips it (the entry goes on), and a later battle runs it
{
  const { createCombatWarmComposition } = await import('./combatWarmComposition.ts');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1000);
  const game = { tanks: [], phase: 'battle', preBattleS: Infinity };
  const owner = createCombatWarmComposition({
    game, renderer: {}, scene, camera, post: { prepareSoftParticles() {} },
    lighting: { updateFov() {}, update() {}, preservePrimedCascadesForNextFrame() {} },
    battleWarm: { requireRuntime: () => ({ createCombatOpeningWarmSteps: function* () {}, createCombatRareWarmSteps: function* () {} }),
      warmBattleTerrainTiles: async () => {}, invalidate() {} },
    forwardProgramWarm: { *initializeSteps() {}, invalidate() {} },
    getFx: () => ({}), getWorld: () => null, getBattleVisuals: () => ({ stream: async () => 0 }),
    getGeneration: () => 1, setPending() {}, prepareNextOpeningRoute: () => false, ensureStagedVisuals: () => true,
    prebakeBurntSteps: function* () {}, warmWreckTextures() {}, createIsolatedForwardWarmBatches: function* () {},
    scratch1: new THREE.Vector3(), scratch2: new THREE.Vector3(), scratch3: new THREE.Vector3(), anisotropy: 4,
    noteFovPrimed() {}, simDt: 1 / 60,
  });
  failing.add('../game/deferredCombatWarmRuntime.ts');
  const skipped = await owner.warmFirstBattleCovered(async () => {});
  assert.equal(skipped.ran, false, 'a failed chunk skips the covered warm: the solo entry goes on');
  assert.equal(skipped.failed, 'load');
  assert.ok(warnings.some((line) => /covered warm did not load/.test(line)), 'and says so in the console');
  const again = await owner.warmFirstBattleCovered(async () => {});
  assert.equal(again.ran, false, 'inside the backoff the next entry skips it too, without a fetch');
  clock += 2_000;
  const ran = await owner.warmFirstBattleCovered(async () => {});
  assert.equal(ran.ran, true, 'a later battle past the backoff loads the chunk and runs the warm it skipped');
  assert.equal((await owner.warmFirstBattleCovered(async () => {})).ran, false, 'then once a renderer, as before');
  owner.dispose();
  delete globalThis.__BATTLE_FIRST_WARM;
}

// ---- the mission-attachment visual: a failed chunk resolves the FX gate (no mount yet), and a later ask loads it
{
  const { loadMissionAttachmentVisual } = await import('../game/battlePresentationRuntime.ts');
  failing.add('./missionAttachmentVisual.ts');
  clock += 60_000;
  await loadMissionAttachmentVisual();
  assert.deepEqual(asked.filter((line) => line.startsWith('./missionAttachmentVisual.ts')), ['./missionAttachmentVisual.ts (failed)'],
    'the gate resolved though the chunk failed');
  assert.ok(warnings.some((line) => /mission attachment/.test(line)));
  assert.equal(loadMissionAttachmentVisual(), loadMissionAttachmentVisual(), 'an aerial tank asking every frame allocates nothing');
  clock += 2_000;
  await loadMissionAttachmentVisual();
  assert.deepEqual(asked.filter((line) => line.startsWith('./missionAttachmentVisual.ts')),
    ['./missionAttachmentVisual.ts (failed)', './missionAttachmentVisual.ts'], 'the next ask past the backoff loads it');
  assert.equal(loadMissionAttachmentVisual(), loadMissionAttachmentVisual());
}

console.warn = warn;
hook.deregister();
console.log('battleEntryLoadFailure.selftest: a failed deferred-warm or mission-attachment chunk no longer fails later battles; the next ask past the backoff loads it');
