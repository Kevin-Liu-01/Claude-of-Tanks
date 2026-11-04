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
async function scenario({ directBoot, priorWorld = null, fail = false, time = 'day', reenter = false, refusedOver = null,
  abandon = false, handedBack = false }) {
  let world = priorWorld;
  const calls = [];
  let releaseWorld;
  const acquire = () => new Promise((resolve, reject) => {
    releaseWorld = () => {
      if (fail) { reject(new Error('world acquisition failed')); return; }
      world = { mapId: 'whiteout', skyConfig: { sunIntensity: 2.8, sunColorHex: 0xd9e8ff },
        spawnPoints: { player: { pos: [4, 2, 6], yaw: 0 } } };
      calls.push('world-activated');
      // worldActivationRuntime.activate: the world comes in awake, under its own sky and sun (restoreAtmosphere's setSun)
      if (abandon) { calls.push(['dormant', false]); calls.push(['sun', world.skyConfig]); }
      resolve(world);
    };
  });
  let acquisition = acquire();
  const garageSky = { sunIntensity: 4.2, sunColorHex: 0xffffff };
  const game = { phase: refusedOver ?? 'garage', preBattleS: 0, result: null, resultTimeS: null, timeS: 0 };
  const announcements = [];
  if (refusedOver) createAppLifecycle({ game, announce: ({ from, phase, reason }) => announcements.push(`${from}>${phase}:${reason}`) });
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
  const pending = studio.enter({ map: 'whiteout', coveredByBoot: directBoot });
  if (refusedOver) {
    // (2026-11-02 audit F1 review) an entry over a battle's scene (Window.__STUDIO.load, a press whose module arrived
    // after a battle started) is refused before the stage, the panel or any write; its catch used to write 'garage'
    // and announce it in the middle of the live battle (battle -> garage is an edge), with no Garage return run
    await assert.rejects(pending, (error) => error?.name === 'AppPhaseTransitionError' && error.from === refusedOver);
    assert.equal(game.phase, refusedOver, 'the battle keeps its scene');
    assert.deepEqual(announcements, [], 'nothing is announced');
    assert.deepEqual(calls, [], 'nothing moved');
    assert.equal(studio.active(), false);
    // (integration IR1) and the refusal began no Studio session: one left 'entering' made every later press 'busy'
    assert.equal(ports.session.phase, 'closed', 'the refused entry holds no session');
    transitionAppPhase(game, 'garage', { reason: 'battle-return' });
    const later = studio.enter({ map: 'whiteout', coveredByBoot: directBoot });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    releaseWorld();
    await later;
    assert.equal(studio.active(), true, 'a press once the Garage has the scene again opens the Studio');
    assert.equal(game.phase, 'studio');
    await studio.doExit();
    return;
  }
  await Promise.resolve();
  if (abandon) {
    // (2026-11-03 audit F9) an exit while the battlefield streams, and the build lands after the teardown: the world
    // runtime activates it over the Garage (awake, its own sun); the Garage gets its presentation back once the teardown is
    // done, and the abandoned entry does nothing else
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await studio.doExit();
    assert.equal(game.phase, 'garage');
    const mark = calls.push('--teardown-done') - 1;
    releaseWorld();
    await pending;
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
    const late = calls.slice(mark);
    assert.ok(late.includes('world-activated') && late.includes('garage-world'), 'the late world is followed by the Garage\'s presentation');
    assert.deepEqual(late.findLast((entry) => Array.isArray(entry) && entry[0] === 'dormant'), ['dormant', true],
      'the battlefield ends asleep under the Garage');
    assert.equal(late.findLast((entry) => Array.isArray(entry) && entry[0] === 'sun')[1].sunIntensity, garageSky.sunIntensity * 0.55,
      'under the Garage\'s trim, not the late world\'s sun');
    assert.ok(!late.some((entry) => Array.isArray(entry) && entry[0] === 'atmosphere'), 'the abandoned entry lights nothing');
    assert.equal(studio.active(), false);
    return;
  }
  if (reenter) {
    // (248) an exit while the battlefield streams, then a second entry: it shows its own shell at once and joins the
    // build; the abandoned entry never touches the plate, the atmosphere or the fleet again
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await studio.doExit();
    assert.equal(studio.active(), false);
    const mark = calls.push('--reenter') - 1;
    const second = studio.enter({ map: 'whiteout' });
    assert.notStrictEqual(second, pending, 'a re-entry runs its own entry');
    for (let i = 0; i < 4; i++) await Promise.resolve();
    const after = calls.slice(mark);
    assert.ok(after.includes('stage-on') && after.includes('panel-shown') && !after.includes('world-activated'),
      'the re-entry shows its shell before the battlefield is in');
    releaseWorld();
    await Promise.all([pending, second]);
    const tail = calls.slice(mark);
    assert.equal(tail.filter((entry) => entry === 'stage-off').length, 1, 'only the live entry clears the plate');
    assert.equal(calls.filter((entry) => Array.isArray(entry) && entry[0] === 'atmosphere').length, 1, 'one atmosphere, the live entry\'s');
    assert.equal(calls.filter((entry) => entry === 'fleet-warm').length, 1, 'the fleet warms once');
    assert.equal(studio.active(), true);
    await studio.doExit();
    return;
  }
  if (handedBack) {
    // (integration IR1) the Garage took the scene back while the Studio's battlefield built (a return: studio -> garage
    // is an edge), then the build failed: the Studio holds no scene to hand back, so no second Garage return runs over
    // the one that has it and nothing is written; the Studio's frame flag, panel and session end, and a later press enters
    for (let i = 0; i < 4; i++) await Promise.resolve();
    assert.equal(game.phase, 'studio');
    transitionAppPhase(game, 'garage', { reason: 'garage-return' });
    // (integration review r2) or a battle has it since, started from that Garage
    if (handedBack === 'battle') transitionAppPhase(game, 'battle', { reason: 'battle-start' });
    const mark = calls.push('--handed-back') - 1;
    fail = true;
    releaseWorld();
    await assert.rejects(pending, /world acquisition failed/);
    const after = calls.slice(mark);
    assert.ok(!after.includes('enter-garage'), 'no Garage return over the one that has the scene');
    assert.ok(after.includes('panel-hidden'), 'the Studio\'s panel goes');
    assert.equal(studio.active(), false);
    assert.equal(ports.session.phase, 'closed', 'the failed entry\'s session ends');
    const studioHalf = ['actors-cleared', 'crushes-released', 'studio-fx-released', 'picture-disposed', 'atmosphere-restored'];
    if (handedBack === 'battle') {
      // the battlefield, its FX and its ground are the battle's: the Studio's teardown (which resets all three) stays out,
      // and the Garage's presentation is not put back under the battle
      assert.equal(game.phase, 'battle');
      for (const step of studioHalf) assert.ok(!after.includes(step), `no ${step} under the battle`);
      assert.ok(!after.includes('garage-world'), 'no Garage presentation under the battle');
      transitionAppPhase(game, 'garage', { reason: 'battle-return' });
    } else {
      assert.equal(game.phase, 'garage');
      // (integration review r2) the failed entry still leaves as an exit does up to the hand-back (audit F9): the Studio's
      // own teardown runs, the battlefield's own light last, and then the Garage's presentation of the battlefield again
      for (const step of studioHalf) assert.ok(after.includes(step), `the Studio's own teardown: ${step}`);
      assert.ok(after.includes('garage-world') && after.indexOf('garage-world') > after.indexOf('atmosphere-restored'),
        'the Garage\'s presentation comes back after the battlefield\'s own light');
      assert.deepEqual(after.findLast((entry) => Array.isArray(entry) && entry[0] === 'dormant'), ['dormant', true],
        'the battlefield ends asleep under the Garage');
      assert.equal(after.findLast((entry) => Array.isArray(entry) && entry[0] === 'sun')[1].sunIntensity,
        garageSky.sunIntensity * 0.55, 'under the Garage\'s trim');
    }
    fail = false;
    acquisition = acquire();
    const retry = studio.enter({ map: 'whiteout' });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    releaseWorld();
    await retry;
    assert.equal(studio.active(), true, 'a later press opens the Studio');
    await studio.doExit();
    return;
  }
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'sun'), false,
    'pending world acquisition never asks for a missing or previous battlefield preset');
  releaseWorld();
  if (fail) {
    await assert.rejects(pending, /world acquisition failed/);
    assert.equal(game.phase, 'garage');
    assert.equal(studio.active(), false);
    // (2026-11-02 audit F9) the failed entry leaves as an exit does: the panel goes, the battlefield gets its own light back
    // and the Garage returns (its showroom, spots and sun trim; only active and the phase were reset, the Garage stayed hidden)
    assert.ok(calls.includes('panel-hidden'), 'the Studio\'s panel goes');
    assert.ok(calls.includes('atmosphere-restored') && calls.indexOf('atmosphere-restored') < calls.indexOf('enter-garage'),
      'the battlefield\'s own light is back before the Garage returns');
    assert.ok(calls.includes('enter-garage'), 'the Garage returns');
    // never a battlefield preset: the only sun is the Garage's own trim, set by its return
    const suns = calls.filter((entry) => Array.isArray(entry) && entry[0] === 'sun');
    assert.ok(suns.length > 0 && suns.every((entry) => entry[1].sunIntensity === garageSky.sunIntensity * 0.55),
      'no battlefield sun; the Garage\'s trim');
    // and a second press enters again
    fail = false;
    acquisition = acquire();
    const retry = studio.enter({ map: 'whiteout', coveredByBoot: directBoot });
    for (let i = 0; i < 4; i++) await Promise.resolve();
    releaseWorld();
    await retry;
    assert.equal(studio.active(), true, 'a retry after a failed entry opens the Studio');
    await studio.doExit();
    return;
  }
  await pending;
  assert.deepEqual(calls.find((entry) => Array.isArray(entry) && entry[0] === 'early-programs'),
    ['early-programs', time !== 'dusk' && time !== 'night'],
    'the build links its programs early unless the entry\'s time lights the lamps (their lights re-key every lit program)');
  const sunIndex = calls.findIndex((entry) => Array.isArray(entry) && entry[0] === 'sun');
  assert.ok(calls.indexOf('world-activated') < sunIndex);
  assert.strictEqual(calls[sunIndex][1], world.skyConfig, 'untrim restores the actual newly activated world');
  assert.deepEqual(calls[sunIndex - 2], ['dormant', false]);
  assert.deepEqual(calls[sunIndex - 1], ['atmosphere', time],
    'the selected atmosphere is prepared after world activation and before restoring its sun');
  const programsIndex = calls.indexOf('first-view-programs');
  // (2026-10-26) the view is prepared again once the entry's own frames have run, before the post warm
  assert.equal(calls.filter((call) => call === 'first-view-programs').length, 2, 'the first view is prepared twice');
  assert.ok(programsIndex > sunIndex && programsIndex < calls.indexOf('picture-applied'),
    'the first view\'s programs are prepared once its light and camera are set, before its frame');
  if (directBoot) assert.ok(programsIndex < calls.indexOf('covered-frame'), 'and before the covered first frame');
  assert.equal(calls.includes('covered-frame'), directBoot);
  // shell-first (247): an F8 entry shows the Studio's own panels at once over the battlefield's stage, which clears once
  // the world is in; a direct boot stays under the boot veil
  assert.equal(calls.includes('stage-on'), !directBoot);
  if (!directBoot) {
    assert.ok(calls.indexOf('stage-on') < calls.indexOf('panel-shown') && calls.indexOf('panel-shown') < calls.indexOf('world-activated'),
      'the panels show before the battlefield is in');
    assert.ok(calls.indexOf('stage-off') > calls.indexOf('world-activated'), 'the stage clears after the battlefield is in');
  }
  assert.equal(calls.filter((entry) => entry === 'fleet-warm').length, 1, 'the fleet warms once');
  assert.ok(calls.indexOf('fleet-warm') > calls.indexOf('picture-applied'), 'the fleet warms after the entry, never inside it');
  assert.ok(calls.indexOf('picture-applied') > calls.indexOf('world-activated'),
    'a picture set before entry applies once the Studio owns the frame');
  await studio.doExit();
  assert.equal(game.phase, 'garage');
  assert.equal(studio.active(), false);
  assert.ok(calls.indexOf('actors-cleared') < calls.indexOf('enter-garage'));
  assert.ok(calls.includes('crushes-released') && calls.indexOf('crushes-released') < calls.indexOf('enter-garage'),
    'the props the Studio\'s hulls crushed stand again before the Garage returns (studioCrush.ts)');
  assert.ok(calls.includes('picture-disposed') && calls.indexOf('picture-disposed') < calls.indexOf('enter-garage'),
    'Studio picture passes leave the composer before the Garage renders');
  assert.ok(calls.indexOf('studio-fx-released') > calls.indexOf('actors-cleared')
    && calls.indexOf('studio-fx-released') < calls.indexOf('enter-garage'),
  'exit releases the cinematic layer (borrowed light, battle shaders) before the Garage returns');
  assert.equal(calls.at(-1)[1].sunIntensity, garageSky.sunIntensity * 0.55,
    'actual Studio exit restores the Garage trim after its teardown');
}

