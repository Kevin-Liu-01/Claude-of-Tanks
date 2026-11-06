// studioSessionExit.selftest.mjs — an exit takes every in-flight step of the Studio session back (2026-11-02 audit F9).
// Runs the actual setMap / load / applyStudioLight / exportFilmFile / directProduction / exit callers of studio.ts against
// small ports, and exits while each awaits: nothing of the closed session may land after the teardown restored the
// battlefield. And the film, the staging and the export's own begin read one busy answer.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { createStudioSession, studioBusy, transportHeld, isStudioSessionEnded, StudioSessionEnded } from './studioSession.ts';
// (round 2) the history's reading, by namespace: a copy of this file on a tree without it still links
import * as studioSessionModule from './studioSession.ts';
import { createAppLifecycle } from './appLifecycle.ts';
import { createMapAmbienceAccess } from '../world/mapAmbienceAccess.ts';

const text = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', text, ts.ScriptTarget.Latest, true);
const CORE = ['setMap', 'withStage', 'doExit', 'exit', 'load', 'ensureLoadMap', 'replaceLoadActors', 'applyStudioLight',
  'exportFilmFile', 'cancelFilmExport', 'filmBusy', 'beginFilm', 'endFilm', 'directProduction'];
// the session's helpers where the file has them
const HELPERS = ['leaveForGarage', 'tearDownToGarage', 'tearDownStudio', 'prepareAtmosphere', 'openFilm', 'busy', 'filmExportAborted',
  'ensureSessionWorld', 'productionBusy', 'busyFlags', 'commitHistory', 'restoreAutosave', 'flushHistory', 'undo', 'stepHistory',
  'restoreDocument', 'invalidate'];
const found = new Map();
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...CORE, ...HELPERS].includes(node.name.text) && !found.has(node.name.text)) {
    found.set(node.name.text, node.getText(source));
  }
  ts.forEachChild(node, visit);
})(source);
for (const name of CORE) assert.ok(found.has(name), `studio.ts declares ${name}`);
// the export's lazy module is a port here
const functions = [...found.values()].join('\n').replace("await import('./studioFilmExport.ts')", 'await importFilmExport()');
// (round 2 U36) a tank added in the open Studio, run on its own over the holder its load reads (scenario 17's batching case)
const actorFunctions = [];
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && ['addActor', 'activateActorPresentation'].includes(node.name.text)) {
    actorFunctions.push(node.getText(source));
  }
  ts.forEachChild(node, visit);
})(source);
assert.equal(actorFunctions.length, 2, 'studio.ts declares addActor and activateActorPresentation');
// the session's holders where the module has them (a copy of this file on a tree without them still links)
const createSessionHolder = studioSessionModule.createSessionHolder ?? (() => ({ held: false, take: () => () => {} }));

