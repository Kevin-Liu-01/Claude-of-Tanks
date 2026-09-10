import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { SkyEnvironmentCache } from './skyEnvironmentCache.ts';

function fixture() {
  let lost = false;
  let context = { isContextLost: () => lost };
  const scene = new THREE.Scene(), targets = [], calls = [];
  const renderer = { info: {}, getContext: () => context };
  const cache = new SkyEnvironmentCache(renderer, scene);
  const create = () => {
    const target = new THREE.WebGLRenderTarget(8, 8);
    target.disposals = 0;
    target.addEventListener('dispose', () => { target.disposals++; });
    targets.push(target);
    return target;
  };
  const install = (key, options = {}) => cache.install(key, options.create ?? create,
    options.intensity ?? 0.75, options.validate ?? (() => { calls.push(scene.environment); return true; }));
  return { renderer, scene, cache, targets, calls, create, install,
    lose: () => { lost = true; }, restore: () => { lost = false; },
    replaceContext: () => { context = { isContextLost: () => lost }; } };
}

const alternating = fixture();
alternating.install('day'); alternating.install('night');
alternating.install('day', { intensity: 0.9 });
assert.equal(alternating.targets.length, 2, 'day→night→day reuses both exact targets');
assert.equal(alternating.calls.length, 3, 'every installation validates, including hits');
assert.equal(alternating.scene.environmentIntensity, 0.9, 'strength is installed, not baked into a stale cache entry');
alternating.install('third');
assert.deepEqual(alternating.targets.map(t => t.disposals), [0, 1, 0], 'two-entry LRU evicts night, not the reused day');
alternating.install('day');
assert.equal(alternating.targets.length, 3);
alternating.install(null);
assert.deepEqual(alternating.targets.map(t => t.disposals), [1, 1, 1, 0], 'bypass/HDRI owns one active target, not two cached plus one');
alternating.install(null); alternating.install('day');
assert.deepEqual(alternating.targets.map(t => t.disposals), [1, 1, 1, 1, 1, 0]);

for (const invalidate of [f => { f.renderer.info = {}; }, f => f.replaceContext()]) {
  const f = fixture(); f.install('day'); f.install('night'); invalidate(f); f.install('day');
  assert.deepEqual(f.targets.map(t => t.disposals), [1, 1, 0]);
}
const loss = fixture(); loss.install('day'); loss.lose();
assert.throws(() => loss.install('day'), /live graphics context/);
assert.equal(loss.scene.environment, null); assert.equal(loss.targets.length, 1);
loss.restore(); loss.install('day'); assert.equal(loss.targets.length, 2);

for (const dispose of [t => t.dispose(), t => t.texture.dispose()]) {
  const f = fixture(); f.install('day'); const first = f.targets[0]; dispose(first);
  assert.equal(f.scene.environment, null); f.install('day');
  assert.equal(f.targets.length, 2); assert.equal(first.disposals, 1, 'external disposal evicts without duplicate RT disposal');
}
const rejected = fixture(); rejected.install('day'); rejected.install('night');
rejected.install('day', { validate: () => { rejected.scene.environment = null; return false; } });
assert.equal(rejected.scene.environment, null, 'invalid cache hit preserves the validator rescue, not stale IBL');
assert.equal(rejected.targets[0].disposals, 1); rejected.install('day');
assert.equal(rejected.targets.length, 3, 'rejected targets never become another cache hit');

const originalError = new Error('original failure');
for (const step of ['create', 'validate']) {
  const f = fixture(); f.install('day'); const previous = f.scene.environment;
  assert.throws(() => f.install('night', {
    create: () => { if (step === 'create') throw originalError; return f.create(); },
    validate: () => { throw originalError; },
  }), error => error === originalError);
  assert.equal(f.scene.environment, previous);
  assert.equal(f.scene.environmentIntensity, 0.75);
  if (step === 'validate') assert.equal(f.targets[1].disposals, 1);
}
const throwingDisposal = fixture(); throwingDisposal.install('day');
assert.throws(() => throwingDisposal.install('night', {
  create: () => { const t = throwingDisposal.create(); t.addEventListener('dispose', () => { throw new Error('cleanup'); }); return t; },
  validate: () => { throw originalError; },
}), error => error === originalError, 'cleanup cannot replace the original validation error');
assert.equal(throwingDisposal.scene.environment, throwingDisposal.targets[0].texture);

