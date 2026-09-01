import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Scene } from 'three';

import { createMainFrameRuntime } from './mainFrameRuntime.ts';

function createFixture({
  phase = 'garage', shotMode = false, studioActive = false, trace = null,
} = {}) {
  const calls = [];
  const frameRequests = [];
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.1, 1000);
  const game = { phase, shells: [], matchModeState: null, timeS: 4 };
  const battleEntryLifecycle = {
    renderingCovered: false,
    noteBattleFrame: () => calls.push('entry:frame'),
  };
  const presentationRestore = { covering: false };
  const fx = { update: () => calls.push('fx') };
  const world = { update: () => calls.push('world') };
  const lighting = {
    updateFov: () => calls.push('lighting:fov'),
    setStaticPresentationDormant: (value) => calls.push(`lighting:dormant:${value}`),
    update: (force) => calls.push(`lighting:update:${force}`),
  };
  const runtime = createMainFrameRuntime({
    scene,
    camera,
    game,
    scheduleFrame: () => calls.push('schedule'),
    isGraphicsContextLost: () => false,
    battleEntryLifecycle,
    getFx: () => fx,
    getWorld: () => world,
    getBaseFogDensity: () => 0,
    getStudio: () => ({
      active: studioActive,
      tick: () => calls.push('studio'),
    }),
    getShotMode: () => shotMode,
    getShotHudFrame: () => true,
    sniperFill: { update: () => calls.push('sniper') },
    resolveFxSubject: () => null,
    battleHudFrame: {
      redrawFrozen: () => calls.push('hud:frozen'),
      update: () => calls.push('hud:update'),
    },
    lighting,
    post: { render: () => calls.push('post') },
    showroom: {
      moving: false,
      update: () => calls.push('showroom'),
    },
    pedestal: { switchPending: false },
    networkSession: { pump: () => calls.push('network') },
    garageFramePacer: {
      shouldRender: (_nowMs, request) => {
        frameRequests.push(request);
        calls.push('garage:pacer');
        return phase !== 'garage';
      },
    },
    battleFrame: {
      advance: () => {
        calls.push('battle:advance');
        return {
          dtSeconds: 1 / 60,
          inBattle: phase === 'battle',
          paused: false,
          livePaused: false,
          killcamActive: false,
        };
      },
    },
    isBattleLoadCovering: () => false,
    isPresentationRestoreCovering: () => presentationRestore.covering,
    cameraInput: { autoAimPoint: null },
    getMobileAutoAim: () => ({ sample: () => null }),
    rig: {
      cinematicActive: false,
      update: () => calls.push('rig'),
    },
    killcam: {
      fxTimeScale: 1,
      isActive: () => false,
      update: () => calls.push('killcam'),
    },
    veilHud: () => calls.push('veil'),
    worldFramePresentation: { update: () => calls.push('world:presentation') },
    matchModeWorld: { update: () => calls.push('match-mode') },
    audioListener: { update: () => calls.push('audio') },
    isGaragePresentationDirty: () => false,
    clearGaragePresentationDirty: () => calls.push('garage:clear'),
    perfHud: { update: () => calls.push('perf') },
    trace,
  });
  return {
    runtime,
    calls,
    frameRequests,
    camera,
    game,
    battleEntryLifecycle,
    presentationRestore,
  };
}

const garage = createFixture();
garage.runtime.tick(1000);
garage.runtime.tick(1016);
assert.equal(garage.frameRequests.length, 2);
assert.equal(garage.frameRequests[0], garage.frameRequests[1],
  'Garage pacing reuses one retained request record');
assert.deepEqual(garage.calls, [
  'schedule', 'network', 'garage:pacer',
  'schedule', 'network', 'garage:pacer',
]);

const shot = createFixture({ shotMode: true });
shot.runtime.tick(1000);
assert.deepEqual(shot.calls, [
  'schedule', 'world', 'sniper', 'fx', 'hud:frozen',
  'lighting:update:true', 'post',
]);

const studio = createFixture({ studioActive: true });
studio.runtime.tick(1000);
assert.deepEqual(studio.calls, ['schedule', 'studio']);

const battle = createFixture({ phase: 'battle' });
battle.runtime.noteFovPrimed(70);
battle.runtime.tick(1000);
assert.equal(battle.calls.includes('lighting:fov'), false,
  'a primed FOV does not refresh shadow geometry again');
battle.camera.fov = 55;
battle.runtime.tick(1016);
assert.equal(battle.calls.filter((entry) => entry === 'lighting:fov').length, 1);
assert.ok(battle.calls.indexOf('battle:advance') < battle.calls.indexOf('rig'));
assert.ok(battle.calls.indexOf('rig') < battle.calls.indexOf('world:presentation'));
assert.ok(battle.calls.indexOf('world:presentation') < battle.calls.indexOf('post'));
assert.equal(battle.calls.filter((entry) => entry === 'entry:frame').length, 2);

const returnMarks = [];
const returning = createFixture({
  phase: 'battle',
  trace: {
    frame: () => {},
    mark: (name, data) => returnMarks.push({ name, data }),
  },
});
returning.runtime.tick(1000);
returning.game.phase = 'garage';
returning.runtime.tick(1016);
returning.runtime.tick(1032);
assert.equal(returnMarks.length, 1,
  'only the first rendered Garage frame after battle is profiled');
assert.equal(returnMarks[0].name, 'garage:return-frame');
assert.deepEqual(Object.keys(returnMarks[0].data), [
  'preRenderMs', 'lightingMs', 'postMs', 'totalMs',
]);
assert.ok(Object.values(returnMarks[0].data).every(Number.isFinite),
  'Garage return frame receipt contains finite stage timings');

const covered = createFixture({ phase: 'battle' });
covered.battleEntryLifecycle.renderingCovered = true;
covered.runtime.tick(1000);
assert.deepEqual(covered.calls, ['schedule', 'network'],
  'covered entry skips scene work but keeps the multiplayer handshake alive');

const restoring = createFixture({ phase: 'garage' });
restoring.presentationRestore.covering = true;
restoring.runtime.tick(1000);
assert.deepEqual(restoring.calls, ['schedule', 'network'],
  'covered Garage restoration skips the cold scene frame but keeps networking alive');

assert.throws(() => createMainFrameRuntime({}), /requires every live frame port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const inertStudioAt = mainSource.indexOf("let studio: ReturnType<typeof createStudioAccess>['presentation']");
const mainFrameAt = mainSource.indexOf('const mainFrame = createMainFrameRuntime({');
const liveStudioAt = mainSource.indexOf('studio = studioAccess.presentation;');
assert.ok(inertStudioAt >= 0 && inertStudioAt < mainFrameAt,
  'an inert Studio presentation must exist before the frame scheduler can tick');
assert.ok(liveStudioAt > mainFrameAt,
  'the lazy Studio presentation replaces the inert owner after composition');

console.log('mainFrameRuntime.selftest: retained Garage, studio, shot, and battle frames pass');
