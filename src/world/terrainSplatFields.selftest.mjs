import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { tileableTorusNoise } from './proceduralTexture.ts';
// round 73 (2026-09-25): the material resolves its ground-redux profile from the map id (groundRedux.ts, THREE-free);
// the sandboxed material steps take the real functions
import { groundReduxUniformValues, resolveGroundReduxProfile } from './groundRedux.ts';
// ground lane (2026-10-03): and its land use (landUse.ts, THREE-free) — the real functions too; the build wrappers'
// height-field hook (attachTerrainLandUse) is a no-op here (the fixture's height field grows nothing)
import { LAND_BAKE_LAYERS, bakeLandUseSteps, landUseTierOf, landUseUniformValues, resolveLandUseProfile } from './landUse.ts';

// 2026-10-01 (frozen pins retired): the control used to be a copy of the b1c6629a3 pre-pacing splatFields, with sha256
// pins of it and of three consumer bodies, so any intended change to the splat noise failed here. The control is now
// the CURRENT synchronous path (a second fixture draining the same generator in one call): row pacing, warm/cold paths,
// cache races, progress and cancellation must never change a Float32 write, an upload or a sample.
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('terrain.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name) {
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `unique real declaration: ${name}`);
  return matches[0].getText(ast);
}
// Reference selector (the documented contract, including ice precedence and falsy/nullish defaults).
const originalWet = `  const wet = S.iceLake
    ? makeIceLayer(3003, aniso)
    : S.seaLake // maps r1 (ADDITIVE): open-water sheet (coastal sea / rivers)
      ? makeSeaLayer(3003, aniso, S.mudTone || null)
      : makeGroundLayer(3003, 'mud', aniso, S.mudTone || null, S.mudRough ?? 1);
`;
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
function fixture({ closeThrows = false } = {}) {
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
    declaration('mulberry32'), declaration('splatFields'), declaration('splatFieldSteps'),
    ...['fieldSample', 'wrapUnit', 'sampleSplatNoise', 'makeShaderNoiseTexture',
      'selectTerrainLandformMask', 'createWetSplatLayer', 'createWetSplatLayerSteps', 'stackLandUseBake', 'snowRockHoldLine'].map(declaration),
    material,
    ...['buildTerrainMeshes', 'buildTerrainMeshesAsync', 'terrainBuildSteps'].map(declaration),
  ].join('\n').replace(/^export /gm, '');
  const compile = new Function('THREE', 'SimplexNoise', 'torusNoise', 'canvasToTexture',
    'layer', 'own', 'state', 'closeThrows', 'groundReduxUniformValues', 'resolveGroundReduxProfile', 'landUseUniformValues', 'resolveLandUseProfile', 'bakeLandUseSteps', 'landUseTierOf', 'LAND_BAKE_LAYERS', stripTypeScriptTypes(`
    const attachTerrainLandUse = () => {};
    const SPLAT_FIELD_S = 256, CHUNKS = 8, CHUNK_SIZE = 128, HALF = 512;
    const LOD_SEGS = [96,48,24], SPLAT_COMMON_FRAG = '', SPLAT_NORMAL_FRAG = '', SNOW_ROCK_HOLD_LINE = '';
    let _splatFields = null;
    function* buildHorizonRingSteps() { return new THREE.Group(); }
    // (2026-10-08, the ring worker) no ring supply in a sandbox build: the ring builds where it stands
    function horizonRingSupplyFor() { return null; }
    function* buildFineGridSteps() { return {}; }
    function* buildChunkGeometrySteps() { state.chunks++; return new THREE.BufferGeometry(); }
    const registerRetainedObject3DResources = () => {};
    const terrainIndexPoolReceipt = () => ({});
    const applySourcedTerrain = () => Promise.resolve([]);
    const makeGrassLayer = () => layer('grass'), makeDirtLayer = () => layer('dirt');
    const makeSandstoneLayer = () => layer('sandstone');
    const makeGroundLayer = (_seed, kind) => layer(kind);
    // This fixture isolates the splat-field scheduler, not ground painting.
    // terrainWetLayer.selftest exercises the real ground iterator separately.
    function* makeGroundLayerSteps(...args) { return makeGroundLayer(...args); }
    const makeIceLayer = () => layer('ice'), makeSeaLayer = () => layer('sea');
    // ground lane (2026-10-03, the land-use bake): a small real mask, so the bake (64 texels a side: no extra build
    // step) and its stack (stackLandUseBake) run as they do in the game
    const makeMaskTexture = () => own(new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64, THREE.RGBAFormat));
    const MASK_STACK_GUTTER = 64, MAP_SIZE = 1024;
    // (2026-10-04, the tier gate: the material reads the live preset — High here, its change listener a no-op)
    const resolvePresetName = () => 'high', onPresetChange = () => () => true;
    ${functions}
    const rawSteps = splatFieldSteps;
    splatFieldSteps = function* () {
      state.fieldStarts++;
      state.pending = rawSteps();
      try { return yield* state.pending; }
      finally { state.fieldCloses++; if (closeThrows) throw new Error('close-failure'); }
    };
  `) + `return { fields: splatFields, steps: splatFieldSteps,
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
  }, layer, own, state, closeThrows, groundReduxUniformValues, resolveGroundReduxProfile, landUseUniformValues, resolveLandUseProfile, bakeLandUseSteps, landUseTierOf, LAND_BAKE_LAYERS);
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
      `${key}: every Float32 write matches the synchronous drain`);
  }
}

const candidate = fixture(), synchronous = fixture();
try {
  const expected = synchronous.api.fields(), steps = candidate.api.steps();
  for (let row = 1; row <= 256; row++) {
    assert.equal(steps.next().done, false);
    assert.equal(candidate.state.noiseCalls, row * 256 * 4, 'one complete row, unchanged noise order/count');
    assert.equal(candidate.api.cache(), null, 'even final-row pause cannot publish partial state');
  }
  const completed = steps.next();
  assert.equal(completed.done, true);
  assert.equal(candidate.api.cache(), completed.value);
  checkFields(completed.value, expected);
  const starts = candidate.state.fieldStarts, calls = candidate.state.noiseCalls;
  assert.equal(candidate.api.fields(), completed.value);
  assert.equal(candidate.state.fieldStarts, starts, 'warm synchronous path creates no generator');
  assert.equal(candidate.state.noiseCalls, calls, 'warm synchronous path does no noise work');
  const warm = drain(candidate.api.steps());
  assert.equal(warm.count, 0); assert.equal(warm.value, completed.value);
  synchronous.api.noiseTexture(3011);
  // (2026-10-05) the upload's orientation: row 0 at v = 0, the rows the CPU twin's fieldSample reads (a canvas defaults
  // to flipY, which mirrored every field in z against its twin)
  assert.equal(candidate.api.noiseTexture(3011).flipY, false, 'the noise texture uploads unflipped: the shader reads the twin\'s rows');
  assert.deepEqual(candidate.state.uploads, synchronous.state.uploads, 'exact quantized RGBA and upload options');
  assert.equal(candidate.state.uploads[0].size, 256);
  assert.equal(candidate.state.uploads[0].options.anisotropy, 16);
  const points = [[0, 0], [-512, 512], [512, -512], [-0.00001, 0.00001],
    [1e9, -1e9], [NaN, 0], [Infinity, -Infinity]];
  for (let i = 0; i < 64; i++) points.push([((i * 173 + 37) % 1024) - 511.625,
    ((i * 293 + 91) % 1024) - 511.875]);
  for (const point of points) {
    const out = { n1: 0, n2: 0, mA: 0 };
    assert.equal(candidate.api.sample(...point, out), out, 'caller scratch identity retained');
    assert.deepEqual(out, synchronous.api.sample(...point));
  }
} finally { candidate.dispose(); synchronous.dispose(); }

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

async function schedule(fineSlices, warmFields = false) {
  // A warm field cache skips the row-paced field iterator: the live control for the paced cold build.
  const f = fixture(), ticks = [];
  if (warmFields) f.api.fields();
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
assert.deepEqual(await schedule(false), await schedule(false, true),
  'coarse callbacks retain exact values/order whether the field rows run cold or the cache is warm');
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
console.log('terrainSplatFields.selftest: wet-selector contract, paced-vs-synchronous Float32/RGBA/query parity, rows, cache races, progress and cancellation passed');
