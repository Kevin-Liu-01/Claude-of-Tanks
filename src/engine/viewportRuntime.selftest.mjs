import assert from 'node:assert/strict';

import { createViewportRuntime } from './viewportRuntime.ts';

function createHarness({ width = 1280, height = 720, canvasWidth = width, canvasHeight = height,
  devicePixelRatio = 1, supportsMatchMedia = true } = {}) {
  const listeners = new Map();
  const mediaQueries = [];
  const resizeOrder = [];
  const observed = [];
  const state = { disconnected: 0, intervalClears: 0, resizeCalls: 0, postCalls: 0, frustumCalls: 0 };
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
    pixelRatio: devicePixelRatio,
    setPixelRatio(value) { this.pixelRatio = value; },
    setSize(nextWidth, nextHeight) {
      resizeOrder.push('renderer');
      state.resizeCalls++;
      this.domElement.width = Math.round(nextWidth * this.pixelRatio);
      this.domElement.height = Math.round(nextHeight * this.pixelRatio);
    },
    userData: {},
  };
  const camera = {
    aspect: 0,
    updateProjectionMatrix() {},
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
    setInterval(callback) { intervalCallback = callback; return 7; },
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
    } },
    lighting: { updateFrustums() { resizeOrder.push('frustums'); state.frustumCalls++; } },
    environment,
    resizeRenderer(liveRenderer, liveCamera) {
      const nextWidth = container.clientWidth || environment.window.innerWidth;
      const nextHeight = container.clientHeight || environment.window.innerHeight;
      liveRenderer.setPixelRatio(environment.window.devicePixelRatio);
      liveRenderer.setSize(nextWidth, nextHeight);
      liveCamera.aspect = nextWidth / nextHeight;
      liveCamera.updateProjectionMatrix();
    },
  });
  return {
    runtime,
    state,
    container,
    renderer,
    camera,
    listeners,
    observed,
    environment,
    mediaQueries,
    resizeOrder,
    runInterval: () => intervalCallback?.(),
    runObserver: () => observerCallback?.([], null),
  };
}

{
  const h = createHarness({ width: 1440, height: 900 });
  assert.equal(h.mediaQueries[0].media, '(resolution: 1dppx)');
  assert.equal(h.state.resizeCalls, 0, 'watching DPR adds no redundant boot resize');
  const initialQuery = h.mediaQueries[0];
  const queuedInitialEvent = [...initialQuery.callbacks][0];
  h.environment.window.devicePixelRatio = 2;
  initialQuery.dispatch();
  assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [2880, 1800],
    'same CSS viewport at DPR2 updates actual backing dimensions');
  assert.equal(h.camera.aspect, 1.6, 'pixel-density-only resize preserves camera aspect');
  assert.deepEqual(h.resizeOrder, ['renderer', 'post', 'frustums'],
    'DPR changes use the same coordinated viewport owners and order');
  assert.equal(initialQuery.callbacks.size, 0, 'old resolution listener is detached');
  assert.equal(h.mediaQueries[1].media, '(resolution: 2dppx)');
  queuedInitialEvent();
  h.mediaQueries[1].dispatch();
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 1, 'late and unchanged-density notifications add no resizes');
  h.environment.window.devicePixelRatio = 1;
  h.mediaQueries[1].dispatch();
  assert.deepEqual([h.renderer.domElement.width, h.renderer.domElement.height], [1440, 900],
    'DPR round trip returns to the original backing dimensions');
  assert.equal(h.state.postCalls, 2);
  assert.equal(h.state.frustumCalls, 2);
  assert.equal(h.mediaQueries.filter(query => query.callbacks.size).length, 1,
    'only one live density listener survives repeated changes');
  const queuedFinalEvent = [...h.mediaQueries.at(-1).callbacks][0];
  h.runtime.dispose();
  h.environment.window.devicePixelRatio = 2;
  queuedFinalEvent();
  assert.equal(h.state.resizeCalls, 2, 'queued media notifications after disposal cannot mutate owners');
  assert.ok(h.mediaQueries.every(query => query.callbacks.size === 0));
}

{
  const h = createHarness();
  const queuedMediaEvent = [...h.mediaQueries[0].callbacks][0];
  h.environment.window.devicePixelRatio = 2;
  h.listeners.get('resize')();
  queuedMediaEvent();
  assert.equal(h.state.resizeCalls, 1, 'window-resize-first re-arms DPR without duplicate work');
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
  assert.equal(h.state.resizeCalls, 2, 'explicit apply remains a force-sync for restoration callers');
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 2, 'only redundant browser notifications are coalesced');
  h.container.clientWidth = 1600;
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 3, 'real layout changes are never suppressed');
  h.runtime.dispose();
}

{
  const h = createHarness({ supportsMatchMedia: false });
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 1, 'hosts without matchMedia retain the existing resize seam');
  h.runtime.dispose();
}

{
  const h = createHarness();
  assert.equal(h.runtime.isRecovering(), false, 'normal non-zero boot remains inert');
  assert.equal(h.state.resizeCalls, 0, 'normal boot does not perform a redundant resize');
  h.listeners.get('resize')();
  assert.equal(h.state.resizeCalls, 1, 'window resize uses the shared viewport seam');
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
