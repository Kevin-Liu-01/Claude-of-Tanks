import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { compileFunction } from 'node:vm';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { createBattleAtmosphereAccess } from './battleAtmosphereAccess.ts';
import { createBattleAtmosphereRuntime } from './battleAtmosphereRuntime.ts';
import { createGarageEnvironmentPresentationRuntime } from '../game/garageEnvironmentPresentationRuntime.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(load) {
  const scene = new THREE.Scene(), applied = [];
  const authored = Object.freeze({ fogDensity: .0006, sunIntensity: 3.2, sunElevationDeg: 42 });
  let loads = 0, creates = 0, optionsReads = 0;
  const module = {
    createBattleAtmosphereRuntime(options) { creates++; return createBattleAtmosphereRuntime(options); },
  };
  const access = createBattleAtmosphereAccess(() => {
    optionsReads++;
    return { scene, getCameraPosition: () => ({ x: 0, y: 5, z: 0 }),
      getAuthoredPreset: () => authored, applyPreset: (preset) => applied.push(preset) };
  }, () => { loads++; return load ? load(module, loads) : Promise.resolve(module); });
  return { scene, authored, applied, access, module,
    get loads() { return loads; }, get creates() { return creates; },
    get optionsReads() { return optionsReads; },
    dispose: () => access.current?.dispose() };
}

{
  const gate = deferred(), h = harness(() => gate.promise);
  try {
    h.access.update(1, 64); h.access.reset();
    assert.equal(h.loads, 0); assert.equal(h.optionsReads, 0); assert.equal(h.access.current, null);
    const old = h.access.prepare(3, 'winter', 64);
    const latest = h.access.prepare(1337, 'monsoon', 64);
    gate.resolve(h.module);
    await Promise.all([old, latest]);
    assert.equal(h.loads, 1); assert.equal(h.creates, 1);
    assert.equal(h.optionsReads, 1, 'options are acquired once at actual lazy construction');
    assert.equal(h.applied.length, 1, 'superseded generation never applies an old preset');
    assert.equal(h.access.current.weather.seed, 1337);
    assert.equal(h.access.current.weather.condition, 'rain');
    const mesh = h.scene.children[0], geometry = mesh.geometry;
    h.access.reset();
    assert.equal(h.access.current.weather, null); assert.equal(h.scene.children.length, 0);
    assert.deepEqual(h.applied.at(-1), h.authored, 'Garage reset restores the authored preset');
    const count = h.applied.length;
    h.access.reset(); h.access.update(5, 64);
    assert.equal(h.applied.length, count, 'duplicate reset and late frame cannot reactivate weather');
    await h.access.prepare(3, 'winter', 64);
    assert.equal(h.loads, 1); assert.equal(h.creates, 1);
    assert.equal(h.scene.children[0], mesh); assert.equal(mesh.geometry, geometry);
    assert.equal(h.access.current.weather.condition, 'snow');
  } finally { h.dispose(); }
}

{
  const gate = deferred(), h = harness(() => gate.promise);
  try {
    const pending = h.access.prepare(3, 'winter', 64);
    h.access.reset(); // return to Garage while the chunk is still in flight
    gate.resolve(h.module);
    await pending;
    assert.equal(h.creates, 1, 'the cached owner may finish inert construction');
    assert.equal(h.applied.length, 0, 'cancelled import completion cannot repaint Garage');
    assert.equal(h.scene.children.length, 0, 'cancelled completion allocates no precipitation mesh');
    assert.equal(h.access.current.weather, null);
    await h.access.prepare(0, 'verdant', 64);
    assert.equal(h.access.current.weather.seed, 0, 'a fresh generation accepts seed zero');
  } finally { h.dispose(); }
}

{
  const h = harness((module, attempt) => attempt === 1
    ? Promise.reject(new Error('weather chunk unavailable')) : Promise.resolve(module));
  try {
    await assert.rejects(h.access.prepare(3, 'winter', 64), /weather chunk unavailable/);
    assert.equal(h.access.current, null); assert.equal(h.applied.length, 0);
    assert.equal(h.optionsReads, 0);
    await h.access.prepare(3, 'winter', 64);
    assert.equal(h.loads, 2); assert.equal(h.creates, 1);
    assert.equal(h.access.current.weather.condition, 'snow', 'failed load remains retryable');
    h.access.reset();
    await assert.rejects(h.access.prepare(NaN, 'winter', 64), /seed/);
    assert.equal(h.access.current.weather, null, 'failed prepare cannot install weather');
    await h.access.prepare(undefined, 'winter', 64);
    assert.equal(h.loads, 2, 'failed prepare retries on the same successfully loaded owner');
    assert.equal(h.access.current.weather, null, 'legacy authority gets authored light, not invented randomness');
    assert.deepEqual(h.applied.at(-1), h.authored);
  } finally { h.dispose(); }
}

{
  const gate = deferred(), h = harness(() => gate.promise);
  try {
    const pending = h.access.prepare(3, 'winter', 64);
    const rejected = assert.rejects(pending, /cancelled failed chunk/);
    h.access.reset(); gate.reject(new Error('cancelled failed chunk'));
    await rejected;
    assert.equal(h.applied.length, 0); assert.equal(h.scene.children.length, 0);
    assert.equal(h.access.current, null, 'cancelled failed load has no partially owned runtime');
  } finally { h.dispose(); }
}

