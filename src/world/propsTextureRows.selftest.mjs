import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import winter from './maps/winter.ts';
import { normalTextureFromHeight, textureFromRgbaPixels, tileableTorusNoise } from './proceduralTexture.ts';

// Independent synchronous control copied before this scheduling change from
// c5ca781e2, props.ts SHA256:
// 1ce878e165b68178209f4b3ef665ab9b8b350beb9d1f25e9f101d7b6e71078e6.
// Keep its painter, course RNG, height and packed-surface formulas independent
// of production. The unchanged shared normal/tone helpers remain actual code.
const prechange = String.raw`
export function mulberry32(a: number): Rng {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

// One linear ORM-style texture feeds both material slots: AO reads red and
// roughness reads green. Packing them together adds real PBR response without
// doubling the building texture/upload budget.
function surfaceFromHeight(h: Float32Array, s: number, anisotropy: number, {
  roughMin = 0.72, roughMax = 0.98, aoMin = 0.76,
}: SurfaceTextureOptions = {}): THREE.CanvasTexture {
  const px = new Uint8ClampedArray(s * s * 4);
  for (let i = 0; i < h.length; i++) {
    const height = clamp(h[i], 0, 1);
    const j = i * 4;
    px[j] = (aoMin + height * (1 - aoMin)) * 255;
    px[j + 1] = (roughMin + (1 - height) * (roughMax - roughMin)) * 255;
    px[j + 2] = 0;
    px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

const _col = new THREE.Color();
function buildStoneCourseEdges(size: number, rng: () => number): number[] {
  const rowE = [0];
  while (rowE[rowE.length - 1] < size) {
    let nxt = rowE[rowE.length - 1] + 88 + ((rng() * 72) | 0);
    if (size - nxt < 70) nxt = size;
    rowE.push(nxt);
  }
  return rowE;
}

function buildStoneColumnEdges(size: number, rowCount: number, rng: () => number): number[][] {
  const stoneE: number[][] = [];
  for (let row = 0; row < rowCount; row++) {
    const e = [0];
    while (e[e.length - 1] < size) {
      let nxt = e[e.length - 1] + 105 + ((rng() * 125) | 0);
      if (size - nxt < 88) nxt = size;
      e.push(nxt);
    }
    stoneE.push(e);
  }
  return stoneE;
}

function intervalAt(edges: readonly number[], value: number): number {
  let index = 0;
  while (edges[index + 1] <= value) index++;
  return index;
}

function paintStoneRow(
  noi: SimplexNoise,
  pixels: Uint8ClampedArray,
  heights: Float32Array,
  size: number,
  y: number,
  rowEdges: readonly number[],
  columnEdges: readonly (readonly number[])[],
): void {
  const row = intervalAt(rowEdges, y);
  const columns = columnEdges[row];
  for (let x = 0; x < size; x++) {
    const i = y * size + x, j = i * 4;
    const wob = noi.noise(x * 0.085 + row * 31, y * 0.085 - 17) * 3.4;
    const dRow = Math.min(y - rowEdges[row], rowEdges[row + 1] - y) + wob * 0.6;
    const column = intervalAt(columns, x);
    const dCol = Math.min(x - columns[column], columns[column + 1] - x) + wob;
    const edgeD = Math.min(dRow, dCol * 0.9);
    const mortar = edgeD < 3.6 ? 1 : 0;
    const tone = noi.noise(row * 13.3 + column * 29.7 + 3.1,
      row * 7.7 - column * 11.9) * 0.5 + 0.5;
    const grain = noi.noise(x * 0.11 + 8, y * 0.11 - 77) * 0.5 + 0.5;
    const grime = smoothstep(0.5, 0.95,
      noi.noise(x * 0.016 + 130, y * 0.028 + 71) * 0.5 + 0.5);
    const bevel = clamp((edgeD - 3.6) / 15, 0, 1);
    _col.setHSL(
      0.081 + tone * 0.014,
      0.06 + tone * 0.055 - grime * 0.02,
      (mortar ? 0.25 + grain * 0.04
        : (0.305 + tone * 0.14 + grain * 0.05) * (0.82 + bevel * 0.18)) - grime * 0.07,
    );
    pixels[j] = _col.r * 255;
    pixels[j + 1] = _col.g * 255;
    pixels[j + 2] = _col.b * 255;
    pixels[j + 3] = 255;
    heights[i] = mortar ? 0.12
      : (0.48 + tone * 0.26 + grain * 0.16) * (0.55 + 0.45 * bevel);
  }
}

function makeStone(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  // Irregular fieldstone coursing (512 px, ~0.35-0.9 m blocks at uvScale 0.5).
  const s = 512, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const srng = mulberry32(0x51a7);
  const rowEdges = buildStoneCourseEdges(s, srng);
  const columnEdges = buildStoneColumnEdges(s, rowEdges.length - 1, srng);
  for (let y = 0; y < s; y++) {
    paintStoneRow(noi, px, hgt, s, y, rowEdges, columnEdges);
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 3.0, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.78, roughMax: 0.98, aoMin: 0.68 }),
  };
}
function makeGrimeTexture(noi: SimplexNoise, anisotropy: number): THREE.CanvasTexture {
  const s = 256, px = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s, j = (y * s + x) * 4;
    const a = torusN(noi, u, v, 3, 3, 5) * 0.6 + torusN(noi, u, v, 7, 7, 19) * 0.4;
    const b = torusN(noi, u, v, 5, 5, 47) * 0.55 + torusN(noi, u, v, 13, 13, 91) * 0.45;
    // r3: blue carries a smooth 1-2 cycle field — sampled at very low world
    // frequency it drives the per-neighbourhood facade tint drift below
    const c2 = torusN(noi, u, v, 2, 2, 133) * 0.7 + torusN(noi, u, v, 5, 5, 171) * 0.3;
    px[j] = (a * 0.5 + 0.5) * 255;
    px[j + 1] = (b * 0.5 + 0.5) * 255;
    px[j + 2] = (c2 * 0.5 + 0.5) * 255; px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}
`;

