import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { Vector3, PerspectiveCamera } from 'three';
import { outputResolution } from '../src/engine/resolutionPolicy.ts';
import { baseDynamicScale, internalPixelRatio } from '../src/engine/renderScalePolicy.ts';
import { PRESETS } from '../src/engine/quality.ts';
import { MOTION_CASES, MOTION_PROTOCOL, validateMotionReceipt, validateLiveSequence,
  contextOptions, validateOneCaseGate, captureRenderedFrames, startLivePan, decodeFramePng,
  bounded, runMotionProbe, closeBrowserOwner, finishCaseContext, motionAcquisitionHash, validateEffectiveQuality,
  startResizeObservation, finishResizeObservation, observeViewportResize } from './environment-motion-probe.mjs';

assert.equal(MOTION_CASES.length, 9);
assert.equal(new Set(MOTION_CASES.map(row => `${row.device}/${row.mapId}`)).size, 9);
assert.deepEqual(MOTION_CASES.filter(row => row.scope).map(row => `${row.device}/${row.mapId}`),
  ['desktop/winter', 'tablet/mangrove', 'phone/urban']);

function receiptFor(testCase) {
  const { width, height, dpr } = testCase;
  const camera = new PerspectiveCamera(55, width / height, 0.5, 4000);
  const box = { client: [width, height] };
  const output = outputResolution({ width, height, devicePixelRatio: dpr, mobile: testCase.tier === 'mobile' });
  const dynScale = baseDynamicScale(output.pixelRatio, PRESETS[testCase.preset]);
  const renderScale = Number(internalPixelRatio(output.pixelRatio, PRESETS[testCase.preset], dynScale).toFixed(3));
  return { mapId: testCase.mapId, playerSpecId: 'm1a2', phase: 'battle', shotMode: false,
    externalActive: true, scoped: false, viewport: [width, height], canvasCss: [width, height], dpr,
    aspect: camera.aspect, projection: camera.projectionMatrix.toArray(), zoom: 1, view: null, filmOffset: 0,
    fov: 55, near: 0.5, far: 4000, requested: testCase, preset: testCase.preset, contextLost: false,
    output, backing: [output.bufferWidth, output.bufferHeight], terrainClearance: 6.2,
    gpuUnmasked: true, gpu: 'ANGLE (Apple, Apple M2, OpenGL 4.1)',
    outputPixelRatio: output.pixelRatio, renderScale, dynScale, perfTrim: 0, postAA: 'smaa-high+fsr1',
    layout: { document: box, app: box, canvas: box,
      visualViewport: { width, height, scale: 1, offsetLeft: 0, offsetTop: 0 },
      storedDesktopPreset: 'high', storedMobilePreset: 'mobile-high' } };
}
for (const testCase of MOTION_CASES) {
  assert.deepEqual(validateMotionReceipt(receiptFor(testCase), testCase), []);
  const options = contextOptions(testCase, 'http://127.0.0.1:5876', '/fresh/video');
  assert.equal(options.deviceScaleFactor, testCase.dpr);
  assert.equal(options.storageState.origins[0].localStorage.length, 3);
  assert.equal(options.recordVideo.dir, '/fresh/video');
  assert.ok(options.recordVideo.size.width >= testCase.width);
  assert.equal(options.isMobile, testCase.tier === 'mobile');
}
const testCase = MOTION_CASES.find(row => row.device === 'desktop' && row.mapId === 'winter'), receipt = receiptFor(testCase);
for (const bad of [{ shotMode: true }, { phase: 'shot' }, { externalActive: false },
  { dpr: 2 }, { aspect: 1 }, { aspect: NaN }, { aspect: undefined }, { playerSpecId: 'm1a3' }, { terrainClearance: -1 },
  { contextLost: true }, { contextLost: undefined }, { contextLost: 0 }, { shotMode: undefined },
  { externalActive: 1 }, { view: undefined }, { backing: [2880, 1800] }, { projection: [NaN] },
  { zoom: 2 }, { filmOffset: 1 }, { view: { enabled: true } }, { fov: 56 },
  { canvasCss: [1280, 577] }, { layout: {} }, { requested: {} }, { dynScale: NaN },
  { perfTrim: 1 }, { perfTrim: undefined }, { postAA: 'none' }, { postAA: undefined },
  { dynScale: 0.99 }, { renderScale: 0.5 }, { outputPixelRatio: undefined },
  { preset: 'medium' }, { gpu: 'ANGLE (Google, SwiftShader Device)' }, { gpu: 'llvmpipe' },
  { gpu: 'software' }, { gpu: '' }, { gpuUnmasked: false }, { output: { ...receipt.output, native: false } },
  { output: { ...receipt.output, bufferWidth: 100 }, backing: [100, 900] }]) {
  assert.ok(validateMotionReceipt({ ...receipt, ...bad }, testCase).length, JSON.stringify(bad));
}
const scopeCamera = new PerspectiveCamera(7.5, 1.6, 0.5, 4000);
assert.deepEqual(validateMotionReceipt({ ...receipt, fov: 7.5, shotMode: true,
  projection: scopeCamera.projectionMatrix.toArray() }, testCase, { live: false }), []);
