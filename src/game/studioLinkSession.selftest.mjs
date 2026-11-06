// studioLinkSession.selftest.mjs — a scene link opens into the Studio session its own entry began (round 3 A10, U36).
// Runs the actual openSharedScene, bootScene, enter, doEnter, doExit and teardown of studio.ts against small ports: a link
// whose entry an exit took back, followed by a new entry before the abandoned build returned, read `active` (the new
// Studio's) and loaded the link's scene into that Studio, or said the refused link's error there. A path link's load that
// an exit ended rejected its boot open, which main.ts logs as '[studio] boot scene failed'.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { assertAppPhaseTransition, assertGarageScreenSettled, transitionAppPhase } from './appLifecycle.ts';
import { createStudioSession, isStudioSessionEnded } from './studioSession.ts';

const source = ts.createSourceFile('studio.ts',
  readFileSync(new URL('./studio.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = new Set(['enter', 'doEnter', 'doExit', 'withStage', 'leaveForGarage', 'tearDownToGarage', 'tearDownStudio',
  'prepareAtmosphere', 'ensureSessionWorld', 'openSharedScene', 'bootScene']);
const functions = [];
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
})(source);
assert.equal(functions.length, names.size, 'studio.ts declares the link and entry functions');

const noop = () => {};
const turns = async (count = 6) => { for (let i = 0; i < count; i++) await new Promise((resolve) => setImmediate(resolve)); };
/** How a step ended, read without an unhandled rejection: 'resolved', its error's name, or 'pending'. */
const track = (promise) => {
  const step = { state: 'pending' };
  promise.then(() => { step.state = 'resolved'; }, (error) => { step.state = error?.name ?? 'rejected'; });
  return step;
};

/**
 * The Studio's entry and its links over ports. `scenePath`: a ?scene= path link the boot reads (else none). `loadHangs`: the
 * scene's load waits for `finishLoad()` before it builds. The load port reads its session as the real load does
 * (opts.owner.check(), then the live session it claims), so a scene staged into a Studio entered after the link's shows
 * in `calls` with that session's generation.
 */
