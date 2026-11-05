// (round 2, app-flow: integration IR1 residual) A failed Studio entry whose Garage return also failed (it threw before
// writing the Garage's scene) announced the Garage twice. The entry's catch wrote and announced 'garage' itself
// ('studio:entry-failed') over a return still 'failed' (frames suppressed, nothing restored), and the return's notice
// Retry (main's enterGarageWithExit is the Studio's enterGarage) announced it again when it landed. The hand-back's
// phase is the return's alone: it is announced once, by the return that lands. Runs studio.ts's own enter, doEnter and
// teardown (the harness of studioEntry.selftest.mjs) over a real app lifecycle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { createGaragePhasePresentationRuntime } from './garagePhasePresentationRuntime.ts';
import { assertAppPhaseTransition, createAppLifecycle, transitionAppPhase } from './appLifecycle.ts';
import { createStudioSession } from './studioSession.ts';

// Execute the actual Studio enter/doEnter/doExit callers without constructing
// the renderer, panel DOM or full fleet. This catches caller ordering; a test
// of setSunTrim alone cannot reproduce first-use Studio with no world.
const source = ts.createSourceFile('studio.ts',
  readFileSync(new URL('./studio.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
// (2026-11-02 audit F9) the session's teardown, shared by an exit and a failed entry, and its atmosphere preparation
// (2026-11-03) and the session's trailed battlefield build
const names = new Set(['enter', 'doEnter', 'doExit', 'withStage', 'leaveForGarage', 'tearDownToGarage', 'tearDownStudio',
  'prepareAtmosphere', 'ensureSessionWorld']);
// (UI-LOCKDOWN E) the first view's program preparation is a port here; its place in the entry is pinned below
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(functions.length, names.size);

const noop = () => {};
{
  const directBoot = false;
  let world = null;
  const calls = [];
  let releaseWorld;
  let fail = true;
  const acquire = () => new Promise((resolve, reject) => {
    releaseWorld = () => {
      if (fail) { reject(new Error('world acquisition failed')); return; }
      world = { mapId: 'whiteout', skyConfig: { sunIntensity: 2.8, sunColorHex: 0xd9e8ff }, spawnPoints: { player: { pos: [4, 2, 6], yaw: 0 } } };
      resolve(world);
    };
  });
  let acquisition = acquire();
  const time = 'day';
  const garageSky = { sunIntensity: 4.2, sunColorHex: 0xffffff };
  const game = { phase: 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  const announcements = [];
  createAppLifecycle({ game, announce: ({ from, phase, reason }) => announcements.push(`${from}>${phase}:${reason}`) });
  const presentation = createGaragePhasePresentationRuntime({
    scene: new THREE.Scene(), stageRoot: new THREE.Group(), dressingRoot: new THREE.Group(),
    garagePosition: new THREE.Vector3(), sunDirection: new THREE.Vector3(0, 1, 0),
    lighting: { setSun: (_direction, sky) => calls.push(['sun', sky]), setFarCascadeDormant: noop },
    getGarageSkyConfig: () => garageSky, getBattleSkyConfig: () => world?.skyConfig ?? null,
    getGroundHeight: () => 0, getPhase: () => game.phase,
    shouldReleaseGpuOnBattle: () => false, posePedestal: noop, poseCamera: noop,
    restorePresentationGpu: async () => ({}),
  });
  const camera = new THREE.PerspectiveCamera();
  const ports = {
    timeOfDay: time,
    studioLight: null, // media r5: the scene's sun override, forwarded with the time
    ctx: { prepareStudioAtmosphere: async (selected) => calls.push(['atmosphere', selected]),
      restoreStudioAtmosphere: () => calls.push('atmosphere-restored'),
      // main.ts: the Garage's own presentation (asleep, its sky and trim) while the Garage owns the screen
      restoreGarageWorld: () => { calls.push('garage-world', ['dormant', true]); presentation.setSunTrim(true); } },
    // the Studio session (studioSession.ts) and the film a teardown ends
    session: createStudioSession(), t: (key) => key, filmRenderer: { active: false }, endFilm: noop,
    // the rest of the fleet warms when the Studio is up, never inside the entry (247)
    window: { requestIdleCallback: (callback) => { calls.push('idle'); callback(); } }, game, camera,
    // (2026-11-02 audit S3) the boot latch the entry waits on (src/app/bootReadiness.ts, as studio.ts imports it)
    isBootReady: () => !directBoot, whenBootReady: (callback) => { callback(); return noop; },
    warmFleet: () => { calls.push('fleet-warm'); return Promise.resolve(); },
    resolveMapId: (id) => id, urlParam: () => null, getMapConfig: (id) => ({ name: id }),
    post: { resetAdaptiveResolution: noop, render: () => calls.push('covered-frame') },
    garage: { hide: noop }, showroom: { stop: noop }, hud: null,
    setGarageSpots: noop, setGarageSunTrim: (enabled) => presentation.setSunTrim(enabled),
    // (perf-248) the build links its programs early unless the entry's time lights the lamps (studioLight.ts)
    ensureFxBus: noop, ensureFullFleet: async () => {},
    ensureWorld: (_id, _progress, options) => { calls.push(['early-programs', options?.earlyPrograms]); return acquisition; },
    studioTimeFor: (_mapId, requested) => requested, studioTimeLightsLamps: (rendered) => rendered === 'dusk' || rendered === 'night',
    warmStudioPipeline: async () => {}, setWorldDormant: (value) => calls.push(['dormant', value]),
    setCamoBiome: noop, applyCamoPatterns: noop, sweepPool: noop, resetFx: noop,
    getWorld: () => world, actors: [], _v1: new THREE.Vector3(), _v2: new THREE.Vector3(),
    cam: { fov: 50, roll: 0, orbit: { target: new THREE.Vector3(), dist: 0 } }, lookAt: noop,
    lighting: { updateFrustums: noop, update: noop }, invalidate: noop,
    panel: { show: () => calls.push('panel-shown'), hide: () => calls.push('panel-hidden'), setBusy: noop, refreshAll: noop,
      setStage: (stage) => calls.push(stage ? 'stage-on' : 'stage-off'), setStageProgress: noop },
    transition: { run: async (work) => { calls.push('transition'); return work(noop); } },
    syncRoute: noop, docBrand: noop, marker: { group: { visible: true } }, keys: new Set(),
    clearActors: () => calls.push('actors-cleared'), shells: [], effectLog: [], activeEffectIds: new Set(),
    releaseCrushes: () => calls.push('crushes-released'),
    fx: { resetAll: noop, setFrozen: noop }, normalizeStoryboard: () => ({}),
    releaseStudioFx: () => calls.push('studio-fx-released'),
    rail: { rebuild: noop, updateVisibility: noop }, unsweepPool: noop,
    enterGarage: async () => { calls.push('enter-garage'); game.phase = 'garage'; presentation.setSunTrim(true); },
    stopRecording: noop,
    disposePicture: () => calls.push('picture-disposed'),
    applyPictureRuntime: () => calls.push('picture-applied'),
    // the destruction stages the Studio played and its own dug ground (fx lane, destruction core lane, 2026-10-08)
    studioStages: new Map(), resetStudioGround: noop, flareToWallClock: noop,
    prepareFirstViewPrograms: async () => { calls.push('first-view-programs'); },
    // the entry's own frames between its two first-view preparations (2026-10-26)
    nextFrame: async () => {},
    // (2026-11-02 audit F1) the Studio moves the phase through the one phase writer, as studio.ts imports it
    transitionAppPhase, assertAppPhaseTransition,
  };
  // The Studio's exit port, main's enterGarageWithExit over a Garage return that throws once before its scene write:
  // its notice's Retry runs it again, and the return that lands writes the scene and announces it at its screen handoff
  // (garageReturnRuntime performEntrySteps, showGarageScreen).
  let returnFails = true;
  let retryReturn = null;
  const enterGarage = async () => {
    calls.push('enter-garage');
    if (returnFails) {
      returnFails = false;
      retryReturn = () => enterGarage();
      throw new Error('restore failed');
    }
    transitionAppPhase(game, 'garage', { reason: 'garage-return', announce: false });
    transitionAppPhase(game, 'garage', { reason: 'garage-return:screen' });
  };
  ports.enterGarage = enterGarage;
  const code = stripTypeScriptTypes(`
    function makeStudioEntry(ports) {
    const { ${Object.keys(ports).join(',')} } = ports;
    let active = false, entering = null, timeScale = 1, recording = false, entryGeneration = 0, buildPlateUp = false, exitRun = null, closing = null;
    class EntryAbandoned extends Error {}
    let placeArmed = null, dragActor = null, dragging = false, storyboard = {};
    let selectedShotId = null, shotUidSeq = 1, actorKeyUidSeq = 1;
    ${functions.join('\n')}
    return { enter, doExit, active: () => active };
    }
  `);
  const studio = new Function('ports', code + '\nreturn makeStudioEntry(ports);')(ports);
  const quiet = console.error;
  console.error = () => {}; // the catch reports the failed return
  const pending = studio.enter({ map: 'whiteout' });
  try {
    for (let i = 0; i < 4; i++) await Promise.resolve();
    assert.equal(game.phase, 'studio', 'the entry took the scene');
    releaseWorld();
    await assert.rejects(pending, /world acquisition failed/);
  } finally { console.error = quiet; }
  assert.ok(calls.includes('enter-garage'), 'the failed entry ran the Garage return');
  assert.equal(typeof retryReturn, 'function', "the return failed: its notice's Retry is the exit");
  assert.deepEqual(announcements, ['garage>studio:studio:enter'],
    "no Garage is announced over a return that failed before the Garage's scene (frames suppressed, nothing restored)");
  assert.equal(game.phase, 'studio', 'the catch does not hand the scene over in the return\'s place');
  assert.equal(studio.active(), false);
  assert.equal(ports.session.phase, 'closed', "the failed entry's session ends");
  await retryReturn();
  assert.equal(game.phase, 'garage');
  assert.deepEqual(announcements.slice(1), ['studio>garage:garage-return:screen'], 'the landing return announces the Garage once');
  // and a later press enters again
  fail = false;
  acquisition = acquire();
  const again = studio.enter({ map: 'whiteout' });
  for (let i = 0; i < 4; i++) await Promise.resolve();
  releaseWorld();
  await again;
  assert.equal(studio.active(), true, 'a later press opens the Studio');
  await studio.doExit();
}

console.log('studioEntryHandBack.selftest: a failed entry over a failed Garage return announces the Garage once, when the return lands passed');