const mobileCase = MOTION_CASES.find(row => row.device === 'tablet');
const mobileReceipt = receiptFor(mobileCase);
assert.equal(mobileReceipt.dynScale, 1.5 / 1.7);
assert.deepEqual(validateEffectiveQuality(mobileReceipt, mobileCase), []);
assert.deepEqual(validateEffectiveQuality({ ...mobileReceipt, dynScale: 1, renderScale: 1.7 }, mobileCase), []);
assert.ok(validateEffectiveQuality({ ...mobileReceipt, dynScale: mobileReceipt.dynScale - 0.001 }, mobileCase).length);
assert.ok(validateEffectiveQuality({ ...mobileReceipt, dynScale: 1.001 }, mobileCase).length);
await assert.rejects(runMotionProbe({ root: process.cwd(), output: '/nonexistent-motion-preflight',
  cases: [testCase], expectedBuildIndexHash: 'wrong' }), /exact --expected-build-index-hash/);
await assert.rejects(bounded(new Promise(() => {}), 2, 'owned operation'), /owned operation timeout/);
const ownership = [];
const closed = await closeBrowserOwner({ close: async () => ownership.push('close'),
  kill: async () => ownership.push('kill') });
assert.equal(closed.forced, false); assert.deepEqual(ownership, ['close']);
const forced = await closeBrowserOwner({ close: () => new Promise(() => {}),
  kill: async () => ownership.push('owned-kill') }, 2);
assert.equal(forced.forced, true); assert.deepEqual(ownership, ['close', 'owned-kill']);

// Run the real final-evidence/close owner without a browser. Completed capture
// results have already been persisted; only interrupted work needs PNG recovery.
async function finalEvidenceFixture({ completed = false, partialError = false, saveError = false,
  layoutError = false, closeError = false, pageClosed = false, errors = [] } = {}) {
  const calls = [], partial = { frames: [{ label: 'start', png: 'already-captured-pixels' }] };
  const layout = { inner: [1440, 900] }, row = { errors: [...errors], receipts: ['previously-saved'] };
  const page = { isClosed: () => pageClosed, async evaluate(fn) {
    if (typeof fn === 'function') {
      calls.push('partial');
      if (partialError) throw new Error('partial unavailable');
      return partial;
    }
    calls.push('layout');
    if (layoutError) throw new Error('layout unavailable');
    return layout;
  } };
  const context = { async close() { calls.push('close'); if (closeError) throw new Error('close unavailable'); } };
  await finishCaseContext(page, context, row, value => {
    calls.push('save'); assert.equal(value, partial);
    if (saveError) throw new Error('save unavailable');
    row.receipts.push(value.frames[0].label);
  }, completed);
  return { calls, row, layout };
}
const completedEvidence = await finalEvidenceFixture({ completed: true });
assert.deepEqual(completedEvidence.calls, ['layout', 'close']);
assert.deepEqual(completedEvidence.row.receipts, ['previously-saved']);
assert.deepEqual(completedEvidence.row.finalLayout, completedEvidence.layout);
assert.equal(completedEvidence.row.contextClosed, true);
assert.deepEqual(completedEvidence.row.errors, []);
const qualityFailureEvidence = await finalEvidenceFixture({ completed: true, errors: ['quality failed'] });
assert.deepEqual(qualityFailureEvidence.calls, ['layout', 'close']);
assert.deepEqual(qualityFailureEvidence.row.errors, ['quality failed'], 'Saving every frame does not waive quality failure');
const interruptedEvidence = await finalEvidenceFixture();
assert.deepEqual(interruptedEvidence.calls, ['partial', 'save', 'layout', 'close']);
assert.deepEqual(interruptedEvidence.row.receipts, ['previously-saved', 'start']);
for (const failure of ['partialError', 'saveError']) {
  const result = await finalEvidenceFixture({ [failure]: true });
  assert.deepEqual(result.calls.slice(-2), ['layout', 'close'], `${failure} cannot suppress layout or disposal`);
  assert.equal(result.row.errors.length, 1); assert.match(result.row.errors[0], /partial evidence/);
  assert.deepEqual(result.row.finalLayout, result.layout); assert.equal(result.row.contextClosed, true);
}
const failedFinalEvidence = await finalEvidenceFixture({ partialError: true, layoutError: true });
assert.deepEqual(failedFinalEvidence.calls, ['partial', 'layout', 'close']);
assert.equal(failedFinalEvidence.row.errors.length, 2);
assert.match(failedFinalEvidence.row.errors[1], /final layout evidence/);
assert.equal(failedFinalEvidence.row.contextClosed, true);
const failedCloseEvidence = await finalEvidenceFixture({ completed: true, layoutError: true, closeError: true });
assert.deepEqual(failedCloseEvidence.calls, ['layout', 'close']);
assert.equal(failedCloseEvidence.row.errors.length, 2); assert.equal(failedCloseEvidence.row.contextClosed, undefined);
const closedPageEvidence = await finalEvidenceFixture({ pageClosed: true });
assert.deepEqual(closedPageEvidence.calls, ['close']); assert.equal(closedPageEvidence.row.contextClosed, true);

