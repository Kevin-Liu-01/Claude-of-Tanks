// terrainPresetListeners.selftest.mjs — (2026-11-02 audit R1) a terrain build closed part way leaves no live preset
// listener behind. The splat material follows the live preset through two onPresetChange subscriptions that end with the
// material's dispose. They were taken before the land-use bake's yields, and nothing disposed a material whose terrain
// build was closed during the chunk rows, so every cancelled world build left both in the global set (engine/quality.ts)
// for good, with the material steps' closure context. The real terrain build generators (terrain.ts, sandboxed as
// terrainSplatFields.selftest runs them: canvas painters stubbed, the land-use bake real) with a counting subscription:
// 1. closed at every checkpoint of the build: no subscription outlives it;
// 2. completed: both stay subscribed until the material is disposed.
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { tileableTorusNoise } from './proceduralTexture.ts';
import { groundReduxUniformValues, resolveGroundReduxProfile } from './groundRedux.ts';
import { LAND_BAKE_LAYERS, bakeLandUseSteps, landUseTierOf, landUseUniformValues, resolveLandUseProfile } from './landUse.ts';
import { terrainSourceText } from './terrainSourceText.mjs';

const source = terrainSourceText();
const ast = ts.createSourceFile('terrain.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name) {
  const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `unique real declaration: ${name}`);
  return matches[0].getText(ast);
}
function fixture({ closeThrows = false } = {}) {
  const state = { noiseCalls: 0, fieldStarts: 0, fieldCloses: 0, paints: [], uploads: [],
    chunks: 0, materials: 0, pending: null, live: new Set() };
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
    // (perf-248) the shore and the folds the build and the ring worker share (terrain.ts createShoreAt, foldFieldSteps)
    ...['createShoreAt', 'foldFieldSteps', 'buildTerrainMeshes', 'buildTerrainMeshesAsync', 'terrainBuildSteps'].map(declaration),
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
    // (the horizons stream, 2026-10-13, HL-3) and the Hinterland's supplied build: none here either
    function hinterlandSupplyFor() { return null; }
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
    // (battle-spikes-253, 5cc91e072a) the material's steps take the mask's own steps; this fixture's mask is the stub above
    function* makeMaskTextureSteps(...args) { return makeMaskTexture(...args); }
    const MASK_STACK_GUTTER = 64, MAP_SIZE = 1024;
    // (2026-10-04, the tier gate: the material reads the live preset — High here, its change listener a no-op)
    const resolvePresetName = () => 'high';
    const onPresetChange = (fn) => { state.live.add(fn); return () => state.live.delete(fn); };
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

// ---- 1. closed at checkpoints across the build: the material's steps (the land-use bake last among them), the chunk rows
const probe = fixture();
const ticks = [];
let probeGroup;
try {
  probeGroup = await probe.api.buildAsync(probe.height, probe.engine, null, (done) => {
    ticks.push({ done, live: probe.state.live.size });
  }, true, null, null);
} finally { probe.dispose(probeGroup); }
const material = ticks.map((tick, index) => [tick, index + 1]).filter(([tick]) => tick.done === 1).map(([, at]) => at);
const rows = ticks.map((tick, index) => [tick, index + 1]).filter(([tick]) => tick.done > 1).map(([, at]) => at);
assert.ok(material.length > 3 && rows.length > 3, `the build paces through its material and its rows (${material.length}, ${rows.length})`);
assert.equal(Math.max(...ticks.map((tick) => tick.live)), 2, 'both preset subscriptions are live while the build runs');
assert.equal(probe.state.live.size, 0, 'and end with the material');
const stops = [...new Set([material[0], material.at(-3), material.at(-2), material.at(-1), rows[0], rows[rows.length >> 1], rows.at(-1)])];
const leaks = [];
for (const stop of stops) {
  const f = fixture(), failure = new Error(`closed at checkpoint ${stop}`);
  let seen = 0;
  try {
    await assert.rejects(f.api.buildAsync(f.height, f.engine, null, () => {
      if (++seen === stop) return Promise.reject(failure);
    }, true, null, null), (error) => error === failure, 'the pacing failure stays the rejection');
    if (f.state.live.size) leaks.push([stop, f.state.live.size]);
  } finally { f.dispose(); }
}
assert.deepEqual(leaks, [], 'a terrain build closed at any of these checkpoints leaves no preset listener subscribed');

// ---- 2. a completed build keeps both until its material is disposed
{
  const f = fixture();
  const group = await f.api.buildAsync(f.height, f.engine, null, null, false, null, null);
  assert.equal(f.state.live.size, 2, 'the built terrain follows the live preset');
  const materials = new Set();
  group.traverse((object) => { if (object.material) materials.add(object.material); });
  for (const material of materials) material.dispose();
  assert.equal(f.state.live.size, 0, 'the material\'s dispose ends them');
  f.dispose(group);
}

console.log(`terrainPresetListeners.selftest: a terrain build closed at ${stops.length} checkpoints (material steps, the land-use bake, chunk rows) leaves no preset listener; a built one keeps both until its material is disposed PASS`);