function makeStudio(overrides = {}) {
  const calls = [];
  const noop = () => {};
  let releaseWorld = null, releaseAtmosphere = null, releaseBuilders = null, releaseExportModule = null, atmosphereOwner = null;
  const exportFrames = { rendered: 0, aborted: false };
  const ports = {
    calls, exportFrames,
    session: createStudioSession(), studioBusy, transportHeld, isStudioSessionEnded, StudioSessionEnded, createSessionHolder,
    t: (key) => key, console,
    resolveMapId: (id) => id, getMapConfig: (id) => ({ name: id }),
    studioTimeLightsLamps: () => false, studioTimeFor: (_map, time) => time,
    world: { mapId: 'verdant', setWindTime: noop, groundOcclusion: null },
    ensureWorld: (id) => new Promise((resolve) => {
      calls.push(['ensure-world', id]);
      releaseWorld = () => { ports.world = { ...ports.world, mapId: id }; calls.push(['world-in', id]); resolve(ports.world); };
    }),
    setWorldDormant: (value) => calls.push(['dormant', value]),
    ctx: {
      // (main.ts lights the world inside its own awaits; this port lights at its release whatever the token says, so a
      // scenario reads what the Studio itself guarantees)
      prepareStudioAtmosphere: (time, _light, owner) => new Promise((resolve) => {
        atmosphereOwner = owner ?? null;
        calls.push(['atmosphere-start', time]);
        releaseAtmosphere = () => { calls.push(['atmosphere-lit', time]); resolve({ time }); }; // the plan it applied
      }),
      restoreStudioAtmosphere: () => calls.push('atmosphere-restored'),
      getStudioLight: () => null,
    },
    setCamoBiome: noop, applyCamoPatterns: noop, settleActor: noop,
    panel: { setStage: (stage) => calls.push(stage ? 'stage-on' : 'stage-off'), setStageProgress: noop, refreshAll: noop,
      refreshMap: noop, hide: () => calls.push('panel-hidden'), refreshSelected: noop, refreshHistory: noop },
    transition: { run: async (work) => work(noop) },
    camoTryOn: { preview: noop },
    // (round 2 U36) the history's parts: the document as authored (the battlefield as rendered, the edits made), the autosave
    // a commit writes, and the one the header's Restore reads
    historyHeld: studioSessionModule.historyHeld, edits: [], HISTORY_LIMIT: 50, undoStack: [], redoStack: [],
    // the history's settle timer is recorded, never run (a scenario flushes the history itself)
    HISTORY_SETTLE_MS: 400, setTimeout: () => { calls.push('history-armed'); return 1; }, clearTimeout: noop,
    // an undo across battlefields loads the document (restoreDocument's other path is the same battlefield's patch)
    sameActorSet: () => false,
    documentJson: () => ({ map: ports.world.mapId, actors: ports.edits.map((id) => ({ id })) }),
    emptyDocument: (doc) => !doc.actors?.length, writeAutosave: (text) => calls.push(['autosave', text]),
    readAutosave: () => null,
    lighting: { updateFrustums: noop, update: noop },
    // load's parts
    sceneInCurrentTankIds: (json) => json, productionAspect: noop, normalizeFilm: (film) => film, isStudioTime: () => true,
    normalizeStudioLight: (light) => light ?? null, resolvePicture: (picture) => picture ?? null,
    createFrameBudgetYielder: () => async () => { await Promise.resolve(); },
    setTimeOfDay: async () => {}, applyFxSettings: noop, normalizeStudioFx: (fx) => fx ?? {},
    resetFx: noop, DEFAULT_ACTOR_ID: 'm1a1',
    ensureTankBuilders: () => new Promise((resolve) => { releaseBuilders = resolve; }),
    addActor: (cfg) => { calls.push(['add-actor', cfg.id]); return { cfg }; }, setHydropneumaticAim: noop,
    loadedStoryboard: () => ({ shots: [], durationMs: 8000 }), bindStoryboardTracks: noop,
    applyCamera: noop, clampStudioTime: (time) => time, replaceLoadEffects: noop, applyPictureRuntime: noop,
    restoreLoadedPresentation: noop, stateJson: () => ({ ok: true }), post: {},
    enter: async () => { calls.push('studio-enter'); }, sceneMeta: { seed: 5000 },
    // the film side
    filmRenderer: { active: false, begin() { this.active = true; calls.push('film-open'); return { startMs: 0, frames: 4 }; },
      renderNext() { return {}; }, end() { this.active = false; calls.push('film-closed'); } },
    filmSettingsFor: () => ({ fps: 30, speed: 1, shake: 1 }), filmOutputSize: () => ({ width: 1920, height: 1080 }),
    renderer: { domElement: {} }, perf: { renderedFrames: 0 }, renderCaptureFrame: () => calls.push('live-frame'),
    createFilmTimeMap: () => ({}), poseMotionCamera: noop, _motionCam: { matrixWorld: { elements: [] } },
    seekTimeline: (ms) => { calls.push(['seek', ms]); return ms; },
    document: { createElement: () => ({ click: noop }) }, URL: { createObjectURL: () => '', revokeObjectURL: noop },
    importFilmExport: () => new Promise((resolve) => {
      releaseExportModule = () => resolve({
        // studioFilmExport.ts's loop: begin, a frame per task while not aborted, end in a finally
        async exportFilm(filmPorts, options) {
          try {
            await Promise.resolve();
            if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
            filmPorts.begin();
            for (let frame = 0; frame < 4; frame++) {
              if (options.signal?.aborted) { exportFrames.aborted = true; throw new DOMException('aborted', 'AbortError'); }
              filmPorts.renderNext();
              exportFrames.rendered++;
              await new Promise((resolve) => setImmediate(resolve));
            }
            return { blob: {}, container: 'mp4', bytes: 1 };
          } finally {
            filmPorts.end();
          }
        },
      });
    }),
    // the teardown's parts
    stopRecording: noop, flareToWallClock: noop, marker: { group: { visible: true } }, keys: new Set(),
    releaseCrushes: noop, clearActors: () => calls.push('actors-cleared'), shells: [], effectLog: [], activeEffectIds: new Set(),
    fx: { resetAll: noop, setFrozen: noop }, studioStages: new Map(), resetStudioGround: noop, releaseStudioFx: noop,
    camera: { rotation: { z: 0 } }, cam: { roll: 0 }, normalizeStoryboard: () => ({ shots: [] }),
    rail: { rebuild: noop, updateVisibility: noop }, disposePicture: noop, unsweepPool: noop,
    enterGarage: async () => { calls.push('enter-garage'); ports.game.phase = 'garage'; }, syncRoute: noop, docBrand: noop,
    game: { phase: 'studio' },
    // a staging's parts (directProduction): an open world its rigs all see the tank in
    productionPreset: (id) => ({ id, map: 'desert' }), createProductionScene: () => ({ map: 'desert', actors: [] }),
    TANK_IDS: { stamp: () => ({}) }, selectActor: noop, setRailVisible: noop, hfProxy: { getHeightAt: () => 0 },
    _v1: null, _v2: null, _v3: null,
    ...overrides,
  };
  ports.getWorld = () => ports.world;
  const names = Object.keys(ports).filter((name) => !['calls', 'exportFrames', 'world'].includes(name));
  const code = stripTypeScriptTypes(`
    function makeStudioHarness(ports) {
    const { ${names.join(', ')} } = ports;
    let active = true, entering = null, closing = null, exitRun = null, mapChange = null, buildPlateUp = false;
    let recording = null, loading = false, productionLoading = false, productionOwnsLoad = false, filming = false, restoringHistory = false;
    let lightChanges = 0, historyTimer = 0, historyHead = null, pointerHeld = false, selectedEffect = null, frameDirty = false;
    // (round 2 U36) the session's holders (the lane base's plain latches above)
    const sceneLoad = createSessionHolder(), staging = createSessionHolder(), historyRestore = createSessionHolder();
    const relighting = createSessionHolder();
    let filmExport = null, filmCues = null, filmShake = 1, timeScale = 0, clockMs = 1200, timeOfDay = 'day', studioLight = null;
    let storyboard = { shots: [], durationMs: 8000 }, selectedShotId = null, shotUidSeq = 1, actorKeyUidSeq = 1;
    let placeArmed = null, dragActor = null, dragging = false, lookThrough = true, productionFormat = 'landscape';
    let sceneFilm = null, picture = null, actors = [];
    // the lane base's own abandonment latch (unused once the session owns the generation)
    let entryGeneration = 0, exiting = false;
    class EntryAbandoned extends Error {}
    ${functions}
    // the Studio is open: its session entered (the base keeps only the active flag)
    session.open(session.beginEntry());
    return {
      setMap, load, exit, doExit, exportFilmFile, cancelFilmExport, directProduction, restoreAutosave, busy: () => busy(),
      undo, flushHistory, invalidate, get loading() { return loading; }, get sceneLoad() { return sceneLoad; },
      // the user enters the Studio again (doEnter's session moves)
      reenter: () => { session.open(session.beginEntry()); active = true; game.phase = 'studio'; },
      setTime: (time) => applyStudioLight(time, null, true),
      get active() { return active; }, get mapChange() { return mapChange; }, get timeOfDay() { return timeOfDay; },
      get filmExport() { return filmExport; }, set recording(value) { recording = value; },
      set filming(value) { filming = value; },
      set productionLoading(value) { productionLoading = value; if (value) staging.take(session.token()); },
    };
    }
  `);
  const studio = new Function('ports', `${code}\nreturn makeStudioHarness(ports);`)(ports);
  return {
    studio, calls, ports, exportFrames,
    releaseWorld: () => releaseWorld?.(), releaseAtmosphere: () => { const release = releaseAtmosphere; releaseAtmosphere = null; release?.(); },
    releaseBuilders: () => releaseBuilders?.(), releaseExportModule: () => releaseExportModule?.(),
    atmosphereOwner: () => atmosphereOwner,
  };
}
const settle = async (turns = 6) => { for (let i = 0; i < turns; i++) await new Promise((resolve) => setImmediate(resolve)); };
const after = (calls, marker) => calls.slice(calls.indexOf(marker) + 1);
/** How a step ended, read at once (no unhandled rejection): 'resolved', its error's name, or 'pending' while it waits. */
const track = (promise) => {
  const step = { state: 'pending' };
  promise.then(() => { step.state = 'resolved'; }, (error) => { step.state = error.name; });
  return step;
};
const outcome = async (step) => { await settle(); return step.state; };