for (const key of ['day', 'night']) {
  const f = fixture(); f.install('day'); const previous = f.targets[0];
  assert.throws(() => f.install(key, { validate: () => { previous.texture.dispose(); throw originalError; } }),
    error => error === originalError);
  assert.equal(f.scene.environment, null, 'an externally disposed prior environment cannot be resurrected by catch');
}
for (const boundary of ['create', 'validate']) {
  const f = fixture(); f.install('day');
  assert.throws(() => f.install('night', {
    create: () => { const t = f.create(); if (boundary === 'create') f.renderer.info = {}; return t; },
    validate: () => { f.renderer.info = {}; return true; },
  }), /outlived/);
  assert.equal(f.scene.environment, null); assert.ok(f.targets.every(t => t.disposals === 1));
}
const drain = fixture(); drain.install('day'); drain.install('night');
drain.targets[0].addEventListener('dispose', () => { throw originalError; });
drain.renderer.info = {};
assert.throws(() => drain.install('day'), error => error === originalError);
assert.deepEqual(drain.targets.map(t => t.disposals), [1, 1], 'lifetime invalidation drains all resources even if one dispose listener throws');
drain.install('day'); assert.equal(drain.targets.length, 3);

const rollback = fixture(); rollback.install('day'); rollback.install('night'); rollback.install('day');
rollback.targets[1].addEventListener('dispose', () => { throw originalError; });
assert.throws(() => rollback.install('third'), error => error === originalError);
assert.equal(rollback.scene.environment, rollback.targets[0].texture, 'eviction failure restores the live prior owner');
assert.throws(() => rollback.install('fourth', { validate: () => {
  rollback.targets[0].texture.dispose(); throw originalError;
} }), error => error === originalError);
assert.equal(rollback.scene.environment, null, 'rollback retains ownership tracking for a later disposal/failure');

