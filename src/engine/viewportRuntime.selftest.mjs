import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';

import { createViewportRuntime } from './viewportRuntime.ts';

function createHarness({ width = 1280, height = 720, devicePixelRatio = 1,
  rendererPixelRatio = devicePixelRatio, canvasWidth = width * rendererPixelRatio,
  canvasHeight = height * rendererPixelRatio, supportsMatchMedia = true } = {}) {
  const listeners = new Map();
  const mediaQueries = [];
  const resizeOrder = [];
  const observed = [];
  const state = { disconnected: 0, intervalClears: 0, intervalStarts: 0, resizeCalls: 0, postCalls: 0, frustumCalls: 0 };
  const postSize = { width: canvasWidth / rendererPixelRatio, height: canvasHeight / rendererPixelRatio };
  let intervalCallback = null;
  let observerCallback = null;
  const container = { clientWidth: width, clientHeight: height };
  const documentElement = {};
  const renderer = {
    domElement: {
      width: canvasWidth,
      height: canvasHeight,
      parentElement: container,
    },
    pixelRatio: rendererPixelRatio,
    setPixelRatio(value) { this.pixelRatio = value; },
    setSize(nextWidth, nextHeight) {
      resizeOrder.push('renderer');
      state.resizeCalls++;
      this.domElement.width = Math.round(nextWidth * this.pixelRatio);
      this.domElement.height = Math.round(nextHeight * this.pixelRatio);
    },
    userData: {},
  };
  const camera = new PerspectiveCamera(60, canvasHeight > 0 ? canvasWidth / canvasHeight : 16 / 9, 0.5, 4000);
  const initialOwners = {
    canvas: [canvasWidth, canvasHeight], pixelRatio: rendererPixelRatio,
    aspect: camera.aspect, post: { ...postSize },
  };
  class FakeResizeObserver {
    constructor(callback) {
      observerCallback = callback;
    }
    observe(target) { observed.push(target); }
    disconnect() { state.disconnected++; }
  }
  const environment = {
    window: {
      innerWidth: width,
      innerHeight: height,
      devicePixelRatio,
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type, callback) {
        if (listeners.get(type) === callback) listeners.delete(type);
      },
    },
    documentElement,
    ResizeObserver: FakeResizeObserver,
    setInterval(callback) { state.intervalStarts++; intervalCallback = callback; return 7; },
    clearInterval(id) { assert.equal(id, 7); state.intervalClears++; intervalCallback = null; },
  };
  if (supportsMatchMedia) environment.window.matchMedia = query => {
    const callbacks = new Set();
    const media = {
      media: query, callbacks,
      addEventListener(type, callback) { assert.equal(type, 'change'); callbacks.add(callback); },
      removeEventListener(type, callback) { assert.equal(type, 'change'); callbacks.delete(callback); },
      dispatch() { for (const callback of [...callbacks]) callback(); },
    };
    mediaQueries.push(media);
    return media;
  };
  const runtime = createViewportRuntime({
    container,
    renderer,
    camera,
    post: { setSize(nextWidth, nextHeight) {
      resizeOrder.push('post');
      state.postCalls++;
      assert.equal(nextWidth, container.clientWidth || environment.window.innerWidth);
      assert.equal(nextHeight, container.clientHeight || environment.window.innerHeight);
      assert.equal(camera.aspect, nextWidth / nextHeight, 'camera is resized before post');
      assert.equal(renderer.domElement.width, Math.round(nextWidth * renderer.pixelRatio));
      assert.equal(renderer.domElement.height, Math.round(nextHeight * renderer.pixelRatio));
      postSize.width = nextWidth;
      postSize.height = nextHeight;
    } },
    lighting: { updateFrustums() {
      resizeOrder.push('frustums'); state.frustumCalls++;
      assert.equal(postSize.width / postSize.height, camera.aspect, 'post is resized before shadows');
    } },
    environment,
    resizeRenderer(liveRenderer, liveCamera) {
      const nextWidth = container.clientWidth || environment.window.innerWidth;
      const nextHeight = container.clientHeight || environment.window.innerHeight;
      liveRenderer.setPixelRatio(environment.window.devicePixelRatio);
      liveRenderer.setSize(nextWidth, nextHeight);
      liveCamera.aspect = nextWidth / nextHeight;
      liveCamera.updateProjectionMatrix();
      resizeOrder.push('camera');
    },
  });
  return {
    runtime,
    state,
    container,
    renderer,
    camera,
    initialOwners,
    postSize,
    listeners,
    observed,
    environment,
    mediaQueries,
    resizeOrder,
    runInterval: () => intervalCallback?.(),
    runObserver: () => observerCallback?.([], null),
  };
}

const RESIZE_ORDER = ['renderer', 'camera', 'post', 'frustums'];

