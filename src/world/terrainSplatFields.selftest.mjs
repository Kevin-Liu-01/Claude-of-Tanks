import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { tileableTorusNoise } from './proceduralTexture.ts';

// Frozen before pacing, b1c6629a30132381a120cf4961aa10cfa5a46109. Never derive
// the comparator from the candidate generator or refresh this hash for pacing.
const originalFields = `function splatFields(): SplatFields {
  if (_splatFields) return _splatFields;
  const s = SPLAT_FIELD_S;
  const noi = new SimplexNoise({ random: mulberry32(3011) });
  const a = new Float32Array(s * s);
  const b = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s, j = y * s + x;
      a[j] = torusNoise(noi, u, v, 4, 4, 3) * 0.6 + torusNoise(noi, u, v, 9, 9, 27) * 0.4;
      b[j] = torusNoise(noi, u, v, 2, 2, 55) * 0.7 + torusNoise(noi, u, v, 5, 5, 91) * 0.3;
    }
  }
  _splatFields = { a, b };
  return _splatFields;
}`;
const sha = value => createHash('sha256').update(value).digest('hex');
assert.equal(sha(originalFields), '9ed5073c8629745ec7caa5bff05f6428eac3addd4a09930cc46c6f5fc3445873');
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('terrain.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name) {
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `unique real declaration: ${name}`);
  return matches[0].getText(ast);
}
// Exact original selector, including ice precedence and falsy/nullish defaults.
const originalWet = `  const wet = S.iceLake
    ? makeIceLayer(3003, aniso)
    : S.seaLake // maps r1 (ADDITIVE): open-water sheet (coastal sea / rivers)
      ? makeSeaLayer(3003, aniso, S.mudTone || null)
      : makeGroundLayer(3003, 'mud', aniso, S.mudTone || null, S.mudRough ?? 1);
`;
assert.equal(sha(originalWet), '17272b4168f49b4992fb293c44516db9547a2de6592eb0712c75821f1d682849');
const beforeWet = new Function('S', 'aniso', 'makeIceLayer', 'makeSeaLayer', 'makeGroundLayer',
  originalWet + 'return wet;');
const wetFactory = new Function('makeIceLayer', 'makeSeaLayer', 'makeGroundLayer',
  stripTypeScriptTypes(declaration('createWetSplatLayer')) + '; return createWetSplatLayer;');
function wetSelection(original, config, anisotropy) {
  const calls = [];
  const painters = ['ice', 'sea', 'ground'].map(kind => (...args) => {
    const value = { kind, args }; calls.push(value); return value;
  });
  const result = original ? beforeWet(config, anisotropy, ...painters)
    : wetFactory(...painters)(config, anisotropy);
  assert.equal(calls.length, 1, 'exactly the selected painter runs');
  assert.equal(result, calls[0], 'selector returns its original layer identity');
  return calls;
}
const tone = (h, s, l) => [h + 0.1, s * 0.8, l];
for (const config of [{}, { iceLake: true }, { seaLake: true },
  { iceLake: true, seaLake: true, mudTone: tone, mudRough: -0.25 },
  { seaLake: true, mudTone: tone }, { mudTone: tone, mudRough: 0 },
  { mudTone: null, mudRough: null }, { mudTone: tone, mudRough: -0.25 },
  { mudRough: NaN }, { iceLake: 0, seaLake: 'truthy', mudTone: false }]) {
  for (const anisotropy of [0, 4, 16, -3]) {
    assert.deepEqual(wetSelection(false, config, anisotropy), wetSelection(true, config, anisotropy),
      'all wet branches, precedence and nonstandard overrides retain exact original arguments');
  }
}
// These consumers are byte-for-byte unchanged, not weakened pixel/query twins.
for (const [name, expected] of [
  ['fieldSample', 'aa8491360e6faa9ce9b41b645d06e79555b4275d1474491890bceec75cf7ca9b'],
  ['sampleSplatNoise', '52ae1bbd2b097919a2df3c44b4406564ef72de794baa9bea703b178307d016d0'],
  ['makeShaderNoiseTexture', 'ad4218c73cd81de255ef4bf9d4bd6543fb181a1d5fc61f5e83bda7f3adc034ed'],
]) assert.equal(sha(declaration(name)), expected, `${name}: preserve prechange consumer bytes`);