const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
function section(text, start, end) {
  const from = text.indexOf(start), to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'exact production source anchors: ' + start);
  return text.slice(from, to);
}
const helpers = section(source, 'export function mulberry32', 'function makePlaster');
const stone = section(source, 'function buildStoneCourseEdges', 'function makeWood');
const grime = section(source, 'function* makeGrimeTexture', '/**');
const tone = section(terrain, 'const _toneCol =', '// ---------------------------------------------------------------------------\n// Procedural PBR');
const current = helpers + stone + grime;
assert.equal([...source.matchAll(/const g = propsBuildSteps\(/g)].length, 2,
  'both public synchronous and asynchronous paths drain the same props generator');
assert.match(source, /const stone = yield\* makeStone\(noi, aniso, T\.stone \|\| null\)/);
assert.match(source, /const grimeTex = yield\* makeGrimeTexture\(noi, aniso\)/);
assert.ok(source.indexOf('const grimeTex = yield*') < source.indexOf('const sourcedTexturesReady ='),
  'all new grime checkpoints precede material allocation and sourced-load ownership');
assert.ok(source.indexOf('const grimeTex = yield*') < source.indexOf('const windowStyle ='));

const { values } = parseArgs({ options: { 'canvas-module': { type: 'string' } } });
function canvasModulePath(explicit) {
  if (explicit !== undefined) {
    assert.ok(isAbsolute(explicit), '--canvas-module must be absolute');
    return explicit;
  }
  try { return createRequire(import.meta.url).resolve('@napi-rs/canvas'); }
  catch (cause) {
    throw new Error('Pinned native @napi-rs/canvas is required: run npm ci or pass --canvas-module. No stub or skip.', { cause });
  }
}
const modulePath = canvasModulePath(values['canvas-module']);
const rasterizer = JSON.parse(readFileSync(join(dirname(modulePath), 'package.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
assert.equal(rasterizer.name, '@napi-rs/canvas');
assert.equal(rasterizer.version, packageJson.devDependencies['@napi-rs/canvas'], 'use the exact pinned rasterizer');
const native = await import(pathToFileURL(modulePath).href);
assert.equal(typeof native.createCanvas, 'function');
assert.equal(typeof native.ImageData, 'function');
const globals = new Map(['document', 'ImageData'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const textures = new Set();
let canvasCount = 0;
function own(texture) { textures.add(texture); return texture; }
globalThis.ImageData = native.ImageData;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  canvasCount++;
  return native.createCanvas(1, 1);
} };
function compile(painters) {
  return new Function('THREE', 'normalFromHeight', 'toTexture', 'torusN',
    stripTypeScriptTypes(painters + '\n' + tone).replace(/^export /gm, '')
      + '\nreturn { makeStone, makeGrimeTexture, mulberry32 };')(
    THREE, (...args) => own(normalTextureFromHeight(...args)),
    (...args) => own(textureFromRgbaPixels(...args)), tileableTorusNoise);
}
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function textureSnapshot(texture) {
  const image = texture.image;
  const rgba = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  const settings = {};
  for (const key of ['mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter',
    'anisotropy', 'format', 'internalFormat', 'type', 'colorSpace', 'generateMipmaps',
    'premultiplyAlpha', 'flipY', 'unpackAlignment', 'rotation', 'matrixAutoUpdate',
    'version', 'isCanvasTexture']) settings[key] = texture[key];
  for (const key of ['offset', 'repeat', 'center', 'matrix']) settings[key] = texture[key].toArray();
  settings.mipmaps = texture.mipmaps.slice();
  settings.source = { version: texture.source.version, dataReady: texture.source.dataReady };
  return { size: [image.width, image.height], rgba: Buffer.from(rgba), settings };
}
function snapshot(value, kind) {
  const entries = kind === 'stone' ? Object.entries(value) : [['grime', value]];
  assert.deepEqual(entries.map(([name]) => name), kind === 'stone' ? ['albedo', 'normal', 'surface'] : ['grime']);
  return Object.fromEntries(entries.map(([name, texture]) => [name, textureSnapshot(texture)]));
}
function makeNoise(api, seed) {
  let rngCalls = 0, calls = 0;
  const rng = api.mulberry32(seed + 7);
  const noise = new SimplexNoise({ random() { rngCalls++; return rng(); } });
  for (const name of ['noise', 'noise4d']) {
    const original = noise[name].bind(noise);
    noise[name] = (...args) => { calls++; return original(...args); };
  }
  return { noise, calls: () => calls, tail: () => ({ rngCalls, values: [rng(), rng(), rng()] }) };
}
function job(api, kind, sample) {
  const probe = makeNoise(api, sample.seed);
  const value = kind === 'stone'
    ? api.makeStone(probe.noise, sample.anisotropy, sample.tone)
    : api.makeGrimeTexture(probe.noise, sample.anisotropy);
  return { kind, sample, probe, value, steps: 0, result: null };
}
function finish(job, value) {
  return { textures: snapshot(value, job.kind), calls: job.probe.calls(), rng: job.probe.tail() };
}
function advance(job) {
  const beforeCanvases = canvasCount, beforeCalls = job.probe.calls();
  const result = job.value.next();
  if (result.done) {
    assert.equal(canvasCount - beforeCanvases, job.kind === 'stone' ? 3 : 1,
      'the complete texture set is published without a suspended partial owner');
    assert.equal(job.probe.calls(), beforeCalls, 'texture publication does not repaint noise');
    job.result = finish(job, result.value);
    return;
  }
  assert.equal(canvasCount, beforeCanvases, 'row/tone checkpoints hold no new CanvasTexture');
  const rows = job.kind === 'stone' ? 512 : 256;
  const width = rows, samplesPerPixel = job.kind === 'stone' ? 4 : 6;
  job.steps++;
  if (job.steps <= rows / 16) {
    assert.deepEqual(result.value, { fine: true, stage: job.kind + '-rows-' + job.steps * 16 });
    assert.equal(job.probe.calls() - beforeCalls, 16 * width * samplesPerPixel,
      'each checkpoint performs exactly sixteen real rows, not fake yields after an eager paint');
  } else {
    assert.equal(job.kind, 'stone');
    assert.equal(job.steps, 33);
    assert.deepEqual(result.value, { fine: true, stage: 'stone-tone' });
    assert.equal(job.probe.calls(), beforeCalls);
  }
}
function drain(job) {
  while (job.result === null) advance(job);
  assert.equal(job.steps, job.kind === 'stone' ? 33 : 16);
  return job.result;
}
function checkCancellation(api, kind, method) {
  const pending = job(api, kind, { seed: 81, anisotropy: 2, tone: null });
  const beforeCanvases = canvasCount;
  advance(pending);
  const calls = pending.probe.calls();
  if (method === 'return') assert.deepEqual(pending.value.return(), { value: undefined, done: true });
  else {
    const failure = new Error('original painter cancellation');
    assert.throws(() => pending.value.throw(failure), error => error === failure);
  }
  assert.deepEqual(pending.value.next(), { value: undefined, done: true });
  assert.equal(pending.probe.calls(), calls, 'a cancelled painter never resumes/restarts');
  assert.equal(canvasCount, beforeCanvases, 'cancellation owns no texture or GPU resource to leak');
}

try {
  const baseline = compile(prechange), candidate = compile(current);
  const samples = [
    { seed: 2002, anisotropy: 4, tone: winter.props.tones.stone },
    { seed: 7719, anisotropy: 1, tone: null },
  ];
  const cases = samples.flatMap(sample => ['stone', 'grime'].map(kind => ({ kind, sample })));
  const controls = cases.map(({ kind, sample }) => {
    const control = job(baseline, kind, sample);
    return finish(control, control.value);
  });
  for (let index = 0; index < cases.length; index++) {
    const { kind, sample } = cases[index];
    assert.deepEqual(drain(job(candidate, kind, sample)), controls[index],
      kind + ': synchronous drain must match the independent prechange algorithm byte for byte');
  }
  const interleaved = cases.map(({ kind, sample }) => job(candidate, kind, sample));
  while (interleaved.some(pending => pending.result === null)) {
    for (const pending of interleaved) {
      if (pending.result !== null) continue;
      await new Promise(resolve => setImmediate(resolve));
      advance(pending);
    }
  }
  interleaved.forEach((pending, index) => {
    assert.deepEqual(pending.result, controls[index],
      pending.kind + ': independent interleaved painters retain exact pixels, maps, settings and RNG');
    assert.equal(pending.steps, pending.kind === 'stone' ? 33 : 16);
  });
  assert.notDeepEqual(controls[0].textures.albedo.rgba, controls[2].textures.albedo.rgba,
    'distinct seed/tone controls cannot collapse to one constant texture');
  for (const kind of ['stone', 'grime']) for (const method of ['return', 'throw']) {
    checkCancellation(candidate, kind, method);
  }
  const original = controls[0];
  const corrupted = { ...original, textures: { ...original.textures,
    normal: { ...original.textures.normal, rgba: Buffer.from(original.textures.normal.rgba) } } };
  assert.deepEqual(corrupted, original, 'the negative control starts byte/type identical');
  corrupted.textures.normal.rgba[0] ^= 1;
  assert.throws(() => assert.deepEqual(corrupted, controls[0]),
    'the parity gate rejects a single changed derived-map byte');
  const rows = controls.map((control, index) => ({
    kind: cases[index].kind, seed: cases[index].sample.seed,
    anisotropy: cases[index].sample.anisotropy,
    tone: cases[index].sample.tone ? 'winter' : null,
    hashes: Object.fromEntries(Object.entries(control.textures).map(([name, data]) => [name, hash(data.rgba)])),
    noiseCalls: control.calls, rng: control.rng,
    rowCheckpoints: interleaved[index].steps,
  }));
  console.log(JSON.stringify({
    proof: 'Exact native Canvas2D CPU payload parity; no GPU or frame-time certification.',
    controlRevision: 'c5ca781e2',
    controlPropsSha256: '1ce878e165b68178209f4b3ef665ab9b8b350beb9d1f25e9f101d7b6e71078e6',
    controlAlgorithmSha256: hash(prechange), candidatePropsSha256: hash(source),
    rasterizer: { name: rasterizer.name, version: rasterizer.version, module: modulePath }, rows,
  }, null, 2));
  console.log('propsTextureRows self-test passed: exact stone/grime output, sixteen-row progress, interleaving and cancellation ownership');
} finally {
  for (const texture of textures) texture.dispose();
  for (const [key, descriptor] of globals) {
    if (descriptor === undefined) delete globalThis[key];
    else Object.defineProperty(globalThis, key, descriptor);
  }
}
