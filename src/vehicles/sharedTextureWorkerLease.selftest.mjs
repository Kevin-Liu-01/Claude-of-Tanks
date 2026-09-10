import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import * as THREE from 'three';
import {
  acquireSharedTextureLease, applyCamoPatterns, applyCamoPatternsChunked, createTankMaterials, discardPrebakedSharedTextures,
  prebakeSharedTextures, resolveCamoVisual, setCamoBiome, setCamoSelection, setCustomCamoSelection,
} from './materials.ts';
import { createMaterialPainter } from './materialPainter.ts';
import { disposeMaterialPainterWorker } from './materialPainterWorkerClient.ts';

// Real small CPU painters, public material/cache owners, and the production
// worker client. Only the native Worker transport is replaced. This proves
// ownership and same-backend pixels, not browser raster or performance parity.
const require = createRequire(import.meta.url);
const canvasEntry = process.env.COT_TEST_CANVAS_MODULE || require.resolve('@napi-rs/canvas');
assert(isAbsolute(canvasEntry), 'optional canvas runtime override must be absolute');
const manifest = JSON.parse(readFileSync(join(dirname(canvasEntry), 'package.json'), 'utf8'));
assert.equal(manifest.name, '@napi-rs/canvas');
assert.equal(manifest.version, require('../../package.json').devDependencies['@napi-rs/canvas']);
const { createCanvas, Path2D, DOMMatrix, ImageData } = require(canvasEntry);
const globals = ['document', 'Worker', 'OffscreenCanvas', 'FontFace', 'Path2D', 'DOMMatrix', 'ImageData', 'localStorage']
  .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, value });
let jobs = [], workers = [], postFailure = null;

class FakeWorker {
  constructor(url, options) {
    assert.equal(options.type, 'module');
    assert.match(String(url), /materialPainterWorker\.ts$/);
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.terminated = 0;
    workers.push(this);
  }
  postMessage(message) {
    if (postFailure) throw postFailure;
    assert.equal(this.terminated, 0, 'terminated transports cannot accept successor work');
    assert(Number.isSafeInteger(message.requestId));
    assert.match(message.fontUrl, /\/fonts\/abc-monument-grotesk\/ABCMonumentGrotesk-Bold\.woff2$/);
    jobs.push({ owner: this, message: structuredClone(message), replied: false });
  }
  terminate() { this.terminated++; }
}

setGlobal('document', {
  baseURI: 'https://material-test.invalid/game/',
  createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); },
});
setGlobal('Worker', FakeWorker);
setGlobal('OffscreenCanvas', class {
  constructor(width, height) { return createCanvas(width, height); }
});
setGlobal('FontFace', class {}); // Capability only; worker font errors use its failure reply.
setGlobal('Path2D', Path2D);
setGlobal('DOMMatrix', DOMMatrix);
setGlobal('ImageData', ImageData);
const storage = new Map();
setGlobal('localStorage', {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
});