// Execute the actual browser callback with an owned fake render loop. No GPU or
// timing certification: prove dt is forwarded, camera RAF stays live, images are
// captured in the render callback, and every success/failure restores ownership.
function fakeBrowser({ manualEncoding = false } = {}) {
  let now = 0, nextRaf = 0;
  const rafs = new Map(), submitted = [], blobs = [], readers = [], argumentsSeen = [];
  const state = { base: [0, 10, 0], yaw: 0, pitch: 0, durationMs: 8000,
    yawSpan: 40 * Math.PI / 180, lateralM: 6, progress: 0, frames: 0, done: false };
  const D = { game: { timeS: 1 }, camera: { position: new Vector3(0, 10, 0) },
    rig: { setExternalPose(position) { D.camera.position.copy(position); } },
    quality: { resolvePresetName: () => 'high' }, renderer: { info: { render: { frame: 0 } }, getPixelRatio: () => 1,
      domElement: { dataset: { renderScale: '1.000', postAa: 'smaa-high+fsr1' },
        toBlob(callback, type) {
          assert.equal(submitted.at(-1), now); assert.equal(type, 'image/png');
          const blob = { pixelTimestamp: now }, request = { blob, deliver: () => callback(blob), callback };
          blobs.push(request);
          if (!manualEncoding) queueMicrotask(request.deliver);
        },
        toDataURL() { throw new Error('Synchronous PNG compression must never run'); } } },
    post: { dynScale: 1, perfTrim: 0, render(dt, ...extra) { assert.equal(this, D.post); argumentsSeen.push([dt, ...extra]); submitted.push(now);
      D.game.timeS += dt; D.renderer.info.render.frame++; return 'render-return-value'; } } };
  class Reader {
    constructor() { this.aborted = false; readers.push(this); }
    readAsDataURL(blob) {
      this.blob = blob;
      if (!manualEncoding) queueMicrotask(() => this.complete());
    }
    complete() { this.result = `data:image/png;base64,frame-${this.blob.pixelTimestamp}`; this.onload?.(); }
    abort() { this.aborted = true; this.onabort?.(); }
  }
  const original = D.post.render;
  const sandbox = { window: { __DEBUG: D, __ENV_MOTION: state }, performance: { now: () => now },
    setTimeout, clearTimeout, FileReader: Reader, requestAnimationFrame(fn) { rafs.set(++nextRaf, fn); return nextRaf; },
    cancelAnimationFrame(id) { rafs.delete(id); }, motionReceipt: () => ({ ...receipt,
      pan: { ...state }, timestamp: now, renderFrame: D.renderer.info.render.frame, gameTimeS: D.game.timeS }) };
  vm.createContext(sandbox);
  vm.runInContext(`globalThis.startLivePan = ${startLivePan.toString()};
    globalThis.capture = ${captureRenderedFrames.toString()};
    globalThis.observe = ${startResizeObservation.toString()};
    globalThis.finishObservation = ${finishResizeObservation.toString()};`, sandbox);
  const advance = (time, dt, wallDt = 'forwarded') => {
    now = time;
    const callbacks = [...rafs.values()]; rafs.clear();
    for (const callback of callbacks) callback(time);
    return D.post.render(dt, wallDt);
  };
  return { sandbox, D, original, advance, rafs, blobs, readers, argumentsSeen };
}
const fake = fakeBrowser();
const pending = fake.sandbox.capture({ pan: true });
fake.advance(0, 0.016); fake.advance(4000, 4); fake.advance(8000, 4);
const captured = await pending;
assert.deepEqual(Array.from(captured.frames, frame => frame.label), ['start', 'mid', 'end']);
assert.equal(captured.positiveDtS, 8.016);
assert.equal(captured.frames[1].receipt.pan.progress, 0.5);
assert.equal(fake.D.post.render, fake.original);
assert.equal(fake.sandbox.window.__ENV_CAPTURE_CLEANUP, undefined);
assert.equal(fake.rafs.size, 0);
assert.deepEqual(fake.argumentsSeen, [[.016, 'forwarded'], [4, 'forwarded'], [4, 'forwarded']],
  'all post arguments and their original receiver remain unchanged');
