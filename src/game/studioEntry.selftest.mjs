import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { createGaragePhasePresentationRuntime } from './garagePhasePresentationRuntime.ts';

// Execute the actual Studio enter/doEnter/doExit callers without constructing
// the renderer, panel DOM or full fleet. This catches caller ordering; a test
// of setSunTrim alone cannot reproduce first-use Studio with no world.
const source = ts.createSourceFile('studio.ts',
  readFileSync(new URL('./studio.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = new Set(['enter', 'doEnter', 'doExit', 'withStage']);
// (UI-LOCKDOWN E) the first view's program preparation is a port here; its place in the entry is pinned below
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(functions.length, 4);

const noop = () => {};
async function scenario({ directBoot, priorWorld = null, fail = false, time = 'day', reenter = false }) {
  let world = priorWorld;
  const calls = [];
  let releaseWorld;
  const acquisition = new Promise((resolve, reject) => {
    releaseWorld = () => {
      if (fail) { reject(new Error('world acquisition failed')); return; }
      world = { mapId: 'whiteout', skyConfig: { sunIntensity: 2.8, sunColorHex: 0xd9e8ff },
        spawnPoints: { player: { pos: [4, 2, 6], yaw: 0 } } };
      calls.push('world-activated');
      resolve(world);
    };
  });
  const garageSky = { sunIntensity: 4.2, sunColorHex: 0xffffff };
  const game = { phase: 'garage' };
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
    ctx: { prepareStudioAtmosphere: async (selected) => calls.push(['atmosphere', selected]) },
    // the rest of the fleet warms when the Studio is up, never inside the entry (247)
    window: { __GAME_READY: !directBoot, requestIdleCallback: (callback) => { calls.push('idle'); callback(); } }, game, camera,
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
  };
  const code = stripTypeScriptTypes(`
    function makeStudioEntry(ports) {
    const { ${Object.keys(ports).join(',')} } = ports;
    let active = false, entering = null, timeScale = 1, recording = false, entryGeneration = 0, buildPlateUp = false, exitRun = null;
    class EntryAbandoned extends Error {}
    let placeArmed = null, dragActor = null, dragging = false, storyboard = {};
    let selectedShotId = null, shotUidSeq = 1, actorKeyUidSeq = 1;
    ${functions.join('\n')}
    return { enter, doExit, active: () => active };
    }
  `);
  const studio = new Function('ports', code + '\nreturn makeStudioEntry(ports);')(ports);
  const pending = studio.enter({ map: 'whiteout', coveredByBoot: directBoot });
  await Promise.resolve();
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
  assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'sun'), false,
    'pending world acquisition never asks for a missing or previous battlefield preset');
  releaseWorld();
  if (fail) {
    await assert.rejects(pending, /world acquisition failed/);
    assert.equal(game.phase, 'garage');
    assert.equal(studio.active(), false);
    assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === 'sun'), false);
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
// the build's wait leaves the way out live: Exit stays outside the inert parts, and its press abandons the entry (doExit's
// entryGeneration step; the loading census 262: the whole app went inert, Exit included)
const panelSource = readFileSync(new URL('../ui/studioPanel.ts', import.meta.url), 'utf8');
assert.match(panelSource, /setStage\(stage\) \{[^]{0,900}?if \(part !== exitBtn\) \(part as HTMLElement\)\.inert = waiting;/,
  'every part of the Studio waits through a build but Exit');
assert.doesNotMatch(panelSource, /app\.inert = /, 'the app itself is never inert (Exit is inside it)');
console.log('studioEntry.selftest: actual cold, F8, warm-map replacement, failed acquisition, a re-entry during the load and Garage return ordering pass');