for (const options of [
  { width: 1920, height: 1080, canvasWidth: 1280, canvasHeight: 577 },
  { width: 1920, height: 1080, devicePixelRatio: 2, rendererPixelRatio: 1 },
  { width: 1920, height: 1080 },
]) {
  // No resize/media/frame callbacks: the owner must reconcile an earlier
  // renderer snapshot at construction, even when both dimensions are positive.
  const h = createHarness(options);
  if (options.canvasWidth) {
    assert.deepEqual(h.initialOwners.canvas, [1280, 577]);
    assert.equal(h.initialOwners.aspect, 1280 / 577);
    assert.deepEqual(h.initialOwners.post, { width: 1280, height: 577 });
  }
  if (options.rendererPixelRatio) assert.equal(h.initialOwners.pixelRatio, 1);
  const dpr = options.devicePixelRatio || 1;
  assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [1920 * dpr, 1080 * dpr]);
  assert.equal(h.renderer.pixelRatio, dpr);
  assert.equal(h.camera.aspect, 16 / 9);
  const projection = h.camera.projectionMatrix.elements;
  assert.ok(Math.abs(projection[5] / projection[0] - 16 / 9) < 1e-12,
    'the actual camera projection is repaired, not just its aspect field');
  assert.deepEqual(h.postSize, { width: 1920, height: 1080 });
  assert.deepEqual(h.resizeOrder, RESIZE_ORDER);
  assert.equal(h.state.intervalStarts, 0);
  assert.deepEqual(h.observed, []);
  assert.equal(h.runtime.isRecovering(), false);
  h.listeners.get('resize')();
  h.mediaQueries[0].dispatch();
  assert.equal(h.runtime.syncPixelRatio(), false);
  assert.equal(h.state.resizeCalls, 1, 'startup receipt coalesces unchanged notifications');
  h.runtime.dispose();
}

{
  const h = createHarness({ width: 1440, height: 900 });
  // No synthetic browser events: reproduce the observed1→2→1 change in the
  // actual DPR value while window resize and MQL listeners remain silent.
  assert.equal(h.runtime.syncPixelRatio(), false, 'the first frame adds no resize after startup reconciliation');
  for (const dpr of [2, 1]) {
    h.environment.window.devicePixelRatio = dpr;
    assert.equal(h.runtime.syncPixelRatio(), true);
    assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [1440 * dpr, 900 * dpr]);
    assert.equal(h.camera.aspect, 1.6);
    assert.equal(h.runtime.syncPixelRatio(), false);
  }
  assert.deepEqual(h.resizeOrder, [...RESIZE_ORDER, ...RESIZE_ORDER, ...RESIZE_ORDER]);
  assert.equal(h.state.intervalStarts, 0, 'silent DPR recovery starts no polling timer');
  assert.equal(h.mediaQueries.filter(query => query.callbacks.size).length, 1);
  for (const key of ['clientWidth', 'clientHeight']) Object.defineProperty(h.container, key,
    { get() { assert.fail('unchanged-DPR hot path must not read layout'); } });
  for (const key of ['innerWidth', 'innerHeight']) Object.defineProperty(h.environment.window, key,
    { get() { assert.fail('unchanged-DPR hot path must not read window dimensions'); } });
  const queries = h.mediaQueries.length;
  for (let frame = 0; frame < 100; frame++) assert.equal(h.runtime.syncPixelRatio(), false);
  assert.equal(h.mediaQueries.length, queries, 'unchanged frames create no new media queries');
  h.runtime.dispose();
  h.environment.window.devicePixelRatio = 3;
  assert.equal(h.runtime.syncPixelRatio(), false, 'disposed synchronization is inert before reading layout');
}

{
  const h = createHarness({ width: 0, height: 0, canvasWidth: 0, canvasHeight: 0 });
  h.environment.window.devicePixelRatio = 2;
  h.mediaQueries[0].dispatch();
  assert.equal(h.runtime.syncPixelRatio(), false);
  assert.equal(h.state.resizeCalls, 0);
  h.container.clientWidth = 1024; h.container.clientHeight = 640;
  assert.equal(h.runtime.syncPixelRatio(), true,
    're-armed MQL density is not confused with successfully applied density');
  assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [2048, 1280]);
  assert.equal(h.runtime.isRecovering(), false, 'successful sync completes the existing layout recovery');
  h.runInterval();
  assert.equal(h.state.resizeCalls, 1, 'the retired recovery timer cannot duplicate the repair');
  h.runtime.dispose();
}

{
  const h = createHarness();
  h.environment.window.devicePixelRatio = 2;
  h.mediaQueries[0].dispatch();
  assert.equal(h.runtime.syncPixelRatio(), false, 'delivered events and frame fallback never double-apply');
  h.environment.window.devicePixelRatio = 1;
  assert.equal(h.runtime.syncPixelRatio(), true);
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 3, 'late resize after silent repair remains coalesced');
  h.runtime.dispose();
}

