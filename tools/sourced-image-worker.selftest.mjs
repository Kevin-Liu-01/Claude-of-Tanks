import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { readLegacyComposerFixture } from './sourced-image-legacy-reference.mjs';
import { SOURCE_WORKER_PROTOCOL, extractWorkerComposer, validateWorkerReply } from './sourced-image-worker.mjs';
import { createBitmapOwner, runWorkerComposition, workerCompositionCases, validateWorkerTrial } from './sourced-image-worker-browser.mjs';
import { urbanCompositionCases } from './sourced-image-composition.mjs';
import { parseCompositionOptions } from './sourced-image-composition-probe.mjs';

const source = await readLegacyComposerFixture();
const policySource = await readFile(new URL('../src/world/sourcedTextures.ts', import.meta.url), 'utf8');
const workerSource = extractWorkerComposer(source);
assert.equal(SOURCE_WORKER_PROTOCOL, 'urban-sourced-image-worker-composition-v1');
const originalCases = await urbanCompositionCases(policySource), originalCaseSnapshot = JSON.stringify(originalCases);
const workerCases = workerCompositionCases(originalCases);
assert.equal(originalCases.length, 6); assert.equal(workerCases.length, 9);
assert.equal(JSON.stringify(originalCases), originalCaseSnapshot, 'Fixture generation never mutates the approved corpus');
assert.deepEqual(workerCases.slice(0, 6), originalCases, 'The six production cases stay unchanged');
assert.deepEqual(workerCases.slice(6).map(row => [row.id, row.set, row.missingOptional]), [
  ['terrain-urban-G-without-ao', 'grass', ['ao']],
  ['terrain-urban-G-without-rough', 'grass', ['rough']],
  ['building-urban-plaster-without-ao-rough', 'plaster', ['ao', 'rough']],
]);
assert.ok(workerCases.slice(6).every(row => row.fixture === true
  && row.missingOptional.every(role => row.images[role] === null)));
const urls = rows => [...new Set(rows.flatMap(row => Object.values(row.images).filter(Boolean)))].sort();
assert.deepEqual(urls(workerCases), urls(originalCases), 'Optional fixtures introduce no new source assets');
assert.throws(() => workerCompositionCases(originalCases.filter(row => row.set !== 'grass')));
assert.throws(() => workerCompositionCases(originalCases.filter(row => row.set !== 'plaster')));
const cliRequired = ['--out=/private/tmp/sourced-worker-selftest-unused', '--dependency-root=/private/tmp/dependencies'];
assert.equal(parseCompositionOptions(cliRequired).mode, 'decode');
assert.equal(parseCompositionOptions(cliRequired).timeoutMs, 180000);
assert.equal(parseCompositionOptions([...cliRequired, '--mode=decode']).timeoutMs, 180000);
assert.equal(parseCompositionOptions([...cliRequired, '--mode=worker']).timeoutMs, 300000);
assert.equal(parseCompositionOptions([...cliRequired, '--mode=worker', '--timeout-ms=200000']).timeoutMs, 200000);
assert.throws(() => parseCompositionOptions([...cliRequired, '--mode=unknown']));
assert.ok(!/^import /m.test(workerSource));
assert.throws(() => extractWorkerComposer(source.replace('export function composeAlbedo(', 'function missingAlbedo(')));
assert.throws(() => extractWorkerComposer(source + '\nexport function composeAlbedo('));
for (const formula of [
  'const s = Math.min(color.width, texSize(1024))',
  'const a = aod ? aod[i] / 255 : 1',
  'let r = d[i] * a * tr, g = d[i + 1] * a * tg, b = d[i + 2] * a * tb',
  'Math.max(8, Math.min(255, (rgd ? rgd[i] : 230) * roughMul))',
]) assert.ok(workerSource.includes(formula), `Production formula changed: ${formula}`);

