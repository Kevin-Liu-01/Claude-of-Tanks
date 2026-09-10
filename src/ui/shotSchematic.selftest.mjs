import assert from 'node:assert/strict';
import { normalizeSchematicPixels, finishSchematicPixels, bakeSchematicSteps, validSchematicSize } from './shotSchematic.ts';
import { legacySchematic } from './shotSchematicReference.test.ts';
import { createSchematicClient, prepareSchematicFallback } from './shotSchematicClient.ts';
import { createSchematicWorkerHandler } from './shotSchematicWorker.ts';
import { createCanvas, loadImage, Image as RasterImage } from '@napi-rs/canvas';

let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const drain = steps => { let next = steps.next(); while (!next.done) next = steps.next(); return next.value; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
// napi's zero-size setters reset to 350x150, unlike browser canvas. Observe
// the actual native setter contract instead of interpreting its getter as DOM.
// Pixel rendering still uses the real native canvas, never a geometry stub.
const dimensionWrites = new WeakMap();
function trackedCanvas(width, height) {
  const canvas = createCanvas(width, height), writes = { width: [], height: [] };
  dimensionWrites.set(canvas, writes);
  for (const axis of ['width', 'height']) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(canvas), axis);
    assert.ok(descriptor?.get && descriptor?.set, `native ${axis} descriptor exists`);
    Object.defineProperty(canvas, axis, {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) { writes[axis].push(value); descriptor.set.call(this, value); },
    });
  }
  return canvas;
}
const releasedCanvas = canvas => {
  const writes = dimensionWrites.get(canvas);
  return writes?.width.at(-1) === 0 && writes?.height.at(-1) === 0;
};
const rgba = (w, h) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i++) out[i] = (i * 197 + (i >> 3) * 31) % 256;
  for (let i = 0; i < out.length; i += 4) out[i + 3] = [0, 1, 7, 8, 15, 16, 128, 216, 255][(i / 4) % 9];
  return out;
};

// Independent pre-change arithmetic, not helper-against-itself parity.
function originalNormalize(pixels) {
  let sum = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 16) continue;
    sum += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722; count++;
  }
  const mean = count ? sum / count : 128;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const luminance = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = Math.max(24, Math.min(250, 178 + (luminance - mean) * 2.1));
  }
}
function originalFinish(pixels, w, h) {
  const src = new Uint8ClampedArray(pixels), amount = .55;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] < 8) continue;
    for (let c = 0; c < 3; c++) {
      const center = src[i + c], n = off => src[i + off + 3] >= 8 ? src[i + off + c] : center;
      pixels[i + c] = center * (1 + 4 * amount) - amount * (n(-4) + n(4) + n(-w * 4) + n(w * 4));
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] < 8) continue;
    let edge = false;
    for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) {
      const nx = x + dx, ny = y + dy;
      edge = nx < 0 || ny < 0 || nx >= w || ny >= h || src[(ny * w + nx) * 4 + 3] < 8;
    }
    if (edge) { pixels[i] = pixels[i + 1] = pixels[i + 2] = 36; pixels[i + 3] = Math.max(pixels[i + 3], 216); }
  }
}
for (const [w, h] of [[1, 1], [2, 3], [17, 19], [192, 192], [368, 184], [512, 512]]) {
  const actual = rgba(w, h), expected = actual.slice();
  originalNormalize(expected); drain(normalizeSchematicPixels(actual));
  equal(actual, expected, `exact luminance RGBA ${w}x${h}`);
  originalFinish(expected, w, h); drain(finishSchematicPixels(actual, w, h));
  equal(actual, expected, `exact sharpen/outline RGBA ${w}x${h}`);
}
for (const alpha of [0, 1, 7, 8, 15, 16, 255]) {
  const actual = rgba(5, 5); for (let i = 3; i < actual.length; i += 4) actual[i] = alpha;
  const expected = actual.slice(); originalNormalize(expected); drain(normalizeSchematicPixels(actual));
  equal(actual, expected, `threshold/no-visible-pixel mean ${alpha}`);
}
check([...normalizeSchematicPixels(rgba(512, 512))].length === 128, '4096-pixel hard checkpoints in both scans');
check(!validSchematicSize(0, 1) && !validSchematicSize(Infinity, 1) && !validSchematicSize(1.2, 4), 'bad dimensions reject');

