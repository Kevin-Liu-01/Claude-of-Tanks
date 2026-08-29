import assert from 'node:assert/strict';
import { Object3D } from 'three';
import { createSoloBattleLoadingRuntime } from './soloBattleLoadingRuntime.ts';

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
  async stageBattleVisualReveal(entity) {
    events.push(`reveal:${entity.specId}`);
    return {
      preUploadYieldMs: 1,
      textureUploadMs: 2,
      compileMs: 3,
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

const runtime = createSoloBattleLoadingRuntime({
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
    resume: () => events.push('audio:resume'),
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
      return { generation: 7, revealPrimed: false };
    },
  },
  lifecycle: { primeReveal: async () => { events.push('reveal:fallback'); } },
  getPendingMapId: () => 'random',
  getMapConfig: () => ({
    name: 'Verdant Fields',
    props: { tankWrecks: { ids: ['wreck'] } },
  }),
  getMapThumb: () => '/verdant.webp',
  hasCachedWorld: () => false,
  getWorld: () => world,
  ensureWorld: async (_mapId, onProgress, options) => {
    assert.deepEqual(options, { precompile: false, services: false });
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
});

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
  assert.ok(events.indexOf('acquisition:done') < events.indexOf('battle:setup'));
  assert.ok(events.indexOf('deployment:warm') < events.indexOf('loader:hide'));
  assert.ok(events.indexOf('reveal:fallback') < events.indexOf('loader:hide'));
  assert.ok(events.indexOf('loader:hide') < events.indexOf('battle:open'));
  assert.equal(globalThis.__BATTLE_LOAD.map, 'verdant');
  assert.equal(globalThis.__BATTLE_LOAD.visiblePreBattleS, 2);
  assert.equal(globalThis.__VISUAL_LOAD_TIMINGS.length, 1);
} finally {
  delete globalThis.__BATTLE_LOAD;
  delete globalThis.__VISUAL_LOAD_TIMINGS;
  delete globalThis.__WORLD_LOAD;
}

console.log('soloBattleLoadingRuntime.selftest: acquisition, progress, warm and reveal order pass');