function fakeCanvasEnvironment({ readFailure = false } = {}) {
  const canvases = [], draws = [];
  let reads = 0;
  class Bitmap {
    constructor(width = 1024, height = 1024, rgba = [100, 120, 140, 255]) {
      this.width = width; this.height = height; this.rgba = rgba; this.closeCalls = 0;
    }
    close() { this.closeCalls++; this.width = this.height = 0; }
  }
  class Canvas {
    constructor(width = 1, height = 1) {
      this.width = width; this.height = height; this.pixels = null; this.context = null;
      canvases.push(this);
    }
    getContext(kind, options = {}) {
      assert.equal(kind, '2d');
      if (this.context) return this.context;
      const canvas = this;
      this.context = {
        getContextAttributes: () => ({ willReadFrequently: options.willReadFrequently === true }),
        drawImage(image, x, y, width, height) {
          assert.equal(x, 0); assert.equal(y, 0);
          assert.equal(width, canvas.width); assert.equal(height, canvas.height);
          draws.push({ sourceWidth: image.width, sourceHeight: image.height, width, height });
          const pixels = new Uint8ClampedArray(width * height * 4);
          for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(image.rgba, offset);
          canvas.pixels = pixels;
        },
        getImageData(x, y, width, height) {
          assert.equal(x, 0); assert.equal(y, 0);
          assert.equal(width, canvas.width); assert.equal(height, canvas.height);
          if (readFailure && ++reads === 1) throw new Error('Injected native readback failure');
          return { data: canvas.pixels ? canvas.pixels.slice() : new Uint8ClampedArray(width * height * 4) };
        },
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData(image, x, y) { assert.equal(x, 0); assert.equal(y, 0); canvas.pixels = image.data.slice(); },
      };
      return this.context;
    }
  }
  return { Bitmap, Canvas, canvases, draws };
}

function startWorker(options) {
  const env = fakeCanvasEnvironment(options), messages = [], transferred = [];
  let closed = 0, clock = 0;
  const self = {
    postMessage(reply, buffers) {
      messages.push(structuredClone(reply, { transfer: buffers }));
      transferred.push(...buffers);
    },
    close() { closed++; },
  };
  new Function('self', 'ImageBitmap', 'OffscreenCanvas', 'performance', workerSource)(
    self, env.Bitmap, env.Canvas, { now: () => (clock += 0.01) });
  assert.equal(env.canvases.length, 0, 'Worker startup must not create a Canvas');
  assert.equal(messages.length, 0, 'Worker startup must not compose');
  return { ...env, self, messages, transferred, closed: () => closed };
}

const terrainOptions = { roughInAlpha: true, roughMul: 1.25, tint: [0.92, 0.92, 0.88], desat: 0, lift: 0 };
const buildingOptions = { roughInAlpha: false, tint: [0.94, 0.86, 0.74], desat: 0.16 };
function request(env, kind = 'terrain', { ao = true, rough = true, height = 1024 } = {}) {
  return { type: 'compose', requestId: 'first', input: {
    kind, options: kind === 'terrain' ? structuredClone(terrainOptions) : structuredClone(buildingOptions),
  }, images: { color: new env.Bitmap(1024, height),
    ao: ao ? new env.Bitmap(1024, height, [128, 128, 128, 255]) : null,
    rough: rough ? new env.Bitmap(1024, height, [96, 96, 96, 255]) : null } };
}

// Compare generated worker output against the complete original production
// module evaluated with the same native-surface fixture, not rewritten math.
function baseline(message) {
  const env = fakeCanvasEnvironment();
  const module = stripTypeScriptTypes(source.replace(/^import[^\n]*;\s*$/gm, '').replace(/^export /gm, ''));
  const owner = new Function('THREE', 'texSize', 'document', `${module}\nreturn { composeAlbedo, composeSurface };`)(
    {}, size => size, { createElement: tag => { assert.equal(tag, 'canvas'); return new env.Canvas(); } });
  const { input, images } = message;
  const albedo = owner.composeAlbedo(images.color, input.kind === 'terrain' ? images.ao : null, images.rough, input.options);
  const rows = [{ role: 'albedo', buffer: albedo.getContext('2d').getImageData(0, 0, 1024, 1024).data }];
  if (input.kind === 'building') {
    const surface = owner.composeSurface(images.ao, images.rough, 1024, input.options.roughMul ?? 1);
    rows.push({ role: 'surface', buffer: surface.getContext('2d').getImageData(0, 0, 1024, 1024).data });
  }
  return rows;
}