function harness({ scenePath = null, loadHangs = false } = {}) {
  const calls = [];
  let releaseWorld = null;
  const acquisition = new Promise((resolve) => {
    releaseWorld = () => {
      calls.push('world-activated');
      resolve({ mapId: 'whiteout', skyConfig: { sunIntensity: 2.8 }, spawnPoints: { player: { pos: [4, 2, 6], yaw: 0 } } });
    };
  });
  let world = null;
  let finishLoad = null;
  const game = { phase: 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  const session = createStudioSession();
  const ports = {
    session, isStudioSessionEnded, timeOfDay: 'day', studioLight: null, t: (key) => key, console,
    ctx: { prepareStudioAtmosphere: async () => {}, restoreStudioAtmosphere: () => calls.push('atmosphere-restored') },
    filmRenderer: { active: false }, endFilm: noop, game, camera: new THREE.PerspectiveCamera(),
    window: { requestIdleCallback: (callback) => callback(), location: { hash: '' } },
    isBootReady: () => true, whenBootReady: (callback) => { callback(); return noop; },
    whenGameReady: () => Promise.resolve(),
    warmFleet: () => Promise.resolve(), resolveMapId: (id) => id, getMapConfig: (id) => ({ name: id }),
    urlParam: (name) => (name === 'scene' ? scenePath : null), sceneLinkPath: (value) => value || null,
    sceneLinkValue: () => null, decodeSceneLink: async () => ({ ok: false, reason: 'empty', detail: '' }),
    sceneLinkOpenFailure: (result) => ({ message: 'studio.sceneLink.refused', detail: result.detail }),
    fetch: async () => ({ ok: true, json: async () => ({ map: 'whiteout', actors: [{ id: 'leo2a4' }] }) }),
    post: { resetAdaptiveResolution: noop, render: noop, warmFirstFrame: async () => {} },
    garage: { hide: noop }, showroom: { stop: noop }, hud: null, setGarageSpots: noop, setGarageSunTrim: noop,
    ensureFxBus: noop, ensureWorld: () => acquisition.then((activated) => { world = activated; return activated; }),
    studioTimeFor: (_mapId, requested) => requested, studioTimeLightsLamps: () => false,
    warmStudioPipeline: async () => {}, setWorldDormant: noop, setCamoBiome: noop, applyCamoPatterns: noop,
    sweepPool: noop, resetFx: noop, getWorld: () => world, actors: [], _v1: new THREE.Vector3(), _v2: new THREE.Vector3(),
    cam: { fov: 50, roll: 0, orbit: { target: new THREE.Vector3(), dist: 0 } }, lookAt: noop,
    lighting: { updateFrustums: noop, update: noop }, invalidate: noop, fx: { resetAll: noop, setFrozen: noop, prepareWorldMaterials: noop },
    panel: { show: noop, hide: () => calls.push('panel-hidden'), setBusy: noop, refreshAll: noop, setStage: noop, setStageProgress: noop,
      notice: (message, tone) => calls.push(['notice', message, tone ?? 'info', session.generation]) },
    transition: { run: async (work) => work(noop) }, syncRoute: noop, docBrand: noop,
    marker: { group: { visible: true } }, keys: new Set(), clearActors: noop, shells: [], effectLog: [], activeEffectIds: new Set(),
    releaseCrushes: noop, normalizeStoryboard: () => ({}), releaseStudioFx: noop, rail: { rebuild: noop, updateVisibility: noop },
    unsweepPool: noop, stopRecording: noop, disposePicture: noop, applyPictureRuntime: noop, studioStages: new Map(),
    resetStudioGround: noop, flareToWallClock: noop, prepareFirstViewPrograms: async () => {}, nextFrame: async () => {},
    createFrameBudgetYielder: () => async () => {},
    enterGarage: async () => { calls.push('enter-garage'); transitionAppPhase(game, 'garage', { reason: 'garage-return' }); },
    transitionAppPhase, assertAppPhaseTransition, assertGarageScreenSettled,
    // load(): its first step is the asking session's check (opts.owner.check()); it builds into the session it claims
    load: async (json, opts = {}) => {
      opts.owner?.check();
      const into = session.token();
      into.check();
      calls.push(['scene-load', json.map, into.generation]);
      if (loadHangs) await new Promise((resolve) => { finishLoad = resolve; });
      into.check(); // the real build checks its session after every await (ensureLoadMap, replaceLoadActors)
      calls.push(['scene-loaded', json.map, into.generation]);
      return {};
    },
  };
  const code = stripTypeScriptTypes(`
    function makeStudio(ports) {
    const { ${Object.keys(ports).join(',')} } = ports;
    let active = false, entering = null, timeScale = 1, recording = false, buildPlateUp = false, exitRun = null, closing = null;
    let placeArmed = null, dragActor = null, dragging = false, storyboard = { durationMs: 12000 };
    let selectedShotId = null, shotUidSeq = 1, actorKeyUidSeq = 1;
    ${functions.join('\n')}
    return { enter, doExit, openSharedScene, bootScene, active: () => active };
    }
  `);
  const studio = new Function('ports', `${code}\nreturn makeStudio(ports);`)(ports);
  return { studio, calls, session, game, releaseWorld: () => releaseWorld(), finishLoad: () => finishLoad?.() };
}
const loads = (calls) => calls.filter((call) => Array.isArray(call) && call[0] === 'scene-load');
const notices = (calls) => calls.filter((call) => Array.isArray(call) && call[0] === 'notice');

/**
 * The link's entry is building; the user exits (the exit's teardown hands the Garage back) and enters again before the
 * abandoned build returns; then the build lands (both entries were waiting on it). Returns the link's outcome.
 */
async function abandonThenReenter(h, opening) {
  await turns(2);
  assert.equal(h.session.phase, 'entering', 'the link\'s entry is building');
  const linkGeneration = h.session.generation;
  await h.studio.doExit();
  assert.equal(h.game.phase, 'garage', 'the exit took the link\'s entry back to the Garage');
  const reentry = track(h.studio.enter({ map: 'whiteout' }));
  await turns(2);
  assert.equal(h.studio.active(), true, 'the Studio entered again shows its shell');
  assert.ok(h.session.generation > linkGeneration, 'and runs a session of its own');
  h.releaseWorld(); // the shared build lands: the abandoned entry returns, the new one goes on
  await turns(8);
  assert.equal(reentry.state, 'resolved');
  assert.equal(h.session.phase, 'open', 'the Studio entered again is open');
  return opening;
}

// 1. A shared link (#scene=) whose entry an exit took back: nothing of it loads into the Studio entered again.
{
  const h = harness();
  const opening = track(h.studio.openSharedScene({ ok: true, scene: { map: 'whiteout', actors: [{ id: 'leo2a4' }] } }, 'verdant'));
  await abandonThenReenter(h, opening);
  assert.equal(opening.state, 'resolved', 'the abandoned link ends quietly');
  assert.deepEqual(loads(h.calls), [], 'the link\'s scene is not loaded into the Studio entered after its entry ended');
  assert.deepEqual(notices(h.calls), [], 'and nothing of it is said there');
}
// (kept) the same link, its entry kept: its scene loads into the session that entry began, and it says what opened
{
  const h = harness();
  const opening = track(h.studio.openSharedScene({ ok: true, scene: { map: 'whiteout', actors: [{ id: 'leo2a4' }] } }, 'verdant'));
  await turns(2);
  const generation = h.session.generation;
  h.releaseWorld();
  await turns(8);
  assert.equal(opening.state, 'resolved');
  assert.deepEqual(loads(h.calls), [['scene-load', 'whiteout', generation]], 'a kept link loads its scene into its own entry\'s session');
  assert.deepEqual(notices(h.calls).map((call) => call[1]), ['studio.sceneLink.openedScene'], 'and says what opened');
}
// (open Studio) a link pasted into the open Studio (hashchange) loads into that session
{
  const h = harness();
  const entry = h.studio.enter({ map: 'whiteout' });
  h.releaseWorld();
  await entry;
  const generation = h.session.generation;
  await h.studio.openSharedScene({ ok: true, scene: { map: 'whiteout', actors: [] } }, 'verdant');
  assert.deepEqual(loads(h.calls), [['scene-load', 'whiteout', generation]], 'a link opened in the open Studio loads there');
}

// 2. A refused shared link whose entry an exit took back: its error is not said in the Studio entered again.
{
  const h = harness();
  const opening = track(h.studio.openSharedScene({ ok: false, reason: 'damaged', detail: 'scene.actors[0]' }, 'verdant'));
  await abandonThenReenter(h, opening);
  assert.equal(opening.state, 'resolved');
  assert.deepEqual(notices(h.calls), [], 'the refused link says nothing in the Studio entered after its entry ended');
}
{
  const h = harness();
  const opening = track(h.studio.openSharedScene({ ok: false, reason: 'damaged', detail: 'scene.actors[0]' }, 'verdant'));
  await turns(2);
  h.releaseWorld();
  await turns(8);
  assert.equal(opening.state, 'resolved');
  assert.deepEqual(notices(h.calls).map((call) => [call[1], call[2]]), [['studio.sceneLink.refused', 'error']],
    'a refused link, its entry kept, says why in its Studio');
}

// 3. A path link (?scene=/x.json) at boot whose entry an exit took back: nothing of it loads into the Studio entered again.
{
  const h = harness({ scenePath: '/scenes/s05.scene.json' });
  const boot = h.studio.bootScene();
  assert.ok(boot, 'the boot reads the path link');
  assert.equal(await boot.map, 'whiteout', 'and enters on its battlefield');
  const opening = track(boot.open('verdant'));
  await abandonThenReenter(h, opening);
  assert.equal(opening.state, 'resolved', 'the abandoned path link ends quietly');
  assert.deepEqual(loads(h.calls), [], 'the path link\'s scene is not loaded into the Studio entered after its entry ended');
}
{
  const h = harness({ scenePath: '/scenes/s05.scene.json' });
  const opening = track(h.studio.bootScene().open('verdant'));
  await turns(2);
  const generation = h.session.generation;
  h.releaseWorld();
  await turns(8);
  assert.equal(opening.state, 'resolved');
  assert.deepEqual(loads(h.calls), [['scene-load', 'whiteout', generation]], 'a kept path link loads into its own entry\'s session');
}

// 4. A path link whose load an exit ends (main.ts's direct boot opens it into the Studio its boot entered): the open ends
// as a cancel, quietly, as a shared link's does; it rejected, and main.ts logged '[studio] boot scene failed'.
{
  const h = harness({ scenePath: '/scenes/s05.scene.json', loadHangs: true });
  const entry = h.studio.enter({ map: 'whiteout', coveredByBoot: true });
  h.releaseWorld();
  await entry;
  const opening = track(h.studio.bootScene().open('verdant'));
  await turns(2);
  assert.equal(loads(h.calls).length, 1, 'the path link\'s load is building');
  await h.studio.doExit();
  h.finishLoad();
  await turns(4);
  assert.ok(!h.calls.some((call) => Array.isArray(call) && call[0] === 'scene-loaded'), 'the load stops at the exit');
  assert.equal(opening.state, 'resolved', 'a path link\'s load that the exit ended is no failure of the boot');
}

console.log('studioLinkSession.selftest: a shared, refused or path scene link whose entry an exit took back loads and says nothing in the Studio entered again; a kept link loads into its own session; a path link\'s load ended by an exit is no boot failure');