assert.equal(validateLiveSequence(captured, testCase).length, 0);
assert.throws(() => fake.sandbox.startLivePan(), /already started/);
assert.deepEqual(captured.frames.map(frame => frame.png),
  vm.runInContext('["data:image/png;base64,frame-0", "data:image/png;base64,frame-4000", "data:image/png;base64,frame-8000"]', fake.sandbox));

// Pixel snapshots and receipts are synchronous; PNG delivery can be delayed
// and arbitrarily reordered without stalling the loop or changing frame order.
const asynchronous = fakeBrowser({ manualEncoding: true });
const asynchronousCapture = asynchronous.sandbox.capture({ pan: true });
assert.equal(asynchronous.advance(0, 0.016), 'render-return-value');
asynchronous.advance(2000, 2); asynchronous.advance(4000, 2); asynchronous.advance(8000, 4);
assert.equal(asynchronous.blobs.length, 3, 'Only the three authored pan snapshots');
assert.equal(asynchronous.readers.length, 0, 'Blob callbacks have not run in the render wrapper');
assert.equal(asynchronous.D.post.render, asynchronous.original, 'Release renderer before PNG encoding completes');
assert.equal(asynchronous.rafs.size, 0);
assert.equal(typeof asynchronous.sandbox.window.__ENV_CAPTURE_CLEANUP, 'function', 'Keep asynchronous cancel ownership');
assert.throws(() => asynchronous.sandbox.capture(), /already active/);
asynchronous.advance(9000, 1); // Ordinary game rendering continues while PNG work remains.
asynchronous.blobs[2].deliver(); asynchronous.blobs[0].deliver(); asynchronous.blobs[1].deliver();
asynchronous.advance(9500, .5);
asynchronous.readers[2].complete(); asynchronous.readers[0].complete(); asynchronous.readers[1].complete();
const asynchronousResult = await asynchronousCapture;
assert.deepEqual(Array.from(asynchronousResult.frames, frame => [frame.label, frame.receipt.timestamp, frame.png]), [
  ['start', 0, 'data:image/png;base64,frame-0'],
  ['mid', 4000, 'data:image/png;base64,frame-4000'],
  ['end', 8000, 'data:image/png;base64,frame-8000'],
]);
assert.equal(asynchronousResult.submittedFrames, 4);
assert.equal(asynchronousResult.positiveDtS, 8.016);
assert.deepEqual(Array.from(asynchronousResult.frames, frame => ({ ...frame.captureTiming })), [0, 4000, 8000].map(time => ({
  receiptAtMs: time, toBlobStartedAtMs: time, toBlobReturnedAtMs: time,
  blobCallbackAtMs: 9000, dataUrlReadStartedAtMs: 9000, dataUrlReadyAtMs: 9500,
})), 'actual snapshot, asynchronous Blob and FileReader timestamps do not conflate capture with encoding');
assert.equal(asynchronous.sandbox.window.__ENV_CAPTURE_CLEANUP, undefined);
assert.equal(validateLiveSequence(asynchronousResult, testCase).length, 0);
for (const mutate of [value => { value.frames[1].receipt.pan.progress = 1; },
  value => { value.frames[2].receipt.gameTimeS = value.frames[0].receipt.gameTimeS; },
  value => { value.positiveDtS = 0; }, value => { value.quality[1].perfTrim = 1; },
  value => { value.quality[1].dynScale = 0.99; }, value => { value.quality[1].postAA = undefined; },
  value => { value.submittedFrames = 99; }, value => { value.quality.pop(); },
  value => { value.quality.push({ preset: 'medium' }); },
  value => { value.frames[1].capturedAfterRealRender = false; }]) {
  const bad = structuredClone(captured); mutate(bad);
  assert.ok(validateLiveSequence(bad, testCase).length);
}
const transient = fakeBrowser(), transientCapture = transient.sandbox.capture({ pan: true });
transient.advance(0, 0.016);
transient.D.post.perfTrim = 1; transient.advance(2000, 2);
transient.D.post.perfTrim = 0; transient.advance(4000, 2); transient.advance(8000, 4);
const transientResult = await transientCapture;
assert.equal(transientResult.quality.length, 4);
assert.equal(transientResult.quality[1].perfTrim, 1);
assert.ok(validateLiveSequence(transientResult, testCase).length, 'Brief relief between PNGs must fail');
const timed = fakeBrowser();
await assert.rejects(timed.sandbox.capture({ timeoutMs: 2 }), /rendered-frame acquisition timeout/);
assert.equal(timed.D.post.render, timed.original);
const throwing = fakeBrowser();
throwing.D.post.render = () => { throw new Error('GPU render failure'); };
const failed = throwing.sandbox.capture(); throwing.D.post.render(0.016);
await assert.rejects(failed, /GPU render failure/);
assert.equal(throwing.sandbox.window.__ENV_CAPTURE_CLEANUP, undefined);
const owned = fakeBrowser();
const cancelled = owned.sandbox.capture(); owned.sandbox.window.__ENV_CAPTURE_CLEANUP();
await assert.rejects(cancelled, /cancelled/); assert.equal(owned.D.post.render, owned.original);

