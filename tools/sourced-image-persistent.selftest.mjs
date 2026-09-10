import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLegacyComposerFixture } from './sourced-image-legacy-reference.mjs';
import { parseCompositionOptions } from './sourced-image-composition-probe.mjs';
import { extractMainComposer } from './sourced-image-worker.mjs';
import { SOURCE_PERSISTENT_PROTOCOL, observePersistentSourceTransport,
  runPersistentSourceComposition, validatePersistentSourceTrial } from './sourced-image-persistent-browser.mjs';

const required = ['--out=/private/tmp/persistent-selftest-unused', '--dependency-root=/private/tmp/dependencies'];
const options = parseCompositionOptions([...required, '--mode=persistent-worker']);
assert.equal(options.pairs, 1); assert.equal(options.timeoutMs, 300000);
assert.throws(() => parseCompositionOptions([...required, '--mode=persistent-worker', '--pairs=2']));
assert.equal(parseCompositionOptions(required).pairs, 2, 'original decode defaults stay unchanged');
assert.equal(SOURCE_PERSISTENT_PROTOCOL, 'urban-sourced-image-persistent-client-v1');
const legacy = await readLegacyComposerFixture();
const extracted = extractMainComposer(legacy);
assert.ok(extracted.includes('const a = aod ? aod[i] / 255 : 1'));
assert.ok(!extracted.includes('composeAlbedoPixels'), 'reference arithmetic is independent from candidate kernel');
assert.throws(() => extractMainComposer(legacy.replace('export function composeAlbedo(', 'function removed(')));

