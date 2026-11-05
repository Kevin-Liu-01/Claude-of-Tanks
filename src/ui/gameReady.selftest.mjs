// gameReady.selftest.mjs — the Garage's one ready wait waits on the boot latch's edge (2026-11-02 audit F5, round 2: Q11,
// U24, the latch edge). The round-1 waiter polled the latch (120 ms, then 1 s for the rest of a stalled boot's session),
// and its `state` getter settled the wait inline, so a caller that read the state while its own waiter was registered ran
// that waiter from inside the read: the Garage's callouts loaded twice (two createGarageHotspots, an orphaned layer).
// Here the waiter rides a real latch (src/app/bootReadiness.ts) and garage.ts's own loadHotspots runs on it. Every timer
// the waiter asks for is recorded: the edge needs none. Each case reports on its own, so a run lists every one that fails.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createGameReadyWaiter } from './gameReady.ts';
import { createBootReadiness } from '../app/bootReadiness.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };

/** A waiter over a real latch. `schedule`/`cancel` record any poll a waiter asks for; the edge waiter takes `onReady`. */
function waiterOn(latch, { failed = () => false } = {}) {
  const timers = [];
  const waiter = createGameReadyWaiter({
    isReady: () => latch.ready,
    hasFailed: failed,
    onReady: (callback) => latch.whenReady(callback),
    schedule: (callback, delayMs) => { const handle = { callback, delayMs }; timers.push(handle); return handle; },
    cancel: (handle) => { const at = timers.indexOf(handle); if (at >= 0) timers.splice(at, 1); },
  });
  return { waiter, timers };
}

/** garage.ts's own loadHotspots (and its one-wait guard), on `gameReady`, over a chunk that counts its builds. */
function hotspotsOn(gameReady) {
  const garage = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
  const start = garage.indexOf('  let hotspotsAwaitingReady = false;');
  const end = garage.indexOf('\n  };\n', garage.indexOf('  const loadHotspots = ', start));
  assert.ok(start > 0 && end > start, 'garage.ts holds loadHotspots');
  const source = stripTypeScriptTypes(garage.slice(start, end + '\n  };'.length));
  const counts = { imports: 0, built: 0, failures: 0 };
  const hotspotsChunk = createLazyChunk(() => {
    counts.imports += 1;
    return Promise.resolve([{ createGarageHotspots: () => { counts.built += 1; return { setFacts() {} }; } }, {}]);
  }, { opener: true });
  const context = {
    gameReady, hotspotsChunk, counts,
    root: { querySelector: () => null }, hotspotRoom: {}, calloutsShown: true, hotspotFacts: null, opts: {},
    reportLoadFailure: () => { counts.failures += 1; }, t: (key) => key, calloutsButton: {},
  };
  runInNewContext(`let hotspots = null;\n${source}\nglobalThis.loadHotspots = loadHotspots;`, context);
  return { load: context.loadHotspots, counts };
}

const failures = [];
async function check(name, body) {
  try { await body(); } catch (error) { failures.push(`${name}: ${error.message}`); }
}

// 1. (Q11) Two callouts presses around the boot's ready edge build one hotspot layer: the second press reads the state
//    and must not run the first press's waiter from inside that read.
await check('the callouts load once across the ready edge', async () => {
  const latch = createBootReadiness();
  const { waiter } = waiterOn(latch);
  const hotspots = hotspotsOn(waiter);
  hotspots.load(); // a press before the game is playable waits
  assert.equal(hotspots.counts.imports, 0, 'a press before ready loads nothing');
  latch.markReady(); // main.ts's end of boot
  hotspots.load(); // the next press, as the edge lands
  await flush();
  assert.equal(hotspots.counts.imports, 1, 'one import');
  assert.equal(hotspots.counts.built, 1, 'one hotspot layer in the Garage root (two presses built two)');
});