const originalDispose = THREE.Texture.prototype.dispose;
const textureDisposals = [];
THREE.Texture.prototype.dispose = function () {
  textureDisposals.push(this);
  return originalDispose.call(this);
};
const visuals = new Set(), leases = new Set(), mutableIds = new Set();
const spec = id => ({ id, nation: 'usa', era: 'modern', visual: {
  base: '#4a553c', weather: '#716846', patches: ['#23251f', '#756448'],
  scheme: 'nato', plateLines: false,
} });
const maps = value => [value.hull.map, value.hull.normalMap, value.hull.roughnessMap];
const disposed = texture => textureDisposals.filter(value => value === texture).length;
const digest = value => maps(value).map(texture => {
  const canvas = texture.image;
  return [canvas.width, canvas.height, createHash('sha256').update(
    canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data,
  ).digest('hex')];
});
function visual(s, quality = 'low', selection = 'factory') {
  const result = createTankMaterials(s, { anisotropy: 4 }, 7, quality, selection);
  const release = result.dispose.bind(result);
  result.dispose = () => { if (visuals.delete(result)) release(); };
  visuals.add(result);
  return result;
}
async function lease(s, quality = 'low', selection = 'factory', tick = null) {
  const result = await acquireSharedTextureLease(s, 4, quality, selection, tick);
  leases.add(result);
  return result;
}
function legacyPixels(s, quality = 'low', selection = 'factory') {
  const result = visual(s, quality, selection);
  const pixels = digest(result);
  result.dispose();
  return pixels;
}
function resetTransport() {
  assert(jobs.every(job => job.replied), 'the preceding case must finish its active worker request');
  disposeMaterialPainterWorker();
  assert(workers.every(worker => worker.terminated === 1), 'each owned worker terminates exactly once');
  jobs = []; workers = []; postFailure = null;
}
async function until(predicate, label) {
  for (let turn = 0; turn < 512 && !predicate(); turn++) await Promise.resolve();
  assert(predicate(), label);
}
async function nextJob() {
  await until(() => jobs.some(job => !job.replied), 'actual material pre-bake must dispatch worker work');
  return jobs.find(job => !job.replied);
}
function exactBase(request) {
  const owned = [];
  const makeCanvas = (width, height) => {
    const canvas = createCanvas(width, height); owned.push(canvas); return canvas;
  };
  try {
    const painter = createMaterialPainter(makeCanvas);
    const entry = { camoCanvas: makeCanvas(4, 4), normalCanvas: makeCanvas(4, 4),
      roughCanvas: makeCanvas(4, 4), feats: null };
    for (const checkpoint of painter.bakeBaseSteps(entry, request)) void checkpoint;
    assert(entry.feats);
    const pixels = canvas => canvas.getContext('2d')
      .getImageData(0, 0, canvas.width, canvas.height).data.slice();
    return { identity: request.identity, dimensions: { ...request.dimensions },
      albedo: pixels(entry.camoCanvas), normal: pixels(entry.normalCanvas),
      roughness: pixels(entry.roughCanvas), features: entry.feats };
  } finally {
    for (const canvas of owned) { canvas.width = 0; canvas.height = 0; }
  }
}
function reply(job, failure = null) {
  assert.equal(job.replied, false);
  job.replied = true;
  const { requestId, request } = job.message;
  if (failure === 'error') { job.owner.onerror?.({ message: 'expected transport failure' }); return; }
  if (failure === 'font') { job.owner.onmessage?.({ data: { requestId, ok: false } }); return; }
  const result = exactBase(request);
  if (failure === 'identity') result.identity += ':stale';
  job.owner.onmessage?.({ data: { requestId, ok: true, result } });
}
async function finishWithReplies(promise) {
  let done = false, failure;
  const observed = promise.then(() => { done = true; }, error => { failure = { error }; done = true; });
  for (let turn = 0; turn < 512 && !done; turn++) {
    const job = jobs.find(value => !value.replied);
    if (job) reply(job);
    await Promise.resolve();
  }
  assert(done, 'bounded worker/cache operation must settle');
  await observed;
  if (failure) throw failure.error;
  return promise;
}

function captureCanvasCreation(failAt = Infinity, failure = null) {
  const original = document.createElement;
  const records = [];
  let attempts = 0;
  const restore = () => { document.createElement = original; };
  document.createElement = function (tag) {
    if (++attempts === failAt) {
      restore(); // The original fallback must remain usable after this one fault.
      throw failure;
    }
    const canvas = original.call(this, tag);
    const record = { canvas, width: [], height: [] };
    for (const key of ['width', 'height']) {
      let owner = canvas, descriptor;
      while (owner && !(descriptor = Object.getOwnPropertyDescriptor(owner, key))) {
        owner = Object.getPrototypeOf(owner);
      }
      assert.equal(typeof descriptor?.get, 'function');
      assert.equal(typeof descriptor?.set, 'function');
      Object.defineProperty(canvas, key, {
        configurable: true,
        get() { return descriptor.get.call(this); },
        set(value) { record[key].push(value); descriptor.set.call(this, value); },
      });
    }
    records.push(record);
    return canvas;
  };
  return { records, restore, attempts: () => attempts };
}

function assertCanvasReleased(record, label) {
  assert(record, `${label}: canvas was actually allocated`);
  // Observe the real owner reset, not backend-specific zero-size normalization.
  for (const key of ['width', 'height']) {
    assert.equal(record[key].filter(value => value === 0).length, 1, `${label}: ${key} released once`);
  }
}

function failCanvasTextureConstruction(failAt, failure) {
  const descriptor = Object.getOwnPropertyDescriptor(THREE.Texture.prototype, 'needsUpdate');
  assert.equal(typeof descriptor?.set, 'function');
  const textures = [];
  const restore = () => Object.defineProperty(THREE.Texture.prototype, 'needsUpdate', descriptor);
  Object.defineProperty(THREE.Texture.prototype, 'needsUpdate', {
    ...descriptor,
    set(value) {
      // CanvasTexture's documented initial needsUpdate uses this public setter.
      // Keep the actual constructor and every successful setter side effect.
      if (value === true && this.isCanvasTexture && !textures.includes(this)) {
        textures.push(this);
        if (textures.length === failAt) throw failure;
      }
      descriptor.set.call(this, value);
    },
  });
  return { textures, restore };
}

