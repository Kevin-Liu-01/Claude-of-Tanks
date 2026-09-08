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
const names = new Set(['enter', 'doEnter', 'doExit']);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(functions.length, 3);

const noop = () => {};
async function scenario({ directBoot, priorWorld = null, fail = false }) {
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
    window: { __GAME_READY: !directBoot }, game, camera,
    resolveMapId: (id) => id, urlParam: () => null, getMapConfig: (id) => ({ name: id }),
    post: { resetAdaptiveResolution: noop, render: () => calls.push('covered-frame') },
    garage: { hide: noop }, showroom: { stop: noop }, hud: null,
    setGarageSpots: noop, setGarageSunTrim: (enabled) => presentation.setSunTrim(enabled),
    ensureFxBus: noop, ensureFullFleet: async () => {}, ensureWorld: () => acquisition,
    warmStudioPipeline: async () => {}, setWorldDormant: (value) => calls.push(['dormant', value]),
    setCamoBiome: noop, applyCamoPatterns: noop, sweepPool: noop, resetFx: noop,
    getWorld: () => world, actors: [], _v1: new THREE.Vector3(), _v2: new THREE.Vector3(),
    cam: { fov: 50, roll: 0, orbit: { target: new THREE.Vector3(), dist: 0 } }, lookAt: noop,
    lighting: { updateFrustums: noop, update: noop }, invalidate: noop,
    panel: { show: noop, hide: () => calls.push('panel-hidden'), setBusy: noop, refreshAll: noop },
    transition: { run: async (work) => { calls.push('transition'); return work(noop); } },
    syncRoute: noop, docBrand: noop, marker: { group: { visible: true } }, keys: new Set(),
    clearActors: () => calls.push('actors-cleared'), shells: [], effectLog: [], activeEffectIds: new Set(),
    fx: { resetAll: noop, setFrozen: noop }, normalizeStoryboard: () => ({}),
    rail: { rebuild: noop, updateVisibility: noop }, unsweepPool: noop,
    enterGarage: async () => { calls.push('enter-garage'); game.phase = 'garage'; presentation.setSunTrim(true); },
    stopRecording: noop,
  };
  const code = stripTypeScriptTypes(`
    function makeStudioEntry(ports) {
    const { ${Object.keys(ports).join(',')} } = ports;
    let active = false, entering = null, timeScale = 1, recording = false;
    let placeArmed = null, dragActor = null, dragging = false, storyboard = {};
    let selectedShotId = null, shotUidSeq = 1, actorKeyUidSeq = 1;
    ${functions.join('\n')}
    return { enter, doExit, active: () => active };
    }
  `);
  const studio = new Function('ports', code + '\nreturn makeStudioEntry(ports);')(ports);
  const pending = studio.enter({ map: 'whiteout', coveredByBoot: directBoot });
  await Promise.resolve();
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
  const sunIndex = calls.findIndex((entry) => Array.isArray(entry) && entry[0] === 'sun');
  assert.ok(calls.indexOf('world-activated') < sunIndex);
  assert.strictEqual(calls[sunIndex][1], world.skyConfig, 'untrim restores the actual newly activated world');
  assert.deepEqual(calls[sunIndex - 1], ['dormant', false]);
  assert.equal(calls.includes('covered-frame'), directBoot);
  await studio.doExit();
  assert.equal(game.phase, 'garage');
  assert.equal(studio.active(), false);
  assert.ok(calls.indexOf('actors-cleared') < calls.indexOf('enter-garage'));
  assert.equal(calls.at(-1)[1].sunIntensity, garageSky.sunIntensity * 0.55,
    'actual Studio exit restores the Garage trim after its teardown');
}

await scenario({ directBoot: true });
await scenario({ directBoot: false });
await scenario({ directBoot: false, priorWorld: { mapId: 'desert', skyConfig: { sunIntensity: 5 } } });
await scenario({ directBoot: true, fail: true });
console.log('studioEntry.selftest: actual cold, F8, warm-map replacement, failed acquisition and Garage return ordering pass');