const blobTimeout = fakeBrowser({ manualEncoding: true });
const blobTimed = blobTimeout.sandbox.capture({ timeoutMs: 2 }); blobTimeout.advance(0, 0.016);
await assert.rejects(blobTimed, /rendered-frame acquisition timeout/);
blobTimeout.blobs[0].deliver();
assert.equal(blobTimeout.readers.length, 0, 'Late Blob delivery cannot create a reader after timeout');
assert.equal(blobTimeout.sandbox.window.__ENV_CAPTURE_RESULT.frames[0].png, undefined);

const readTimeout = fakeBrowser({ manualEncoding: true });
const readTimed = readTimeout.sandbox.capture({ timeoutMs: 2 }); readTimeout.advance(0, 0.016); readTimeout.blobs[0].deliver();
await assert.rejects(readTimed, /rendered-frame acquisition timeout/);
assert.equal(readTimeout.readers[0].aborted, true);
assert.equal(readTimeout.readers[0].onload, null);
readTimeout.readers[0].complete();
assert.equal(readTimeout.sandbox.window.__ENV_CAPTURE_RESULT.frames[0].png, undefined);

const cancelRead = fakeBrowser({ manualEncoding: true });
const cancelledRead = cancelRead.sandbox.capture(); cancelRead.advance(0, 0.016); cancelRead.blobs[0].deliver();
cancelRead.sandbox.window.__ENV_CAPTURE_CLEANUP();
await assert.rejects(cancelledRead, /cancelled/);
assert.equal(cancelRead.readers[0].aborted, true);
assert.equal(cancelRead.D.post.render, cancelRead.original);
assert.equal(cancelRead.sandbox.window.__ENV_CAPTURE_CLEANUP, undefined);

for (const failure of ['null-blob', 'read-error', 'read-abort', 'invalid-data', 'to-blob-throw']) {
  const broken = fakeBrowser({ manualEncoding: true });
  if (failure === 'to-blob-throw') broken.D.renderer.domElement.toBlob = () => { throw new Error('Snapshot failure'); };
  const brokenCapture = broken.sandbox.capture(); broken.advance(0, 0.016);
  if (failure === 'null-blob') broken.blobs[0].callback(null);
  else if (failure !== 'to-blob-throw') {
    broken.blobs[0].deliver();
    const reader = broken.readers[0];
    if (failure === 'read-error') { reader.error = new Error('Blob read failure'); reader.onerror(); }
    if (failure === 'read-abort') reader.onabort();
    if (failure === 'invalid-data') { reader.result = ''; reader.onload(); }
  }
  await assert.rejects(brokenCapture, /no Blob|read failure|read aborted|invalid data|Snapshot failure/);
  assert.equal(broken.D.post.render, broken.original);
  assert.equal(broken.sandbox.window.__ENV_CAPTURE_CLEANUP, undefined);
  assert.equal(broken.sandbox.window.__ENV_CAPTURE_RESULT.frames[0].png, undefined);
}

// The resize observer starts before browser emulation, forwards raw wall delta
// verbatim and stops sampling at the same existing PNG snapshot, not after encode.
const resizeFake = fakeBrowser({ manualEncoding: true });
resizeFake.sandbox.observe({ label: 'resize-alternate' });
const observerRender = resizeFake.D.post.render;
Object.assign(resizeFake.D.renderer.domElement.dataset,
  { frameEmaMs: '19.40', dynBudgetMs: '16.67', fps: '50.2', fpsBaseline: '59.9' });
