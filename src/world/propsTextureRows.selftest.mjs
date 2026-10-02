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
import { createWreckBakeClient } from './wreckBakeClient.ts';

// 2026-10-01 (frozen pins retired): the control used to be a copy of the c5ca781e2 synchronous stone/grime painters,
// so any intended repaint of either texture failed here. The control is now the CURRENT row-checkpointed painter
// drained in one synchronous loop; every scheduled path (the public owner, interleaved async ticks) must reproduce it
// byte for byte, so row checkpoints and interleaving never change pixels, maps, settings or the RNG stream.
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
// cd7939351 made the async iterator typed so rejected awaits can IteratorClose
// delegated owners. Execute both real wrappers; declaration spelling is not an
// ownership contract. The injected producer below delegates to real painters.
const wrappers = section(source, 'export function createProps(', '\nfunction* propsBuildSteps(');
function publicOwner(iterator, wrapperSource = wrappers) {
  const runtime = {}, calls = [], events = [];
  function* build(...args) {
    calls.push(args);
    try {
      runtime.textures = yield* iterator;
      events.push('published');
      return runtime;
    } finally { events.push('closed'); }
  }
  const api = new Function('propsBuildSteps', 'ensureTankBuilder', 'createWreckBakeClient',
    stripTypeScriptTypes(wrapperSource).replace(/^export /gm, '')
      + '\nreturn { createProps, createPropsAsync };')(build, () => {
    assert.fail('texture row checkpoints must not acquire a vehicle builder');
  }, createWreckBakeClient);
  return { api, runtime, calls, events };
}
function assertPublicOwner(owner, result, args) {
  assert.equal(result, owner.runtime, 'publish the original owner, not a clone or yield value');
  assert.equal(owner.calls.length, 1, 'one producer owns the entire invocation');
  assert.equal(owner.calls[0].length, args.length);
  args.forEach((value, index) => assert.equal(owner.calls[0][index], value,
    'forward the identical producer argument at index ' + index));
  assert.deepEqual(owner.events, ['published', 'closed'], 'complete and close exactly once');
}
async function checkWrapperOwnership(wrapperSource) {
  const height = {}, engine = {}, config = {}, vegetation = {}, textures = {};
  for (const async of [false, true]) for (const defaults of [false, true]) {
    const owner = publicOwner((function* () {
      yield { fine: true, stage: 'owned-rows' };
      yield undefined;
      return textures;
    })(), wrapperSource);
    const explicit = [height, engine, 7719, config];
    const result = async
      ? await owner.api.createPropsAsync(...(defaults ? [height, engine]
        : [...explicit, null, true, vegetation]))
      : owner.api.createProps(...(defaults ? [height, engine] : [...explicit, vegetation]));
    const forwarded = defaults ? [height, engine, 2002, null, null] : [...explicit, vegetation];
    // Node keeps the synchronous bake path; only the async wrapper forwards
    // its explicit worker-mode flag to the same texture-owning producer.
    const sourceApplication = async ? owner.calls[0][6] : null;
    if (async) {
      assert.equal(sourceApplication.worker, true, 'only the async wrapper requests source composition');
      assert.ok(sourceApplication.signal instanceof AbortSignal);
      assert.equal(sourceApplication.signal.aborted, false, 'completed build keeps its source settlement owner');
    }
    assertPublicOwner(owner, result, async ? [...forwarded, false, sourceApplication] : forwarded);
    assert.equal(result.textures, textures, 'the published texture owner is not replaced');
  }
}
await checkWrapperOwnership(wrappers);
for (const [before, after] of [
  ['seed, cfg, vegetation);', 'seed + 1, cfg, vegetation);'],
  ['wreckWorker !== null,', 'true,'],
  ['while (!r.done) r = g.next();', 'if (!r.done) r = g.next();'],
  ['return r.value;', 'return { ...r.value };'],
  ['return runtime;', 'return { ...runtime };'],
]) {
  const mutated = wrappers.replace(before, after);
  assert.notEqual(mutated, wrappers, 'the negative control must change the real wrapper');
  await assert.rejects(checkWrapperOwnership(mutated), assert.AssertionError,
    'reject changed forwarding, incomplete drains and cloned sync/async ownership');
}
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
    return result;
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
  return result;
}
function* checkedPainter(job) {
  try {
    let result = advance(job);
    while (!result.done) {
      yield result.value;
      result = advance(job);
    }
    assert.equal(job.steps, job.kind === 'stone' ? 33 : 16);
    return result.value;
  } finally {
    if (job.result === null) job.value.return();
  }
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
  const candidate = compile(current);
  const samples = [
    { seed: 2002, anisotropy: 4, tone: winter.props.tones.stone },
    { seed: 7719, anisotropy: 1, tone: null },
  ];
  const cases = samples.flatMap(sample => ['stone', 'grime'].map(kind => ({ kind, sample })));
  const controls = cases.map(({ kind, sample }) => {
    const control = job(candidate, kind, sample);
    let step = control.value.next();
    while (!step.done) step = control.value.next();
    return finish(control, step.value);
  });
  const height = {}, engine = {}, vegetation = {};
  for (let index = 0; index < cases.length; index++) {
    const { kind, sample } = cases[index];
    const pending = job(candidate, kind, sample);
    const owner = publicOwner(checkedPainter(pending));
    const args = [height, engine, sample.seed, sample, vegetation];
    assertPublicOwner(owner, owner.api.createProps(...args), args);
    assert.deepEqual(pending.result, controls[index],
      kind + ': the checkpointed public owner must match the plain synchronous drain byte for byte');
  }
  const interleaved = cases.map(({ kind, sample }) => job(candidate, kind, sample));
  await Promise.all(interleaved.map(async pending => {
    const owner = publicOwner(checkedPainter(pending));
    const args = [height, engine, pending.sample.seed, pending.sample, vegetation];
    let ticks = 0;
    const result = await owner.api.createPropsAsync(...args.slice(0, 4), async (done, total) => {
      assert.equal(done, ++ticks);
      assert.equal(total, 180);
      assert.equal(owner.runtime.textures, undefined, 'no partial texture owner at an awaited checkpoint');
      assert.deepEqual(owner.events, [], 'the producer stays open while a row tick is awaited');
      await new Promise(resolve => setImmediate(resolve));
    }, true, vegetation);
    assertPublicOwner(owner, result, [...args, false, owner.calls[0][6]]);
    assert.equal(owner.calls[0][6].signal.aborted, false);
    assert.equal(ticks, pending.steps, 'every real row/tone checkpoint reaches the async scheduler');
    assert.equal(result._buildDetail.sliceCount, pending.steps + 1);
  }));
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
    candidatePropsSha256: hash(source),
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
