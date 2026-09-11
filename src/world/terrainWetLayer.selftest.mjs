import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { createOpaqueLoadingYielder } from '../engine/frameScheduler.ts';
import { resolveDeviceTier, texSize } from '../engine/quality.ts';
import { normalTextureFromHeight, textureFromRgbaPixels, tileableTorusNoise } from './proceduralTexture.ts';

// Frozen synchronous painter from 465a68f7c, independent of candidate steps.
// Native Canvas2D is mandatory. No upload-only stub or rasterizer skip is used.
const originalGround = `function originalGround(seed, kind, anisotropy, tone = null, roughMul = 1) {
  const s = texSize(256);
  const noi = new SimplexNoise({ random: mulberry32(seed) });
  const px = new Uint8ClampedArray(s * s * 4);
  const hgt = new Float32Array(s * s);
  let nStrength = 2.0;
  for (let y = 0; y < s; y++) {
    const v = y / s;
    for (let x = 0; x < s; x++) {
      const u = x / s, i = y * s + x, j = i * 4;
      let rough = 0.9, hn = 0.5;
      if (kind === 'rock') {
        const tone = torusNoise(noi, u, v, 3, 3, 17) * 0.5 + 0.5;
        const r1 = 1 - Math.abs(torusNoise(noi, u, v, 6, 6, 41));
        const r2 = 1 - Math.abs(torusNoise(noi, u, v, 15, 15, 8));
        const ridge = r1 * 0.62 + r2 * 0.38;
        const crack = smoothstep(0.86, 0.985, ridge);
        hn = 0.72 - crack * 0.62 + (tone - 0.5) * 0.34;
        _col.setHSL(0.082, 0.055 + tone * 0.035, (0.40 + tone * 0.14) * (1 - crack * 0.45));
        rough = 0.76 + crack * 0.12 - tone * 0.06;
        nStrength = 3.0;
      } else {
        const macro = torusNoise(noi, u, v, 3, 3, 29) * 0.5 + 0.5;
        const rip = torusNoise(noi, u, v, 42, 42, 13) * 0.5 + 0.5;
        const puddle = smoothstep(0.56, 0.76, macro);
        hn = macro * 0.55 + rip * 0.18 - puddle * 0.28 + 0.25;
        _col.setHSL(0.068, 0.27 - puddle * 0.12, 0.145 + (1 - puddle) * 0.075 + rip * 0.028);
        rough = 0.84 - puddle * 0.10;
        nStrength = 1.5;
      }
      hn = clamp(hn, 0, 1);
      hgt[i] = hn;
      const cav = 0.72 + 0.28 * hn;
      px[j] = _col.r * cav * 255; px[j + 1] = _col.g * cav * 255; px[j + 2] = _col.b * cav * 255;
      px[j + 3] = clamp(rough * roughMul, 0.45, 1) * 255;
    }
  }
  applyTone(px, tone);
  return {
    albedo: canvasToTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, nStrength, anisotropy),
  };
}`;
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('terrain.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name, text = source) {
  const tree = text === source ? ast : ts.createSourceFile('mutant.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matches = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `one actual owner: ${name}`);
  return matches[0].getText(tree).replace(/^export /, '');
}
const saved = new Map(['document', 'ImageData', 'window', 'scheduler', 'requestAnimationFrame',
  'cancelAnimationFrame', 'setTimeout', 'clearTimeout'].map(key => [key, globalThis[key]]));
const canvasPath = createRequire(import.meta.url).resolve('@napi-rs/canvas');
const canvasPackage = JSON.parse(readFileSync(join(dirname(canvasPath), 'package.json'), 'utf8'));
assert.equal(canvasPackage.name, '@napi-rs/canvas');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
assert.equal(canvasPackage.version, packageJson.devDependencies['@napi-rs/canvas'], 'exact pinned native rasterizer version');
const canvasDocument = { hidden: false, addEventListener() {}, removeEventListener() {},
  createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
globalThis.document = canvasDocument;
globalThis.ImageData = ImageData;

function fixture({ text = source, observe = null } = {}) {
  const state = { calls: 0, textures: [], heights: [], closes: 0, pending: null,
    chunks: 0, materials: 0, sourceCancels: 0, time: 0 };
  const own = texture => { state.textures.push(texture); return texture; };
  const layer = () => ({ albedo: own(new THREE.Texture()), normal: own(new THREE.Texture()) });
  const declarations = ['mulberry32', 'smoothstep', 'clamp', 'applyTone', 'makeGroundLayer',
    'makeGroundLayerSteps', 'createWetSplatLayer', 'createWetSplatLayerSteps',
    'selectTerrainLandformMask', 'createSplatMaterialSteps', 'buildTerrainMeshes',
    'buildTerrainMeshesAsync', 'terrainBuildSteps'].map(name => declaration(name, text)).join('\n');
  // The actual ground, wet selector, material, terrain generator and async
  // consumer run together. Unrelated horizon/geometry/source I/O is peripheral;
  // real Three objects retain the material/texture identity boundary.
  const create = new Function('THREE', 'SimplexNoise', 'texSize', 'torusNoise',
    'canvasToTexture', 'normalFromHeight', 'layer', 'own', 'state', stripTypeScriptTypes(`
    const _col = new THREE.Color(), _toneCol = new THREE.Color();
    const _toneHsl = { h: 0, s: 0, l: 0 };
    const CHUNKS = 8, CHUNK_SIZE = 128, HALF = 512, LOD_SEGS = [96,48,24];
    const SPLAT_COMMON_FRAG = '', SPLAT_NORMAL_FRAG = '';
    const _splatFields = {};
    const makeGrassLayer = layer, makeDirtLayer = layer, makeSandstoneLayer = layer;
    const makeIceLayer = layer, makeSeaLayer = layer;
    const makeMaskTexture = () => own(new THREE.Texture());
    const makeShaderNoiseTexture = () => own(new THREE.Texture());
    const applySourcedTerrain = () => Promise.resolve([]);
    const registerRetainedObject3DResources = () => {};
    const terrainIndexPoolReceipt = () => ({});
    function* buildHorizonRingSteps() { return new THREE.Group(); }
    function* buildFineGridSteps() { return {}; }
    function* buildChunkGeometrySteps() { state.chunks++; return new THREE.BufferGeometry(); }
    ${declarations}
    ${originalGround}
    const rawGroundSteps = makeGroundLayerSteps;
    makeGroundLayerSteps = function* (...args) {
      const pending = rawGroundSteps(...args);
      state.pending = pending;
      try { return yield* pending; } finally { state.closes++; }
    };
  `) + `return { sync: makeGroundLayer, original: originalGround, steps: makeGroundLayerSteps,
    wet: createWetSplatLayerSteps, build: buildTerrainMeshes, buildAsync: buildTerrainMeshesAsync };`);
  const api = create(THREE, SimplexNoise, texSize, (...args) => {
    observe?.(state.calls, args);
    state.calls++; state.time += 13 / (8 * texSize(256) * 2);
    return tileableTorusNoise(...args);
  }, (...args) => own(textureFromRgbaPixels(...args)), (height, ...args) => {
    state.heights.push(height.slice());
    return own(normalTextureFromHeight(height, ...args));
  }, layer, own, state);
  const sourcePreparation = { tryCreateLayer: layer, apply: () => Promise.resolve([]),
    cancel() { state.sourceCancels++; } };
  const engine = { anisotropy: 4, setupShadowMaterial() { state.materials++; } };
  const height = { _layout: { spawns: { player: { x: 0, z: 0 } }, terrain: {} } };
  return { api, state, sourcePreparation, engine, height, dispose(group) {
    group?.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    for (const texture of state.textures) texture.dispose();
  } };
}
function raster(layer) {
  return Object.fromEntries(Object.entries(layer).map(([name, texture]) => [name, {
    pixels: texture.image.getContext('2d').getImageData(0, 0, texture.image.width, texture.image.height).data,
    width: texture.image.width, height: texture.image.height, colorSpace: texture.colorSpace,
    wrapS: texture.wrapS, wrapT: texture.wrapT, anisotropy: texture.anisotropy,
    generateMipmaps: texture.generateMipmaps, minFilter: texture.minFilter, magFilter: texture.magFilter,
  }]));
}
function checkedDrain(f, args, maxRows = 8) {
  const steps = f.api.steps(...args), size = texSize(256), perPixel = args[1] === 'mud' ? 2 : 3;
  let checkpoints = 0, maxCalls = 0;
  for (;;) {
    const before = f.state.calls, textureCount = f.state.textures.length;
    const step = steps.next(), calls = f.state.calls - before;
    maxCalls = Math.max(maxCalls, calls);
    assert.ok(calls <= maxRows * size * perPixel, 'at most eight rows per native ground step');
    if (step.done) return { layer: step.value, checkpoints, maxCalls };
    checkpoints++;
    assert.equal(calls, 8 * size * perPixel, 'each checkpoint follows exactly eight rows');
    assert.equal(f.state.textures.length, textureCount, 'no partial texture publication');
  }
}
function noiseOrder(kind) {
  const coordinates = kind === 'mud' ? [[3, 29], [42, 13]] : [[3, 17], [6, 41], [15, 8]];
  return (call, [, u, v, fu, fv, offset]) => {
    const size = texSize(256), pixel = Math.floor(call / coordinates.length);
    const expected = coordinates[call % coordinates.length];
    assert.equal(u, (pixel % size) / size); assert.equal(v, Math.floor(pixel / size) / size);
    assert.equal(fu, expected[0]); assert.equal(fv, expected[0]); assert.equal(offset, expected[1]);
  };
}
const receipts = [];
function parityCases(tier) {
  const urbanTone = (h, s, l) => [0.085, Math.max(0, Math.min(1, s * 0.6)), Math.max(0, Math.min(1, l * 0.9))];
  for (const kind of ['mud', 'rock']) for (const seed of [3003, 0xffffffff]) {
    for (const [tone, rough] of [[null, 1], [urbanTone, 0], [urbanTone, 1.5]]) {
      const args = [seed, kind, 16, tone, rough];
      const actual = fixture({ observe: noiseOrder(kind) }), original = fixture(), sync = fixture();
      try {
        const stepped = checkedDrain(actual, args), expected = original.api.original(...args);
        const output = raster(stepped.layer);
        assert.deepEqual(output, raster(expected), 'all returned native RGBA and texture settings match the frozen painter');
        assert.deepEqual(output, raster(sync.api.sync(...args)), 'synchronous wrapper drains to exactly the same pixels');
        assert.deepEqual(actual.state.heights, original.state.heights, 'every pre-normal Float32 height is unchanged');
        assert.equal(stepped.checkpoints, texSize(256) / 8);
        assert.equal(actual.state.textures.length, 2);
        receipts.push({ tier, kind, seed, toned: !!tone, rough, size: texSize(256),
          checkpoints: stepped.checkpoints, maxNoiseCalls: stepped.maxCalls,
          albedo: createHash('sha256').update(output.albedo.pixels).digest('hex'),
          normal: createHash('sha256').update(output.normal.pixels).digest('hex') });
      } finally { actual.dispose(); original.dispose(); sync.dispose(); }
    }
  }
}
async function flush() { for (let i = 0; i < 512; i++) await Promise.resolve(); }
function schedulerHost() {
  let serial = 0;
  const frames = new Map(), tasks = [], timers = new Map();
  globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.setTimeout = (callback, delay) => { timers.set(++serial, { callback, delay }); return serial; };
  globalThis.clearTimeout = id => timers.delete(id);
  globalThis.scheduler = { yield: () => new Promise(resolve => tasks.push(resolve)) };
  return { frames, tasks, timers,
    frame() { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(); },
    task() { assert.ok(tasks.length); tasks.shift()(); },
    restore() { for (const key of ['scheduler', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout']) {
      const value = saved.get(key); if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } } };
}
async function scheduledBuild(cancelAt = null, text = source) {
  const host = schedulerHost(), f = fixture({ text }), events = [], failure = new Error('cancelled wet build');
  const yieldWork = createOpaqueLoadingYielder(12, 32, { now: () => f.state.time });
  let done = false, error = null, group = null;
  const pending = f.api.buildAsync(f.height, f.engine, null, async (completed, total) => {
    events.push([completed, total]);
    if (completed !== 1 || f.state.calls === 0) return;
    await yieldWork();
    if (cancelAt !== null && f.state.calls >= cancelAt * texSize(256) * 2) throw failure;
  }, true, null, f.sourcePreparation).then(value => { group = value; done = true; }, caught => { error = caught; done = true; });
  try {
    let tasks = 0, frames = 0;
    for (let guard = 0; !done && guard < 160; guard++) {
      await flush();
      if (done) break;
      const calls = f.state.calls;
      assert.ok(calls > 0 && calls <= texSize(256) ** 2 * 2, 'pending work is actual mud painting');
      assert.equal(f.state.materials, 0); assert.equal(f.state.chunks, 0);
      assert.equal(f.state.textures.length, 6, 'only the three completed sourced layers exist during row waits');
      await flush();
      assert.equal(f.state.calls, calls, 'pending scheduler cannot advance the real pixel loop');
      if (host.frames.size) {
        frames++; host.frame(); await flush();
        assert.equal(f.state.calls, calls, 'rAF alone cannot resume before its post-paint task');
        assert.equal(host.tasks.length, 1); host.task();
      } else { tasks++; host.task(); }
    }
    assert.equal(done, true, 'bounded fixture finishes without artificial timeout delivery');
    await pending;
    assert.equal(f.state.closes, 1, 'ground generator completes or closes exactly once');
    assert.equal(f.state.pending.next().done, true);
    assert.equal(host.frames.size + host.tasks.length + host.timers.size, 0, 'all paint wait ownership is released');
    if (cancelAt !== null) {
      assert.equal(error, failure); assert.equal(group, null);
      assert.equal(f.state.calls, cancelAt * texSize(256) * 2);
      assert.equal(f.state.sourceCancels, 1);
      assert.equal(f.state.textures.length, 6, 'cancelled row cannot publish a wet texture');
      assert.equal(f.state.materials + f.state.chunks, 0);
    } else {
      assert.equal(error, null); assert.equal(f.state.sourceCancels, 0);
      assert.ok(tasks > 0 && frames > 0, 'actual opaque scheduler uses both task and paint opportunities');
      assert.equal(f.state.materials, 1); assert.equal(f.state.chunks, 192);
      assert.equal(group.children.length, 65);
      assert.equal(f.state.textures.length, 10, 'unchanged completed material texture budget');
    }
    return { cancelAt, tasks, frames, calls: f.state.calls, events };
  } finally {
    // A negative control may reject our assertion while its controlled host
    // still holds a wait. Settle that real owner before disposing the fixture.
    try {
      for (let guard = 0; !done && guard < 160; guard++) {
        await flush();
        if (host.frames.size) host.frame();
        else if (host.tasks.length) host.task();
      }
      await flush();
      assert.equal(done, true, 'controlled host cleanup settles within its bound');
      await pending;
    } finally {
      f.dispose(group); host.restore();
    }
  }
}
async function coarseProgress(text) {
  const f = fixture({ text }), events = [];
  let group;
  try {
    group = await f.api.buildAsync(f.height, f.engine, null,
      (done, total) => { events.push([done, total]); }, false, null, f.sourcePreparation);
    return events;
  } finally { f.dispose(group); }
}
try {
  parityCases('desktop');
  const run = await scheduledBuild();
  const cancellation = [];
  for (const row of [8, 128, 256]) cancellation.push(await scheduledBuild(row));
  const beforeDelegation = source.replace('const wet = yield* createWetSplatLayerSteps(S, aniso);',
    'const wet = createWetSplatLayer(S, aniso);');
  assert.notEqual(beforeDelegation, source, 'one actual material delegation seam');
  assert.deepEqual(await coarseProgress(source), await coarseProgress(beforeDelegation), 'coarse progress values/order are unchanged');
  await assert.rejects(scheduledBuild(null, beforeDelegation), /only the three completed sourced layers/,
    'negative: bypassing the real material delegation cannot satisfy scheduler coverage');
  const noYield = source.replace('if ((y & 7) === 7) yield;', '');
  assert.notEqual(noYield, source);
  const mutant = fixture({ text: noYield });
  try { assert.throws(() => checkedDrain(mutant, [3003, 'mud', 16]), /eight rows/,
    'negative: an atomic painter cannot pass the step-bound assertion'); } finally { mutant.dispose(); }
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem() { return null; } } };
  assert.equal(resolveDeviceTier(), 'mobile');
  parityCases('mobile');
  console.log(JSON.stringify({ proof: 'native Canvas2D exact payload parity and real generator/scheduler ownership; no GPU or callback-gap claim',
    rasterizer: { name: canvasPackage.name, version: canvasPackage.version, module: canvasPath },
    rows: receipts, scheduler: { tasks: run.tasks, frames: run.frames },
    cancellation: cancellation.map(({ events, ...row }) => row) }));
  console.log('terrainWetLayer.selftest: PASS 24 exact native pixel cases, 8-row bounds, actual task/rAF/post-task pacing, cancellation and atomic negative control');
} finally {
  for (const [key, value] of saved) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
