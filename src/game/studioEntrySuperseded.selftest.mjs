// studioEntrySuperseded.selftest.mjs — (2026-11-02 audit R1, review) a Studio entry its own exit abandons while the
// battlefield builds. The Garage taking the screen supersedes the world activation (worldActivationRuntime.ts setDormant
// (true)), so the abandoned entry's ensure rejects with WorldActivationSuperseded; the entry must take that as the
// abandonment it caused. The actual Studio enter/doEnter/doExit/withStage over the real activation runtime and build
// coordinator (a fake map module with a gate the test holds), the exit's Garage restore calling setDormant(true) as
// garageEnvironmentPresentationRuntime.ts does:
// 1. exit while the battlefield builds: the entry settles silently (before, it rethrew, studioAccess's onEntryError marked
//    the Studio press failed and the next press reloaded the page), and writes nothing after the exit;
// 2. exit, then a re-entry before the first build finishes: the first entry's rejection lands while the second loads and
//    writes nothing over it (before, it set active=false, hid the panel and set the Garage phase under the second entry,
//    which then presented the battlefield awake with no Studio panel and no Garage).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { createWorldActivationRuntime } from '../world/worldActivationRuntime.ts';
import { assertAppPhaseTransition, assertGarageScreenSettled, transitionAppPhase } from './appLifecycle.ts';
import { createStudioSession } from './studioSession.ts';