function mutableSpec(id) {
  mutableIds.add(id);
  return spec(id);
}
const sharedSeed = key => 0x5eed ^ [...key].reduce((hash, ch) => (hash * 33 + ch.charCodeAt(0)) | 0, 7);
function assertMutableRequest(job, s) {
  const { request } = job.message;
  assert.equal(request.identity, s.id, 'four-argument prebake keeps the mutable specId cache key');
  assert.equal(request.seed, sharedSeed(s.id), 'seed remains keyed to the original mutable identity');
  assert.notEqual(request.seed, sharedSeed(`${s.id}::factory`), 'fixed-lease seed must not replace mutable seed');
  assert.deepEqual(request.visual, { ...resolveCamoVisual(s), modernWelds: true });
}
const mutablePixels = (s, quality = 'low') => legacyPixels(s, quality, null);
const mutableBake = (s, quality = 'low', tick = null) => prebakeSharedTextures(s, 4, quality, tick);

const mutableChanges = [
  { name: 'selection', initial: s => setCamoSelection(s.id, 'factory'),
    change: s => setCamoSelection(s.id, 'winter') },
  { name: 'biome', initial: s => { setCamoSelection(s.id, 'auto'); setCamoBiome('verdant'); },
    change: () => setCamoBiome('winter') },
  { name: 'custom', initial: s => setCustomCamoSelection(s.id, {
    style: 'digital', base: '#4a553c', colorA: '#23251f', colorB: '#756448', repeat: 34,
  }), change: s => setCustomCamoSelection(s.id, {
    style: 'stripes', base: '#827250', colorA: '#30291d', colorB: '#bca57c', repeat: 61,
  }) },
];

async function withCamoClock(run) {
  const original = globalThis.setTimeout;
  const timers = [], promises = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 16 && delay !== 32) return original(callback, delay, ...args);
    const timer = { callback, delay, args }; timers.push(timer); return timer;
  };
  const clock = {
    track(promise) { promises.push(promise); void promise.catch(() => {}); return promise; },
    has(delay) { return timers.some(timer => timer.delay === delay); },
    async release(delay) {
      await until(() => clock.has(delay), `actual repaint must reach its ${delay}ms yield`);
      const [timer] = timers.splice(timers.findIndex(value => value.delay === delay), 1);
      timer.callback(...timer.args);
    },
    async finish(promise) {
      let settled = false, failure;
      void promise.then(() => { settled = true; }, error => { failure = { error }; settled = true; });
      for (let turn = 0; turn < 512 && !settled; turn++) {
        const job = jobs.find(value => !value.replied);
        if (job) reply(job);
        const timer = timers.shift();
        if (timer) timer.callback(...timer.args);
        await Promise.resolve();
      }
      assert(settled, 'bounded real repaint/worker composition must settle');
      if (failure) throw failure.error;
      return promise;
    },
  };
  let failure;
  try { await run(clock); } catch (error) { failure = { error }; }
  try { await clock.finish(Promise.allSettled(promises)); }
  catch (error) { failure ??= { error }; }
  finally { globalThis.setTimeout = original; }
  if (failure) throw failure.error;
}