// 2. (the latch edge) The wait asks for no timer: the latch's ready edge runs each waiter once.
await check('the wait rides the latch edge, not a poll', async () => {
  const latch = createBootReadiness();
  const { waiter, timers } = waiterOn(latch);
  const ran = [];
  waiter.whenReady(() => ran.push('gallery'));
  waiter.whenReady(() => ran.push('deploy'));
  const cancelHotspots = waiter.whenReady(() => ran.push('hotspots'));
  assert.equal(timers.length, 0, 'three waiters schedule nothing (the round-1 waiter polled every 120 ms)');
  cancelHotspots();
  latch.markReady();
  assert.deepEqual(ran, ['gallery', 'deploy'], 'the edge runs each waiter once, never a cancelled one');
  waiter.whenReady(() => ran.push('late'));
  assert.equal(ran.at(-1), 'late', 'a waiter after ready runs at once');
  assert.equal(waiter.state, 'ready');
  assert.equal(timers.length, 0);
});

// 3. (U24) A boot that stops on an uncaught error never settles the latch: its waiters never run and nothing runs for them
//    for the rest of the session (the round-1 waiter kept one 1 s poll). The recorded timers are run, capped.
await check('a stalled boot schedules nothing', async () => {
  const latch = createBootReadiness();
  const { waiter, timers } = waiterOn(latch);
  const ran = [];
  waiter.whenReady(() => ran.push('never'));
  let polls = 0;
  while (timers.length && polls < 400) { polls += 1; timers.shift().callback(); }
  assert.equal(polls, 0, `the wait ran ${polls} polls for a boot that never finished (and still holds ${timers.length})`);
  assert.equal(waiter.state, 'waiting');
  assert.deepEqual(ran, []);
});

// 4. A boot the capability gate halted on purpose is the failed state: no waiter registers, none will ever run.
await check('a halted boot is failed', async () => {
  const latch = createBootReadiness();
  let halted = false;
  const { waiter, timers } = waiterOn(latch, { failed: () => halted });
  halted = true;
  assert.equal(waiter.state, 'failed');
  const ran = [];
  waiter.whenReady(() => ran.push('never'));
  assert.equal(timers.length, 0);
  assert.deepEqual(ran, []);
});

// 5. (Q11) Reading the state runs nothing: a waiter runs at the latch's edge only, never inside a read.
await check('reading the state runs no waiter', async () => {
  let ready = false;
  const edge = new Set();
  const timers = [];
  const waiter = createGameReadyWaiter({
    isReady: () => ready,
    hasFailed: () => false,
    onReady: (callback) => { edge.add(callback); return () => edge.delete(callback); },
    schedule: (callback, delayMs) => { const handle = { callback, delayMs }; timers.push(handle); return handle; },
    cancel: () => {},
  });
  const ran = [];
  waiter.whenReady(() => ran.push('hotspots'));
  ready = true; // the latch has settled; its edge is still running the earlier waiters
  assert.equal(waiter.state, 'ready');
  assert.deepEqual(ran, [], 'the read ran the waiter inline (re-entry)');
  for (const callback of [...edge]) callback();
  assert.deepEqual(ran, ['hotspots'], 'the edge runs it, once');
});

// 6. The page's waiter: the boot latch's ready edge, its halt flag as the failed state, and no timer of its own.
await check('the page waiter rides whenBootReady', async () => {
  const source = readFileSync(new URL('./gameReady.ts', import.meta.url), 'utf8');
  assert.match(source, /onReady: whenBootReady,/, 'the page waiter waits on the latch\'s edge');
  assert.doesNotMatch(source, /setTimeout|setInterval/, 'gameReady.ts schedules nothing');
  assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ''), /__GAME_READY/, 'nor reads the harness flag');
});

assert.deepEqual(failures, [], `gameReady.selftest: ${failures.length} case(s) failed`);
console.log('gameReady.selftest: the ready wait rides the latch edge, reads run nothing, a stalled boot schedules nothing PASS');