const source = ts.createSourceFile('studio.ts',
  readFileSync(new URL('./studio.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
// (integration IR1) the Studio session's entry and teardown (studioSession.ts, 2026-11-02 audit F9): an exit's
// abandonment is the session token going stale, and a failed or abandoned entry leaves through the shared teardown
const names = new Set(['enter', 'doEnter', 'doExit', 'withStage', 'leaveForGarage', 'tearDownToGarage', 'tearDownStudio',
  'prepareAtmosphere', 'ensureSessionWorld']);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(functions.length, names.size);

const noop = () => {};
const flush = async () => { for (let i = 0; i < 24; i++) await new Promise((resolve) => setImmediate(resolve)); };
function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

function harness() {
  const calls = [];
  const game = { phase: 'garage' };
  const scene = new THREE.Scene();
  let gate = deferred();
  const runtime = createWorldActivationRuntime({
    initialMapId: 'whiteout',
    coordinatorDependencies: {
      engineContext: {}, scene, renderer: { renderLists: { dispose() {} } }, deviceTier: 'desktop',
      getGarageActivity: () => ({ phase: 'garage', transitionActive: false, lastActivityAt: 0 }),
      releaseShadowMaterial() {},
      loadModule: async () => ({ async createMapAsync(_engine, { mapId }, progress) {
        await progress('Surveying terrain', 0.2);
        await gate.promise;
        const group = new THREE.Group();
        group.name = mapId;
        scene.add(group);
        calls.push('world-built');
        return { mapId, group, config: { sky: {} }, raycast: () => null,
          skyConfig: { sunIntensity: 2.8, sunColorHex: 0xd9e8ff }, spawnPoints: { player: { pos: [4, 2, 6], yaw: 0 } },
          dispose() {} };
      } }),
      now: () => 0, foregroundYielder: () => async () => {}, backgroundYielder: () => async () => {},
      resourceLimits: { pedestalVisuals: 2, worldScenes: 2 },
      buildClass: () => 'full',
    },
    swapSceneWorld() {}, setSceneWorldActive() {}, ensureCloudTextures() {}, awaitInitialCloudWarm: async () => {},
    applySkyPreset() {}, applySkyPresentation() {}, setSun() {}, getFogDensity: () => 0, onFogDensityChanged() {},
    canCreateCollider: () => false, createCollider: () => null, placeGarage() {},
    isMinimapReady: () => false, buildMinimap() {}, loadMinimapAsset: async () => false,
    compilePrograms() {}, linkerBreathingSlices: function* () {}, updateShadowFrustums() {}, warmShadowFrame() {},
    nextFrame: async () => {}, now: () => 0,
  });
  const camera = new THREE.PerspectiveCamera();
  const ports = {
    timeOfDay: 'day', studioLight: null,
    ctx: { prepareStudioAtmosphere: async () => calls.push('atmosphere'), restoreStudioAtmosphere: noop,
      // main.ts: the Garage's own presentation after a build its session outlived (asleep, its sky and trim)
      restoreGarageWorld: () => { calls.push('garage-world'); runtime.setDormant(true); } },
    // the Studio session (studioSession.ts) and the film a teardown ends
    session: createStudioSession(), t: (key) => key, filmRenderer: { active: false }, endFilm: noop,
    // (2026-11-02 audit F1) the Studio moves the phase through the one phase writer, as studio.ts imports it
    transitionAppPhase, assertAppPhaseTransition, assertGarageScreenSettled,
    window: { requestIdleCallback: (callback) => callback() }, game, camera,
    // (2026-11-02 audit S3) the boot latch the entry waits on (src/app/bootReadiness.ts, as studio.ts imports it)
    isBootReady: () => true, whenBootReady: (callback) => { callback(); return noop; },
    warmFleet: () => Promise.resolve(),
    resolveMapId: (id) => id, urlParam: () => null, getMapConfig: (id) => ({ name: id }),
    post: { resetAdaptiveResolution: noop, render: noop },
    garage: { hide: noop }, showroom: { stop: noop }, hud: null,
    setGarageSpots: noop, setGarageSunTrim: noop, ensureFxBus: noop, ensureFullFleet: async () => {},
    // main.ts's Studio context: the Studio's own ensure options
    ensureWorld: (id, onProgress) => runtime.ensure(id, onProgress, { precompile: false, compilePrograms: true, services: false }),
    studioTimeFor: (_mapId, requested) => requested, studioTimeLightsLamps: () => false,
    warmStudioPipeline: async () => {},
    setWorldDormant: (value) => { calls.push(['dormant', value]); runtime.setDormant(value); },
    setCamoBiome: noop, applyCamoPatterns: noop, sweepPool: noop, resetFx: noop,
    getWorld: () => runtime.current, actors: [], _v1: new THREE.Vector3(), _v2: new THREE.Vector3(),
    cam: { fov: 50, roll: 0, orbit: { target: new THREE.Vector3(), dist: 0 } }, lookAt: noop,
    lighting: { updateFrustums: noop, update: noop }, invalidate: noop,
    panel: { show: () => calls.push('panel-shown'), hide: () => calls.push('panel-hidden'), setBusy: noop, refreshAll: noop,
      setStage: noop, setStageProgress: noop },
    transition: { run: async (work) => work(noop) },
    syncRoute: noop, docBrand: noop, marker: { group: { visible: true } }, keys: new Set(),
    clearActors: noop, shells: [], effectLog: [], activeEffectIds: new Set(), releaseCrushes: noop,
    fx: { resetAll: noop, setFrozen: noop }, normalizeStoryboard: () => ({}), releaseStudioFx: noop,
    rail: { rebuild: noop, updateVisibility: noop }, unsweepPool: noop,
    // the Garage return: its environment presentation puts the battlefield to sleep (garageEnvironmentPresentationRuntime.ts)
    enterGarage: async () => { calls.push('enter-garage'); game.phase = 'garage'; runtime.setDormant(true); },
    stopRecording: noop, disposePicture: noop, applyPictureRuntime: () => calls.push('picture-applied'),
    studioStages: new Map(), resetStudioGround: noop, flareToWallClock: noop,
    prepareFirstViewPrograms: async () => {}, nextFrame: async () => {},
  };
  const code = stripTypeScriptTypes(`
    function makeStudioEntry(ports) {
    const { ${Object.keys(ports).join(',')} } = ports;
    let active = false, entering = null, timeScale = 1, recording = false, buildPlateUp = false, exitRun = null, closing = null;
    let placeArmed = null, dragActor = null, dragging = false, storyboard = {};
    let selectedShotId = null, shotUidSeq = 1, actorKeyUidSeq = 1;
    ${functions.join('\n')}
    return { enter, doExit, active: () => active };
    }
  `);
  const studio = new Function('ports', code + '\nreturn makeStudioEntry(ports);')(ports);
  // studioAccess.ts open(): a rejected entry goes to onEntryError, which marks the Studio press failed (main.ts)
  const entryErrors = [];
  const press = () => studio.enter({ map: 'whiteout' }).then(() => 'resolved', (error) => { entryErrors.push(error); return 'rejected'; });
  return { calls, game, runtime, studio, entryErrors, press, releaseBuild: () => gate.resolve(), session: ports.session };
}

// ---- 1. exit while the battlefield builds
{
  const h = harness();
  const pending = h.press();
  await flush();
  assert.equal(h.studio.active(), true, 'the Studio shell is up while its battlefield builds');
  await h.studio.doExit();
  const mark = h.calls.length;
  h.releaseBuild();
  assert.equal(await pending, 'resolved', 'an entry its own exit abandoned settles silently');
  await flush();
  assert.deepEqual(h.entryErrors, [], 'never reported as a failed entry (studioAccess onEntryError, the reload-on-press state)');
  const after = h.calls.slice(mark);
  assert.ok(after.includes('world-built'), 'the build finished after the exit');
  assert.ok(!after.includes('panel-hidden') && !after.includes('panel-shown') && !after.includes('atmosphere'),
    'and the abandoned entry wrote nothing after it');
  assert.equal(h.game.phase, 'garage');
  assert.equal(h.studio.active(), false);
  assert.equal(h.runtime.current, null, 'the battlefield never presented over the Garage');
  // (integration IR1) on the session owner: the exit closed the session, and the superseded build rejected, so the
  // session's trail has no late world to undo (studio's restoreGarageWorld stays for a build that does land)
  assert.equal(h.session.phase, 'closed');
  assert.ok(!after.includes('garage-world'), 'a superseded build leaves the trail nothing to undo');
}

// ---- 2. exit, then a re-entry before the first build finishes
{
  const h = harness();
  const first = h.press();
  await flush();
  await h.studio.doExit();
  const mark = h.calls.length;
  const second = h.press();
  await flush();
  assert.equal(h.studio.active(), true, 'the re-entry shows its own shell');
  h.releaseBuild();
  const [firstSettled, secondSettled] = await Promise.all([first, second]);
  const after = h.calls.slice(mark);
  assert.equal(after.filter((call) => call === 'panel-hidden').length, 0, 'nothing hides the live entry\'s panel');
  assert.equal(h.studio.active(), true, 'the second entry stays active');
  assert.equal(h.game.phase, 'studio', 'in the Studio phase');
  assert.ok(after.includes('picture-applied'), 'the live entry presents');
  assert.equal(h.runtime.current?.mapId, 'whiteout');
  assert.equal(h.runtime.dormant, false, 'with its battlefield awake under the Studio');
  assert.equal(secondSettled, 'resolved', 'the re-entry completes');
  assert.equal(h.session.phase, 'open', 'the re-entry\'s session is the open one');
  assert.equal(firstSettled, 'resolved', 'the abandoned entry settles silently');
  assert.deepEqual(h.entryErrors, []);
  await h.studio.doExit();
  assert.equal(h.game.phase, 'garage');
  assert.equal(h.runtime.dormant, true);
  assert.equal(h.session.phase, 'closed');
}

console.log('studioEntrySuperseded.selftest: a Studio entry abandoned by its exit while its battlefield builds settles silently and writes nothing, and a re-entry before that build finishes stays active with its panel shown and its battlefield awake PASS');