{
  const h = createHarness({ width: 1440, height: 900 });
  assert.equal(h.mediaQueries[0].media, '(resolution: 1dppx)');
  assert.equal(h.state.resizeCalls, 1, 'startup reconciles all size owners once');
  const initialQuery = h.mediaQueries[0];
  const queuedInitialEvent = [...initialQuery.callbacks][0];
  h.environment.window.devicePixelRatio = 2;
  initialQuery.dispatch();
  assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [2880, 1800],
    'same CSS viewport at DPR2 updates actual backing dimensions');
  assert.equal(h.camera.aspect, 1.6, 'pixel-density-only resize preserves camera aspect');
  assert.deepEqual(h.resizeOrder, [...RESIZE_ORDER, ...RESIZE_ORDER],
    'DPR changes use the same coordinated viewport owners and order');
  assert.equal(initialQuery.callbacks.size, 0, 'old resolution listener is detached');
  assert.equal(h.mediaQueries[1].media, '(resolution: 2dppx)');
  queuedInitialEvent();
  h.mediaQueries[1].dispatch();
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 2, 'late and unchanged-density notifications add no resizes');
  h.environment.window.devicePixelRatio = 1;
  h.mediaQueries[1].dispatch();
  assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [1440, 900],
    'DPR round trip returns to the original backing dimensions');
  assert.equal(h.state.postCalls, 3);
  assert.equal(h.state.frustumCalls, 3);
  assert.equal(h.mediaQueries.filter(query => query.callbacks.size).length, 1,
    'only one live density listener survives repeated changes');
  const queuedFinalEvent = [...h.mediaQueries.at(-1).callbacks][0];
  h.runtime.dispose();
  h.environment.window.devicePixelRatio = 2;
  queuedFinalEvent();
  assert.equal(h.state.resizeCalls, 3, 'queued media notifications after disposal cannot mutate owners');
  assert.ok(h.mediaQueries.every(query => query.callbacks.size === 0));
}

{
  const h = createHarness();
  const queuedMediaEvent = [...h.mediaQueries[0].callbacks][0];
  h.environment.window.devicePixelRatio = 2;
  h.listeners.get('resize')();
  queuedMediaEvent();
  assert.equal(h.state.resizeCalls, 2, 'window-resize-first re-arms DPR without duplicate work');
  assert.equal(h.mediaQueries.at(-1).media, '(resolution: 2dppx)');
  h.runtime.dispose();
}

{
  const h = createHarness({ width: 0, height: 0, canvasWidth: 0, canvasHeight: 0 });
  h.environment.window.devicePixelRatio = 2;
  h.mediaQueries[0].dispatch();
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 0, 'DPR events cannot apply a zero-size camera projection');
  assert.equal(h.runtime.isRecovering(), true, 'density changes leave initial-layout recovery armed');
  assert.equal(h.mediaQueries.at(-1).media, '(resolution: 2dppx)');
  h.container.clientWidth = 1024;
  h.container.clientHeight = 640;
  h.runObserver();
  assert.equal(h.camera.aspect, 1.6);
  assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [2048, 1280]);
  assert.equal(h.runtime.isRecovering(), false);
  h.runtime.dispose();
}

{
  const h = createHarness();
  h.runtime.apply();
  h.runtime.apply();
  assert.equal(h.state.resizeCalls, 3, 'explicit apply remains a force-sync for restoration callers');
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 3, 'only redundant browser notifications are coalesced');
  h.container.clientWidth = 1600;
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 4, 'real layout changes are never suppressed');
  h.runtime.dispose();
}

{
  const h = createHarness({ supportsMatchMedia: false });
  h.container.clientWidth = 1600;
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 2, 'hosts without matchMedia retain the existing resize seam');
  h.runtime.dispose();
}

{
  const h = createHarness();
  assert.equal(h.runtime.isRecovering(), false, 'normal non-zero boot needs no recovery observer/timer');
  assert.equal(h.state.resizeCalls, 1, 'positive startup reconciles once');
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 1, 'unchanged resize is coalesced with startup');
  assert.equal(h.state.postCalls, 1);
  assert.equal(h.state.frustumCalls, 1);
  h.runtime.dispose();
  assert.equal(h.listeners.has('resize'), false, 'dispose detaches the resize listener');
}

{
  const h = createHarness({ width: 0, height: 0, canvasWidth: 0, canvasHeight: 0 });
  assert.equal(h.runtime.isRecovering(), true, 'zero-size boot arms first-layout recovery');
  assert.deepEqual(h.observed, [h.container, h.environment.documentElement]);
  h.container.clientWidth = 1024;
  h.container.clientHeight = 640;
  h.runObserver();
  assert.equal(h.state.resizeCalls, 1, 'first non-zero layout repairs the renderer');
  assert.equal(h.camera.aspect, 1.6);
  assert.equal(h.state.postCalls, 1);
  assert.equal(h.state.frustumCalls, 1);
  assert.equal(h.runtime.isRecovering(), false, 'successful repair disarms both fallbacks');
  assert.equal(h.state.disconnected, 1);
  assert.equal(h.state.intervalClears, 1);
}

{
  const h = createHarness({ width: 0, height: 0, canvasWidth: 0, canvasHeight: 0 });
  h.runInterval();
  assert.equal(h.state.resizeCalls, 0, 'interval fallback waits while layout remains zero');
  h.runtime.dispose();
  assert.equal(h.state.intervalClears, 1, 'dispose clears pending recovery work');
  h.runtime.apply();
  assert.equal(h.state.resizeCalls, 0, 'disposed runtime cannot mutate renderer state');
}

console.log('viewportRuntime selftest: PASS');