function fixture({ original = false, closeThrows = false } = {}) {
  const state = { noiseCalls: 0, fieldStarts: 0, fieldCloses: 0, paints: [], uploads: [],
    chunks: 0, materials: 0, pending: null };
  const textures = [];
  const own = texture => { textures.push(texture); return texture; };
  const layer = name => { state.paints.push(name); return {
    albedo: own(new THREE.Texture()), normal: own(new THREE.Texture()),
  }; };
  const material = declaration('createSplatMaterialSteps');
  const extraColdWork = '  if (!_splatFields) yield* splatFieldSteps();\n';
  assert.equal(material.split(extraColdWork).length, 2, 'one cold-only delegation at the existing noise stage');
  const functions = [
    declaration('mulberry32'), original ? originalFields : declaration('splatFields'),
    ...(original ? [] : [declaration('splatFieldSteps')]),
    ...['fieldSample', 'wrapUnit', 'sampleSplatNoise', 'makeShaderNoiseTexture',
      'selectTerrainLandformMask', 'createWetSplatLayer'].map(declaration),
    original ? material.replace(extraColdWork, '') : material,
    ...['buildTerrainMeshes', 'buildTerrainMeshesAsync', 'terrainBuildSteps'].map(declaration),
  ].join('\n').replace(/^export /gm, '');
  const compile = new Function('THREE', 'SimplexNoise', 'torusNoise', 'canvasToTexture',
    'layer', 'own', 'state', 'closeThrows', stripTypeScriptTypes(`
    const SPLAT_FIELD_S = 256, CHUNKS = 8, CHUNK_SIZE = 128, HALF = 512;
    const LOD_SEGS = [96,48,24], SPLAT_COMMON_FRAG = '', SPLAT_NORMAL_FRAG = '';
    let _splatFields = null;
    function* buildHorizonRingSteps() { return new THREE.Group(); }
    function* buildFineGridSteps() { return {}; }
    function* buildChunkGeometrySteps() { state.chunks++; return new THREE.BufferGeometry(); }
    const registerRetainedObject3DResources = () => {};
    const terrainIndexPoolReceipt = () => ({});
    const applySourcedTerrain = () => Promise.resolve([]);
    const makeGrassLayer = () => layer('grass'), makeDirtLayer = () => layer('dirt');
    const makeSandstoneLayer = () => layer('sandstone');
    const makeGroundLayer = (_seed, kind) => layer(kind);
    const makeIceLayer = () => layer('ice'), makeSeaLayer = () => layer('sea');
    const makeMaskTexture = () => own(new THREE.Texture());
    ${functions}
    ${original ? '' : `
    const rawSteps = splatFieldSteps;
    splatFieldSteps = function* () {
      state.fieldStarts++;
      state.pending = rawSteps();
      try { return yield* state.pending; }
      finally { state.fieldCloses++; if (closeThrows) throw new Error('close-failure'); }
    };`}
  `) + `return { fields: splatFields, steps: ${original ? 'null' : 'splatFieldSteps'},
      sample: sampleSplatNoise, noiseTexture: makeShaderNoiseTexture,
      cache: () => _splatFields, materialSteps: createSplatMaterialSteps,
      build: buildTerrainMeshes, buildAsync: buildTerrainMeshesAsync };
  `);
  const api = compile(THREE, SimplexNoise, (...args) => {
    state.noiseCalls++; return tileableTorusNoise(...args);
  }, (pixels, size, options) => {
    // The real quantizer emits these bytes. Canvas raster/upload is not under test.
    const texture = own(new THREE.Texture());
    texture.image = { pixels: pixels.slice(), width: size, height: size };
    state.uploads.push({ pixels: texture.image.pixels, size, options });
    return texture;
  }, layer, own, state, closeThrows);
  const engine = { anisotropy: 4, setupShadowMaterial() { state.materials++; } };
  const height = { _layout: { spawns: { player: { x: 0, z: 0 } }, terrain: {} } };
  return { api, state, engine, height, dispose(group) {
    group?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    for (const texture of textures) texture.dispose();
  } };
}
function drain(steps) {
  let step = steps.next(), count = 0;
  while (!step.done) { count++; step = steps.next(); }
  return { value: step.value, count };
}
function checkFields(actual, expected) {
  for (const key of ['a', 'b']) {
    assert.ok(actual[key] instanceof Float32Array);
    assert.equal(actual[key].length, 256 * 256);
    assert.deepEqual(new Uint8Array(actual[key].buffer), new Uint8Array(expected[key].buffer),
      `${key}: every Float32 write matches frozen original`);
  }
}

const control = fixture({ original: true }), candidate = fixture(), synchronous = fixture();
try {
  const expected = control.api.fields(), steps = candidate.api.steps();
  for (let row = 1; row <= 256; row++) {
    assert.equal(steps.next().done, false);
    assert.equal(candidate.state.noiseCalls, row * 256 * 4, 'one complete row, unchanged noise order/count');
    assert.equal(candidate.api.cache(), null, 'even final-row pause cannot publish partial state');
  }
  const completed = steps.next();
  assert.equal(completed.done, true);
  assert.equal(candidate.api.cache(), completed.value);
  checkFields(completed.value, expected);
  checkFields(synchronous.api.fields(), expected);
  const starts = candidate.state.fieldStarts, calls = candidate.state.noiseCalls;
  assert.equal(candidate.api.fields(), completed.value);
  assert.equal(candidate.state.fieldStarts, starts, 'warm synchronous path creates no generator');
  assert.equal(candidate.state.noiseCalls, calls, 'warm synchronous path does no noise work');
  const warm = drain(candidate.api.steps());
  assert.equal(warm.count, 0); assert.equal(warm.value, completed.value);
  control.api.noiseTexture(3011); candidate.api.noiseTexture(3011);
  assert.deepEqual(candidate.state.uploads, control.state.uploads, 'exact quantized RGBA and upload options');
  assert.equal(candidate.state.uploads[0].size, 256);
  assert.equal(candidate.state.uploads[0].options.anisotropy, 16);
  const points = [[0, 0], [-512, 512], [512, -512], [-0.00001, 0.00001],
    [1e9, -1e9], [NaN, 0], [Infinity, -Infinity]];
  for (let i = 0; i < 64; i++) points.push([((i * 173 + 37) % 1024) - 511.625,
    ((i * 293 + 91) % 1024) - 511.875]);
  for (const point of points) {
    const out = { n1: 0, n2: 0, mA: 0 };
    assert.equal(candidate.api.sample(...point, out), out, 'caller scratch identity retained');
    assert.deepEqual(out, control.api.sample(...point));
  }
} finally { control.dispose(); candidate.dispose(); synchronous.dispose(); }

