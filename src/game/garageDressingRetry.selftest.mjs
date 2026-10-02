// garageDressingRetry.selftest.mjs — the workshop scheduler's failure path is bounded (INFRA-P11).
// Production 2026-09-27: one tab requested a removed garageDressing chunk 33,875 times in a day because every
// failure re-queued the build 140 ms later for as long as the Garage stayed open.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGarageDressingScheduler } from './garageDressingScheduler.ts';

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

function harness({ classify = 'transient', failPreload = () => true } = {}) {
  const state = { idle: [], delayed: [], warnings: [], missing: [], preloads: 0, built: false, clock: 0 };
  const removed = new TypeError('Failed to fetch dynamically imported module: https://cot.kevinliu.studio/assets/garageDressing-BO96SP48.js');
  const dressing = {
    group: { userData: {} },
    async preload() {
      state.preloads += 1;
      if (failPreload(state.preloads)) throw removed;
      return dressing;
    },
    async pump() { state.built = true; return false; },
    isBuilt() { return state.built; },
  };
  const scheduler = createGarageDressingScheduler({
    dressing,
    getPhase: () => 'garage',
    isTransitionActive: () => false,
    requestIdle: (callback) => state.idle.push(callback),
    scheduleDelay: (callback, delayMs) => state.delayed.push({ callback, delayMs }),
    now: () => state.clock,
    warn: (message) => state.warnings.push(message),
    classifyFailure: async () => classify,
    onChunkMissing: (error) => state.missing.push(error),
  });
  state.clock = 10_000; // the garage has been quiet since the scheduler was created
  // One idle-granted attempt; returns the delay the scheduler queued next (null = none).
  const attempt = async () => {
    assert.equal(state.idle.length, 1, 'exactly one attempt is queued');
    state.idle.shift()();
    await flush();
    const next = state.delayed.shift();
    if (!next) return null;
    next.callback();
    return next.delayMs;
  };
  return { state, scheduler, attempt };
}

// Transient failures: 2, 4, 8, 16 s, then the scheduler stops for this garage visit.
{
  const { state, scheduler, attempt } = harness();
  scheduler.schedule();
  const delays = [];
  for (let i = 0; i < 5; i++) delays.push(await attempt());
  assert.deepEqual(delays, [2000, 4000, 8000, 16000, null]);
  assert.equal(state.preloads, 5, 'five requests, not one every 140 ms');
  assert.equal(state.idle.length, 0, 'nothing is queued after the budget is spent');
  assert.match(state.warnings.at(-1), /stopped after 5 failed attempts/);
  scheduler.schedule();
  assert.equal(state.idle.length, 1, 'a garage entry or return opens a fresh budget');
  assert.equal(await attempt(), 2000, 'and the backoff starts over');
}

// A removed hashed chunk: stop at once, surface the reload path, never retry in this document.
{
  const { state, scheduler, attempt } = harness({ classify: 'missing' });
  scheduler.schedule();
  assert.equal(await attempt(), null);
  assert.equal(state.preloads, 1);
  assert.equal(state.missing.length, 1, 'the reload surface is offered once');
  assert.match(String(state.missing[0].message), /garageDressing-BO96SP48\.js/);
  scheduler.schedule();
  assert.equal(state.idle.length, 0, 'a stale deployment never requests the chunk again');
}

// A success resets the count: the next failure waits the base delay again.
{
  const { state, scheduler, attempt } = harness({ failPreload: (n) => n === 1 });
  scheduler.schedule();
  assert.equal(await attempt(), 2000);
  assert.equal(await attempt(), null, 'the retry built the workshop');
  assert.equal(state.built, true);
  assert.equal(state.preloads, 2);
}

// The composition root wires the platform classifier and the inline watchdog's reload action.
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const wiring = main.slice(main.indexOf('createGarageDressingScheduler({'), main.indexOf('const scheduleGarageDressingBuild'));
assert.match(wiring, /classifyFailure: \(error\) => classifyChunkFailure\(error\)/);
assert.match(wiring, /onChunkMissing: \(\) => window\.__COT_BOOT_RECOVERY\?\.showRetry\?\.\('module'\)/);
const watchdog = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
assert.match(watchdog, /window\.__COT_BOOT_RECOVERY = \{\s*recover, showRetry,/, 'the inline watchdog exports showRetry');

console.log('garageDressingRetry.selftest: failures back off 2/4/8/16 s and stop; a removed chunk stops at once');