// 1. Exit during a battlefield change: the switch resumes after the teardown restored the battlefield's light. It must
// never wake the world or light it for the Studio again (the next battle would play under the Studio's sun).
{
  const h = makeStudio();
  const switching = track(h.studio.setMap('desert'));
  await settle();
  assert.deepEqual(h.calls.filter((c) => Array.isArray(c) && c[0] === 'ensure-world'), [['ensure-world', 'desert']]);
  h.studio.exit();
  await settle();
  assert.equal(h.studio.active, false, 'the exit tore the Studio down');
  assert.ok(h.calls.includes('atmosphere-restored') && h.calls.includes('enter-garage'));
  h.releaseWorld();
  await settle();
  h.releaseAtmosphere(); // the lane base went on to light the world: let it land, to read what it did
  await settle();
  const late = after(h.calls, 'enter-garage');
  assert.ok(!late.some((c) => Array.isArray(c) && c[0] === 'dormant' && c[1] === false), 'the world stays dormant after the exit');
  assert.ok(!late.some((c) => Array.isArray(c) && c[0] === 'atmosphere-start'), 'no Studio light after the restore');
  assert.equal(late.filter((c) => c === 'stage-off').length, 0, 'the closed switch leaves the plate to the teardown');
  assert.equal(await outcome(switching), 'AbortError', 'the switch ends as a cancel');
  assert.equal(h.studio.mapChange, null);
}

// 2. Exit while a switch lights the battlefield: the teardown waits for the preparation to land before it restores, so
// the restore is the battlefield's last light.
{
  const h = makeStudio();
  const switching = track(h.studio.setMap('desert'));
  await settle();
  h.releaseWorld();
  await settle();
  assert.ok(h.calls.some((c) => Array.isArray(c) && c[0] === 'atmosphere-start'), 'the switch is lighting');
  h.studio.exit();
  await settle();
  h.releaseAtmosphere();
  await outcome(switching);
  await settle();
  const lit = h.calls.findIndex((c) => Array.isArray(c) && c[0] === 'atmosphere-lit');
  assert.ok(lit >= 0 && lit < h.calls.indexOf('atmosphere-restored'), 'the restore lands after the late preparation, never under it');
}

// 3. Two switches requested during a third build one after another, in order; the latch is never cleared under a build.
{
  const h = makeStudio();
  const first = track(h.studio.setMap('desert'));
  await settle();
  const second = track(h.studio.setMap('fjord'));
  const third = track(h.studio.setMap('urban'));
  await settle();
  h.releaseWorld(); await settle(); h.releaseAtmosphere(); await outcome(first); await settle();
  assert.deepEqual(h.calls.filter((c) => Array.isArray(c) && c[0] === 'ensure-world').map((c) => c[1]), ['desert', 'fjord'],
    'the second waits for the first; the third waits for the second');
  assert.ok(h.studio.mapChange, 'the latch names the build in flight');
  h.releaseWorld(); await settle(); h.releaseAtmosphere(); await outcome(second); await settle();
  assert.deepEqual(h.calls.filter((c) => Array.isArray(c) && c[0] === 'ensure-world').map((c) => c[1]), ['desert', 'fjord', 'urban']);
  h.releaseWorld(); await settle(); h.releaseAtmosphere();
  assert.equal(await outcome(third), 'resolved');
  assert.equal(h.studio.mapChange, null);
}

// 4. Exit during a scene load: the build stops at its next yield; no tank is added after the teardown cleared the actors.
{
  const h = makeStudio();
  const loading = track(h.studio.load({ map: 'verdant', actors: [{ id: 'leo2a4' }, { id: 't72b3' }] }));
  await settle();
  h.studio.exit();
  await settle();
  h.releaseBuilders();
  const loaded = await outcome(loading);
  assert.ok(!after(h.calls, 'actors-cleared').some((c) => Array.isArray(c) && c[0] === 'add-actor'), 'no tank joins a closed Studio');
  assert.equal(loaded, 'AbortError', 'the load ends as a cancel');
}

// 5. Exit during a film export: the export is cancelled, its film ends (the live viewport back) before the Garage
// returns, and its playhead restore never runs over the Garage.
{
  const h = makeStudio();
  const film = track(h.studio.exportFilmFile({ download: false }));
  h.releaseExportModule();
  await settle(2);
  assert.ok(h.calls.includes('film-open'), 'the film is rendering');
  h.studio.exit();
  const exported = await outcome(film);
  await settle();
  assert.ok(h.exportFrames.rendered < 4, 'the film stopped short');
  assert.ok(h.calls.indexOf('film-closed') >= 0 && h.calls.indexOf('film-closed') < h.calls.indexOf('enter-garage'),
    'the film size is restored before the Garage');
  assert.ok(!after(h.calls, 'enter-garage').some((c) => Array.isArray(c) && c[0] === 'seek'), 'no Studio seek after the teardown');
  assert.equal(exported, 'AbortError', 'the export ends as a cancel');
  assert.equal(h.studio.filmExport, null);
}

// 6. Exit in the gap before the film opens (its module still loading): the film never opens on the Garage.
{
  const h = makeStudio();
  const film = track(h.studio.exportFilmFile({ download: false }));
  await settle();
  h.studio.exit();
  await settle();
  h.releaseExportModule();
  const exported = await outcome(film);
  assert.ok(!h.calls.includes('film-open'), 'no film opens after the exit');
  assert.equal(exported, 'AbortError');
}
// 6 (and a Studio entered again). (round 3 B10) The export is the page's, not a session's (one encoder, studio.ts
// filmExport): one an exit outlived (its module still loading; likewise its encoder's flush and its soundtrack mix, which
// the cancel does not stop) holds 'export' in a Studio entered again until it ends, so no second export starts beside it.
// Then that Studio is free. docs/STUDIO.md's busy() line says so.
{
  const h = makeStudio({ session: createStudioSession({ settleMs: 20 }) });
  const film = track(h.studio.exportFilmFile({ download: false }));
  await settle();
  h.studio.exit();
  await new Promise((resolve) => { setTimeout(resolve, 60); }); // past the exit's bound, the module still loading
  await settle();
  assert.equal(h.studio.active, false, 'the bound let the exit go on');
  h.studio.reenter();
  assert.equal(h.studio.busy(), 'export', 'the closed session\'s export still holds the page\'s export in the Studio entered again');
  const second = track(h.studio.exportFilmFile({ download: false }));
  assert.equal(await outcome(second), 'Error', 'a second export is refused while it runs');
  h.releaseExportModule();
  assert.equal(await outcome(film), 'AbortError', 'the dead export ends as a cancel once its module lands');
  assert.ok(!h.calls.includes('film-open'), 'its film never opens');
  assert.equal(h.studio.busy(), null, 'and the Studio entered again is free');
}

// 7. Exit while a covered time change lights the scene: the change applies nothing once its session ended, and the
// teardown's restore follows its light.
{
  const h = makeStudio();
  const change = track(h.studio.setTime('night'));
  await settle();
  h.studio.exit();
  await settle();
  h.releaseAtmosphere();
  await outcome(change);
  assert.equal(h.studio.timeOfDay, 'day', 'a closed session keeps no new time');
  const lit = h.calls.findIndex((c) => Array.isArray(c) && c[0] === 'atmosphere-lit');
  assert.ok(lit < h.calls.indexOf('atmosphere-restored'), 'the restore is the last light');
}