resizeFake.advance(1, .1, .5);
resizeFake.advance(2, .1, .12);
resizeFake.advance(3, 0, 0);
resizeFake.D.post.render(.016); // An old/manual caller truly omits wall dt.
resizeFake.D.post.dynScale = .91; resizeFake.D.renderer.domElement.dataset.renderScale = '1.365';
const resizeCapture = resizeFake.sandbox.capture({ label: 'resize-alternate' });
assert.equal(resizeFake.advance(4, .016, .02), 'render-return-value');
assert.equal(resizeFake.D.post.render, observerRender, 'snapshot wrapper restores its own prior render owner');
const resizeState = resizeFake.sandbox.window.__ENV_RESIZE_OBSERVER.result;
assert.equal(resizeState.stopReason, 'snapshot'); assert.equal(resizeState.snapshotAtMs, 4);
assert.equal(resizeState.frames.length, 5);
assert.deepEqual(Array.from(resizeState.frames, f => [f.dt, f.wallDt, f.wallDtProvided]),
  [[.1, .5, true], [.1, .12, true], [0, 0, true], [.016, null, false], [.016, .02, true]],
  'hitches, bounded simulation dt, sustained overload, warm zero and missing raw input stay distinguishable');
assert.deepEqual(resizeFake.argumentsSeen, [[.1, .5], [.1, .12], [0, 0], [.016], [.016, .02]]);
assert.equal(resizeState.frames[0].frameEmaMs, 19.4); assert.equal(resizeState.frames[0].dynBudgetMs, 16.67);
assert.equal(resizeState.frames[0].fps, 50.2); assert.equal(resizeState.frames[0].fpsBaseline, 59.9);
assert.equal(resizeState.frames[4].dynScale, .91); assert.equal(resizeState.frames[4].renderScale, 1.365);
resizeFake.advance(100, .1, .1); resizeFake.blobs[0].deliver(); resizeFake.readers[0].complete();
await resizeCapture;
const finishedResize = resizeFake.sandbox.finishObservation();
assert.equal(finishedResize.frames.length, 5, 'PNG encoding/transport frames cannot lengthen the observed resize window');
assert.equal(finishedResize.restored, true); assert.equal(finishedResize.finishedAtMs, 100);
assert.equal(resizeFake.D.post.render, resizeFake.original);
assert.equal(resizeFake.sandbox.window.__ENV_RESIZE_OBSERVER, undefined);
assert.equal(resizeFake.sandbox.finishObservation(), finishedResize, 'completed scalar receipt remains available');
assert.doesNotThrow(() => JSON.stringify(finishedResize), 'no renderer/scene/material roots in retained data');
assert.equal(resizeFake.D.post.dynScale, .91, 'observer never restores, clamps or pins runtime quality');

const cappedResize = fakeBrowser();
cappedResize.sandbox.observe({ label: 'resize-alternate', maxFrames: 2 });
cappedResize.advance(0, .016, .016); cappedResize.advance(1, .016, .016); cappedResize.advance(2, .016, .016);
const cappedResult = cappedResize.sandbox.finishObservation();
assert.equal(cappedResult.frames.length, 2); assert.equal(cappedResult.truncated, true);
assert.equal(cappedResult.stopReason, 'frame-cap'); assert.equal(cappedResult.restored, true);
assert.equal(cappedResize.argumentsSeen.length, 3, 'observation cap never drops a production render');
assert.equal(cappedResult.frames[0].frameEmaMs, null, 'absent1Hz telemetry is unavailable, not zero');

const missingRaw = fakeBrowser();
missingRaw.sandbox.observe({ label: 'resize-restored' });
missingRaw.advance(0, .016, null); missingRaw.advance(1, .016, NaN);
const missingRawResult = missingRaw.sandbox.finishObservation();
assert.deepEqual(Array.from(missingRawResult.frames, f => f.wallDt), [null, null]);
assert.equal(missingRawResult.stopReason, 'closed-before-snapshot');

const timeoutResize = fakeBrowser();
timeoutResize.sandbox.observe({ label: 'resize-alternate', timeoutMs: 2 });
await new Promise(resolve => setTimeout(resolve, 8));
const timeoutResult = timeoutResize.sandbox.finishObservation();
assert.equal(timeoutResult.stopReason, 'timeout'); assert.equal(timeoutResult.restored, true);
assert.equal(timeoutResult.snapshotAtMs, null); assert.equal(timeoutResult.frames.length, 0);
assert.equal(timeoutResize.D.post.render, timeoutResize.original);