// CPU raster parity is an independent complete recipe oracle, not a native
// OffscreenCanvas certification. The browser probe is a separate required gate.
const priorDocument = globalThis.document;
globalThis.document = { createElement: () => createCanvas(1, 1) };
try {
  const source = createCanvas(53, 31), ctx = source.getContext('2d');
  const input = ctx.createImageData(53, 31); input.data.set(rgba(53, 31)); ctx.putImageData(input, 0, 0);
  const image = await loadImage(source.toBuffer('image/png'));
  for (const [width, height] of [[1, 1], [7, 13], [192, 192], [368, 184]]) {
    const original = await loadImage(legacySchematic(image, width, height));
    const expected = createCanvas(width, height), ec = expected.getContext('2d'); ec.drawImage(original, 0, 0);
    const owned = [];
    const target = drain(bakeSchematicSteps(image, 53, 31, { url: '', width, height }, (w, h) => {
      const canvas = trackedCanvas(w, h); owned.push(canvas); return canvas;
    }));
    equal(target.getContext('2d').getImageData(0, 0, width, height).data,
      ec.getImageData(0, 0, width, height).data, `independent full pipeline ${width}x${height}`);
    check(releasedCanvas(owned[0]) && !releasedCanvas(target) && target.width === width,
      'only complete target ownership transfers; both source dimensions explicitly released');
  }
  const checkpoints = [...bakeSchematicSteps(image, 53, 31, { url: '', width: 7, height: 13 }, createCanvas)].length;
  for (let stop = 0; stop <= checkpoints; stop++) {
    const owned = [], steps = bakeSchematicSteps(image, 53, 31, { url: '', width: 7, height: 13 }, (w, h) => {
      const canvas = trackedCanvas(w, h); owned.push(canvas); return canvas;
    });
    for (let i = 0; i < stop; i++) steps.next();
    steps.return(null);
    check(owned.every(releasedCanvas), `cancel explicitly releases both dimensions of every unpublished canvas at ${stop}`);
  }
} finally { if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument; }

