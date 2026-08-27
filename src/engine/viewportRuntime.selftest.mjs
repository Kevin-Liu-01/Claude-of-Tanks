import assert from 'node:assert/strict';

import { createViewportRuntime } from './viewportRuntime.ts';

function createHarness({ width = 1280, height = 720, canvasWidth = width, canvasHeight = height } = {}) {
  const listeners = new Map();
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
    setPixelRatio() {},
    setSize(nextWidth, nextHeight) {
      state.resizeCalls++;
      this.domElement.width = nextWidth;
      this.domElement.height = nextHeight;
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
  const runtime = createViewportRuntime({
    container,
    renderer,
    camera,
    post: { setSize(nextWidth, nextHeight) {
      state.postCalls++;
      assert.equal(nextWidth, container.clientWidth || environment.window.innerWidth);
      assert.equal(nextHeight, container.clientHeight || environment.window.innerHeight);
    } },
    lighting: { updateFrustums() { state.frustumCalls++; } },
    environment,
    resizeRenderer(liveRenderer, liveCamera) {
      const nextWidth = container.clientWidth || environment.window.innerWidth;
      const nextHeight = container.clientHeight || environment.window.innerHeight;
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
    runInterval: () => intervalCallback?.(),
    runObserver: () => observerCallback?.([], null),
  };
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
