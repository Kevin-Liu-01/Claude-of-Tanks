import assert from 'node:assert/strict';
import { PerspectiveCamera, Scene } from 'three';

import { createMainFrameRuntime } from './mainFrameRuntime.ts';

function createFixture({ phase = 'garage', shotMode = false, studioActive = false } = {}) {
  const calls = [];
  const frameRequests = [];
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.1, 1000);
  const game = { phase, shells: [], matchModeState: null, timeS: 4 };
  const battleEntryLifecycle = {
    renderingCovered: false,
    noteBattleFrame: () => calls.push('entry:frame'),
  };
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
  });
  return { runtime, calls, frameRequests, camera, battleEntryLifecycle };
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

const covered = createFixture({ phase: 'battle' });
covered.battleEntryLifecycle.renderingCovered = true;
covered.runtime.tick(1000);
assert.deepEqual(covered.calls, ['schedule']);

assert.throws(() => createMainFrameRuntime({}), /requires every live frame port/);

console.log('mainFrameRuntime.selftest: retained Garage, studio, shot, and battle frames pass');