// 8. A cover another transition takes over before the teardown ran still leaves, and its failure is no unhandled rejection.
{
  const h = makeStudio({ transition: { run: async () => { throw new DOMException('Transition cover was superseded', 'AbortError'); } } });
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  h.studio.exit();
  await settle(10);
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(unhandled, [], 'the exit handles its own rejection');
  assert.equal(h.studio.active, false, 'the Studio left without its cover');
  assert.ok(h.calls.includes('enter-garage'));
}

// 9. A preparation slower than the exit's bounded wait (a cold light chunk, a far-panorama rebake on a loaded phone): the
// teardown goes on after the bound, the preparation holds a token the exit made stale (main.ts applies no light and no
// ambience override with it), and one that lights anyway is undone after the teardown: the restore stays the last light.
{
  const h = makeStudio({ session: createStudioSession({ settleMs: 20 }) });
  const switching = track(h.studio.setMap('desert'));
  await settle();
  h.releaseWorld();
  await settle();
  assert.ok(h.calls.some((c) => Array.isArray(c) && c[0] === 'atmosphere-start'), 'the switch is lighting');
  assert.equal(h.atmosphereOwner()?.current(), true, 'the preparation is handed its live session\'s token');
  h.studio.exit();
  await new Promise((resolve) => { setTimeout(resolve, 60); }); // past the exit's bound
  await settle();
  assert.ok(h.calls.includes('enter-garage'), 'the bound let the exit go on to the Garage');
  assert.equal(h.atmosphereOwner().current(), false, 'the late preparation holds a stale token');
  h.releaseAtmosphere(); // lands after the teardown, lighting regardless
  await outcome(switching);
  await settle();
  const lastLit = h.calls.findLastIndex((c) => Array.isArray(c) && c[0] === 'atmosphere-lit');
  assert.ok(lastLit > h.calls.indexOf('enter-garage'), 'the preparation landed after the Garage returned');
  assert.ok(h.calls.lastIndexOf('atmosphere-restored') > lastLit, 'the restore is still the battlefield\'s last light');
}

// 9 (main.ts's side). A preparation that honours its token lights nothing for the closed session and reports no light:
// the teardown's restore is the only one (a second could reset a battle the Garage started in the meantime).
{
  const h = makeStudio({ session: createStudioSession({ settleMs: 20 }) });
  let release = null;
  h.ports.ctx.prepareStudioAtmosphere = (time, _light, owner) => new Promise((resolve) => {
    release = () => {
      if (!owner.current()) { resolve(null); return; }
      h.calls.push(['atmosphere-lit', time]);
      resolve({ time });
    };
  });
  const switching = track(h.studio.setMap('desert'));
  await settle();
  h.releaseWorld();
  await settle();
  h.studio.exit();
  await new Promise((resolve) => { setTimeout(resolve, 60); });
  await settle();
  release();
  await outcome(switching);
  await settle();
  assert.ok(!h.calls.some((c) => Array.isArray(c) && c[0] === 'atmosphere-lit'), 'no Studio light for the closed session');
  assert.equal(h.calls.filter((c) => c === 'atmosphere-restored').length, 1, 'nothing lit late, so nothing restored twice');
}

// 10. A load asked for in a session that ended (a take whose fetch, or a JSON file whose read, lands after the exit):
// refused as a cancel, and the Studio an exit closed is never entered again over the Garage.
{
  const h = makeStudio();
  const owner = h.ports.session.token(); // the take is chosen in the open Studio
  h.studio.exit();
  await settle();
  assert.equal(h.studio.active, false);
  const loaded = track(h.studio.load({ map: 'verdant', actors: [{ id: 'leo2a4' }] }, { owner }));
  assert.equal(await outcome(loaded), 'AbortError', 'the closed session\'s load ends as a cancel');
  assert.ok(!h.calls.includes('studio-enter'), 'the load never enters the Studio again');
  assert.ok(!h.calls.some((c) => Array.isArray(c) && c[0] === 'add-actor'), 'no tank is staged');
}

// 11. A recording that began in the export's module gap: the export's own begin refuses it (no film opens under a
// recording at film size with its clock stopped), as beginFilm's filmBusy does.
{
  const h = makeStudio();
  const film = track(h.studio.exportFilmFile({ download: false }));
  await settle();
  h.studio.recording = { promise: Promise.resolve() };
  h.releaseExportModule();
  const exported = await outcome(film);
  assert.ok(!h.calls.includes('film-open'), 'no film opens under a recording');
  assert.equal(exported, 'Error', 'the export is refused, not cancelled');
  assert.equal(h.studio.filmExport, null);
}

// 12. The export's own film begin refuses what beginFilm refuses, its own export flag aside: a battlefield change, a staging
// or a light change in flight when the film would open (begun in the export's module gap) stops the export with
// filmBusy's answer. studioBusy ranks the export flag first, so asking whether the holder was the export hid them all.
for (const [name, hold] of [
  ['battlefield change', (h) => { void h.studio.setMap('desert').catch(() => undefined); }],
  ['staging', (h) => { h.studio.productionLoading = true; }],
  ['light change', (h) => { void h.studio.setTime('night').catch(() => undefined); }],
]) {
  const h = makeStudio();
  let refusal = null;
  const film = h.studio.exportFilmFile({ download: false }).catch((error) => { refusal = error; });
  await settle();
  hold(h);
  await settle();
  h.releaseExportModule();
  await film;
  await settle();
  assert.ok(!h.calls.includes('film-open'), `no film opens beside a ${name}`);
  assert.equal(refusal?.message, 'Finish the current Studio operation first', `the ${name} refuses the export as beginFilm would`);
  assert.equal(h.studio.filmExport, null);
}

// 13. A staging asks the one busy reading before it stages: under an open film, during an export (its module gap) or
// beside a light change it is refused, and the battlefield is never switched, woken or relit under the film.
for (const [name, hold, message] of [
  ['an open film', (h) => { h.studio.filming = true; }, 'studio.error.finishFilm'],
  ['an export', (h) => { void h.studio.exportFilmFile({ download: false }).catch(() => undefined); }, 'studio.error.finishFilm'],
  ['a light change', (h) => { void h.studio.setTime('night').catch(() => undefined); }, 'studio.error.busy'],
]) {
  const h = makeStudio();
  hold(h);
  await settle();
  const before = h.calls.length;
  const staged = h.studio.directProduction({ presetId: 'desert-crossfire' }).then(() => 'staged', (error) => error.message);
  assert.equal(await Promise.race([staged, settle(2).then(() => 'still staging')]), message, `a staging under ${name} is refused at once`);
  const late = h.calls.slice(before);
  assert.ok(!late.some((c) => Array.isArray(c) && (c[0] === 'ensure-world' || (c[0] === 'dormant' && c[1] === false))),
    `no battlefield switch or wake under ${name}`);
}

