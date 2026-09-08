import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createStudioAccess } from './studioAccess.ts';

class FakeKeyTarget {
  listeners = new Set();
  addEventListener(_type, listener) { this.listeners.add(listener); }
  removeEventListener(_type, listener) { this.listeners.delete(listener); }
  press(code, { repeat = false } = {}) {
    let prevented = false;
    let stopped = false;
    const event = {
      code,
      repeat,
      preventDefault() { prevented = true; },
      stopImmediatePropagation() { stopped = true; },
    };
    for (const listener of [...this.listeners]) listener(event);
    return { prevented, stopped };
  }
}

const keys = new FakeKeyTarget();
let phase = 'garage';
let moduleLoads = 0;
let fxPreloads = 0;
let fxCreates = 0;
let prepares = 0;
let enters = 0;
let ticks = 0;
const timing = [];
let contextFx = null;
const runtime = {
  active: false,
  tick(dt, wallDt) { ticks += dt; timing.push([dt, wallDt]); },
  async enter() { enters += 1; this.active = true; },
};

const access = createStudioAccess({
  async loadModule() {
    moduleLoads += 1;
    return {
      createStudio(context) {
        contextFx = context.fx;
        return runtime;
      },
    };
  },
  async preloadFxModule() { fxPreloads += 1; },
  async ensureFxRuntime() { fxCreates += 1; return { id: 'fx' }; },
  prepareRuntime() { prepares += 1; },
  createContext: (fx) => ({ fx }),
  getPhase: () => phase,
  keyTarget: keys,
});

access.preloadIntent();
access.preloadIntent();
await Promise.resolve();
assert.equal(moduleLoads, 1, 'intent coalesces the Studio module transfer');
assert.equal(fxPreloads, 2, 'FX preload remains a cheap idempotent module request');
assert.equal(fxCreates, 0, 'hover intent never constructs the FX runtime');

access.installKeyboard();
access.installKeyboard();
assert.equal(keys.listeners.size, 1, 'the lazy F8 listener has one owner');
assert.deepEqual(keys.press('F7'), { prevented: false, stopped: false });
phase = 'battle';
assert.deepEqual(keys.press('F8'), { prevented: false, stopped: false });
phase = 'garage';
assert.deepEqual(keys.press('F8', { repeat: true }), { prevented: false, stopped: false });
assert.deepEqual(keys.press('F8'), { prevented: true, stopped: true });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(prepares, 1);
assert.equal(fxCreates, 1);
assert.equal(enters, 1);
assert.deepEqual(contextFx, { id: 'fx' });
assert.equal(keys.listeners.size, 0, 'the full Studio runtime replaces lazy key ownership');
assert.equal(access.presentation.active, true);
access.presentation.tick(0.25);
assert.equal(ticks, 0.25, 'the stable composition proxy forwards to the live runtime');
assert.deepEqual(timing.at(-1), [.25, .25], 'manual Studio callers preserve their explicit interval');
access.presentation.tick(.1, .5);
assert.deepEqual(timing.at(-1), [.1, .5], 'the lazy presentation proxy preserves raw timing separately');
assert.equal(await access.loadRuntime(), runtime, 'runtime acquisition is idempotent');

let attempts = 0;
const retrying = createStudioAccess({
  async loadModule() {
    attempts += 1;
    if (attempts === 1) throw new Error('transient chunk failure');
    return { createStudio: () => runtime };
  },
  async preloadFxModule() {},
  async ensureFxRuntime() { return {}; },
  prepareRuntime() {},
  createContext: () => ({}),
  getPhase: () => 'garage',
  keyTarget: null,
});
await assert.rejects(retrying.loadRuntime(), /transient chunk failure/);
assert.equal(await retrying.loadRuntime(), runtime, 'failed chunk acquisition retries cleanly');
assert.equal(attempts, 2);

// Execute the real Studio tick without its DOM/UI constructor. Playback,
// camera and post must keep bounded dt while the governor receives raw time.
const studioSource = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const tickStart = studioSource.indexOf('  function tick(dt: number, frameWallDtSeconds = dt): void {');
const tickEnd = studioSource.indexOf('\n  function urlParam(', tickStart);
assert(tickStart >= 0 && tickEnd > tickStart);
const tickSource = stripTypeScriptTypes(studioSource.slice(tickStart, tickEnd));
const frameCalls = [];
const tick = new Function('calls', `
  let poolSweepAcc = 0, lastFov = 55, frameDirty = true;
  const recording = null, timeScale = 1, clockMs = 0, _fwd = {};
  const perf = { skippedFrames: 0, renderedFrames: 0 }, storyboard = { durationMs: 1000 };
  const updateCamera = dt => { calls.push(['camera', dt]); return true; };
  const panel = { tick: dt => calls.push(['panel', dt]) }, getWorld = () => null;
  const camera = { fov: 55, getWorldDirection() {} }, lighting = { update() {}, updateFrustums() {} };
  const advanceTimeline = dt => calls.push(['timeline', dt]), stepFx = () => {};
  const sweepPool = () => {}, stopRecording = () => {}, post = { render: (...args) => calls.push(['post', ...args]) };
  ${tickSource}
  return tick;
`)(frameCalls);
tick(.1, .5);
assert.deepEqual(frameCalls, [['camera', .1], ['panel', .1], ['timeline', 100], ['post', .1, .5]]);
frameCalls.length = 0;
tick(.02);
assert.deepEqual(frameCalls.at(-1), ['post', .02, .02]);

console.log('studioAccess.selftest: intent, retry, F8 ownership, and runtime proxy passed');