const foreignResize = fakeBrowser();
foreignResize.sandbox.observe({ label: 'resize-alternate' });
assert.throws(() => foreignResize.sandbox.observe({ label: 'resize-alternate' }), /already active/);
const resizeOwner = foreignResize.D.post.render, foreignOwner = () => 'foreign';
foreignResize.D.post.render = foreignOwner;
assert.equal(foreignResize.sandbox.finishObservation().restored, false);
assert.equal(foreignResize.D.post.render, foreignOwner, 'cleanup cannot replace another active render wrapper');
foreignResize.D.post.render = resizeOwner;
assert.equal(foreignResize.sandbox.finishObservation().restored, true);
assert.equal(foreignResize.D.post.render, foreignResize.original);
for (const bad of [{ label: 'pan' }, { label: 'resize-x', maxFrames: 0 }, { label: 'resize-x', maxFrames: 513 },
  { label: 'resize-x', timeoutMs: 0 }, { label: 'resize-x', timeoutMs: 30001 }]) {
  assert.throws(() => foreignResize.sandbox.observe(bad), /bounds/);
  assert.equal(foreignResize.D.post.render, foreignResize.original);
}

async function viewportObservationFixture({ mobile = false, captureFailure = false, observeFailure = false } = {}) {
  const size = mobile ? { ...mobileCase, width: mobileCase.height, height: mobileCase.width } : { ...testCase, dpr: 2 };
  const calls = [], row = { id: 'test', resizes: [], resizeObservations: [], errors: [] };
  const frame = { label: 'resize-alternate', receipt: receiptFor(size) }, observed = { stopReason: 'snapshot', frames: [] };
  const evaluate = async (fn, args) => {
    calls.push(fn.name);
    if (fn === startResizeObservation) { assert.equal(args.label, 'resize-alternate'); return; }
    if (fn === captureRenderedFrames) {
      if (captureFailure) throw new Error('original capture failure');
      return { frames: [frame] };
    }
    assert.equal(fn, finishResizeObservation);
    if (observeFailure) throw new Error('observer recovery failure');
    return observed;
  };
  const pending = observeViewportResize({ evaluate, testCase: mobile ? mobileCase : testCase, size,
    label: 'alternate', row, saveCapture(value) { assert.equal(value.frames[0], frame); calls.push('save'); },
    write(_name, value) { assert.equal(value, observed); calls.push('write-observation'); },
    page: { async setViewportSize(value) { assert.deepEqual(value, { width: size.width, height: size.height }); calls.push('viewport'); },
      async waitForTimeout(ms) { assert.equal(ms, 1000); calls.push('fixed-settle'); } },
    cdp: { async send(method, value) { assert.equal(method, 'Emulation.setDeviceMetricsOverride');
      assert.deepEqual(value, { width: size.width, height: size.height, deviceScaleFactor: size.dpr, mobile: false }); calls.push('browser-dpr'); } },
  });
  if (captureFailure) await assert.rejects(pending, /original capture failure/); else await pending;
  return { calls, row, observed };
}
const observedDesktop = await viewportObservationFixture();
assert.deepEqual(observedDesktop.calls, ['startResizeObservation', 'viewport', 'browser-dpr', 'fixed-settle',
  'captureRenderedFrames', 'save', 'finishResizeObservation', 'write-observation']);
assert.deepEqual(observedDesktop.row.errors, []);
assert.equal(observedDesktop.row.resizeObservations[0], observedDesktop.observed);
const observedMobile = await viewportObservationFixture({ mobile: true });
assert.deepEqual(observedMobile.calls, ['startResizeObservation', 'viewport', 'fixed-settle',
  'captureRenderedFrames', 'save', 'finishResizeObservation', 'write-observation']);
const failedViewportCapture = await viewportObservationFixture({ captureFailure: true });
assert.deepEqual(failedViewportCapture.calls.slice(-2), ['finishResizeObservation', 'write-observation']);
const failedViewportObservation = await viewportObservationFixture({ captureFailure: true, observeFailure: true });
assert.match(failedViewportObservation.row.errors[0], /observer recovery failure/);

const png = Buffer.alloc(33);
Buffer.from('89504e470d0a1a0a', 'hex').copy(png); png.writeUInt32BE(1440, 16); png.writeUInt32BE(900, 20);
const frame = { png: `data:image/png;base64,${png.toString('base64')}`, receipt };
assert.equal(decodeFramePng(frame).length, 33);
assert.throws(() => decodeFramePng({ ...frame, receipt: { ...receipt, backing: [1, 1] } }), /dimensions/);