// Execute the actual composition-root callback expressions with controlled
// owners, without importing/booting main.ts or copying its adapter logic.
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function mainCallback(name, bindings, containingCall = null, exposeFogBaseline = false) {
  const matches = [];
  function visit(node) {
    const owner = node.parent?.parent;
    const belongs = !containingCall || (owner && ts.isCallExpression(owner)
      && owner.expression.getText(tree) === containingCall);
    if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node))
      && node.name.getText(tree) === name && belongs) matches.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(matches.length, 1, `unambiguous source-owned ${name} callback`);
  const expression = stripTypeScriptTypes(`const callback = ${matches[0].getText(tree)};`);
  const result = exposeFogBaseline ? '{ callback, getBaseFogDensity: () => baseFogDensity }' : 'callback';
  return compileFunction(`${expression};return ${result};`, Object.keys(bindings))(...Object.values(bindings));
}

const calls = [], weather = { current: { weather: { timeOfDay: 'night' } },
  reset() { calls.push('reset'); this.current.weather = null; },
  prepare: (...args) => { calls.push(args); } };
const garagePhasePresentation = {
  setActive: (active) => calls.push(['active', active]),
  setSunTrim: (active) => calls.push(['trim', active]),
};
const setGarageSpots = mainCallback('setGarageSpots', { battleAtmosphere: weather, garagePhasePresentation });
const setGarageSunTrim = mainCallback('setGarageSunTrim', { battleAtmosphere: weather, garagePhasePresentation });
setGarageSpots(false); setGarageSunTrim(false);
assert.deepEqual(calls, [['active', false]], 'network activation does not overwrite the prepared night preset');
calls.length = 0;
setGarageSpots(true); setGarageSunTrim(true);
assert.deepEqual(calls, ['reset', ['active', true], ['trim', true]],
  'Garage clears weather before reinstalling its own active lighting');
calls.length = 0;
setGarageSunTrim(false);
assert.deepEqual(calls, [['trim', false]], 'authored no-weather entry still untrims Garage lighting');

calls.length = 0;
let currentMap = 'winter';
const prepareNetwork = mainCallback('atmosphere', {
  battleAtmosphere: weather, currentWorld: () => ({ mapId: currentMap }),
  game: { mapId: 'desert' }, battleParticleBudget: 64,
});
prepareNetwork({ meta: { weatherSeed: 0 } });
currentMap = 'monsoon';
prepareNetwork({ meta: { weatherSeed: 1337 } });
prepareNetwork({ meta: {} });
assert.deepEqual(calls, [[0, 'winter', 64], [1337, 'monsoon', 64], [undefined, 'monsoon', 64]],
  'actual network warm uses current acquired map, preserves seed0, and does not randomize a legacy snapshot');

// Actual Garage activation precedes its setGarageSpots call on return. A late
// atmosphere reset must not overwrite the newly selected Garage sky/fog.
{
  const h = harness();
  try {
    await h.access.prepare(3, 'winter', 64);
    const garagePreset = { fogDensity: .0001, sunIntensity: 5, sunElevationDeg: 60 };
    const phase = { setActive() {}, setSunTrim() {} };
    const bindings = { battleAtmosphere: h.access, garagePhasePresentation: phase };
    const spots = mainCallback('setGarageSpots', bindings);
    const trim = mainCallback('setGarageSunTrim', bindings);
    const skyOwner = mainCallback('applySkyPreset', {
      battleAtmosphere: h.access, selectedGarageVariantId: 'verdant',
      getGarageVariant: () => ({ mapId: 'verdant' }), getGarageSkyPreset: () => garagePreset,
      sky: { applyPresentationPreset(preset) {
        h.applied.push(preset); h.scene.fog = new THREE.FogExp2(0xaaaaaa, preset.fogDensity);
      } }, scene: h.scene, THREE, baseFogDensity: h.authored.fogDensity,
    }, 'createGarageEnvironmentPresentationRuntime', true);
    const garage = createGarageEnvironmentPresentationRuntime({
      garagePosition: new THREE.Vector3(), getSelectedVariantId: () => 'verdant',
      setWorldDormant() {}, applySkyPreset: skyOwner.callback, placeGarage() {}, setGarageSunTrim: trim,
      invalidatePresentation() {}, setCameraPose() {},
    });
    await garage.activate('verdant');
    spots(true); trim(true);
    assert.deepEqual(h.applied.at(-1), garagePreset,
      'Garage return retains its selected sky after late idempotent phase-light reset');
    assert.equal(skyOwner.getBaseFogDensity(), h.scene.fog.density,
      'next rendered Garage frame must use the selected Garage fog, not the restored battlefield baseline');
    assert.equal(h.access.current.weather, null); assert.equal(h.scene.children.length, 0);
  } finally { h.dispose(); }
}

console.log('battleAtmosphereAccess.selftest: lazy generation/cancellation/retry/reset, actual current-map adapters and Garage light ownership passed');