// 14. A battlefield build that outlives the exit (Exit stays live through a cold build and never waits for it): the world
// runtime activates it when it lands, awake under its own sky and sun, over the Garage the teardown handed back. Once the
// teardown is done the Garage's presentation comes back (ctx.restoreGarageWorld: asleep, its sky and its trim); never
// while a battle holds the phase, and nothing for a build its live session still owns.
for (const phaseAtLanding of ['garage', 'battle']) {
  let landWorld = null, h = null;
  h = makeStudio({
    ensureWorld: (id) => new Promise((resolve) => {
      h.calls.push(['ensure-world', id]);
      // worldActivationRuntime.activate: the world swapped in, awake, its sky and its sun (restoreAtmosphere's setSun)
      landWorld = () => {
        h.ports.world = { ...h.ports.world, mapId: id };
        h.calls.push(['world-in', id], ['dormant', false], 'battlefield-sun');
        resolve(h.ports.world);
      };
    }),
  });
  h.ports.ctx.restoreGarageWorld = () => h.calls.push(['dormant', true], 'garage-sun');
  const switching = track(h.studio.setMap('desert'));
  await settle();
  h.studio.exit();
  await settle();
  assert.ok(h.calls.includes('enter-garage'), 'the exit went on without waiting for the build');
  h.ports.game.phase = phaseAtLanding;
  landWorld();
  await settle();
  const lastDormant = h.calls.findLast((c) => Array.isArray(c) && c[0] === 'dormant');
  const lastSun = h.calls.findLast((c) => c === 'battlefield-sun' || c === 'garage-sun');
  if (phaseAtLanding === 'garage') {
    assert.deepEqual(lastDormant, ['dormant', true], 'the Garage ends with the battlefield asleep');
    assert.equal(lastSun, 'garage-sun', 'and under its own sun trim, not the late world\'s');
  } else {
    assert.ok(!h.calls.includes('garage-sun'), 'a battle that took the phase keeps the world it was handed');
  }
  assert.equal(await outcome(switching), 'AbortError');
}
{
  const h = makeStudio();
  h.ports.ctx.restoreGarageWorld = () => h.calls.push('garage-sun');
  const switching = track(h.studio.setMap('desert'));
  await settle();
  h.releaseWorld(); await settle(); h.releaseAtmosphere();
  assert.equal(await outcome(switching), 'resolved');
  assert.ok(!h.calls.includes('garage-sun'), 'a build its live session still owns is the Studio\'s');
}

// 15. (round 2 U36) An edit still settling when the battlefield changes, then Exit during the build: the exit's commit
// takes the edit to the autosave (a battlefield change leaves the document the authored scene; the flush stops once the
// Studio closes, so a commit refused here was lost). A scene load in flight still keeps its half-built scene out.
{
  const h = makeStudio();
  h.ports.edits.push('lead-moved');
  const switching = track(h.studio.setMap('desert'));
  await settle();
  assert.ok(h.studio.mapChange, 'the battlefield change is building');
  h.studio.exit();
  await settle();
  const saved = h.calls.filter((c) => Array.isArray(c) && c[0] === 'autosave');
  assert.equal(saved.length, 1, 'the exit during the build commits the last edit');
  assert.deepEqual(JSON.parse(saved[0][1]), { map: 'verdant', actors: [{ id: 'lead-moved' }] },
    'the scene as authored: the edit, on the battlefield the change had not replaced');
  h.releaseWorld(); await settle(); h.releaseAtmosphere();
  assert.equal(await outcome(switching), 'AbortError');
}
{
  const h = makeStudio();
  const loading = track(h.studio.load({ map: 'desert', actors: [] }));
  await settle();
  assert.ok(h.studio.mapChange, 'the load is building its battlefield');
  h.ports.edits.push('half-built');
  h.studio.exit();
  await settle();
  assert.ok(!h.calls.some((c) => Array.isArray(c) && c[0] === 'autosave'), 'a scene load in flight is no step');
  h.releaseWorld(); await settle(); h.releaseAtmosphere();
  assert.equal(await outcome(loading), 'AbortError');
}

// 16. (round 2 U36) Exit while the header's Restore builds the autosaved scene: the restore ends quietly (false), never an
// unhandled rejection under the panel's handler, and no step is committed for the scene the exit took back.
{
  const h = makeStudio({ readAutosave: () => ({ savedAt: 1, doc: { map: 'desert', actors: [{ id: 'm1a1' }] } }) });
  const restoring = h.studio.restoreAutosave().then((value) => ({ value }), (error) => ({ error: error.name }));
  await settle();
  assert.deepEqual(h.calls.filter((c) => Array.isArray(c) && c[0] === 'ensure-world'), [['ensure-world', 'desert']]);
  h.studio.exit();
  await settle();
  h.releaseWorld(); await settle(); h.releaseAtmosphere();
  assert.deepEqual(await Promise.race([restoring, settle().then(() => 'still restoring')]), { value: false },
    'a restore the exit took back resolves false');
  assert.ok(!h.calls.some((c) => Array.isArray(c) && c[0] === 'autosave'), 'and commits nothing');
}
// 16 (a failure in its live session). (round 3 B10) A saved scene that will not load in the live Studio (its battlefield's
// build fails) is the caller's: restoreAutosave rejects with that failure, which the panel's Restore says with
// studio.loadFailed, and commits no step. Only a restore its session's exit took back resolves false: one that swallowed
// every failure left a broken saved scene doing nothing, the panel's catch dead.
{
  const failure = new Error('the saved scene\'s battlefield did not build');
  const h = makeStudio({
    readAutosave: () => ({ savedAt: 1, doc: { map: 'desert', actors: [{ id: 'm1a1' }] } }),
    ensureWorld: (id) => { h.calls.push(['ensure-world', id]); return Promise.reject(failure); },
  });
  const restored = await h.studio.restoreAutosave().then((value) => ({ value }), (error) => ({ error }));
  assert.deepEqual(h.calls.filter((c) => Array.isArray(c) && c[0] === 'ensure-world'), [['ensure-world', 'desert']],
    'the restore built the saved scene\'s battlefield');
  assert.equal(restored.error, failure, 'a restore that fails in its live session rejects with its failure, not false');
  assert.ok(!h.calls.some((c) => Array.isArray(c) && c[0] === 'autosave'), 'and commits no step');
  assert.equal(h.studio.active, true, 'the Studio stays open');
  assert.equal(h.studio.busy(), null, 'and free: the failed load released its hold');
}

