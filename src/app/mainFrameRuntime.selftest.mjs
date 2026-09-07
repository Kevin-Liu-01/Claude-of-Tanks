import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Scene } from 'three';

import { createMainFrameRuntime } from './mainFrameRuntime.ts';
import { createGarageFramePacer } from '../engine/garageFramePacer.ts';

function createFixture({
  phase = 'garage', shotMode = false, studioActive = false, trace = null,
  densityChanged = false, contextLost = false, useRealGaragePacer = false,
} = {}) {
  const calls = [];
  const frameRequests = [];
  const replay = { active: false };
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.1, 1000);
  const game = { phase, shells: [], matchModeState: null, timeS: 4 };
  const battleEntryLifecycle = {
    renderingCovered: false,
    noteBattleFrame: () => calls.push('entry:frame'),
  };
  const presentationRestore = { covering: false };
  const density = { pending: densityChanged };
  const realGaragePacer = createGarageFramePacer();
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
    isGraphicsContextLost: () => contextLost,
    syncViewportPixelRatio: () => {
      calls.push('viewport:sync');
      const changed = density.pending;
      density.pending = false;
      return changed;
    },
    battleEntryLifecycle,
    getFx: () => fx,
    getWorld: () => world,
    getBaseFogDensity: () => 0,
    get updateAtmosphere() {
      throw new Error('removed atmosphere frame port must never be acquired');
    },
    getStudio: () => ({
      active: studioActive,
      tick: () => calls.push('studio'),
    }),
    getShotMode: () => shotMode,
    getShotHudFrame: () => true,
    sniperFill: { update: () => calls.push('sniper') },
    updateNightLighting: () => calls.push('night-lights'),
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
      noteActivity: nowMs => {
        calls.push('garage:activity');
        realGaragePacer.noteActivity(nowMs);
      },
      shouldRender: (_nowMs, request) => {
        frameRequests.push(request);
        calls.push('garage:pacer');
        return useRealGaragePacer ? realGaragePacer.shouldRender(_nowMs, request) : phase !== 'garage';
      },
    },
    battleFrame: {
      advance: () => {
        calls.push('battle:advance');
        return {
          dtSeconds: 1 / 60,
          inBattle: game.phase === 'battle',
          paused: false,
          livePaused: false,
          killcamActive: replay.active,
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
      isActive: () => replay.active,
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
    replay,
    camera,
    game,
    battleEntryLifecycle,
    presentationRestore,
    density,
  };
}

const garage = createFixture();
garage.runtime.tick(1000);
garage.runtime.tick(1016);
assert.equal(garage.frameRequests.length, 2);
assert.equal(garage.frameRequests[0], garage.frameRequests[1],
  'Garage pacing reuses one retained request record');
assert.deepEqual(garage.calls, [
  'schedule', 'viewport:sync', 'network', 'garage:pacer',
  'schedule', 'viewport:sync', 'network', 'garage:pacer',
]);

const shot = createFixture({ shotMode: true });
shot.runtime.tick(1000);
assert.deepEqual(shot.calls, [
  'schedule', 'viewport:sync', 'world', 'sniper', 'fx', 'night-lights', 'hud:frozen',
  'lighting:update:true', 'post',
]);

const studio = createFixture({ studioActive: true });
studio.runtime.tick(1000);
assert.deepEqual(studio.calls, ['schedule', 'viewport:sync', 'studio']);

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
assert.ok(battle.calls.indexOf('world:presentation') < battle.calls.indexOf('night-lights'));
assert.ok(battle.calls.indexOf('night-lights') < battle.calls.indexOf('post'));
assert.equal(battle.calls.filter((entry) => entry === 'night-lights').length, 2,
  'retained lamps follow final visual/camera transforms once before each live draw');
assert.equal(battle.calls.filter((entry) => entry === 'entry:frame').length, 2);

const replaying = createFixture({ phase: 'battle' });
replaying.runtime.tick(1000);
replaying.replay.active = true;
replaying.runtime.tick(1016);
replaying.runtime.tick(1032);
replaying.replay.active = false;
replaying.runtime.tick(1048);
assert.equal(replaying.calls.filter((entry) => entry === 'killcam').length, 2,
  'actual replay frames still advance without an atmosphere frame owner');
replaying.game.phase = 'garage';
replaying.runtime.tick(1064);
replaying.runtime.tick(1080);

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

const lost = createFixture({ contextLost: true, densityChanged: true });
lost.runtime.tick(1000);
assert.deepEqual(lost.calls, ['schedule'], 'context loss never resizes unavailable GPU owners');
assert.equal(lost.density.pending, true, 'the unapplied density remains pending until the context returns');

for (const options of [
  { phase: 'battle' }, { phase: 'shot', shotMode: true }, { phase: 'studio', studioActive: true },
]) {
  const f = createFixture({ ...options, densityChanged: true });
  f.runtime.tick(1000);
  assert.equal(f.calls.filter(call => call === 'viewport:sync').length, 1,
    'each visible frame transaction samples density exactly once');
  assert.ok(f.calls.indexOf('viewport:sync') < f.calls.indexOf(options.studioActive ? 'studio' : 'post'),
    'density repair precedes actual shot, battle and delegated Studio presentation');
}

const quietGarage = createFixture({ useRealGaragePacer: true });
quietGarage.runtime.tick(0);
quietGarage.calls.length = 0;
quietGarage.runtime.tick(16);
assert.equal(quietGarage.calls.includes('post'), false, 'the real settled Garage pacer skips an ordinary tick');
quietGarage.calls.length = 0;
quietGarage.density.pending = true;
quietGarage.runtime.tick(32);
assert.equal(quietGarage.calls.filter(call => call === 'post').length, 1,
  'a silent density repair is painted on the SAME tick, never left as a cleared canvas');
assert.ok(quietGarage.calls.indexOf('viewport:sync') < quietGarage.calls.indexOf('garage:activity'));
assert.ok(quietGarage.calls.indexOf('garage:activity') < quietGarage.calls.indexOf('garage:pacer'));
assert.ok(quietGarage.calls.includes('lighting:dormant:false'), 'resize-invalidation is not immediately suppressed by static shadows');
assert.equal(quietGarage.calls.filter(call => call === 'schedule').length, 1,
  'density recovery adds no second frame schedule or Garage restart');
quietGarage.calls.length = 0;
quietGarage.runtime.tick(1000);
assert.equal(quietGarage.calls.includes('post'), false, 'ordinary idle suppression resumes after the existing activity tail');
quietGarage.density.pending = true;
quietGarage.runtime.tick(5032);
assert.equal(quietGarage.calls.filter(call => call === 'post').length, 1,
  'the existing five-second safety tick also repairs a silent density change');

assert.throws(() => createMainFrameRuntime({}), /requires every live frame port/);

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const frameSource = await readFile(new URL('./mainFrameRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(frameSource, /updateAtmosphere/,
  'fixed day/night must not leave an atmosphere port or scheduler in the frame loop');
assert.doesNotMatch(mainSource, /battleWeatherParticleBudget|battleParticleBudget|battleAtmosphere\.update\(/,
  'composition must not retain particle budgets, quality listeners or atmosphere frame work');
const inertStudioAt = mainSource.indexOf("let studio: ReturnType<typeof createStudioAccess>['presentation']");
const mainFrameAt = mainSource.indexOf('const mainFrame = createMainFrameRuntime({');
const liveStudioAt = mainSource.indexOf('studio = studioAccess.presentation;');
assert.ok(inertStudioAt >= 0 && inertStudioAt < mainFrameAt,
  'an inert Studio presentation must exist before the frame scheduler can tick');
assert.ok(liveStudioAt > mainFrameAt,
  'the lazy Studio presentation replaces the inert owner after composition');
assert.match(mainSource, /syncViewportPixelRatio: viewport\.syncPixelRatio/,
  'production composition uses the real viewport owner, not a test-only forced resize');

console.log('mainFrameRuntime.selftest: retained Garage, studio, shot, and battle frames pass');
