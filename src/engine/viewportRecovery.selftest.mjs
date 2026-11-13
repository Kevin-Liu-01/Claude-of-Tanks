import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { createViewportRuntime } from './viewportRuntime.ts';

// 2026-11-02 audit R4 (viewport recovery): apply() entered first-layout recovery when the canvas's PARENT was tiny, but
// the recovery's own check (tryRecover) tested only the container. With a tiny parent under a normal container every
// 250 ms tick (and every ResizeObserver callback) ran stop -> apply -> start again, rebuilding the observer and the
// interval each time. Both now share one "layout not ready" test.

const counts = { observers: 0, intervals: 0, clears: 0, resizes: 0 };
let tick = null;
const container = { clientWidth: 1280, clientHeight: 720 };
const parent = { clientWidth: 0, clientHeight: 0 }; // a collapsed host pane around a sized container
const renderer = { domElement: { width: 1280, height: 720, parentElement: parent }, setPixelRatio() {}, setSize() {}, userData: {} };
const environment = {
  window: { innerWidth: 1, innerHeight: 1, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} },
  documentElement: {},
  ResizeObserver: class { constructor() { counts.observers += 1; } observe() {} disconnect() {} },
  setInterval(callback) { counts.intervals += 1; tick = callback; return 9; },
  clearInterval() { counts.clears += 1; },
};
const runtime = createViewportRuntime({
  container, renderer, camera: new PerspectiveCamera(), environment,
  post: { setSize() { counts.resizes += 1; } }, lighting: { updateFrustums() {} },
  resizeRenderer: () => { counts.resizes += 1; },
});
runtime.apply();
assert.equal(counts.observers, 1, 'the tiny parent starts one recovery');
assert.equal(counts.intervals, 1);
for (let i = 0; i < 8; i++) tick();
assert.equal(counts.observers, 1, 'the recovery ticks without rebuilding its observer');
assert.equal(counts.intervals, 1, 'or its interval');
assert.equal(counts.clears, 0);
assert.equal(counts.resizes, 0, 'nothing is sized while the parent is tiny');
// the parent lays out: the next tick recovers once and stops
parent.clientWidth = 1280; parent.clientHeight = 720;
tick();
assert.equal(counts.clears, 1, 'the recovery stops');
assert.ok(counts.resizes > 0, 'and the viewport is applied');
runtime.dispose?.();
console.log('viewportRecovery selftest: a tiny parent waits in one recovery instead of rebuilding it every tick');