// 17. (round 2 U36) A battlefield change belongs to its session: one an exit outlived (a cold build still going) neither
// holds a Studio entered again (busy() read 'map' until the dead build settled: recording, undo, a film refused) nor
// queues that Studio's own change behind it.
{
  const builds = [];
  let h = null;
  h = makeStudio({
    ensureWorld: (id) => new Promise((resolve) => {
      h.calls.push(['ensure-world', id]);
      builds.push({ id, land: () => { h.ports.world = { ...h.ports.world, mapId: id }; resolve(h.ports.world); } });
    }),
  });
  const stale = track(h.studio.setMap('desert'));
  await settle();
  h.studio.exit();
  await settle();
  assert.equal(h.studio.active, false, 'the exit tore the Studio down without waiting for the build');
  h.studio.reenter();
  assert.equal(h.studio.busy(), null, 'the Studio entered again is not held by the closed session\'s change');
  const next = track(h.studio.setMap('arctic'));
  await settle();
  assert.deepEqual(h.calls.filter((c) => Array.isArray(c) && c[0] === 'ensure-world').map((c) => c[1]), ['desert', 'arctic'],
    'its own change builds at once, not behind the dead one');
  assert.ok(h.studio.mapChange, 'and holds the Studio while it builds');
  assert.equal(h.studio.busy(), 'map');
  builds.find((build) => build.id === 'desert').land();
  await settle();
  assert.equal(await outcome(stale), 'AbortError', 'the dead change ends as a cancel');
  assert.equal(h.studio.busy(), 'map', 'and leaves the live change\'s latch alone');
  builds.find((build) => build.id === 'arctic').land();
  await settle();
  h.releaseAtmosphere();
  assert.equal(await outcome(next), 'resolved');
  assert.equal(h.studio.mapChange, null);
  assert.equal(h.studio.busy(), null);
}

// 17 (the Studio's other holders). (round 2 U36) A scene load, a staging and an undo across battlefields hold the Studio
// for their own session only. Exit while one waits on a cold build, then enter again: on the merged code the new Studio
// read busy 'scene' until the dead build settled, refused its own load (loadInFlight), skipped its added tanks' rail
// binding, headlights and panel row (a load batches those for its own pass), and an undo's stale flag kept its history
// from committing. Here the new Studio is free, its own load builds at once and holds it, and the dead run's end
// releases nothing of the live load's.
/** addActor and its presentation, run over the holder (and, on the lane base, the plain flag) the Studio's load set. */
const addActorIn = (h) => {
  const added = [];
  const noop = () => {};
  const ports = {
    loading: h.studio.loading, sceneLoad: h.studio.sceneLoad,
    getSpec: (id) => ({ name: id }), DEFAULT_ACTOR_ID: 'm1a1', isTankBuilderReady: () => true, t: (key) => key,
    game: { _engineCtx: {} }, createTank: () => ({ root: {}, syncFromState: noop }), scene: { add: noop },
    hfDug: { getHeightAt: () => 0 },
    createActorRecord: (_cfg, specId, _spec, visual) => ({ specId, visual, camo: null, authoredStateName: 'idle', authoredStateAgeS: 0 }),
    actors: [], bindStoryboardTracks: () => added.push('bind'), actorRoots: [], actorByRoot: new WeakMap(),
    setCamoOverride: noop, applyCamoPatterns: noop, settleActor: noop, applyActorState: noop, igniteColumn: noop,
    panel: { refreshActors: () => added.push('listed') }, invalidate: noop,
    ctx: { getStudioLight: () => ({ setActorRoots: () => added.push('headlights') }) },
  };
  const addActor = new Function(...Object.keys(ports),
    `let uidSeq = 1;\n${stripTypeScriptTypes(actorFunctions.join('\n'))}\nreturn addActor;`)(...Object.values(ports));
  addActor({ id: 'leo2a4' });
  return added;
};
for (const [name, start, ended] of [
  ['scene load', (h) => h.studio.load({ map: 'desert', actors: [] }), 'AbortError'],
  ['staging', (h) => h.studio.directProduction({ presetId: 'desert-crossfire' }), 'AbortError'],
  // stepHistory reads an undo the exit took back as no step (false)
  ['undo across battlefields', (h) => {
    h.ports.undoStack.push(JSON.stringify({ map: 'desert', actors: [] }));
    return h.studio.undo();
  }, 'resolved'],
]) {
  const builds = [];
  let h = null;
  h = makeStudio({
    ensureWorld: (id) => new Promise((resolve) => {
      h.calls.push(['ensure-world', id]);
      builds.push({ id, land: () => { h.ports.world = { ...h.ports.world, mapId: id }; resolve(h.ports.world); } });
    }),
  });
  const built = () => h.calls.filter((c) => Array.isArray(c) && c[0] === 'ensure-world').map((c) => c[1]);
  const stale = track(start(h));
  await settle();
  assert.deepEqual(built(), ['desert'], `the ${name} is building its battlefield`);
  assert.equal(h.studio.busy(), 'scene', `the ${name} holds the Studio`);
  h.studio.exit();
  await settle();
  assert.equal(h.studio.active, false, `the exit tore the Studio down without waiting for the ${name}'s build`);
  h.studio.reenter();
  assert.equal(h.studio.busy(), null, `the Studio entered again is not held by the closed session's ${name}`);
  assert.deepEqual(addActorIn(h), ['bind', 'listed', 'headlights'],
    `a tank added after the closed session's ${name} gets its rail binding, panel row and headlights`);
  const before = h.calls.length;
  h.studio.invalidate(); // an edit in the Studio entered again
  assert.deepEqual(h.calls.slice(before), ['history-armed'], `an edit after the closed session's ${name} arms the history`);
  h.ports.edits.push('reentered-edit');
  h.studio.flushHistory();
  assert.ok(h.calls.some((c) => Array.isArray(c) && c[0] === 'autosave' && c[1].includes('reentered-edit')),
    `the history commits an edit after the closed session's ${name}`);
  const next = track(h.studio.load({ map: 'arctic', actors: [] }));
  await settle();
  assert.equal(next.state, 'pending', `the new Studio's own load runs after the closed session's ${name}`);
  assert.deepEqual(built(), ['desert', 'arctic'], 'and builds its battlefield at once');
  assert.equal(h.studio.busy(), 'scene', 'and holds the Studio while it builds');
  builds.find((build) => build.id === 'desert').land();
  await settle();
  assert.equal(await outcome(stale), ended, `the closed session's ${name} ends as a cancel`);
  assert.equal(h.studio.busy(), 'scene', 'and its end releases nothing of the live load\'s');
  builds.find((build) => build.id === 'arctic').land();
  await settle();
  h.releaseAtmosphere();
  await settle();
  h.releaseBuilders();
  assert.equal(await outcome(next), 'resolved');
  assert.equal(h.studio.busy(), null);
}
// and a light change: one whose preparation outlived the exit's bounded wait holds no Studio entered again (busy() read
// 'light' until it landed), and its end releases nothing of the new session's own change
{
  const preps = [];
  const h = makeStudio({ session: createStudioSession({ settleMs: 20 }) });
  h.ports.ctx.prepareStudioAtmosphere = (time) => new Promise((resolve) => {
    preps.push({ time, land: () => resolve({ time }) });
  });
  const stale = track(h.studio.setTime('dusk'));
  await settle();
  assert.equal(h.studio.busy(), 'light', 'the change holds the Studio while it prepares');
  h.studio.exit();
  await new Promise((resolve) => { setTimeout(resolve, 60); }); // past the exit's bound
  await settle();
  assert.equal(h.studio.active, false, 'the bound let the exit go on');
  h.studio.reenter();
  assert.equal(h.studio.busy(), null, 'the Studio entered again is not held by the closed session\'s light change');
  const next = track(h.studio.setTime('night'));
  await settle();
  assert.equal(h.studio.busy(), 'light', 'its own change holds it');
  preps.find((prep) => prep.time === 'dusk').land();
  await settle();
  assert.equal(await outcome(stale), 'AbortError', 'the closed session\'s change ends as a cancel');
  assert.equal(h.studio.busy(), 'light', 'and its end releases nothing of the live change\'s');
  preps.find((prep) => prep.time === 'night').land();
  assert.equal(await outcome(next), 'resolved');
  assert.equal(h.studio.timeOfDay, 'night');
  assert.equal(h.studio.busy(), null);
}