const png = new Blob(['fixture'], { type: 'image/png' });
const request = { url: 'https://example.test/icons/tank.png', width: 192, height: 192 };
function fixture(options = {}) {
  const timers = [], workers = [], fallbacks = [];
  const ports = {
    schedule(callback, delay) { const t = { callback, delay, cancelled: false }; timers.push(t); return () => { t.cancelled = true; }; },
    worker() { const w = { onmessage: null, onerror: null, onmessageerror: null, sent: [], dead: false,
      postMessage(message) { this.sent.push(message); }, terminate() { this.dead = true; } }; workers.push(w); return w; },
    async fallback(r, signal) { fallbacks.push({ request: r, signal }); return png; },
    async dataUrl() { return 'data:image/png;base64,fixture'; },
    ...options,
  };
  const client = createSchematicClient(ports, { timeoutMs: 100, idleMs: 5, maxPending: 3 });
  const respond = (w = workers.at(-1), extra = {}) => w.onmessage?.({ data: { ...w.sent.at(-1), blob: png, ...extra } });
  return { client, ports, timers, workers, fallbacks, respond };
}
{
  const f = fixture(), mutable = { ...request };
  const first = f.client.get('a', mutable), second = f.client.get('b', request);
  check(first === f.client.get('a', request), 'same key coalesces exact promise');
  mutable.width = 1;
  check(f.workers[0].sent[0].request.width === 192, 'request identity snapshotted');
  check(f.workers[0].sent.length === 1 && f.timers.filter(t => t.delay === 100).length === 1, 'queued job has no running deadline');
  f.respond(); await first; await flush();
  check(f.workers[0].sent.length === 2, 'second starts only after full encode completion');
  f.respond(); equal(await second, 'data:image/png;base64,fixture', 'second queued job succeeds');
  const idle = f.timers.findLast(t => t.delay === 5 && !t.cancelled);
  const third = f.client.get('c', request); idle.callback();
  check(!f.workers[0].dead, 'stale idle callback cannot terminate active work');
  f.respond(); await third; await flush();
  f.timers.findLast(t => t.delay === 5 && !t.cancelled).callback();
  check(f.workers[0].dead, 'idle worker shutdown releases owned worker');
  const fourth = f.client.get('d', request); check(f.workers.length === 2, 'fresh demand restarts idle worker');
  f.respond(); await fourth; f.client.dispose();
}
for (const failure of ['error', 'messageerror', 'mismatch', 'timeout', 'null']) {
  const f = fixture(), first = f.client.get('a', request), second = f.client.get('b', request);
  const worker = f.workers[0];
  if (failure === 'timeout') f.timers.find(t => t.delay === 100).callback();
  else if (failure === 'mismatch') f.respond(worker, { request: { ...request, width: 1 } });
  else if (failure === 'null') f.respond(worker, { blob: null });
  else worker[`on${failure}`]();
  check(await first && await second, `${failure}: both active and waiting requests get fallback, not poisoned cache`);
  check(worker.dead && f.fallbacks.length === 2, `${failure}: failed worker released, fallback remains serial`);
  f.client.dispose();
}
// The native parity worker leg uses a throwing fallback. A PNG-looking but
// rejected reply MUST fail that leg, never become successful fallback pixels.
for (const invalid of ['wrong-id', 'wrong-url', 'empty-png']) {
  let fallbackAttempts = 0;
  const f = fixture({ fallback: async () => { fallbackAttempts++; throw new Error('Worker proof forbids fallback'); } });
  const pending = f.client.get('strict-worker-proof', request);
  const bad = invalid === 'wrong-id' ? { id: f.workers[0].sent[0].id + 1 }
    : invalid === 'wrong-url' ? { request: { ...request, url: 'https://example.test/wrong.webp' } }
      : { blob: new Blob([], { type: 'image/png' }) };
  f.respond(f.workers[0], bad);
  equal(await pending, null, `${invalid}: invalid worker response cannot pass strict parity leg`);
  check(fallbackAttempts === 1 && f.workers[0].dead, `${invalid}: validator rejects response before any accepted worker URL`);
  f.client.dispose();
}
{
  let attempts = 0;
  const f = fixture({ worker: () => null, fallback: async () => { if (++attempts === 1) throw new Error('decode'); return png; } });
  equal(await f.client.get('a', request), null, 'failure returns raw fallback');
  check(await f.client.get('a', request), 'failed cache entry can retry successfully'); f.client.dispose();
}
{
  const f = fixture(), jobs = ['a', 'b', 'c'].map(key => f.client.get(key, request));
  equal(await f.client.get('d', request), null, 'pending memory bounded');
  const oldCallback = f.workers[0].onmessage;
  f.client.dispose(); equal(await Promise.all(jobs), [null, null, null], 'disposal settles active and queued jobs');
  oldCallback({ data: { ...f.workers[0].sent[0], blob: png } }); await flush();
  check(f.workers.length === 1 && f.workers[0].dead, 'late callback cannot revive disposed worker');
  equal(await f.client.get('e', request), null, 'disposed owner rejects new work');
}
{
  const f = fixture({ worker: () => null, fallback: () => new Promise(() => {}) });
  const pending = f.client.get('hung', request); await flush();
  f.timers.findLast(t => t.delay === 100 && !t.cancelled).callback();
  equal(await pending, null, 'fallback deadline settles even missing native callback'); f.client.dispose();
}
// Exercise REAL fallback lifetime, pausing its actual scheduler and encoder.
// Raster pixels use napi; only scheduling and the pending native callback are controlled.
{
  const saved = { document: globalThis.document, Image: globalThis.Image, scheduler: globalThis.scheduler };
  const source = createCanvas(19, 13), sourceContext = source.getContext('2d');
  sourceContext.fillStyle = '#91ae37'; sourceContext.fillRect(1, 1, 17, 11);
  const req = { url: source.toDataURL(), width: 7, height: 3 };
  const owned = [];
  let releaseYield, noteYield, encodeCallback, noteEncode;
  const yielded = new Promise(resolve => { noteYield = resolve; });
  globalThis.Image = RasterImage;
  globalThis.document = { createElement: () => { const canvas = trackedCanvas(1, 1); owned.push(canvas); return canvas; } };
  globalThis.scheduler = { yield: () => { noteYield(); return new Promise(resolve => { releaseYield = resolve; }); } };
  try {
    const owner = new AbortController(), pending = prepareSchematicFallback(req, owner.signal);
    await yielded; owner.abort(); releaseYield();
    await assert.rejects(pending, /cancelled/); checks++;
    check(owned.every(releasedCanvas), 'real fallback cancellation at first yield owns no live canvas');
    globalThis.scheduler = { yield: () => Promise.resolve() };
    const encoded = new Promise(resolve => { noteEncode = resolve; });
    globalThis.document = { createElement: () => {
      const canvas = trackedCanvas(1, 1); owned.push(canvas);
      canvas.toBlob = callback => { encodeCallback = callback; noteEncode(); }; return canvas;
    } };
    const f = fixture({ worker: () => null, fallback: prepareSchematicFallback });
    const first = f.client.get('real-encode', req);
    await encoded;
    f.timers.findLast(t => t.delay === 100 && !t.cancelled).callback();
    equal(await first, null, 'real pending toBlob deadline settles client'); await flush();
    check(owned.every(releasedCanvas), 'real timed-out fallback explicitly releases source and target');
    encodeCallback(png); await flush();
    const encodedAgain = new Promise(resolve => { noteEncode = resolve; });
    const second = f.client.get('real-dispose', req);
    await encodedAgain; f.client.dispose(); equal(await second, null, 'real pending encoder disposal settles client'); await flush();
    check(owned.every(releasedCanvas), 'real encoder cancellation explicitly releases all private canvases');
    encodeCallback(png); await flush();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}
{
  const replies = [];
  const handle = createSchematicWorkerHandler({ decode: async () => { throw new Error('decode'); },
    createCanvas, post: reply => replies.push(reply) });
  await handle({ id: 1, request }); await handle({ id: 2, request });
  equal(replies.map(r => [r.id, r.blob]), [[1, null], [2, null]], 'worker decode failure releases busy latch for next job');
}
console.log(`shotSchematic.selftest: ${checks} exact pixel, cooperative ownership and serial client checks passed`);