const cases = [
  ['terrain', {}], ['terrain', { ao: false }], ['terrain', { rough: false }],
  ['terrain', { ao: false, rough: false }], ['building', {}],
  ['building', { ao: false }], ['building', { rough: false }],
  ['building', { ao: false, rough: false }], ['building', { height: 512 }],
];
let canonicalReply;
for (const [kind, options] of cases) {
  const env = startWorker(), message = request(env, kind, options);
  const expected = baseline(message), bitmaps = Object.values(message.images).filter(Boolean);
  const input = { ...message.input, images: { color: 'color.jpg',
    ao: message.images.ao ? 'ao.jpg' : null, rough: message.images.rough ? 'rough.jpg' : null } };
  const handler = env.self.onmessage;
  handler({ data: message });
  assert.equal(env.messages.length, 1); assert.equal(env.closed(), 1);
  const reply = validateWorkerReply(env.messages[0], 'first', input);
  assert.equal(reply.cleanup.bitmapsClosed, bitmaps.length);
  assert.ok(bitmaps.every(bitmap => bitmap.closeCalls === 1 && bitmap.width === 0 && bitmap.height === 0));
  assert.ok(env.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  assert.ok(env.canvases.every(canvas => !Object.hasOwn(canvas.context, 'getImageData')
    || canvas.context.getImageData.name === 'getImageData'), 'Owned readback wrappers are restored');
  assert.ok(env.transferred.every(buffer => buffer.byteLength === 0), 'Output buffers really transfer');
  assert.equal(reply.timing.readbacks.length, bitmaps.length, 'Only 3/2/1 exact composer reads');
  assert.equal(reply.timing.outputReadbacks.length, expected.length, 'Necessary output readbacks recorded separately');
  for (let index = 0; index < expected.length; index++) {
    assert.equal(reply.outputs[index].role, expected[index].role);
    assert.deepEqual(new Uint8ClampedArray(reply.outputs[index].buffer), expected[index].buffer);
  }
  if (kind === 'terrain' && bitmaps.length === 3) {
    assert.deepEqual([...new Uint8ClampedArray(reply.outputs[0].buffer).slice(0, 4)], [46, 55, 62, 120]);
    canonicalReply = structuredClone(reply);
  }
  if (kind === 'building' && !message.images.ao && !message.images.rough) {
    assert.deepEqual([...new Uint8ClampedArray(reply.outputs[1].buffer).slice(0, 4)], [255, 230, 0, 255]);
  }
  if (options.height === 512) assert.ok(env.draws.every(draw => draw.sourceHeight === 512 && draw.width === 1024 && draw.height === 1024),
    'Brick source keeps the production square resize');
  handler({ data: message });
  assert.equal(env.messages.length, 1, 'A worker accepts only one job');
}

for (const mutate of [
  message => { message.type = 'unknown'; },
  message => { message.requestId = ''; },
  message => { message.requestId = 'x'.repeat(129); },
  message => { message.input.kind = 'other'; },
  message => { message.input.options.roughInAlpha = false; },
  message => { message.input.options.roughMul = NaN; },
  message => { message.input.options.unknown = 1; },
  message => { message.images.color.width = 512; },
  message => { message.images.color.height = 100; },
  message => { message.images.color = null; },
  message => { message.images.ao = message.images.color; },
]) {
  const env = startWorker(), message = request(env);
  mutate(message);
  const bitmaps = [...new Set(Object.values(message.images).filter(value => value instanceof env.Bitmap))];
  env.self.onmessage({ data: message });
  assert.equal(env.messages[0].status, 'failed'); assert.equal(env.closed(), 1);
  assert.ok(bitmaps.every(bitmap => bitmap.closeCalls === 1));
  assert.equal(env.messages[0].cleanup.complete, true);
  assert.throws(() => validateWorkerReply(env.messages[0], 'first', message.input));
}
const failed = startWorker({ readFailure: true }), failedMessage = request(failed);
failed.self.onmessage({ data: failedMessage });
assert.equal(failed.messages[0].status, 'failed');
assert.match(failed.messages[0].error, /Injected native readback failure/);
assert.equal(failed.messages[0].cleanup.bitmapsClosed, 3);
assert.ok(failed.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
assert.equal(failed.closed(), 1);
const closeFailure = startWorker(), closeFailureMessage = request(closeFailure);
closeFailureMessage.images.color.close = () => { throw new Error('Injected bitmap close failure'); };
closeFailure.self.onmessage({ data: closeFailureMessage });
assert.equal(closeFailure.messages[0].status, 'failed');
assert.equal(closeFailure.messages[0].cleanup.complete, false);
assert.equal(closeFailure.messages[0].cleanup.bitmapsClosed, 2);
assert.equal(closeFailure.messages[0].cleanup.errors.length, 1);
assert.equal(closeFailure.closed(), 1, 'Worker closes even when explicit bitmap cleanup fails');
const malformed = startWorker();
malformed.self.onmessageerror();
assert.equal(malformed.messages[0].status, 'failed');
assert.equal(malformed.messages[0].requestId, null);
assert.equal(malformed.closed(), 1);

// The validator has no Node/module closure and rejects altered wire receipts.
const browserValidate = new Function(`return (${validateWorkerReply.toString()});`)();
assert.equal(browserValidate(canonicalReply, 'first', { kind: 'terrain' }), canonicalReply);
for (const mutate of [
  row => { row.protocol = 'wrong'; }, row => { row.requestId = 'wrong'; },
  row => { row.outputs[0].buffer = new Uint8Array(4); },
  row => { row.outputs[0].width = 512; }, row => { row.outputs[0].byteLength--; },
  row => { row.cleanup.bitmapsClosed--; }, row => { row.cleanup.canvasesCleared--; },
  row => { row.readyToTerminate = false; }, row => { row.timing.readbacks.pop(); },
  row => { row.timing.outputReadbackMs = NaN; }, row => { row.timing.transferPrepMs = -1; },
]) {
  const reply = structuredClone(canonicalReply); mutate(reply);
  assert.throws(() => browserValidate(reply, 'first', { kind: 'terrain' }));
}
assert.throws(() => browserValidate(canonicalReply, 'first', { kind: 'terrain', images: { color: 'color.jpg', ao: null, rough: 'rough.jpg' } }));

function mainBitmap() {
  return { width: 1024, height: 1024, closeCalls: 0,
    close() { this.closeCalls++; this.width = this.height = 0; } };
}
const sourceImages = { color: { role: 'color' }, ao: { role: 'ao' }, rough: { role: 'rough' } };
const successfulOwner = createBitmapOwner(async () => mainBitmap());
const prepared = await successfulOwner.prepare(sourceImages);
assert.equal(successfulOwner.transferList().length, 3);
for (const bitmap of Object.values(prepared)) bitmap.width = bitmap.height = 0;
successfulOwner.markTransferred(); successfulOwner.close(); successfulOwner.close();
assert.deepEqual(successfulOwner.snapshot(), { created: 3, closed: 0, transferred: 3,
  detached: 3, pending: 0, closeErrors: [], owned: 0, stopped: true });
assert.ok(Object.values(prepared).every(bitmap => bitmap.closeCalls === 0), 'Transferred owners must not be closed by main');

const rejectedBitmaps = [];
const rejectingOwner = createBitmapOwner(async image => {
  if (image.role === 'ao') throw new Error('Bitmap factory rejected');
  const bitmap = mainBitmap(); rejectedBitmaps.push(bitmap); return bitmap;
});
await assert.rejects(() => rejectingOwner.prepare(sourceImages), /Bitmap factory rejected/);
assert.ok(rejectedBitmaps.every(bitmap => bitmap.closeCalls === 1));
assert.equal(rejectingOwner.snapshot().owned, 0);
assert.equal(rejectingOwner.snapshot().pending, 0);

let resolveLate;
const lateBitmap = mainBitmap();
const canceledOwner = createBitmapOwner(() => new Promise(resolve => { resolveLate = resolve; }));
const latePreparation = canceledOwner.prepare({ color: sourceImages.color });
canceledOwner.close(); resolveLate(lateBitmap);
await assert.rejects(latePreparation, /Late bitmap after cancellation/);
canceledOwner.close();
assert.equal(lateBitmap.closeCalls, 1, 'Late native backing closes exactly once');
assert.deepEqual(canceledOwner.snapshot(), { created: 1, closed: 1, transferred: 0,
  detached: 0, pending: 0, closeErrors: [], owned: 0, stopped: true });

function acquisitionPorts(mode) {
  const bitmaps = [], events = { terminated: 0, revoked: 0, canceled: 0, posts: 0 };
  let clock = 0, scheduled;
  const worker = {
    postMessage(message, transfers) {
      events.posts++;
      assert.equal(message.type, 'compose'); assert.equal(message.requestId, 'first');
      assert.equal(transfers.length, 3);
      if (mode === 'post-failure') throw new Error('Injected post failure');
      for (const bitmap of transfers) bitmap.width = bitmap.height = 0;
      queueMicrotask(() => {
        if (mode === 'message-error') worker.onmessageerror?.();
        else if (mode === 'worker-error') worker.onerror?.({ message: 'Injected worker failure' });
        else worker.onmessage?.({ data: structuredClone(canonicalReply) });
      });
    },
    terminate() { events.terminated++; },
  };
  const ports = {
    now: () => (clock += 0.01),
    createBitmap: async image => {
      if (mode === 'factory-failure' && image.role === 'ao') throw new Error('Injected factory failure');
      if (mode === 'deadline') {
        queueMicrotask(() => scheduled());
        return new Promise(() => {});
      }
      const bitmap = mainBitmap(); bitmaps.push(bitmap); return bitmap;
    },
    createUrl(sourceText) { assert.equal(sourceText, workerSource); return 'blob:owned-worker-fixture'; },
    createWorker(url) { assert.equal(url, 'blob:owned-worker-fixture'); return worker; },
    revokeUrl(url) { assert.equal(url, 'blob:owned-worker-fixture'); events.revoked++; },
    schedule(callback) { scheduled = callback; return 'deadline-fixture'; },
    cancelSchedule(token) { assert.equal(token, 'deadline-fixture'); events.canceled++; },
    adopt(outputs) {
      if (mode === 'adoption-error') throw new Error('Injected adoption failure');
      return outputs.map(output => ({ role: output.role }));
    },
  };
  return { ports, events, worker, bitmaps };
}
for (const mode of ['success', 'post-failure', 'message-error', 'worker-error', 'factory-failure', 'deadline', 'adoption-error']) {
  const fixture = acquisitionPorts(mode);
  let result, failure;
  try {
    result = await runWorkerComposition({ images: sourceImages, input: { kind: 'terrain', options: terrainOptions },
      requestId: 'first', workerSource, validateReply: browserValidate, timeoutMs: 10, ports: fixture.ports });
  } catch (error) { failure = error; }
  if (mode === 'success') {
    assert.equal(failure, undefined); assert.equal(result.outputs[0].role, 'albedo');
    assert.equal(result.bitmapOwnership.transferred, 3); assert.equal(result.bitmapOwnership.detached, 3);
    assert.equal(result.bitmapOwnership.closed, 0); assert.equal(result.bitmapOwnership.owned, 0);
    assert.equal(result.lifecycle.terminationRequested, true); assert.equal(result.lifecycle.urlRevoked, true);
  } else {
    assert.ok(failure instanceof Error, `Missing ${mode} failure`);
    assert.ok(failure.compositionReceipt, 'Every acquisition failure keeps its finalized ownership receipt');
    assert.equal(failure.compositionReceipt.bitmapOwnership.owned, 0);
    assert.equal(failure.compositionReceipt.lifecycle.terminationRequested, true);
    assert.equal(failure.compositionReceipt.lifecycle.urlRevoked, true);
  }
  assert.equal(fixture.events.terminated, 1); assert.equal(fixture.events.revoked, 1); assert.equal(fixture.events.canceled, 1);
  assert.equal(fixture.worker.onmessage, null); assert.equal(fixture.worker.onerror, null); assert.equal(fixture.worker.onmessageerror, null);
  const transferred = ['success', 'message-error', 'worker-error', 'adoption-error'].includes(mode);
  assert.ok(fixture.bitmaps.every(bitmap => bitmap.closeCalls === (transferred ? 0 : 1)), 'Only untransferred bitmap owners close on main');
}

const abortController = new AbortController(), abortFixture = acquisitionPorts('success');
const deferredBitmaps = [], resolveBitmaps = [];
abortFixture.ports.createBitmap = () => new Promise(resolve => {
  const bitmap = mainBitmap(); deferredBitmaps.push(bitmap); resolveBitmaps.push(() => resolve(bitmap));
});
const abortedJob = runWorkerComposition({ images: sourceImages, input: { kind: 'terrain', options: terrainOptions },
  requestId: 'first', workerSource, validateReply: browserValidate, timeoutMs: 10,
  ports: abortFixture.ports, signal: abortController.signal });
abortController.abort();
await assert.rejects(abortedJob, /Worker composition canceled/);
assert.equal(abortFixture.events.terminated, 1); assert.equal(abortFixture.events.revoked, 1);
for (const resolve of resolveBitmaps) resolve();
await Promise.resolve(); await Promise.resolve();
assert.ok(deferredBitmaps.every(bitmap => bitmap.closeCalls === 1), 'Explicit cancellation also closes later bitmap completions');

const acquisitionSource = await readFile(new URL('./sourced-image-worker-browser.mjs', import.meta.url), 'utf8');
assert.ok(acquisitionSource.includes('createBitmap: image => createImageBitmap(image)'));
assert.ok(acquisitionSource.includes("new Worker(url, { type: 'module' })"));
assert.ok(acquisitionSource.indexOf('report.responsiveness = observer.stop(); observer = null;')
  < acquisitionSource.indexOf('report.measurements[0].outputs = first.map(packOutput)'));
assert.ok(acquisitionSource.includes('window.__STOP_SOURCE_COMPOSITION = stop'));
assert.ok(!/AudioContext|sampleRate|sinkId/.test(acquisitionSource));

/** Saved JSON shape: pixel buffers were already adopted and removed. */
function trialFixture(input = originalCases[0], policy = 'worker') {
  const roles = input.kind === 'building' ? ['albedo', 'surface'] : ['albedo'];
  const count = 1 + Number(Boolean(input.images.ao)) + Number(Boolean(input.images.rough));
  const outputShapes = () => roles.map(role => ({ role, width: 1024, height: 1024, byteLength: 4194304 }));
  return { status: 'complete', policy, caseId: input.id, kind: input.kind, size: 1024,
    requestedAt: 1, readyAt: 10, reuseDelayMs: 1000,
    quality: { tier: 'desktop', preset: 'high', textureSize: 1024 },
    graphics: { nativeObserved: true, contextLost: false },
    images: Object.entries(input.images).filter(([, url]) => url).map(([role, url]) => ({
      role, url, width: 1024, height: input.set === 'brick' ? 512 : 1024, requestedAt: 1, onloadAt: 5,
    })),
    responsiveness: { overflow: false,
      callbacks: [0, 30, 1010, 1040].map(callbackAt => ({ callbackAt, frameTimestamp: callbackAt })), longTasks: [] },
    measurements: ['first', 'delayed-reuse'].map((stage, index) => {
      const startedAt = index === 0 ? 10 : 1020, endedAt = startedAt + 10;
      const reads = Array.from({ length: count }, (_, offset) => ({ start: startedAt + offset,
        width: 1024, height: 1024, durationMs: 1 }));
      const leadingCallbackAt = index === 0 ? 0 : 1010, trailingCallbackAt = index === 0 ? 30 : 1040;
      return { stage, startedAt, endedAt, pipelineMs: 10, compositionMs: policy === 'worker' ? 5 : 10,
        readbackMs: count, imageReadyToAdoptionMs: endedAt - 10, requestToCompositionEndMs: endedAt - 1,
        mainReadbacks: policy === 'main' ? reads : [], outputs: outputShapes(),
        responsiveness: { leadingCallbackAt, trailingCallbackAt, maxCallbackGapMs: 30,
          callbackIntervals: [{ start: leadingCallbackAt, end: trailingCallbackAt, gapMs: 30 }], overlappingLongTasks: [] },
        ...(policy === 'worker' ? {
          bitmapMs: 1, workerBootstrapMs: 1, postMessageMs: 0.1, replyWaitMs: 7, adoptionMs: 1,
          bitmapOwnership: { created: count, transferred: count, detached: count, closed: 0,
            pending: 0, owned: 0, stopped: true, closeErrors: [] },
          lifecycle: { terminationRequested: true, urlRevoked: true, errors: [] },
          worker: { type: 'composition-result', protocol: SOURCE_WORKER_PROTOCOL, status: 'complete',
            requestId: stage, kind: input.kind, size: 1024, readyToTerminate: true, bitmapImagesReceived: count,
            imagePresence: { color: true, ao: !!input.images.ao, rough: !!input.images.rough },
            cleanup: { complete: true, bitmapsClosed: count, canvasesCleared: roles.length + Number(count > 1),
              contextsRestored: roles.length + Number(count > 1), errors: [] },
            timing: { compositionMs: 5, readbackMs: count, readbacks: reads,
              outputReadbackMs: 1, transferPrepMs: 0.1 }, outputs: outputShapes() },
        } : {}),
      };
    }) };
}
for (const input of workerCases) for (const policy of ['main', 'worker']) validateWorkerTrial(trialFixture(input, policy), input);
for (const mutate of [
  row => { row.status = 'failed'; }, row => { row.policy = 'decode'; }, row => { row.caseId = 'wrong'; },
  row => { row.quality.textureSize = 512; }, row => { row.images.pop(); },
  row => { row.images.find(image => image.role === 'color').height = 512; },
  row => { row.graphics.nativeObserved = false; }, row => { row.responsiveness.overflow = true; },
  row => { row.responsiveness.callbacks[1].callbackAt = -1; },
  row => { row.responsiveness.longTasks.push({ startTime: 1, duration: NaN }); },
  row => { row.measurements[0].pipelineMs = 9; }, row => { row.measurements[0].compositionMs = NaN; },
  row => { row.measurements[0].outputs[0].byteLength--; }, row => { row.measurements[0].outputs[0].role = 'surface'; },
  row => { row.measurements[0].responsiveness.leadingCallbackAt = null; },
  row => { row.measurements[0].responsiveness.trailingCallbackAt = null; },
  row => { row.measurements[0].responsiveness.callbackIntervals = []; },
  row => { row.measurements[0].responsiveness.maxCallbackGapMs = 29; },
  row => { row.measurements[0].worker.timing.readbacks.pop(); },
  row => { row.measurements[0].mainReadbacks.push({ width: 1024, height: 1024, durationMs: 1 }); },
  row => { row.measurements[0].bitmapOwnership.detached--; },
  row => { row.measurements[0].bitmapOwnership.owned = 1; },
  row => { row.measurements[0].bitmapOwnership.pending = 1; },
  row => { row.measurements[0].bitmapOwnership.closeErrors.push('failure'); },
  row => { row.measurements[0].lifecycle.terminationRequested = false; },
  row => { row.measurements[0].lifecycle.urlRevoked = false; },
  row => { row.measurements[0].worker.cleanup.complete = false; },
  row => { row.measurements[0].worker.cleanup.bitmapsClosed--; },
  row => { row.measurements[0].worker.readyToTerminate = false; },
]) {
  const row = trialFixture(); mutate(row); assert.throws(() => validateWorkerTrial(row, originalCases[0]));
}
const brickInput = originalCases.find(row => row.set === 'brick'), badBrick = trialFixture(brickInput);
badBrick.images.find(image => image.role === 'color').height = 1024;
assert.throws(() => validateWorkerTrial(badBrick, brickInput), /Native input dimensions/);
const badMain = trialFixture(originalCases[0], 'main'); badMain.measurements[0].mainReadbacks.pop();
assert.throws(() => validateWorkerTrial(badMain, originalCases[0]), /composer readbacks/);
console.log('sourced-image-worker: exact formulas, nine-case corpus, optional maps, brick resize, transfers, ownership, cancellation and admission passed');