{
  let clock = 0, nativeArgs, nativePromise;
  class NativeWorker extends EventTarget {
    constructor(...args) { super(); nativeArgs = args; this.terminated = 0; }
    postMessage(request, transfer) { this.request = request; for (const value of transfer) value.width = value.height = 0; return 17; }
    terminate() { this.terminated++; return 18; }
    receive(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
  }
  const source = { role: 'color' }, bitmap = { width: 1024, height: 512 };
  const nativeBitmap = (...args) => { assert.deepEqual(args, [source]); return nativePromise = Promise.resolve(bitmap); };
  const target = { Worker: NativeWorker, createImageBitmap: nativeBitmap };
  const observer = observePersistentSourceTransport(target, () => ++clock);
  const options = { type: 'module' }, worker = new target.Worker('/actual-worker.ts', options);
  assert.ok(worker instanceof NativeWorker); assert.deepEqual(nativeArgs, ['/actual-worker.ts', options]);
  const promise = target.createImageBitmap(source); assert.equal(promise, nativePromise);
  await promise;
  worker.receive({ type: 'ready', protocol: 'sourced-texture-composition-v1' });
  assert.equal(worker.postMessage({ requestId: 1 }, [bitmap]), 17);
  worker.receive({ type: 'complete', protocol: 'sourced-texture-composition-v1', requestId: 1, size: 1024, closedBitmaps: 1 });
  assert.equal(worker.terminate(), 18);
  const result = observer.stop();
  assert.equal(target.Worker, NativeWorker); assert.equal(target.createImageBitmap, nativeBitmap);
  assert.equal(worker.terminated, 1); assert.equal(result.workers[0].requests[0].detached, 1);
  assert.equal(result.bitmaps[0].height, 512); assert.deepEqual(result.errors, []);
  assert.equal(observer.stop(), result);
}
{
  const Worker = function () {};
  const target = { Worker };
  Object.defineProperty(target, 'createImageBitmap', { value: () => Promise.resolve({}), writable: false, configurable: false });
  assert.throws(() => observePersistentSourceTransport(target));
  assert.equal(target.Worker, Worker, 'partial observer installation restores its owned constructor');
}
{
  let adopted = 0, now = 0;
  const input = { set: 'plaster', kind: 'building', options: { tint: [1, 0.8, 0.7] } };
  const images = {}, signal = new AbortController().signal, pixels = new Uint8ClampedArray(4);
  const result = await runPersistentSourceComposition({ input, images, signal, now: () => ++now,
    compose: async (request, passedSignal) => {
      assert.equal(passedSignal, signal); assert.equal(request.images, images);
      assert.equal(request.options.separateSurface, true); assert.equal(request.includeSurface, true);
      return { requestId: 7, albedo: pixels, surface: pixels, closedBitmaps: 3 };
    }, adopt: (passed, size) => { assert.equal(passed, pixels); assert.equal(size, 1024); adopted++; return {}; } });
  assert.equal(adopted, 2); assert.equal(result.requestId, 7);
  assert.equal(result.compositionMs, null); assert.equal(result.readbackMs, null);
  await assert.rejects(runPersistentSourceComposition({ input, images, signal, compose: async () => null,
    adopt: () => assert.fail('fallback cannot masquerade as worker adoption') }), /fallback/);
}

const input = { id: 'building-urban-plaster', set: 'plaster', kind: 'building',
  images: { color: '/color.jpg', normal: '/normal.jpg', ao: '/ao.jpg', rough: '/rough.jpg' } };
function fixture(policy = 'worker') {
  const callbacks = [0, 10, 20, 30, 1030, 1040, 1050, 1060].map(callbackAt => ({ callbackAt, frameTimestamp: callbackAt }));
  return { caseId: input.id, policy, kind: input.kind, status: 'complete', size: 1024, requestedAt: 1, readyAt: 10, reuseDelayMs: 1000,
    quality: { tier: 'desktop', preset: 'high', textureSize: 1024 }, graphics: { nativeObserved: true, contextLost: false },
    images: Object.entries(input.images).map(([role, url]) => ({ role, url, width: 1024, height: 1024, requestedAt: 1, onloadAt: 9 })),
    responsiveness: { callbacks, longTasks: [], overflow: false },
    measurements: ['first', 'delayed-reuse'].map((stage, index) => {
      const startedAt = index ? 1030 : 10, endedAt = startedAt + 20;
      const callbackIntervals = callbacks.slice(1).map((value, i) => ({ start: callbacks[i].callbackAt, end: value.callbackAt,
        gapMs: value.callbackAt - callbacks[i].callbackAt })).filter(value => value.start < endedAt && value.end > startedAt);
      return { stage, startedAt, endedAt, pipelineMs: 20, imageReadyToAdoptionMs: endedAt - 10,
        requestToCompositionEndMs: endedAt - 1, compositionMs: policy === 'worker' ? null : 20,
        readbackMs: policy === 'worker' ? null : 3, workerInternalTiming: 'unavailable', adoptionMs: 2,
        requestId: index + 1, closedBitmaps: 3, mainReadbacks: policy === 'worker' ? []
          : [1, 2, 3].map(durationMs => ({ durationMs, width: 1024, height: 1024 })),
        responsiveness: { callbackIntervals, leadingCallbackAt: startedAt, trailingCallbackAt: endedAt, maxCallbackGapMs: 10 },
        outputs: ['albedo', 'surface'].map(role => ({ role, width: 1024, height: 1024, byteLength: 1024 ** 2 * 4 })) };
    }), transport: { stopped: true, errors: [], bitmaps: Array.from({ length: 6 }, () => ({ settledAt: 15, failed: false })),
      workers: [{ constructedAt: 10, readyAt: 12, terminatedAt: 1061,
        requests: [15, 1035].map((at, i) => ({ at, requestId: i + 1, bitmaps: 3, detached: 3 })),
        replies: [25, 1045].map((at, i) => ({ at, type: 'complete', requestId: i + 1, closedBitmaps: 3 })) }] } };
}
validatePersistentSourceTrial(fixture(), input); validatePersistentSourceTrial(fixture('main'), input);
for (const mutate of [
  row => { row.measurements[0].compositionMs = 0; },
  row => { row.measurements[0].mainReadbacks = [{}]; },
  row => { row.transport.workers.push(row.transport.workers[0]); },
  row => { row.transport.workers[0].requests[0].detached = 2; },
  row => { row.transport.workers[0].replies[0].closedBitmaps = 2; },
  row => { row.transport.workers[0].terminatedAt = 20; },
  row => { row.transport.bitmaps.pop(); },
  row => { row.images[0].height = 512; },
  row => { row.measurements[0].responsiveness.callbackIntervals = []; },
  row => { row.measurements[0].responsiveness.leadingCallbackAt = null; },
  row => { row.quality.textureSize = 512; },
]) { const row = fixture(); mutate(row); assert.throws(() => validatePersistentSourceTrial(row, input)); }

const browser = await readFile(new URL('./sourced-image-worker-browser.mjs', import.meta.url), 'utf8');
assert.ok(browser.includes('compose: client.tryComposeSourcedTexture'));
assert.ok(browser.includes('runtimeOwner.adoptPixels(pixels, size, albedo)'));
assert.ok(browser.includes('client?.disposeSourcedTextureCompositionWorker()'));
assert.ok(browser.indexOf('report.measurements[0].outputs = first.map(packOutput)') > browser.indexOf('report.responsiveness = observer.stop()'));
console.log('sourced-image-persistent.selftest: actual client/adopter wiring, pinned legacy reference, transparent observation, bounded CLI and fail-closed ownership passed');