try {
  {
    const s = spec('worker-lease-coalesced'), expected = legacyPixels(s);
    let firstTicks = 0, otherTicks = 0;
    const first = lease(s, 'low', 'factory', () => { firstTicks++; });
    const second = lease(s, 'low', 'factory', () => { otherTicks++; });
    const legacy = prebakeSharedTextures(s, 4, 'low', () => { otherTicks++; }, 'factory');
    const job = await nextJob();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(jobs.length, 1, 'three callers share one pending texture-identity job');
    assert.equal(workers.length, 1);
    assert.deepEqual(job.message.request.dimensions, { albedo: 256, map: 128 });
    reply(job);
    const [a, b] = await finishWithReplies(Promise.all([first, second, legacy]));
    assert.equal(jobs.length, 1, 'cache-hit joiners must not repaint after completion');
    assert(firstTicks > 0, 'worker completion retains caller scheduling checkpoints');
    assert.equal(otherTicks, 0);
    const current = visual(s), textures = maps(current);
    assert.deepEqual(digest(current), expected, 'worker base plus MAIN patch exactly matches legacy maps');
    current.dispose(); a.release(); a.release();
    assert(textures.every(texture => disposed(texture) === 0), 'independent lease still owns all maps');
    assert.equal(discardPrebakedSharedTextures(`${s.id}::factory`), false);
    b.release(); b.release();
    assert(textures.every(texture => disposed(texture) === 1));
    const replacement = visual(s);
    a.release(); b.release();
    assert(maps(replacement).every(texture => disposed(texture) === 0), 'old releases cannot evict a successor');
    replacement.dispose();
  }
  resetTransport();

  {
    const s = spec('worker-live-promotion'), expected = legacyPixels(s, 'ai');
    const current = visual(s), textures = maps(current), before = digest(current);
    const pending = lease(s, 'ai');
    const job = await nextJob();
    assert.deepEqual(digest(current), before, 'in-flight worker promotion does not resize or paint live maps');
    current.dispose();
    assert(textures.every(texture => disposed(texture) === 0), 'pending lease pins the last live reference');
    assert.equal(discardPrebakedSharedTextures(`${s.id}::factory`), false);
    reply(job); const held = await finishWithReplies(pending);
    const upgraded = visual(s, 'ai');
    assert.deepEqual(maps(upgraded), textures, 'promotion preserves exact THREE.Texture object identity');
    assert.deepEqual(digest(upgraded), expected);
    assert(textures.every(texture => disposed(texture) === 1), 'promotion performs the immutable-storage resize ritual');
    upgraded.dispose(); held.release();
    assert(textures.every(texture => disposed(texture) === 2));
  }
  resetTransport();

  {
    const s = spec('worker-sync-acquire'), expected = legacyPixels(s);
    const pending = lease(s);
    const job = await nextJob();
    const acquired = visual(s), textures = maps(acquired);
    acquired.dispose();
    reply(job); const held = await finishWithReplies(pending);
    const successor = visual(s);
    assert.deepEqual(maps(successor), textures, 'worker draft cannot overwrite synchronous acquisition during wait');
    assert.deepEqual(digest(successor), expected);
    assert(textures.every(texture => disposed(texture) === 0), 'same-quality result needs no resize/disposal');
    successor.dispose(); held.release();
    assert(textures.every(texture => disposed(texture) === 1));
  }
  resetTransport();

  {
    const s = spec('worker-sync-higher-promotion');
    const current = visual(s), textures = maps(current);
    const pending = lease(s, 'ai');
    const job = await nextJob();
    const higher = visual(s, 'preview'), expected = digest(higher);
    assert.equal(higher.hull.map.image.width, 1024);
    assert(textures.every(texture => disposed(texture) === 1));
    reply(job); const held = await finishWithReplies(pending);
    assert.deepEqual(maps(higher), textures);
    assert.deepEqual(digest(higher), expected, 'late lower-quality worker result must never downgrade newer sync promotion');
    assert(textures.every(texture => disposed(texture) === 1), 'discarding an obsolete result must not re-dispose live maps');
    current.dispose(); higher.dispose(); held.release();
    assert(textures.every(texture => disposed(texture) === 2));
  }
  resetTransport();

  {
    const s = spec('worker-two-quality-requests');
    const low = lease(s), high = lease(s, 'ai');
    const firstJob = await nextJob();
    assert.equal(firstJob.message.request.dimensions.albedo, 256);
    reply(firstJob); const lowOwner = await low;
    const secondJob = await nextJob();
    assert.equal(secondJob.message.request.dimensions.albedo, 512);
    const current = visual(s), textures = maps(current);
    reply(secondJob); const highOwner = await finishWithReplies(high);
    assert.equal(jobs.length, 2, 'higher pending tier needs one subsequent promotion, not parallel work');
    assert.deepEqual(maps(current), textures);
    assert.equal(current.hull.map.image.width, 512);
    lowOwner.release(); highOwner.release(); current.dispose();
    assert(textures.every(texture => disposed(texture) === 2));
  }
  resetTransport();

  {
    const s = spec('worker-tick-failed-joiner'), expected = legacyPixels(s);
    const error = new Error('expected one owner tick failure');
    let ticks = 0;
    const rejected = acquireSharedTextureLease(s, 4, 'low', 'factory', () => { ticks++; throw error; });
    const rejection = assert.rejects(rejected, problem => problem === error);
    const survivor = lease(s);
    const job = await nextJob(); reply(job);
    const [, held] = await finishWithReplies(Promise.all([rejection, survivor]));
    assert(ticks > 0);
    assert.equal(jobs.length, 1, 'one tick failure cannot poison the shared successful painter');
    const current = visual(s), textures = maps(current);
    assert.deepEqual(digest(current), expected);
    current.dispose(); assert(textures.every(texture => disposed(texture) === 0));
    held.release(); assert(textures.every(texture => disposed(texture) === 1));
  }
  resetTransport();

  for (const failure of ['font', 'error', 'identity']) {
    const s = spec(`worker-fallback-${failure}`), expected = legacyPixels(s);
    const pending = lease(s);
    const job = await nextJob(); reply(job, failure);
    const held = await finishWithReplies(pending);
    assert(workers.every(worker => worker.terminated === 1), `${failure}: failed worker is released`);
    const current = visual(s), textures = maps(current);
    assert.deepEqual(digest(current), expected, `${failure}: failure uses exact legacy painter, never incomplete maps`);
    current.dispose(); held.release();
    assert(textures.every(texture => disposed(texture) === 1));
    resetTransport();
  }

  {
    const s = spec('worker-post-failed'), expected = legacyPixels(s);
    postFailure = new Error('expected postMessage failure');
    const held = await finishWithReplies(lease(s));
    assert.equal(jobs.length, 0);
    const current = visual(s), textures = maps(current);
    assert.deepEqual(digest(current), expected, 'synchronous worker submission failure falls back completely');
    current.dispose(); held.release();
    assert(textures.every(texture => disposed(texture) === 1));
  }
  resetTransport();

  for (const failAt of [2, 3]) {
    const s = spec(`worker-partial-canvas-${failAt}`), expected = legacyPixels(s);
    const pending = lease(s), job = await nextJob();
    const fault = new Error(`expected private canvas allocation ${failAt} failure`);
    const capture = captureCanvasCreation(failAt, fault);
    let held;
    try {
      reply(job);
      held = await finishWithReplies(pending);
    } finally { capture.restore(); }
    assert.equal(capture.attempts(), failAt, 'the intended partial allocation actually failed');
    assert.equal(capture.records.length, failAt - 1);
    capture.records.forEach((record, index) => assertCanvasReleased(record, `private draft ${index}`));
    assert.equal(jobs.length, 1, 'private setup failure falls back without resubmitting worker work');
    const current = visual(s), textures = maps(current);
    assert.deepEqual(digest(current), expected, 'allocation failure keeps the exact original painter fallback');
    assert(textures.every(texture => !capture.records.some(record => record.canvas === texture.image)),
      'no partially allocated private canvas enters the successful cache');
    current.dispose(); held.release();
    assert(textures.every(texture => disposed(texture) === 1));
    resetTransport();
  }

  for (const failAt of [2, 3]) {
    const s = spec(`worker-partial-texture-${failAt}`), expected = legacyPixels(s);
    const pending = lease(s), job = await nextJob();
    const fault = new Error(`expected CanvasTexture construction ${failAt} failure`);
    const rejection = assert.rejects(pending, error => error === fault);
    const capture = captureCanvasCreation();
    const construction = failCanvasTextureConstruction(failAt, fault);
    try {
      reply(job);
      await finishWithReplies(rejection);
    } finally { construction.restore(); capture.restore(); }
    assert.equal(construction.textures.length, failAt, 'the intended later constructor actually failed');
    const completed = construction.textures.slice(0, -1);
    assert(completed.every(texture => disposed(texture) === 1), 'all earlier unpublished textures are disposed once');
    const privateMaps = capture.records.slice(0, 3);
    privateMaps.forEach((record, index) => assertCanvasReleased(record, `unpublished map ${index}`));
    assert(construction.textures.every(texture => privateMaps.some(record => record.canvas === texture.image)),
      'fault injection exercised the actual shared map constructors');
    // The legacy patch may allocate its own scratch canvas between the private
    // trio and the returned track canvas. Track is the last allocation before
    // construction; its internal painter is intentionally not mocked.
    const track = capture.records.at(-1);
    assert(!privateMaps.includes(track));
    assertCanvasReleased(track, 'unpublished track');
    assert.equal(discardPrebakedSharedTextures(`${s.id}::factory`), false, 'failed entry was never published');
    const held = await finishWithReplies(lease(s));
    assert.equal(jobs.length, 2, 'failure releases both pending owners so the same identity can retry');
    const current = visual(s), textures = maps(current);
    assert.deepEqual(digest(current), expected, 'retry produces all exact legacy maps');
    assert(textures.every(texture => !construction.textures.includes(texture)), 'retry cannot adopt failed-entry textures');
    current.dispose(); held.release();
    assert(textures.every(texture => disposed(texture) === 1));
    assert(completed.every(texture => disposed(texture) === 1), 'retry never disposes an obsolete entry twice');
    resetTransport();
  }

  {
    const s = spec('worker-pattern-isolation');
    const expectedFactory = legacyPixels(s), expectedWinter = legacyPixels(s, 'low', 'winter');
    const factory = lease(s), winter = lease(s, 'low', 'winter');
    const [factoryOwner, winterOwner] = await finishWithReplies(Promise.all([factory, winter]));
    assert.equal(jobs.length, 2);
    assert.notEqual(jobs[0].message.request.identity, jobs[1].message.request.identity);
    const a = visual(s), b = visual(s, 'low', 'winter');
    assert.notEqual(a.hull.map, b.hull.map);
    assert.deepEqual(digest(a), expectedFactory); assert.deepEqual(digest(b), expectedWinter);
    const bMaps = maps(b);
    a.dispose(); factoryOwner.release();
    assert(bMaps.every(texture => disposed(texture) === 0));
    b.dispose(); winterOwner.release();
    assert(bMaps.every(texture => disposed(texture) === 1));
  }
  resetTransport();

  {
    const s = mutableSpec('worker-four-argument-coalesced');
    setCamoSelection(s.id, 'factory');
    const expected = mutablePixels(s);
    let firstTicks = 0, secondTicks = 0;
    // Deliberately FOUR arguments: this is the older roster-warm call site,
    // not a fixed fifth-argument lease identity disguised as a mutable test.
    const first = prebakeSharedTextures(s, 4, 'low', () => { firstTicks++; });
    const second = prebakeSharedTextures(s, 4, 'low', () => { secondTicks++; });
    const job = await nextJob(); assertMutableRequest(job, s);
    assert.equal(jobs.length, 1);
    reply(job); await finishWithReplies(Promise.all([first, second]));
    assert(firstTicks > 0); assert.equal(secondTicks, 0);
    assert.equal(jobs.length, 1, 'mutable pending callers share the existing single identity owner');
    const a = visual(s, 'low', null), b = visual(s, 'low', null), textures = maps(a);
    assert.deepEqual(digest(a), expected, 'four-argument worker base preserves exact original mutable output');
    assert.deepEqual(maps(b), textures, 'ordinary synchronous acquisition reuses the worker-installed textures');
    const fixed = visual(s);
    assert(maps(fixed).every((texture, index) => texture !== textures[index]), 'fixed and mutable caches stay independent');
    a.dispose(); assert(textures.every(texture => disposed(texture) === 0));
    b.dispose(); assert(textures.every(texture => disposed(texture) === 1));
    fixed.dispose();
  }
  resetTransport();

  {
    const s = mutableSpec('worker-four-argument-promotion');
    setCamoSelection(s.id, 'factory');
    const expected = mutablePixels(s, 'ai');
    const current = visual(s, 'low', null), textures = maps(current), before = digest(current);
    const pending = mutableBake(s, 'ai');
    const job = await nextJob(); assertMutableRequest(job, s);
    assert.deepEqual(digest(current), before, 'mutable live canvases remain untouched while worker promotion waits');
    reply(job); await finishWithReplies(pending);
    assert.deepEqual(maps(current), textures);
    assert.deepEqual(digest(current), expected, 'mutable promotion is the exact sync legacy tier');
    assert(textures.every(texture => disposed(texture) === 1), 'mutable promotion retains the storage-resize ritual');
    current.dispose(); assert(textures.every(texture => disposed(texture) === 2));
  }
  resetTransport();

  for (const change of mutableChanges) {
    const s = mutableSpec(`worker-four-argument-queued-${change.name}`);
    change.initial(s); const previousPixels = mutablePixels(s);
    change.change(s); const expected = mutablePixels(s);
    assert.notDeepEqual(expected, previousPixels, `${change.name}: witness must actually change painted output`);
    change.initial(s);
    const pending = mutableBake(s), job = await nextJob(); assertMutableRequest(job, s);
    const requestedVisual = structuredClone(job.message.request.visual);
    change.change(s);
    assert.notDeepEqual({ ...resolveCamoVisual(s), modernWelds: true }, requestedVisual,
      `${change.name}: global state changed during the request`);
    reply(job); await finishWithReplies(pending);
    const current = visual(s, 'low', null), textures = maps(current);
    assert.deepEqual(digest(current), expected, `${change.name}: obsolete worker pixels must never become current mutable paint`);
    assert.deepEqual(job.message.request.visual, requestedVisual, 'queued request remains its original immutable snapshot');
    assert(jobs.every(value => value.message.request.identity === s.id && value.message.request.seed === sharedSeed(s.id)));
    current.dispose(); assert(textures.every(texture => disposed(texture) === 1));
    setCamoBiome('verdant'); resetTransport();
  }

  for (const repaint of [false, true]) {
    const s = mutableSpec(`worker-four-argument-sync-${repaint ? 'repaint' : 'acquire'}`);
    setCamoSelection(s.id, 'factory');
    const pending = mutableBake(s), job = await nextJob(); assertMutableRequest(job, s);
    const current = visual(s, 'low', null), textures = maps(current);
    const beforeRepaint = digest(current);
    if (repaint) {
      setCamoSelection(s.id, 'winter'); applyCamoPatterns(s.id);
      assert.notDeepEqual(digest(current), beforeRepaint, 'actual synchronous repaint changed this live entry');
      assert.equal(jobs.length, 1, 'ordinary repaint did not become a new worker mode');
    }
    const expected = digest(current), wheelColor = current.wheels.color.getHex();
    const beforeDisposals = textures.map(disposed);
    reply(job); await finishWithReplies(pending);
    assert.deepEqual(maps(current), textures, 'synchronous mutable owner keeps its exact texture identities');
    assert.deepEqual(digest(current), expected, 'captured worker result cannot overwrite a newer synchronous owner');
    assert.equal(current.wheels.color.getHex(), wheelColor, 'worker settlement cannot revert synchronously retinted fittings');
    assert.deepEqual(textures.map(disposed), beforeDisposals, 'discarded stale result cannot resize a sufficient live entry');
    current.dispose();
    assert.deepEqual(textures.map(disposed), beforeDisposals.map(value => value + 1));
    resetTransport();
  }

  {
    const s = mutableSpec('worker-four-argument-sync-higher-promotion');
    setCamoSelection(s.id, 'factory');
    const current = visual(s, 'low', null), textures = maps(current);
    const pending = mutableBake(s, 'ai'), job = await nextJob(); assertMutableRequest(job, s);
    setCamoSelection(s.id, 'winter'); applyCamoPatterns(s.id);
    const higher = visual(s, 'preview', null), expected = digest(higher);
    assert.deepEqual(maps(higher), textures); assert.equal(higher.hull.map.image.width, 1024);
    const beforeDisposals = textures.map(disposed);
    reply(job); await finishWithReplies(pending);
    assert.deepEqual(maps(higher), textures); assert.deepEqual(digest(higher), expected,
      'late lower-quality old-pattern worker result cannot downgrade newer mutable paint');
    assert.deepEqual(textures.map(disposed), beforeDisposals);
    current.dispose(); higher.dispose();
    assert.deepEqual(textures.map(disposed), beforeDisposals.map(value => value + 1));
  }
  resetTransport();

  {
    const s = mutableSpec('worker-cached-A-global-B');
    setCamoSelection(s.id, 'factory');
    const control = visual(s, 'ai', null), expectedA = digest(control);
    setCamoSelection(s.id, 'winter'); applyCamoPatterns(s.id);
    const expectedB = digest(control), expectedWheelB = control.wheels.color.getHex();
    assert.deepEqual(expectedB[1], expectedA[1], 'legacy repaint retains its base normal map');
    assert.notDeepEqual(expectedB, expectedA); control.dispose();
    setCamoSelection(s.id, 'factory');
    const current = visual(s, 'low', null), textures = maps(current);
    setCamoSelection(s.id, 'winter');
    const pending = mutableBake(s, 'ai'), job = await nextJob();
    assert.equal(job.message.request.identity, s.id);
    assert.equal(job.message.request.seed, sharedSeed(s.id));
    assert.deepEqual(job.message.request.visual, { ...resolveCamoVisual(s, 'factory'), modernWelds: true },
      'base promotion uses cached A recipe, not an unrequested global B repaint');
    assert.notDeepEqual(job.message.request.visual, { ...resolveCamoVisual(s), modernWelds: true });
    reply(job); await finishWithReplies(pending);
    assert.deepEqual(maps(current), textures); assert.deepEqual(digest(current), expectedA);
    assert(textures.every(texture => disposed(texture) === 1));
    applyCamoPatterns(s.id);
    assert.deepEqual(digest(current), expectedB, 'ordinary repaint retains exact legacy pattern-keyed RNG ownership');
    assert.equal(current.wheels.color.getHex(), expectedWheelB);
    assert.equal(jobs.length, 1, 'base optimization did not introduce a worker repaint mode');
    current.dispose(); assert(textures.every(texture => disposed(texture) === 2));
  }
  resetTransport();

  for (const returnToA of [false, true]) {
    const s = mutableSpec(`worker-active-repaint-${returnToA ? 'A-B-A' : 'A-B'}`);
    setCamoSelection(s.id, returnToA ? 'factory' : 'winter');
    const expected = mutablePixels(s, 'ai');
    setCamoSelection(s.id, 'factory');
    const current = visual(s, 'low', null), textures = maps(current), original = digest(current);
    await withCamoClock(async clock => {
      const pending = clock.track(mutableBake(s, 'ai'));
      let workerSettled = false;
      void pending.then(() => { workerSettled = true; }, () => { workerSettled = true; });
      const job = await nextJob(); assertMutableRequest(job, s);
      setCamoSelection(s.id, 'winter');
      const repaint = clock.track(applyCamoPatternsChunked({ onlySpecIds: [s.id] }));
      await clock.release(32);
      await until(() => clock.has(16), 'real chunked albedo must be painted and paused before exposure');
      const partial = digest(current);
      assert.notDeepEqual(partial, original, 'active repaint witness must contain actual intermediate pixels');
      if (returnToA) {
        setCamoSelection(s.id, 'factory');
        clock.track(applyCamoPatternsChunked({ onlySpecIds: [s.id] }));
      }
      reply(job);
      for (let turn = 0; turn < 64; turn++) await Promise.resolve();
      assert.equal(workerSettled, false, 'worker completion must join the active repaint owner before fallback/publication');
      assert.deepEqual(digest(current), partial, 'worker cannot blit or resize between actual repaint stages');
      assert(textures.every(texture => disposed(texture) === 0));
      await clock.finish(Promise.all([pending, repaint]));
      assert.deepEqual(maps(current), textures);
      assert.deepEqual(digest(current), expected,
        `${returnToA ? 'A-B-A' : 'A-B'}: drained owner is followed by exact legacy base fallback`);
      assert.equal(jobs.length, 1, 'active-owner invalidation falls back without a second worker recipe');
    });
    current.dispose(); assert(textures.every(texture => disposed(texture) === 2));
    resetTransport();
  }

  for (const mutation of ['nested-palette', 'plateLines']) {
    const s = mutableSpec(`worker-same-pattern-${mutation}`);
    delete s.nation; // National Factory presets must not hide authored recipe changes.
    setCamoSelection(s.id, 'factory');
    const originalPatch = s.visual.patches[0], previous = mutablePixels(s);
    const mutate = () => {
      if (mutation === 'nested-palette') s.visual.patches[0] = '#bb4632';
      else s.visual.plateLines = true;
    };
    mutate(); const expected = mutablePixels(s);
    assert.notDeepEqual(expected, previous, `${mutation}: recipe mutation must affect real pixels`);
    s.visual.patches[0] = originalPatch; s.visual.plateLines = false;
    const pending = mutableBake(s), job = await nextJob(); assertMutableRequest(job, s);
    const requestSnapshot = structuredClone(job.message.request);
    mutate();
    reply(job); await finishWithReplies(pending);
    const current = visual(s, 'low', null), textures = maps(current);
    assert.deepEqual(digest(current), expected, `${mutation}: identical pattern ID cannot hide a changed recipe`);
    assert.deepEqual(job.message.request, requestSnapshot, 'request owns the original nested palette and plate policy');
    assert.equal(jobs.length, 1, 'same-pattern recipe mutation uses the guarded original fallback');
    current.dispose(); assert(textures.every(texture => disposed(texture) === 1));
    resetTransport();
  }

  {
    const s = mutableSpec('worker-null-legacy-tick-reject');
    setCamoSelection(s.id, 'factory');
    const failure = new Error('expected cancellation after failed worker await');
    let ticks = 0;
    const pending = prebakeSharedTextures(s, 4, 'low', () => { ticks++; throw failure; });
    const rejection = assert.rejects(pending, error => error === failure);
    const job = await nextJob(), capture = captureCanvasCreation();
    try {
      reply(job, 'font');
      await finishWithReplies(rejection);
    } finally { capture.restore(); }
    assert.equal(ticks, 1, 'even a null worker result honors cancellation after its real await');
    assert.equal(capture.records.length, 0, 'rejected post-worker tick prevents fallback canvas allocation/paint');
    assert.equal(discardPrebakedSharedTextures(s.id), false, 'cancellation published no mutable entry');
  }
  resetTransport();

  {
    const s = mutableSpec('worker-active-idle-legacy-tick-reject');
    setCamoSelection(s.id, 'factory');
    const current = visual(s, 'low', null), textures = maps(current), original = digest(current);
    const failure = new Error('expected cancellation after active repaint idle');
    let ticks = 0, idlePixels;
    await withCamoClock(async clock => {
      const pending = clock.track(prebakeSharedTextures(s, 4, 'ai', () => {
        if (++ticks === 2) { idlePixels = digest(current); throw failure; }
      }));
      const rejection = clock.track(assert.rejects(pending, error => error === failure));
      const job = await nextJob();
      setCamoSelection(s.id, 'winter');
      const repaint = clock.track(applyCamoPatternsChunked({ onlySpecIds: [s.id] }));
      await clock.release(32);
      await until(() => clock.has(16), 'real repaint must own its first inter-stage pause');
      const partial = digest(current);
      assert.notDeepEqual(partial, original);
      reply(job);
      for (let turn = 0; turn < 64; turn++) await Promise.resolve();
      assert.equal(ticks, 1, 'the second cancellation boundary cannot precede active-owner idle');
      assert.deepEqual(digest(current), partial, 'initial post-worker tick did not permit a write across active repaint');
      await clock.finish(Promise.all([repaint, rejection]));
      assert.equal(ticks, 2);
      assert(idlePixels, 'cancellation actually ran at the post-idle boundary');
      assert.notDeepEqual(idlePixels, original, 'active repaint completed before cancellation');
      assert.deepEqual(idlePixels[1], original[1], 'completed repaint retained the legacy base normal');
      assert.deepEqual(digest(current), idlePixels, 'rejected post-idle tick prevents any legacy base fallback write');
      assert.deepEqual(maps(current), textures); assert.equal(current.hull.map.image.width, 256);
      assert(textures.every(texture => disposed(texture) === 0), 'cancelled promotion performs no storage resize');
      assert.equal(jobs.length, 1);
    });
    current.dispose(); assert(textures.every(texture => disposed(texture) === 1));
  }
  resetTransport();

  console.log('sharedTextureWorkerLease.selftest: actual fixed/mutable worker parity, coalescing, promotion, selection races, fallback, partial allocation and lease cleanup pass');
} finally {
  disposeMaterialPainterWorker();
  for (const value of visuals) value.dispose();
  for (const value of leases) value.release();
  for (const id of mutableIds) discardPrebakedSharedTextures(id);
  setCamoBiome('verdant');
  THREE.Texture.prototype.dispose = originalDispose;
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