for (const stopRow of [1, 128, 256]) {
  const f = fixture();
  try {
    const steps = f.api.steps();
    for (let row = 0; row < stopRow; row++) assert.equal(steps.next().done, false);
    const calls = f.state.noiseCalls;
    steps.return();
    assert.equal(steps.next().done, true);
    assert.equal(f.api.cache(), null, 'iterator close never publishes a canceled bake');
    assert.equal(f.state.noiseCalls, calls);
    const retry = drain(f.api.steps());
    assert.equal(retry.count, 256, 'retry builds a complete independent field');
    assert.equal(f.api.cache(), retry.value);
  } finally { f.dispose(); }
}

for (const stopRow of [1, 256]) {
  const f = fixture();
  try {
    const paused = f.api.steps();
    for (let row = 0; row < stopRow; row++) paused.next();
    const winner = f.api.fields(), calls = f.state.noiseCalls;
    assert.deepEqual(paused.next(), { done: true, value: winner });
    assert.equal(f.api.cache(), winner, 'paused bake cannot replace a synchronous winner');
    assert.equal(f.state.noiseCalls, calls, 'adoption performs no additional row');
  } finally { f.dispose(); }
}
const competing = fixture();
try {
  const first = competing.api.steps(), second = competing.api.steps();
  first.next(); second.next();
  const winner = drain(first).value, calls = competing.state.noiseCalls;
  assert.deepEqual(second.next(), { done: true, value: winner });
  assert.equal(competing.state.noiseCalls, calls);
} finally { competing.dispose(); }

async function schedule(fineSlices, original = false) {
  const f = fixture({ original }), ticks = [];
  let group;
  try {
    group = await f.api.buildAsync(f.height, f.engine, null,
      (done, total) => { ticks.push([done, total]); }, fineSlices, null, null);
    assert.equal(f.state.chunks, 192, 'later geometry stage still completes');
    assert.equal(f.state.materials, 1);
    assert.equal(group.children.length, 65);
    const starts = f.state.fieldStarts;
    const warm = drain(f.api.materialSteps(f.engine, f.height._layout, null));
    warm.value.material.dispose();
    assert.equal(warm.count, 6, 'warm material path keeps its six original checkpoints');
    assert.equal(f.state.fieldStarts, starts, 'warm material skips the field iterator entirely');
    return ticks;
  } finally { f.dispose(group); }
}
assert.deepEqual(await schedule(false), await schedule(false, true), 'all coarse callbacks retain exact values/order');
const fine = await schedule(true), beforeFine = await schedule(true, true);
assert.equal(fine.length, beforeFine.length + 256);
const fieldCheckpoint = [1, 66];
assert.deepEqual(fine.filter(tick => tick[0] !== 1), beforeFine.filter(tick => tick[0] !== 1));
assert.equal(fine.filter(tick => tick[0] === 1).length,
  beforeFine.filter(tick => tick[0] === 1).length + 256);
assert.ok(fine.filter(tick => tick[0] === 1).every(tick => tick[1] === fieldCheckpoint[1]),
  'fine rows retain the existing material-phase progress, not invented geometry progress');

for (const [stopRow, closeThrows] of [[1, false], [128, false], [256, false], [128, true]]) {
  const f = fixture({ closeThrows }), failure = new Error('pacing-canceled');
  try {
    await assert.rejects(f.api.buildAsync(f.height, f.engine, null, () => {
      if (f.state.noiseCalls === stopRow * 256 * 4) return Promise.reject(failure);
    }, true, null, null), error => error === failure, 'iterator cleanup cannot mask pacing rejection');
    assert.equal(f.state.fieldCloses, 1, 'async wrapper closes terrain → material → field delegation');
    assert.equal(f.state.pending.next().done, true);
    assert.equal(f.api.cache(), null);
    assert.equal(f.state.noiseCalls, stopRow * 256 * 4);
    assert.equal(f.state.chunks, 0, 'canceled material cannot start later geometry');
    assert.equal(f.state.materials, 0, 'no partial material publication');
    assert.equal(f.state.uploads.length, 0, 'no partial noise texture publication');
  } finally { f.dispose(); }
}
console.log('terrainSplatFields.selftest: frozen wet-selector/Float32/RGBA/query parity, rows, cache races, progress and cancellation passed');
