import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGarageDressingScheduler } from './garageDressingScheduler.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main.ts'), 'utf8');
const garageReturn = fs.readFileSync(path.join(here, 'garageReturnRuntime.ts'), 'utf8');

const flush = () => new Promise((resolve) => setImmediate(resolve));
let now = 0;
let phase = 'garage';
let transitionActive = false;
let built = false;
let preloadCount = 0;
let pumpCount = 0;
let sourceLoadCount = 0;
let visualChanges = 0;
const idle = [];
const delayed = [];
const dressing = {
  group: { userData: { buildTimings: [], modernComponentSources: ['t90m'] } },
  async preload() { preloadCount += 1; return dressing; },
  async pump() {
    pumpCount += 1;
    if (pumpCount === 1) dressing.group.userData.buildTimings.push({ chunk: 'core' });
    else built = true;
    return !built;
  },
  isBuilt() { return built; },
};

const scheduler = createGarageDressingScheduler({
  dressing,
  getPhase: () => phase,
  isTransitionActive: () => transitionActive,
  ensureTankBuilders: async (ids) => {
    assert.deepEqual(ids, ['t90m']);
    sourceLoadCount += 1;
  },
  requestIdle: (callback) => idle.push(callback),
  scheduleDelay: (callback, delayMs) => delayed.push({ callback, delayMs }),
  onVisualChange: () => { visualChanges += 1; },
  now: () => now,
});

scheduler.schedule();
scheduler.schedule();
assert.equal(idle.length, 1, 'concurrent requests must coalesce into one idle task');
assert.equal(scheduler.scheduled, true);
now = 1700;
idle.shift()();
await flush();
assert.equal(preloadCount, 1);
assert.equal(pumpCount, 1, 'the ordinary workshop core must build first');
assert.equal(sourceLoadCount, 0, 'vehicle families must stay deferred until after the core');
assert.equal(visualChanges, 1, 'each completed streamed chunk invalidates the presentation');
const firstResume = delayed.shift();
assert.equal(firstResume.delayMs, 350, 'unfinished chunks resume after a short lull');

firstResume.callback();
assert.equal(idle.length, 1);
idle.shift()();
await flush();
assert.equal(sourceLoadCount, 1, 'the exact exhibit families load before vehicle chunks');
assert.equal(pumpCount, 2);
assert.equal(built, true);
assert.equal(visualChanges, 2, 'the final vehicle chunk also requests an immediate paint');

// A second owner verifies transition and fresh-input deferral without sharing
// completion state from the happy-path stream above.
const waitIdle = [];
const waitDelayed = [];
const waitingDressing = {
  group: { userData: {} },
  async preload() { return waitingDressing; },
  async pump() { return true; },
  isBuilt() { return false; },
};
const waiting = createGarageDressingScheduler({
  dressing: waitingDressing,
  getPhase: () => phase,
  isTransitionActive: () => transitionActive,
  ensureTankBuilders: async () => {},
  requestIdle: (callback) => waitIdle.push(callback),
  scheduleDelay: (callback, delayMs) => waitDelayed.push({ callback, delayMs }),
  now: () => now,
});
transitionActive = true;
now = 4000;
waiting.schedule();
waitIdle.shift()();
await flush();
assert.equal(waitDelayed[0].delayMs, 350, 'active transitions must never build exhibits');
transitionActive = false;
waitDelayed.shift().callback();
waiting.noteActivity();
waitIdle.shift()();
await flush();
assert.equal(waitDelayed[0].delayMs, 600, 'fresh input must restart the full quiet window');
assert.equal(waiting.getLastActivityAt(), now);

assert.match(main, /createGarageDressingScheduler\(\{/,
  'main must compose the typed workshop scheduler');
assert.match(main, /createGarageIdleWorkCoordinator\(\)/,
  'garage background producers must share one typed exclusion owner');
assert.equal((main.match(/acquireBackgroundWork:/g) || []).length, 3,
  'world, neighbor paint and workshop dressing must use the same work lane');
assert.match(main, /const scheduleGarageDressingBuild = garageDressingScheduler\.schedule/,
  'all garage entry points must share the scheduler owner');
assert.doesNotMatch(main, /function scheduleGarageDressingBuild\(/,
  'the workshop state machine must not be duplicated in main');
assert.match(main, /lastActivityAt: garageDressingScheduler\.getLastActivityAt\(\)/,
  'background world building must observe the same garage activity epoch');

const readyAt = main.indexOf('window.__GAME_READY = true;');
assert(readyAt >= 0);
assert.match(main.slice(readyAt, readyAt + 500), /scheduleGarageDressingBuild\(\)/,
  'the post-ready garage path must arm the dressing scheduler');

assert.match(garageReturn,
  /work\.noteActivity\(\);[\s\S]{0,180}work\.scheduleDressing\(\);/,
  'the Garage return owner must establish a new activity epoch before scheduling work');
assert.match(main,
  /noteActivity: \(\) => garageDressingScheduler\.noteActivity\(\)[\s\S]{0,180}scheduleDressing: scheduleGarageDressingBuild/,
  'Studio/battle returns must establish a fresh lull and resume the stream');

console.log('garageDressingLifecycle.selftest: typed quiet-window ordering and integration pass');