await scenario({ directBoot: true });
await scenario({ directBoot: false });
await scenario({ directBoot: false, priorWorld: { mapId: 'desert', skyConfig: { sunIntensity: 5 } } });
await scenario({ directBoot: false, time: 'sunset' });
await scenario({ directBoot: false, time: 'night' });
await scenario({ directBoot: true, fail: true });
await scenario({ directBoot: false, reenter: true });
await scenario({ directBoot: false, refusedOver: 'battle' });
await scenario({ directBoot: false, abandon: true });
await scenario({ directBoot: false, handedBack: true });
await scenario({ directBoot: false, handedBack: 'battle' });
// the build's wait leaves the way out live: Exit stays outside the inert parts, and its press abandons the entry (doExit's
// entryGeneration step; the loading census 262: the whole app went inert, Exit included)
const panelSource = readFileSync(new URL('../ui/studioPanel.ts', import.meta.url), 'utf8');
assert.match(panelSource, /setStage\(stage\) \{[^]{0,900}?if \(part !== exitBtn\) \(part as HTMLElement\)\.inert = waiting;/,
  'every part of the Studio waits through a build but Exit');
assert.doesNotMatch(panelSource, /app\.inert = /, 'the app itself is never inert (Exit is inside it)');
console.log('studioEntry.selftest: actual cold, F8, warm-map replacement, failed acquisition, a re-entry during the load, a build that lands after the exit, a refusal over a battle that holds no session, a '
  + 'failed entry whose scene the Garage already took back (the Studio\'s own teardown, no second return) or a battle has since, '
  + 'and Garage return ordering pass');
