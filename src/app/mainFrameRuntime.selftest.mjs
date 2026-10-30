import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Scene, Vector3 } from 'three';

import { createMainFrameRuntime, LENS_REFIT_SLACK } from './mainFrameRuntime.ts';
import { createGarageFramePacer } from '../engine/garageFramePacer.ts';
import { createLighting } from '../engine/lighting.ts';
import { CSMFrustum } from 'three/examples/jsm/csm/CSMFrustum.js';

function createFixture({
  phase = 'garage', shotMode = false, studioActive = false, trace = null,
  densityChanged = false, contextLost = false, useRealGaragePacer = false, modePreview = null, lighting: lightingPort = null,
} = {}) {
  const calls = [];
  const frameRequests = [];
  const postFrames = [], simulationFrames = [], fxFrames = [], studioFrames = [], shadowMerges = [], framing = [];
  const replay = { active: false };
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.1, 1000);
  const game = { phase, shells: [], matchModeState: null, timeS: 4 };
  const battleEntryLifecycle = {
    renderingCovered: false,
    noteBattleFrame: () => calls.push('entry:frame'),
  };
  const presentationRestore = { covering: false };
  const transition = { holdingSceneForFadeIn: false };
  const density = { pending: densityChanged };
  const realGaragePacer = createGarageFramePacer();
  const fx = { update: dt => { calls.push('fx'); fxFrames.push(dt); } };
  const world = { update: () => calls.push('world') };
  const lighting = lightingPort ?? {
    updateFov: () => calls.push('lighting:fov'),
    setStaticPresentationDormant: (value) => calls.push(`lighting:dormant:${value}`),
    setVehicleShadowMerge: (on) => shadowMerges.push(on),
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
      tick: (dt, wallDt) => { calls.push('studio'); studioFrames.push({ dt, wallDt }); },
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
    post: { render: (dt, wallDt) => { calls.push('post'); postFrames.push({ dt, wallDt }); } },
    showroom: {
      moving: false,
      update: () => calls.push('showroom'),
    },
    pedestal: { switchPending: false },
    garageModePreview: modePreview,
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
      advance: (dtSeconds, wallDtSeconds) => {
        calls.push('battle:advance');
        simulationFrames.push({ dt: dtSeconds, wallDt: wallDtSeconds });
        return {
          dtSeconds,
          inBattle: game.phase === 'battle',
          paused: false,
          livePaused: false,
          killcamActive: replay.active,
        };
      },
    },
    isBattleLoadCovering: () => false,
    isPresentationRestoreCovering: () => presentationRestore.covering,
    isTransitionHoldingSceneForFadeIn: () => transition.holdingSceneForFadeIn,
    cameraInput: { autoAimPoint: null },
    getMobileAutoAim: () => ({ sample: () => null }),
    rig: {
      cinematicActive: false,
      update: () => calls.push('rig'),
      suspendFraming: () => framing.push('suspend'),
      previewFraming: () => framing.push('preview'),
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
    postFrames,
    simulationFrames,
    fxFrames,
    studioFrames,
    shadowMerges,
    framing,
    replay,
    camera,
    game,
    battleEntryLifecycle,
    presentationRestore,
    transition,
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

for (const shotMode of [false, true]) {
  const frame = createFixture({ phase: 'battle', shotMode });
  frame.runtime.tick(1000);
  assert.deepEqual(frame.postFrames.at(-1), { dt: 0, wallDt: 0 }, 'first paint invents no wall-clock interval');
  frame.runtime.tick(1500);
  assert.deepEqual(frame.postFrames.at(-1), { dt: .1, wallDt: .5 },
    'live and shot post paths receive bounded animation plus the actual hitch interval');
  assert.equal(frame.fxFrames.at(-1), .1, 'effects never integrate the whole hitch');
  if (!shotMode) assert.deepEqual(frame.simulationFrames.at(-1), { dt: .1, wallDt: .5 });
  frame.runtime.tick(1620);
  assert.deepEqual(frame.postFrames.at(-1), { dt: .1, wallDt: .12 },
    'sustained low FPS keeps raw overload evidence instead of flattening it to 100ms');
  frame.runtime.tick(1640);
  assert.deepEqual(frame.postFrames.at(-1), { dt: .02, wallDt: .02 }, 'ordinary cadence is unchanged');
  // (battle-spikes-253) a live battle frame turns the near hulls' merged shadow casters on; a shot frame leaves them
  if (!shotMode) assert.ok(frame.shadowMerges.length > 0 && frame.shadowMerges.every((on) => on === true), 'a live battle frame merges');
  else assert.equal(frame.shadowMerges.length, 0, 'a shot frame leaves the merge as it was');
}

const shot = createFixture({ shotMode: true });
shot.runtime.tick(1000);
assert.deepEqual(shot.calls, [
  'schedule', 'viewport:sync', 'world', 'sniper', 'fx', 'night-lights', 'hud:frozen',
  'lighting:dormant:false', 'lighting:update:true', 'post',
]);

// The Garage -> shot latch (2026-10-08, the clouds lane's F2c forensics; the perf lane's fix): the Garage GPU warm leaves
// lighting's static-presentation dormancy latch set in its `finally` (garageGpuWarmRuntime.ts) and can finish after a
// capture has staged its battlefield. A shot frame releases the latch as a battle frame does, so a capture tool sampling
// the live, unforced update (the cost probes' costLiveLighting) still renders every cascade. The real lighting owner.
{
  const lighting = createLighting(new Scene(), new PerspectiveCamera(60, 16 / 9, 0.5, 4000), new Vector3(1, 1, 1).normalize());
  const allCascades = (1 << lighting.csm.lights.length) - 1;
  try {
    lighting.update(true);
    lighting.setStaticPresentationDormant(true); // the Garage warm's `finally`
    // the capture tool's live sampling: the shot frame's forced update made unforced, as costLiveLighting does
    const sampled = {
      updateFov: () => lighting.updateFov(),
      setStaticPresentationDormant: (on) => lighting.setStaticPresentationDormant(on),
      setVehicleShadowMerge: (on) => lighting.setVehicleShadowMerge(on),
      update: () => lighting.update(false, 1 / 60),
    };
    sampled.update();
    assert.equal(lighting.scheduledMask, 0,
      'negative: on a latched lighting an unforced update renders no shadow map (F2c\'s page: -193 calls, -2.3 M triangles)');
    const shotPage = createFixture({ shotMode: true, lighting: sampled });
    shotPage.runtime.tick(1000);
    assert.equal(lighting.getShadowTelemetry().staticPresentationDormant, false, 'a shot frame releases the Garage latch');
    assert.equal(lighting.scheduledMask, allCascades, 'every cascade renders on a shot page after a Garage warm');
    lighting.setStaticPresentationDormant(true); // a warm finishing after the staging
    shotPage.runtime.tick(1016);
    assert.equal(lighting.scheduledMask, allCascades, 'a late Garage warm cannot freeze the next shot frame\'s cascades');
    lighting.update(false, 1 / 60);
    assert.ok(lighting.scheduledMask > 0, 'and the live schedule resumes between shot frames');
  } finally {
    lighting.csm.remove();
    lighting.csm.dispose();
  }
}

const studio = createFixture({ studioActive: true });
studio.runtime.tick(1000);
assert.deepEqual(studio.calls, ['schedule', 'viewport:sync', 'studio']);
studio.runtime.tick(1500);
assert.deepEqual(studio.studioFrames.at(-1), { dt: .1, wallDt: .5 },
  'the Studio early branch also receives the bounded animation and separate real cadence');

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

// (battle-camera-264) the chase framing's lens shift (cameraRig.ts applyLens: camera.view) moves the projection without
// the fov. CSM's cascade slices are the projection's unprojection at their last fit, so the lens refits them
// (lighting.updateFov). (local-fps-265) Not at every step of its ease: refitting each step re-shaped the slices every
// frame and kept the tree canopies' shadow proxies out of the static shadow cache. A move past LENS_REFIT_SLACK from the
// last fit refits at once, a lens that has settled anywhere off the fit refits once, and a step inside the slack waits;
// a held lens and a primed fit refit nothing.
{
  const garage = createFixture();
  garage.runtime.tick(1000);
  assert.ok(garage.framing.includes('suspend'), 'a Garage frame takes the chase framing\'s lens off the camera');
  const live = createFixture({ phase: 'battle' });
  live.runtime.tick(1000);
  assert.deepEqual(live.framing, [], 'a live battle frame leaves the framing to the rig\'s own update');
}
const lensView = (shift) => ({ enabled: true, fullWidth: 1, fullHeight: 1, width: 1, height: 1, offsetX: 0, offsetY: shift });
{
  const lens = createFixture({ phase: 'battle' });
  const refits = () => lens.calls.filter((entry) => entry === 'lighting:fov').length;
  lens.runtime.noteFovPrimed(lens.camera.fov);
  lens.runtime.tick(1000);
  assert.equal(refits(), 0);
  lens.camera.view = lensView(0.115);
  lens.camera.updateProjectionMatrix();
  lens.runtime.tick(1016);
  assert.equal(refits(), 1, 'a lens shift with the fov unchanged refits the cascades');
  lens.runtime.tick(1032);
  assert.equal(refits(), 1, 'a held lens refits nothing more');
  // the projection's off-axis term is -2 x the view offset: a 0.005 step of the ease moves it 0.01, inside the slack
  assert.equal(LENS_REFIT_SLACK, 0.05);
  lens.camera.view.offsetY = 0.12;
  lens.camera.updateProjectionMatrix();
  lens.runtime.tick(1048);
  assert.equal(refits(), 1, 'a step of the ease inside the slack does not refit (the negative control)');
  lens.runtime.tick(1064);
  assert.equal(refits(), 2, 'the ease\'s end (the lens held at 0.12) refits to the exact lens');
  lens.runtime.tick(1080);
  assert.equal(refits(), 2, 'and once only');
  // steps that each stay inside the slack refit once their sum since the last fit passes it (0.02, 0.04, then 0.06)
  for (const [t, offsetY, expected] of [[1096, 0.13, 2], [1112, 0.14, 2], [1128, 0.15, 3]]) {
    lens.camera.view.offsetY = offsetY;
    lens.camera.updateProjectionMatrix();
    lens.runtime.tick(t);
    assert.equal(refits(), expected, `the ease at ${offsetY}: ${expected === 3 ? 'past the slack from the last fit, refits' : 'inside the slack, waits'}`);
  }
  lens.camera.clearViewOffset();
  lens.runtime.tick(1144);
  assert.equal(refits(), 4, 'clearing the shift (the scope, the Garage) jumps past the slack and refits at once');
  lens.camera.view = lensView(0.05);
  lens.camera.updateProjectionMatrix();
  lens.runtime.noteFovPrimed(lens.camera.fov); // the battle entry's final shadows fit the lens it reveals
  lens.runtime.tick(1160);
  lens.runtime.tick(1176);
  assert.equal(refits(), 4, 'a primed fit is not refitted again, held or not');
  // the fov keeps its exact refit: a fov step inside any slack refits at once
  lens.camera.fov += 0.01;
  lens.camera.updateProjectionMatrix();
  lens.runtime.tick(1192);
  assert.equal(refits(), 5, 'a fov change refits at once');
}
// The real lighting: after a lens change the cascades' slices are the shifted projection's own; without the refit they
// keep the centred one (the negative control)
{
  const sameFrustum = (a, b) => ['near', 'far'].every((plane) => a.vertices[plane].every((v, i) => v.distanceTo(b.vertices[plane][i]) < 1e-6));
  let real = null;
  const port = {
    updateFov: () => real.updateFov(),
    setStaticPresentationDormant: (on) => real.setStaticPresentationDormant(on),
    setVehicleShadowMerge: (on) => real.setVehicleShadowMerge(on),
    update: () => real.update(false, 1 / 60),
  };
  const lens = createFixture({ phase: 'battle', lighting: port });
  lens.camera.fov = 60;
  lens.camera.aspect = 16 / 9;
  lens.camera.updateProjectionMatrix();
  real = createLighting(new Scene(), lens.camera, new Vector3(0.4, 0.8, -0.3).normalize());
  try {
    const csm = real.csm;
    const fitted = () => new CSMFrustum({ webGL: true, projectionMatrix: lens.camera.projectionMatrix, maxFar: csm.maxFar });
    real.updateFov();
    lens.runtime.noteFovPrimed(lens.camera.fov);
    lens.runtime.tick(1000);
    assert.ok(sameFrustum(csm.mainFrustum, fitted()), 'centred: the slices are the projection\'s');
    lens.camera.view = lensView(0.115);
    lens.camera.updateProjectionMatrix();
    assert.ok(!sameFrustum(csm.mainFrustum, fitted()), 'negative: before the frame the slices still hold the centred lens');
    lens.runtime.tick(1016);
    assert.ok(sameFrustum(csm.mainFrustum, fitted()), 'the frame refits them to the shifted lens');
    assert.ok(csm.frustums[0].vertices.near[2].distanceTo(fitted().vertices.near[2]) < 1e-6, 'cascade 0 reaches the picture\'s bottom edge');
  } finally {
    real.csm.remove();
    real.csm.dispose();
  }
}

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

const incomingResultVeil = createFixture({ phase: 'battle', densityChanged: true });
incomingResultVeil.transition.holdingSceneForFadeIn = true;
incomingResultVeil.runtime.tick(1000);
assert.deepEqual(incomingResultVeil.calls, ['schedule', 'network'],
  'opted-in fade-in retains the old scene frame without stopping scheduling or networking');
assert.equal(incomingResultVeil.density.pending, true, 'fade-in cannot resize and clear the retained scene canvas');
incomingResultVeil.transition.holdingSceneForFadeIn = false;
incomingResultVeil.calls.length = 0;
incomingResultVeil.runtime.tick(1016);
assert.ok(incomingResultVeil.calls.includes('viewport:sync') && incomingResultVeil.calls.includes('post'),
  'releasing fade-in immediately resumes the original frame path and pending viewport update');

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
assert.match(mainSource, /isTransitionHoldingSceneForFadeIn: \(\) => transition\.holdingSceneForFadeIn/,
  'production frames consume the transition owner lease, not veil visibility through fade-out');

console.log('mainFrameRuntime.selftest: retained Garage, studio, shot, and battle frames pass');

{
 let updates=0,clears=0;
 const preview={animated:true,update(){updates++;},clear(){clears++;}};
 const fixture=createFixture({useRealGaragePacer:true,modePreview:preview});
 fixture.runtime.tick(1000);fixture.runtime.tick(1100);
 assert.ok(updates>=2,'mode animation keeps settled Garage frames alive');
 assert.equal(clears,0);
 const battle=createFixture({phase:'battle',modePreview:preview});battle.runtime.tick(2000);
 assert.ok(clears>0,'Garage preview releases before battle presentation');
}
{
 const preview={animated:false,pending:true,update(){},clear(){}};
 const fixture=createFixture({useRealGaragePacer:true,modePreview:preview});
 fixture.runtime.tick(1000);fixture.runtime.tick(5000);
 assert.equal(fixture.postFrames.length,0,'retain the complete canvas while mode shaders prepare');
 assert.ok(fixture.calls.filter(call=>call==='network').length>=2,'pending preview never blocks multiplayer pumping');
 preview.pending=false;preview.animated=true;fixture.runtime.tick(5016);
 assert.equal(fixture.postFrames.length,1,'prepared mode reveals on the next frame');
}