// Execute the actual sky key/state/bake owner with pinned Sky geometry and
// recording PMREM. Native render parity remains a separate qualification.
const source = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('sky.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const fn = name => file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(file);
const configuredSource = fn('configureSkyUniforms');
const hash = text => createHash('sha256').update(text).digest('hex');
// Frozen before this cache change: every radiance formula and injected shader byte.
assert.equal(hash(configuredSource), 'd946d85018fc2510f8185322f57aa325a701baccb4b2d9e0e959dd8adb376e07');
const keySource = ['horizonColorKey', 'environmentKey', 'withEnvironmentRenderState', 'disposeEnvironmentSky'].map(fn).join('\n');
let bakeMethod;
function visit(node) {
  if (ts.isMethodDeclaration(node) && node.name?.getText(file) === 'bakeEnvironment') bakeMethod = node.getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
const ownerSource = source.slice(source.indexOf('  let pmrem: '), source.indexOf('  // Sourced-HDRI environment override'));
function skyFixture() {
  const state = { creates: 0, bakes: 0, validations: 0, generatorDisposals: 0,
    geometryDisposals: 0, materialDisposals: 0, targets: [], inputs: [], failure: '' };
  const scene = new THREE.Scene(); const originalTarget = new THREE.WebGLCubeRenderTarget(8);
  let bound = [originalTarget, 4, 2];
  const renderer = {
    info: {}, getContext: () => context, xr: { enabled: true, isPresenting: false },
    autoClear: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    getClearColor: c => c.setRGB(0.1, 0.2, 0.3), getClearAlpha: () => 1,
    getRenderTarget: () => bound[0], getActiveCubeFace: () => bound[1], getActiveMipmapLevel: () => bound[2],
    setRenderTarget: (target, face = 0, mip = 0) => {
      bound = [target, face, mip];
      if (state.failure === 'restore' && target === originalTarget) throw new Error('restore');
    },
  };
  const context = { isContextLost: () => false };
  const preset = { skyIntensity: 1, turbidity: 4, rayleigh: 1.2, mieCoefficient: 0.006,
    mieDirectionalG: 0.82, envIntensity: 0.4 };
  const sunDir = new THREE.Vector3(0.6, 0.5, 0.4).normalize();
  class RecordedSky extends Sky {
    constructor() {
      super();
      this.geometry.addEventListener('dispose', () => {
        state.geometryDisposals++;
        if (state.failure === 'geometry') throw originalError;
      });
      this.material.addEventListener('dispose', () => { state.materialDisposals++; });
    }
  }
  class Generator {
    constructor() { state.creates++; }
    dispose() { state.generatorDisposals++; }
    fromScene(envScene) {
      state.bakes++; assert.equal(envScene.children.length, 1);
      const sky = envScene.children[0]; assert.equal(sky.scale.x, 50);
      const u = sky.material.uniforms;
      state.inputs.push([u.uSkyIntensity.value, u.turbidity.value, u.rayleigh.value,
        u.mieCoefficient.value, u.mieDirectionalG.value, ...u.sunPosition.value.toArray(), u.cloudCoverage.value]);
      renderer.xr.enabled = false; renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(null);
      if (state.failure === 'bake' || state.failure === 'restore') throw originalError;
      const target = new THREE.WebGLRenderTarget(8, 8); target.disposals = 0;
      target.addEventListener('dispose', () => { target.disposals++; }); state.targets.push(target);
      return target;
    }
  }
  const code = `const { renderer, scene, preset, sunDir } = input;
    const DEFAULT_PRESET = preset, ENV_SKY_SCALE = 50, ENV_INTENSITY_FLOOR = 0.21, HDRI_ENV_URL = null;
    const loadHdriEnvironment = () => { throw new Error('unexpected HDRI'); };
    ${configuredSource}\n${keySource}\n${ownerSource}\nconst rig = { ${bakeMethod} };`;
  const make = new Function('THREE', 'Sky', 'SkyEnvironmentCache', 'enforceEnvValidity', 'input',
    stripTypeScriptTypes(code) + '\nreturn { rig, environmentKey: () => environmentKey(renderer, sunDir, preset) };');
  const result = make({ ...THREE, PMREMGenerator: Generator }, RecordedSky, SkyEnvironmentCache,
    (_renderer, targetScene, scale) => {
      state.validations++; assert.equal(scale, preset.skyIntensity); assert.ok(targetScene.environment);
      if (state.failure === 'validate') throw originalError;
      // The real validator restores target without its cube face/mip.
      renderer.setRenderTarget(renderer.getRenderTarget());
      return true;
    }, { renderer, scene, preset, sunDir });
  return { ...result, state, scene, renderer, preset, sunDir,
    assertRestored() { assert.deepEqual(bound, [originalTarget, 4, 2]); assert.equal(renderer.xr.enabled, true);
      assert.equal(renderer.autoClear, true); assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping); } };
}
const sky = skyFixture(); sky.rig.bakeEnvironment(); const day = sky.scene.environment;
sky.preset.skyIntensity = 0.05; sky.rig.bakeEnvironment(); sky.preset.skyIntensity = 1; sky.rig.bakeEnvironment();
assert.equal(sky.scene.environment, day); assert.equal(sky.state.bakes, 2); assert.equal(sky.state.validations, 3);
assert.deepEqual(sky.state.inputs[0], [1, 4, 1.2, 0.006 * 1.25, 0.82, ...sky.sunDir.toArray(), 0]);
assert.equal(sky.state.geometryDisposals, 2); assert.equal(sky.state.materialDisposals, 2); sky.assertRestored();
for (const field of ['skyIntensity', 'turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) {
  const f = skyFixture(), original = f.environmentKey(); f.preset[field] += 0.000000000001;
  assert.notEqual(f.environmentKey(), original, `${field}: exact unrounded radiance key`);
  f.preset[field] = NaN; assert.equal(f.environmentKey(), null);
}
for (const field of ['x', 'y', 'z']) {
  const f = skyFixture(), original = f.environmentKey(); f.sunDir[field] += 0.000000000001;
  assert.notEqual(f.environmentKey(), original); f.sunDir[field] = Infinity; assert.equal(f.environmentKey(), null);
}
for (const [field, value] of [['toneMapping', THREE.NoToneMapping], ['toneMappingExposure', 0.7], ['outputColorSpace', THREE.LinearSRGBColorSpace]]) {
  const f = skyFixture(), original = f.environmentKey(); f.renderer[field] = value; assert.notEqual(f.environmentKey(), original);
}
const xr = skyFixture(); xr.renderer.xr.isPresenting = true;
assert.equal(xr.environmentKey(), null); xr.rig.bakeEnvironment(); xr.rig.bakeEnvironment();
assert.equal(xr.state.bakes, 2); assert.equal(xr.state.targets[0].disposals, 1);
for (const failure of ['bake', 'validate', 'geometry', 'restore']) {
  const f = skyFixture(); f.rig.bakeEnvironment(); const previous = f.scene.environment;
  f.preset.skyIntensity = 0.05; f.state.failure = failure;
  assert.throws(() => f.rig.bakeEnvironment(), error => error === originalError, failure);
  assert.equal(f.scene.environment, previous, `${failure}: original live environment remains installed`);
  assert.equal(f.state.geometryDisposals, 2); assert.equal(f.state.materialDisposals, 2);
  f.assertRestored();
  if (failure === 'validate' || failure === 'geometry') assert.equal(f.state.targets[1].disposals, 1);
}
const resetGenerator = skyFixture(); resetGenerator.rig.bakeEnvironment();
resetGenerator.renderer.info = {}; resetGenerator.rig.bakeEnvironment();
assert.equal(resetGenerator.state.creates, 2); assert.equal(resetGenerator.state.generatorDisposals, 1);
assert.equal(resetGenerator.state.targets[0].disposals, 1);
assert.match(bakeMethod, /if \(HDRI_ENV_URL\)\s*\{\s*loadHdriEnvironment\(HDRI_ENV_URL\);\s*return;/);
assert.match(source, /null, \(\) => environmentGenerator\(\)\.fromEquirectangular\(tex\)/);
console.log('skyEnvironmentCache.selftest: bounded validated day/night reuse, exact keys, context/disposal/failure ownership, actual sky bake/state contracts passed');