// and a load asked for while the Studio is closed (a script, a take): it builds into the session its own entry begins
// (session.claim()). An exit that takes that entry back, then a new entry, leaves it holding nothing and building nothing
// there: on the merged code it held the new Studio as 'scene', and once its entry returned it read session.token(), the
// new session's, and staged its scene into it.
{
  let finishEntry = null;
  let h = null;
  h = makeStudio({
    // enter(): the entry begins its session at once and opens when its build lands (doEnter, without the build)
    enter: () => new Promise((resolve) => {
      const entry = h.ports.session.beginEntry();
      h.calls.push('studio-enter');
      finishEntry = () => { h.ports.session.open(entry); resolve(); };
    }),
  });
  h.studio.exit();
  await settle();
  assert.equal(h.studio.active, false);
  const stale = track(h.studio.load({ map: 'desert', actors: [{ id: 'leo2a4' }] }));
  await settle();
  assert.ok(h.calls.includes('studio-enter'), 'the load enters the Studio itself');
  assert.equal(h.studio.busy(), 'session', 'its entry holds the Studio');
  h.ports.session.beginExit(); // the exit takes the entry back (doEnter's failed-entry path), and the teardown closes it
  h.ports.session.close();
  h.studio.reenter();
  assert.equal(h.studio.busy(), null, 'the Studio entered again is not held by a load whose entry the exit took back');
  finishEntry(); // the abandoned entry returns
  await settle();
  h.releaseBuilders();
  assert.equal(await outcome(stale), 'AbortError', 'the load stops: the session it entered ended');
  assert.ok(!h.calls.some((c) => Array.isArray(c) && c[0] === 'ensure-world'), 'it switches the Studio entered again to nothing');
  assert.ok(!h.calls.some((c) => Array.isArray(c) && c[0] === 'add-actor'), 'and no tank of it joins that Studio');
}
// (its own entry, kept) a load that enters the Studio holds it from the request through its entry and its build: a second
// load meanwhile is refused, while the entry is still to begin (it waits for an exit's teardown or the boot) as once it
// runs, and once the entry opens the load builds its scene into that session
{
  let beginEntry = null, finishEntry = null;
  let h = null;
  h = makeStudio({
    // enter() waits for the teardown or the boot before its entry begins, then opens when its build lands
    enter: () => new Promise((resolve) => {
      beginEntry = () => {
        const entry = h.ports.session.beginEntry();
        finishEntry = () => { h.ports.session.open(entry); resolve(); };
      };
    }),
  });
  h.studio.exit();
  await settle();
  const first = track(h.studio.load({ map: 'verdant', actors: [{ id: 'leo2a4' }] }));
  await settle();
  const refused = (load) => Promise.race([load.then(() => 'loaded', (error) => error.message), settle().then(() => 'still loading')]);
  assert.equal(await refused(h.studio.load({ map: 'verdant', actors: [] })), 'studio.error.loadInFlight',
    'a second load while the first one\'s entry is still to begin is refused');
  beginEntry();
  assert.equal(await refused(h.studio.load({ map: 'verdant', actors: [] })), 'studio.error.loadInFlight',
    'and while that entry runs');
  finishEntry();
  await settle();
  assert.equal(h.studio.busy(), 'scene', 'the open Studio is held by the load that entered it');
  h.releaseBuilders();
  assert.equal(await outcome(first), 'resolved', 'and the load builds into the session its entry began');
  assert.ok(h.calls.some((c) => Array.isArray(c) && c[0] === 'add-actor' && c[1] === 'leo2a4'));
  assert.equal(h.studio.busy(), null);
}

