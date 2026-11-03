// studioSessionExit.selftest.mjs — an exit takes every in-flight step of the Studio session back (2026-11-02 audit F9).
// Runs the actual setMap / load / applyStudioLight / exportFilmFile / exit callers of studio.ts against small ports, and
// exits while each awaits: nothing of the closed session may land after the teardown restored the battlefield.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import { createStudioSession, studioBusy, transportHeld, isStudioSessionEnded, StudioSessionEnded } from './studioSession.ts';

const text = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('studio.ts', text, ts.ScriptTarget.Latest, true);
const CORE = ['setMap', 'withStage', 'doExit', 'exit', 'load', 'ensureLoadMap', 'replaceLoadActors', 'applyStudioLight',
  'exportFilmFile', 'cancelFilmExport', 'filmBusy', 'beginFilm', 'endFilm'];
// the session's helpers where the file has them
const HELPERS = ['leaveForGarage', 'tearDownToGarage', 'prepareAtmosphere', 'openFilm', 'busy', 'filmExportAborted'];
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

function makeStudio(overrides = {}) {
  const calls = [];
  const noop = () => {};
  let releaseWorld = null, releaseAtmosphere = null, releaseBuilders = null, releaseExportModule = null, atmosphereOwner = null;
  const exportFrames = { rendered: 0, aborted: false };
  const ports = {
    calls, exportFrames,
    session: createStudioSession(), studioBusy, transportHeld, isStudioSessionEnded, StudioSessionEnded,
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
    setCamoBiome: noop, applyCamoPatterns: noop, settleActor: noop, invalidate: noop,
    panel: { setStage: (stage) => calls.push(stage ? 'stage-on' : 'stage-off'), setStageProgress: noop, refreshAll: noop,
      refreshMap: noop, hide: () => calls.push('panel-hidden'), refreshSelected: noop },
    transition: { run: async (work) => work(noop) },
    camoTryOn: { preview: noop }, commitHistory: noop,
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
    restoreLoadedPresentation: noop, stateJson: () => ({ ok: true }),
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
    enterGarage: async () => { calls.push('enter-garage'); }, syncRoute: noop, docBrand: noop,
    ...overrides,
  };
  ports.getWorld = () => ports.world;
  const names = Object.keys(ports).filter((name) => !['calls', 'exportFrames', 'world'].includes(name));
  const code = stripTypeScriptTypes(`
    function makeStudioHarness(ports) {
    const { ${names.join(', ')} } = ports;
    let active = true, entering = null, closing = null, exitRun = null, mapChange = null, buildPlateUp = false;
    let recording = null, loading = false, productionLoading = false, productionOwnsLoad = false, filming = false, restoringHistory = false;
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
      setMap, load, exit, doExit, exportFilmFile, cancelFilmExport,
      setTime: (time) => applyStudioLight(time, null, true),
      get active() { return active; }, get mapChange() { return mapChange; }, get timeOfDay() { return timeOfDay; },
      get filmExport() { return filmExport; }, set recording(value) { recording = value; },
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
}

console.log('studioSessionExit.selftest: an exit during a map switch, its lighting (bounded or not), a scene load, a film export, the export\'s module gap and a time change lands nothing after the teardown; a closed session\'s load never re-enters; a recording refuses the export\'s film; queued switches run in order; a superseded exit cover still leaves');
