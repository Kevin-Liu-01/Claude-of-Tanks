import assert from 'node:assert/strict';
import { Object3D, Scene, PerspectiveCamera, Vector3, Texture, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { createBattleEntryAcquisition } from './battleEntryAcquisition.ts';
import { createBattleVisualStreamer } from './battleVisualStreamer.ts';
import { createSoloBattleDeploymentRuntime } from './soloBattleDeploymentRuntime.ts';
import { primeOpeningTerrainPresentation } from './battleWarmRuntime.ts';
import { getLocale, setLocale } from '../ui/i18n.ts';
import { createLazyAudio } from '../audio/lazyAudio.ts';
import { createSoloBattleEntryRuntime } from './soloBattleEntryRuntime.ts';
import {
  createSoloBattleLoadingRuntime,
  soloBattleLoadingModeLabel,
} from './soloBattleLoadingRuntime.ts';

const originalLocale = getLocale();
setLocale('en-US');
assert.equal(
  soloBattleLoadingModeLabel('capture_the_flag', 'verdant'),
  'Capture the Flag · Selected Battlefield',
);
setLocale('zh-CN');
assert.equal(
  soloBattleLoadingModeLabel('capture_the_flag', 'verdant'),
  '夺旗战 · 指定战场',
  'non-standard battle loading labels stay in the active locale',
);
setLocale('en-US');

const events = [];
const world = { mapId: 'verdant', group: new Object3D() };
world.group.name = 'world';
const fxGroup = new Object3D();
fxGroup.name = 'fx';
const playerVisual = { root: new Object3D() };
const pedestalVisual = playerVisual;
const game = {
  tanks: [
    { specId: 'm1a2', isPlayer: true, visual: playerVisual, spec: { id: 'm1a2' } },
    { specId: 't90m', isPlayer: false, visual: { root: new Object3D() } },
  ],
  player: null,
};
const battleVisuals = {
  async stageRootTextureUploads(root) {
    events.push(`upload:${root.name}`);
    return { textures: 1, totalMs: 1 };
  },
  async stageBattleVisualReveal(entity, _yield, initiallyHidden, options) {
    assert.equal(initiallyHidden, false);
    assert.deepEqual(options, { compilePrograms: false },
      'early player textures remain staged but final light/camouflage state owns its first compile');
    events.push(`reveal:${entity.specId}`);
    return {
      preUploadYieldMs: 1,
      textureUploadMs: 2,
      compileMs: 0,
      postCompileYieldMs: 4,
      totalMs: 10,
    };
  },
  async stream(predicate) {
    assert.equal(predicate(game.tanks[0]), true);
    assert.equal(predicate(game.tanks[1]), false);
    events.push('stream:opening');
    return 0;
  },
};
let clock = 0;
let shown = null;
let openedAt = null;
let scheduledGeneration = null;
let delayMs = null;
let acquiredTasks = 0;

const loadingOptions = {
  game,
  post: { setAdaptiveSuspended: (value) => events.push(`adaptive:${value}`) },
  battleIntent: {
    consumeMap(specId, mapId) {
      assert.equal(specId, 'm1a2');
      assert.equal(mapId, 'random');
      return 'verdant';
    },
    prepareRoster(options) {
      assert.deepEqual(options.rosterIds, ['m1a2', 't90m']);
      assert.deepEqual(options.autoCamoIds, ['m1a2']);
      events.push('roster:textures');
      return Promise.resolve();
    },
  },
  battleLoad: {
    show: (options) => { shown = options; events.push('loader:show'); },
    progress: (_fraction, label) => events.push(`progress:${label}`),
    rosters: (allies, enemies) => {
      assert.deepEqual(allies, ['allies']);
      assert.deepEqual(enemies, ['enemies']);
      events.push('loader:rosters');
    },
    hide: async () => { events.push('loader:hide'); },
  },
  audio: {
    async startLoadingAfterPaint() {
      clock += 20; events.push('frame');
      events.push('audio:resume', 'audio:loading:true');
    },
    loadingOn: (value) => events.push(`audio:loading:${value}`),
    ambientOn: (value) => events.push(`audio:ambient:${value}`),
    warmBattleEvents: () => events.push('audio:warm'),
  },
  acquisition: {
    async acquireSolo(tasks) {
      acquiredTasks = tasks.length;
      await Promise.all(tasks.map((task) => task()));
      events.push('acquisition:done');
    },
  },
  deployment: {
    async warm(camoSweep) {
      await camoSweep;
      events.push('deployment:warm');
      return { generation: 7, revealPrimed: false, assertRevealReady() {} };
    },
  },
  lifecycle: { primeReveal: async () => { events.push('reveal:fallback'); } },
  getPendingMapId: () => 'random',
  getMapName: () => 'Verdant Fields',
  loadMapConfig: async () => ({
    name: 'Verdant Fields',
    props: { tankWrecks: { ids: ['wreck'] } },
  }),
  getMapThumb: () => '/verdant.webp',
  hasCachedWorld: () => false,
  getWorld: () => world,
  ensureWorld: async (_mapId, onProgress, options) => {
    assert.deepEqual(options, { precompile: false, services: false, atmosphere: 'covered-battle' });
    onProgress(0.5, 'Terrain');
    events.push('world:ready');
  },
  ensureBattleVisuals: async () => events.push('visuals:ready'),
  getBattleVisuals: () => battleVisuals,
  ensureBattleHud: async () => events.push('hud:ready'),
  preloadMinimap: async (mapId) => events.push(`minimap:preload:${mapId}`),
  ensureTouchControls: async () => events.push('touch:ready'),
  preloadSettings: async () => events.push('settings:ready'),
  preloadArmorAim: async () => events.push('armor:ready'),
  preloadGarageReturn: async () => events.push('return:ready'),
  planRoster: () => ['m1a2', 't90m'],
  planCamoOverrides: () => ['m1a2'],
  ensureTankBuilders: async (ids) => {
    assert.deepEqual(ids, ['m1a2', 't90m', 'wreck']);
    events.push('builders:ready');
  },
  preloadSoloAuthority: async () => events.push('authority:ready'),
  preloadBattleClient: async () => events.push('client:ready'),
  preloadBattleWarm: async () => events.push('warm:ready'),
  preloadBattleStart: async () => events.push('start:ready'),
  ensureKillcam: async () => events.push('killcam:ready'),
  ensureFx: async () => ({
    group: fxGroup,
    preloadTextures: async () => events.push('fx:preload'),
    warmTextures: () => events.push('fx:warm'),
  }),
  startBattle: (_specId, _mapId, options) => {
    assert.deepEqual(options, {
      deferVisuals: true,
      preBattleHold: true,
      randomRoster: false,
    });
    game.player = game.tanks[0];
    events.push('battle:setup');
  },
  prepareBattleWorldServices: () => events.push('world:services'),
  getPedestalVisual: () => pedestalVisual,
  prebakeSharedTextures: async () => events.push('player:prebake'),
  anisotropy: 4,
  rosterRows: (team) => team === 'player' ? ['allies'] : ['enemies'],
  warmShotCards: (ids) => {
    assert.deepEqual(ids, ['m1a2', 't90m']);
    events.push('shotcards:warm');
  },
  getCamoSweep: () => Promise.resolve(events.push('camo:ready')),
  prepareRevealCamera: () => events.push('reveal:camera'),
  resolveVisiblePreBattleSeconds: (requested, elapsed, minimum) => {
    assert.equal(requested, 5);
    assert.ok(elapsed >= 0);
    assert.equal(minimum, 2);
    return 2;
  },
  preBattleHoldSeconds: 5,
  minimumVisiblePreBattleSeconds: 2,
  openBattle: (seconds) => { openedAt = seconds; events.push('battle:open'); },
  scheduleDeferredWarm: (generation) => { scheduledGeneration = generation; },
  nextFrame: async () => { clock += 20; events.push('frame'); },
  createLoadingYielder: () => async () => { clock += 5; },
  now: () => clock,
  delay: async (milliseconds) => { delayMs = milliseconds; clock += milliseconds; },
};
const runtime = createSoloBattleLoadingRuntime(loadingOptions);

try {
  await runtime.begin('m1a2', null, { randomRoster: false });
  assert.equal(acquiredTasks, 12, 'all independent cold-entry tasks share one barrier');
  assert.ok(events.includes('minimap:preload:verdant'),
    'the exact tactical-map asset decodes alongside world construction');
  assert.equal(shown.mapName, 'Verdant Fields');
  assert.equal(shown.mode, 'Random Battle · Standard');
  assert.equal(delayMs, 840, 'fast entries preserve the minimum loader dwell');
  assert.equal(openedAt, 2);
  assert.equal(scheduledGeneration, 7);
  assert.equal(fxGroup.userData.battleTexturesStaged, true);
  assert.ok(events.indexOf('loader:show') < events.indexOf('audio:resume'));
  assert.ok(events.indexOf('frame') < events.indexOf('audio:resume'),
    'confirmed sticky activation lets the loading cover get its rendering opportunity before audio');
  assert.ok(events.indexOf('frame') < events.indexOf('return:ready'),
    'return-owner acquisition waits for the loading cover to paint');
  assert.ok(events.indexOf('return:ready') < events.indexOf('acquisition:done'),
    'Return/Battle Again code is acquired before play, not on the result click');
  assert.ok(events.indexOf('acquisition:done') < events.indexOf('battle:setup'));
  assert.ok(events.indexOf('deployment:warm') < events.indexOf('loader:hide'));
  assert.ok(events.indexOf('reveal:m1a2') < events.indexOf('camo:ready'),
    'early player upload still precedes final camouflage');
  assert.ok(events.indexOf('camo:ready') < events.indexOf('deployment:warm'));
  assert.ok(events.indexOf('reveal:fallback') < events.indexOf('loader:hide'));
  assert.ok(events.indexOf('loader:hide') < events.indexOf('battle:open'));
  assert.equal(globalThis.__BATTLE_LOAD.map, 'verdant');
  assert.equal(globalThis.__BATTLE_LOAD.visiblePreBattleS, 2);
  assert.equal(globalThis.__VISUAL_LOAD_TIMINGS.length, 1);
  assert.equal(globalThis.__VISUAL_LOAD_TIMINGS[0].compileMs, 0);
} finally {
  delete globalThis.__BATTLE_LOAD;
  delete globalThis.__VISUAL_LOAD_TIMINGS;
  delete globalThis.__WORLD_LOAD;
  setLocale(originalLocale);
}

// Use the real audio facade and default paint scheduler: this guards the
// actual Solo composition, not just a mock that promises to yield itself.
events.length = 0;
const originalRaf = globalThis.requestAnimationFrame;
let releaseAudioFrame;
globalThis.requestAnimationFrame = (callback) => { releaseAudioFrame = callback; return 1; };
const actualAudio = createLazyAudio({
  hasStickyActivation: () => true,
  createContext() { events.push('audio:device'); return null; },
  loadMixer: async () => null,
});
try {
  const actualLoading = createSoloBattleLoadingRuntime({ ...loadingOptions, audio: actualAudio });
  const opening = actualLoading.begin('m1a2', null, { randomRoster: false });
  assert.ok(events.includes('loader:show'));
  assert.ok(!events.includes('audio:device') && !events.includes('visuals:ready'),
    'the opaque loader is requested before device creation or scene acquisition');
  assert.equal(typeof releaseAudioFrame, 'function');
  releaseAudioFrame(16);
  assert.ok(!events.includes('audio:device'), 'the animation callback alone is not the post-paint task boundary');
  await opening;
  assert.ok(events.indexOf('loader:show') < events.indexOf('audio:device'));
  assert.ok(events.indexOf('audio:device') < events.indexOf('visuals:ready'));
} finally {
  if (originalRaf) globalThis.requestAnimationFrame = originalRaf;
  else delete globalThis.requestAnimationFrame;
  delete globalThis.__BATTLE_LOAD;
  delete globalThis.__VISUAL_LOAD_TIMINGS;
}

const audioRecoveryEvents = [];
const deniedDeviceAudio = createLazyAudio({
  hasStickyActivation: () => true,
  createContext() { throw new Error('audio device unavailable'); },
});
const deniedDeviceLoading = createSoloBattleLoadingRuntime({
  ...loadingOptions,
  audio: {
    ...deniedDeviceAudio,
    startLoadingAfterPaint: () => deniedDeviceAudio.startLoadingAfterPaint(async () => {}),
  },
});
await createSoloBattleEntryRuntime({
  lifecycle: {
    run: (work) => work(), coverRendering() {},
    uncoverRendering: () => audioRecoveryEvents.push('uncover'),
  },
  loading: deniedDeviceLoading,
  audio: deniedDeviceAudio,
  battleLoad: { showPending() {}, hide: () => audioRecoveryEvents.push('hide') },
  enterGarage: () => audioRecoveryEvents.push('restore-garage'),
  nextFrame: async () => {},
  isVisibleSpecId: () => true,
  getSelectedSpecId: () => 'm1a2',
  getSelectedMapId: () => 'verdant',
  reportError: (_message, error) => { assert.match(error.message, /audio device unavailable/); audioRecoveryEvents.push('report'); },
}).begin('m1a2');
assert.deepEqual(audioRecoveryEvents, ['report', 'restore-garage', 'uncover', 'hide'],
  'real deferred audio errors use existing covered-entry recovery instead of stranding the loader');
assert.equal(deniedDeviceAudio.loadingActive, false);

// Compose the real loading + deployment + bounded carpet readiness owners.
// A stubbed warm-result test alone cannot catch cancelled/early-failed warm
// taking the loading owner's optional shader fallback and uncovering anyway.
async function runComposed({ fail = '', cancel = '' } = {}) {
  events.length = 0;
  clock = 0;
  let generation = 0, coverUpdates = 0;
  const camera = new PerspectiveCamera();
  const scene = new Scene();
  scene.add(fxGroup);
  const requiredWorld = {
    ...world,
    update() {
      coverUpdates++;
      if (fail === 'carpet') throw new Error('carpet failed');
    },
    getGrassWorkState: () => ({ disposed: false, carpet: { cold: coverUpdates < 3, pending: coverUpdates < 3 } }),
  };
  game.tanks[0].state = { pos: new Vector3(20, 0, 12.5), yaw: 0 };
  game.tanks[0].team = 'player';
  game.tanks[1].team = 'enemy';
  const prepareRevealCamera = () => { camera.position.set(20, 6, -0.3); events.push('reveal:camera'); };
  const fx = { group: fxGroup };
  const gl = { isContextLost: () => false };
  const warmRender = Object.assign(() => {}, { *prepareProgramsSteps() {
    return { status: 'incomplete', pending: null, reason: 'not-requested' };
  } });
  const deployment = createSoloBattleDeploymentRuntime({
    game, scene, camera, battleLoad: loadingOptions.battleLoad,
    renderer: { info: {}, getContext: () => gl },
    battleWarm: {
      warmBattleTerrainTiles: async () => {},
      primeOpeningTerrainPresentation,
      stageCombatFxProgramSubmission: async () => {
        assert.equal(fxGroup.parent, scene, 'the composed loading fixture owns its staged root');
        events.push('fx:staged');
        if (cancel === 'fx') generation++;
        return { staged: false, restore() { events.push('fx:restored'); } };
      },
    },
    armorAimOverlay: { warm: () => () => {} },
    forwardProgramWarm: { *compileSceneSteps() {}, *prepareSceneSteps() {
      throw new Error('this loading fixture has no visible terrain root');
    } },
    combatWarm: { markOpeningReady() {} },
    post: { async warmFirstFrame() {
      if (cancel === 'post') generation++;
      if (fail === 'shader') throw new Error('shader failed');
    } },
    lighting: { csm: { lights: [] } }, createShell() {},
    getWorld: () => requiredWorld,
    getBattleVisuals: () => ({ async stream() { if (fail === 'allies') throw new Error('allies failed'); } }),
    getFx: () => fx, getWarmRender: () => warmRender,
    getDeploymentShadowWarm: () => ({ async prime() {} }),
    getEntryLifecycle: () => ({ async primeReveal() {
      events.push('deployment:reveal');
      if (cancel === 'deploymentReveal') generation++;
    }, coverRendering() {} }),
    prepareRevealCamera,
    runSceneWatchdog: async assertCurrent => { assertCurrent(); events.push('watchdog'); },
    prepareAtmosphere: async () => { if (fail === 'atmosphere') throw new Error('atmosphere failed'); },
    getGeneration: () => generation, advanceGeneration: () => ++generation,
    setPending() {}, setDestructionWarmed() {},
    now: () => clock,
    yieldFrame: async () => {},
    createLoadingYielder: () => async () => {
      if (cancel === 'carpet' && coverUpdates === 1) generation++;
    },
  });
  const combined = createSoloBattleLoadingRuntime({
    ...loadingOptions, deployment, getWorld: () => requiredWorld, prepareRevealCamera,
    delay: async () => { if (cancel === 'hold') generation++; },
    lifecycle: { async primeReveal() {
      events.push('reveal:fallback');
      assert.equal(coverUpdates, 3, 'legitimate shader fallback requires completed exact-camera geometry');
      if (cancel === 'fallback') generation++;
    } },
    battleLoad: { ...loadingOptions.battleLoad, async hide() {
      events.push('loader:hide');
      if (cancel === 'fade') generation++;
    } },
  });
  const result = combined.begin('m1a2', null, { randomRoster: false });
  if (cancel || (fail && fail !== 'shader')) {
    await assert.rejects(result, cancel ? /superseded/ : new RegExp(`${fail} failed`));
    assert.ok(!events.includes('battle:open'), 'failed/cancelled entry cannot release control');
    if (cancel !== 'fade') assert.ok(!events.includes('loader:hide'), 'required readiness fails under cover');
    if (!cancel || cancel === 'carpet' || cancel === 'hold') {
      assert.ok(!events.includes('reveal:fallback'), 'early failure cannot enter optional shader fallback');
    }
  } else {
    await result;
    assert.ok(events.includes('loader:hide') && events.includes('battle:open'));
    assert.equal(events.includes('reveal:fallback'), fail === 'shader');
  }
    if (cancel === 'fx') {
      assert.ok(events.includes('fx:staged'), 'positive control: cancellation actually enters FX staging');
      assert.ok(events.includes('fx:restored'), 'cancellation still drains borrowed FX state');
    }
  return coverUpdates;
}
for (const fail of ['atmosphere', 'allies', 'carpet']) await runComposed({ fail });
assert.equal(await runComposed({ cancel: 'carpet' }), 1, 'stale carpet cannot perform another update');
for (const cancel of ['hold', 'fallback', 'fade']) await runComposed({ fail: 'shader', cancel });
for (const cancel of ['fx', 'post', 'deploymentReveal']) await runComposed({ cancel });
await runComposed({ fail: 'shader' });
await runComposed();

events.length = 0;
const missingReceipt = createSoloBattleLoadingRuntime({
  ...loadingOptions,
  deployment: { async warm() { return { generation: 1, revealPrimed: false }; } },
});
await assert.rejects(missingReceipt.begin('m1a2', null, { randomRoster: false }), /required reveal readiness/);
assert.ok(!events.includes('loader:hide') && !events.includes('reveal:fallback'));
delete globalThis.__BATTLE_LOAD;
delete globalThis.__VISUAL_LOAD_TIMINGS;
delete globalThis.__BATTLE_COUNTDOWN_WARM;
delete globalThis.__COMBAT_OPENING_WARM;

// A rejected sibling must recover immediately even when FX construction or
// native image decode is held. Its old continuation cannot submit GPU work.
for (const heldStage of ['constructor', 'preload', 'upload']) {
  const ready = Promise.withResolvers(), release = Promise.withResolvers();
  const root = new Object3D(), textures = [new Texture(), new Texture(), new Texture()];
  const geometry = new BoxGeometry();
  const materials = textures.map(map => new MeshBasicMaterial({ map }));
  for (const material of materials) root.add(new Mesh(geometry, material));
  let firstEntry = true, fxPending, uploads = 0, preloads = 0, warms = 0;
  const hold = async (stage) => {
    if (firstEntry && stage === heldStage) {
      ready.resolve();
      await release.promise;
    }
  };
  const realUploads = createBattleVisualStreamer({
    game, scene: new Scene(), renderer: { initTexture() { uploads++; } },
    anisotropy: 4, ensureTankBuilders: async () => {}, nextStagedBake: () => null,
    *ensureStagedVisualsSteps() { return true; }, getSpec: () => ({}),
    prebakeSharedTextures: async () => {}, armorAimOverlay: { prime() {}, warm: () => () => {} },
    forwardProgramWarm: { compile() {} },
  });
  const live = {
    group: root,
    async preloadTextures() { preloads++; await hold('preload'); },
    warmTextures() { warms++; },
  };
  const acquisition = createBattleEntryAcquisition();
  const failure = new Error(`sibling failed during ${heldStage}`);
  const entry = createSoloBattleLoadingRuntime({
    ...loadingOptions,
    acquisition: { acquireSolo(tasks) {
      return acquisition.acquireSolo(tasks.map((task, index) => () => {
        const result = task();
        if (index === 9) fxPending = result;
        return result;
      }));
    } },
    async ensureFx() { await hold('constructor'); return live; },
    async ensureWorld(...args) {
      if (firstEntry) { await ready.promise; throw failure; }
      return loadingOptions.ensureWorld(...args);
    },
    getBattleVisuals: () => ({ ...battleVisuals,
      stageRootTextureUploads: realUploads.stageRootTextureUploads }),
    createLoadingYielder: () => () => hold('upload'),
  });
  await assert.rejects(entry.begin('m1a2', null, { randomRoster: false }), error => error === failure);
  const stopped = { uploads, preloads, warms };
  assert.equal(uploads, heldStage === 'upload' ? 1 : 0,
    'positive control reaches exactly the selected asynchronous boundary');
  assert.equal(root.userData.battleTexturesStaged, undefined);
  firstEntry = false;
  release.resolve();
  await assert.rejects(fxPending, /FX preparation superseded/);
  assert.deepEqual({ uploads, preloads, warms }, stopped,
    'the old entry performs no further preload, warm or actual texture uploads after recovery');
  await entry.begin('m1a2', null, { randomRoster: false });
  assert.equal(root.userData.battleTexturesStaged, true);
  assert.equal(uploads, stopped.uploads + 3, 'fresh entry stages the same retained runtime completely');
  geometry.dispose(); materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}
delete globalThis.__BATTLE_LOAD;
delete globalThis.__VISUAL_LOAD_TIMINGS;
console.log('soloBattleLoadingRuntime.selftest: acquisition, progress, warm, reveal and abandoned FX upload order pass');