// main.ts's side of the token (its preparation, a port above): after its awaits it lights nothing for a session that ended.
{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const start = main.indexOf('prepareStudioAtmosphere: async (');
  const body = main.slice(start, main.indexOf('restoreStudioAtmosphere:', start));
  assert.ok(start > 0 && body.includes('owner?: { current(): boolean }'), 'main.ts takes the session\'s token');
  const stale = body.indexOf('if (owner && !owner.current()) return null;');
  assert.ok(stale > body.indexOf('await studioLightRuntime') && stale < body.indexOf('.apply(time, light)')
    && stale < body.indexOf('setDensityOverride(1)'), 'the stale check follows the last await and precedes the light and the ambience override');
  assert.match(body, /return owner && !owner\.current\(\) \? null : applied;/, 'a session that ended before it finished reports no light to undo');
  // and its Garage presentation after a late Studio build: only while the Garage owns the screen (a battle being
  // assembled from the Garage keeps the phase there and owns the world it builds)
  // (integration IR6) the slice ends at the Garage ports that follow it, whatever binds enterGarage (app-flow's exit)
  const port = main.slice(main.indexOf('restoreGarageWorld: () => {'), main.indexOf('setGarageSpots, setGarageSunTrim, enterGarage'));
  assert.ok(port.length > 0 && port.length < 900, 'main.ts hands the Studio the Garage\'s presentation');
  assert.match(port, /garageEnvironmentPresentation\.activate\(selectedGarageVariantId\)/, 'the Garage\'s own presentation: asleep, its sky and trim');
  // (round 2 IR1) run the port itself over app-flow's lifecycle (appLifecycle.ts, bound as main.ts binds it): the Garage's
  // presentation comes back only while the Garage is the settled screen. A return that still owes the screen (failed: its
  // notice and Retry; superseded; handed off or skipped) restores the Garage itself, so the late build's undo stays out.
  const restoreGarageWorldIn = (state) => {
    const game = { phase: state.phase ?? 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
    const garageReturn = { state: state.returnState ?? 'idle', transitioning: state.transitioning ?? false };
    const battleEntryLifecycle = { pending: state.entryPending ?? false, renderingCovered: false };
    const battleLoad = { covering: state.covering ?? false };
    const appLifecycle = createAppLifecycle({ game, announce: () => {} });
    appLifecycle.setReaders({
      isBooting: () => state.booting ?? false,
      isEntryCovering: () => battleEntryLifecycle.pending && (battleLoad.covering === true || battleEntryLifecycle.renderingCovered),
      isReturnOwed: () => garageReturn.state !== 'idle',
    });
    const activated = [];
    const garageEnvironmentPresentation = { activate: (variant) => { activated.push(variant); return Promise.resolve(); } };
    const ports = { game, garageReturn, battleEntryLifecycle, battleLoad, appLifecycle, garageEnvironmentPresentation,
      selectedGarageVariantId: 'hangar' };
    const context = new Function(...Object.keys(ports), `return ({ ${port} });`)(...Object.values(ports));
    context.restoreGarageWorld();
    return activated;
  };
  assert.deepEqual(restoreGarageWorldIn({}), ['hangar'], 'a settled Garage gets its presentation back');
  for (const [name, state] of [
    ['a failed return (its notice and Retry own the screen)', { returnState: 'failed' }],
    ['a superseded return', { returnState: 'superseded' }],
    ['a return under its veil', { returnState: 'entering', transitioning: true }],
    ['a handoff behind the report', { returnState: 'handoff' }],
    ['a skipped restore (Battle Again)', { returnState: 'restoreSkipped' }],
    ['Battle Again\'s lease between its return and its battle', { transitioning: true }],
    ['a battle entry being assembled', { entryPending: true }],
    ['a battle entry\'s cover', { entryPending: true, covering: true }],
    ['a battle cover', { covering: true }],
    ['a battle', { phase: 'battle' }],
    ['a Studio entered again', { phase: 'studio' }],
  ]) assert.deepEqual(restoreGarageWorldIn(state), [], `no Garage presentation over ${name}`);
}

// 18. (round 3 A10) main.ts's preparation, run itself (its prepareStudioAtmosphere and restoreStudioAtmosphere over the real
// map-air owner, world/mapAmbienceAccess.ts): the map's air the Studio asks for at its hour lands after the module's import.
// An exit that outlived that import (the bound) restored the air (the density override and the toggle) and the import then
// prepared the closed session's hour over the battlefield, the one write after the teardown's restore that the session's
// token did not cover. Here a closed session's air applies nothing; a live session's, and a battle's (no owner), land.
{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const property = (from, to) => {
    const start = main.indexOf(from);
    assert.ok(start > 0, `main.ts declares ${from}`);
    return main.slice(start, main.indexOf(to, start));
  };
  const preparation = property('prepareStudioAtmosphere: async (', 'setAmbienceEnabled:');
  const restore = property('restoreStudioAtmosphere: () => {', 'getStudioLight:');
  const makeContext = (ports) => new Function('ports', `${stripTypeScriptTypes(`
    function makeMainContext(ports) {
    const { battleAtmosphere, currentWorld, game, mapAmbience } = ports;
    // main.ts's own (the light runtime's chunk is loaded: its import is the light's half, scenario 9 and main's pin above)
    let studioLightRuntime = ports.studioLightRuntime, studioLightLive = ports.studioLightLive;
    let battleWatchdogRadianceScale = 1, baseFogDensity = 0;
    return { ${preparation} ${restore} };
    }
  `)}\nreturn makeMainContext(ports);`)(ports);
  /** The map's air: the real access over a module whose import the case lands, and the runtime it makes. */
  const air = () => {
    const prepared = [];
    let landModule = null;
    const module = new Promise((resolve) => { landModule = resolve; });
    const mapAmbience = createMapAmbienceAccess(() => ({}), () => module);
    const runtime = {
      prepare: (seed, mapId, time) => prepared.push([seed, mapId, time]),
      setEnabled: () => {}, setDensityOverride: () => {}, refreshTier: () => {}, reset: () => {}, isActive: () => false,
    };
    return { mapAmbience, prepared, land: () => landModule({ createMapAmbience: () => runtime }) };
  };
  const contextFor = (mapAmbience) => {
    const light = { apply: (time) => ({ time }), restore: () => {} };
    return makeContext({
      battleAtmosphere: { prepare: async () => {} }, currentWorld: () => ({ mapId: 'verdant' }), game: { mapId: 'verdant' },
      mapAmbience, studioLightRuntime: { load: async () => light }, studioLightLive: light,
    });
  };
  // the exit outlived the air's import: the teardown restored, then the import landed
  {
    const { mapAmbience, prepared, land } = air();
    const context = contextFor(mapAmbience);
    const session = createStudioSession();
    const owner = session.beginEntry();
    session.open(owner);
    const work = context.prepareStudioAtmosphere('night', null, owner);
    await settle();
    session.beginExit();
    context.restoreStudioAtmosphere(); // the teardown's restore (tearDownStudio), past the exit's bounded wait
    session.close();
    land();
    assert.equal(await work, null, 'the closed session\'s preparation reports no light');
    await settle();
    assert.deepEqual(prepared, [], 'the map\'s air at the closed session\'s hour never lands after the teardown restored it');
  }
  // a live session's air lands at its hour; a battle's (no owner) lands as it did
  {
    const { mapAmbience, prepared, land } = air();
    const context = contextFor(mapAmbience);
    const session = createStudioSession();
    const owner = session.beginEntry();
    session.open(owner);
    const work = context.prepareStudioAtmosphere('night', null, owner);
    await settle();
    land();
    assert.deepEqual(await work, { time: 'night' }, 'the live session\'s preparation reports its light');
    assert.deepEqual(prepared, [[0, 'verdant', 'night']], 'and its air lands at its hour');
    await mapAmbience.prepare(3, 'verdant', 'day');
    assert.deepEqual(prepared.at(-1), [3, 'verdant', 'day'], 'a battle\'s air (no owner) lands');
  }
}

console.log('studioSessionExit.selftest: an exit during a map switch, its lighting (bounded or not), a scene load, a film export, the export\'s module gap and a time change lands nothing after the teardown; a build that outlives the exit leaves the Garage its presentation; a closed session\'s load never re-enters; a recording, a battlefield change, a staging or a light change refuses the export\'s film; a staging refuses a film, an export or a light change; queued switches run in order; a superseded exit cover still leaves; an exit during a build commits the last edit; a restore the exit took back resolves false; a closed session\'s build, load, staging, undo or light change holds no later Studio; the late build\'s undo waits for a settled Garage');