// Bounded temporary artifact fixtures test saved-evidence recomputation, not
// image/video content or GPU execution. No boolean-only certificate is accepted.
const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cot-motion-gate-test-'));
try {
  fs.mkdirSync(path.join(evidenceRoot, 'desktop'));
  const digest = buffer => createHash('sha256').update(buffer).digest('hex');
  const liveFrames = captured.frames.map(({ label, receipt }) => ({ label, receipt, capturedAfterRealRender: true }));
  const scope = { ...receipt, shotMode: true, scoped: true, rigMode: 'SNIPER', rigZoom: 8, fov: 7.5,
    projection: scopeCamera.projectionMatrix.toArray() };
  const resizes = [receiptFor({ ...testCase, dpr: 2 }), receiptFor(testCase)];
  const frames = [...liveFrames, { label: 'scope8', receipt: scope, capturedAfterRealRender: true },
    ...resizes.map((receipt, i) => ({ label: i ? 'resize-restored' : 'resize-alternate', receipt, capturedAfterRealRender: true }))];
  for (const frame of frames) {
    const buffer = Buffer.from(png); buffer.writeUInt32BE(frame.receipt.backing[0], 16); buffer.writeUInt32BE(frame.receipt.backing[1], 20);
    frame.png = { file: `desktop/winter-${frame.label}.png`, bytes: buffer.length, sha256: digest(buffer) };
    fs.writeFileSync(path.join(evidenceRoot, frame.png.file), buffer);
  }
  const video = Buffer.from('CPU-only artifact fixture');
  fs.writeFileSync(path.join(evidenceRoot, 'desktop/winter.webm'), video);
  const oneCase = { protocol: MOTION_PROTOCOL, buildIndexHash: 'hash', acquisitionHash: motionAcquisitionHash(),
    complete: true, errors: [], browserClosed: true, serverClosed: true, lockReleased: true,
    browserCleanup: { closed: true, forced: false }, cases: [{ id: 'desktop/winter', livePass: true,
      contextClosed: true, errors: [], receipts: frames, quality: captured.quality,
      positiveDtS: captured.positiveDtS, submittedFrames: captured.submittedFrames, resizes,
      scope: { mapId: 'winter', mode: 'SNIPER', zoom: 8, fov: 7.5, scoped: true },
      video: { file: 'desktop/winter.webm', verified: true, bytes: video.length, sha256: digest(video),
        metadata: { format: { duration: '8' }, streams: [{ width: 1440, height: 900 }] } } }] };
  validateOneCaseGate(oneCase, 'hash', evidenceRoot);
  for (const mutate of [value => { value.acquisitionHash = 'old'; }, value => { value.buildIndexHash = 'other'; },
    value => { value.cases[0].receipts = []; }, value => { value.browserClosed = undefined; },
    value => { value.serverClosed = false; }, value => { value.lockReleased = false; },
    value => { value.cases[0].quality = []; }, value => { value.cases[0].scope.zoom = 1; },
    value => { value.cases[0].receipts[4].receipt.dpr = 1; }, value => { value.cases[0].resizes.pop(); },
    value => { value.cases[0].receipts[1].receipt.pan.progress = 1; },
    value => { value.cases[0].receipts[0].png.sha256 = 'bad'; }, value => { value.cases[0].video.sha256 = 'bad'; }]) {
    const bad = structuredClone(oneCase); mutate(bad);
    assert.throws(() => validateOneCaseGate(bad, 'hash', evidenceRoot));
  }
  assert.throws(() => validateOneCaseGate({ ...oneCase, cases: [{ id: 'desktop/winter', livePass: true,
    errors: [], video: { verified: true } }] }, 'hash', evidenceRoot));
  fs.unlinkSync(path.join(evidenceRoot, 'desktop/winter-mid.png'));
  assert.throws(() => validateOneCaseGate(oneCase, 'hash', evidenceRoot), /ENOENT/);
} finally { fs.rmSync(evidenceRoot, { recursive: true }); }

const source = fs.readFileSync(new URL('./environment-motion-probe.mjs', import.meta.url), 'utf8');
assert.ok(!source.includes('agent-browser'));
assert.ok(!source.includes('__SHOTS.set'));
assert.match(source, /beginSoloBattle\(\{ specId: 'm1a2', mapId, randomRoster: false/);
assert.match(source, /recordVideo: \{ dir: videoDir, size: videoSize \}/);
assert.ok(source.indexOf('const context = await browser.newContext(options)') < source.indexOf('page = await context.newPage()'));
assert.match(source, /context.close\(\)/);
assert.match(source, /video.saveAs\(target\)/);
assert.ok(!source.includes('await video.path('));
assert.match(source, /restoreHorizonArcadeCapture, row.scope.arcade/);
assert.match(source, /if \(row.errors.length\) break/);
assert.match(source, /message.type\(\) === 'error'/);
assert.ok(!source.includes('pinDynScale('));
assert.ok(!source.includes('renderer.setSize('));
assert.ok(!source.includes('setPresetName('));
assert.ok(!source.includes('.toDataURL('));
assert.match(source, /domElement\.toBlob/);
console.log('environment-motion-probe: nine-case policy, asynchronous exact-frame PNG/order, live dt, timeout/cancel/ownership and one-case gate PASS (CPU only)');
