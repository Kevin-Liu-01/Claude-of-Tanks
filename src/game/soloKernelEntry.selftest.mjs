// soloKernelEntry.selftest.mjs — the solo battle entry waits for the world kernels (round 3 X10). Copyright © 2026 Kevin B. Liu.
//
// state.ts setupBattle chooses a battle's kernels once, at its setup (2026-11-02 audit S2): a battle set up before they
// landed runs its whole life on the TypeScript. The kernels load in the solo authority's own chunk
// (game/soloBattleRuntime.ts), and the authority was ready as soon as that chunk's body ran, so the covered entry's
// barrier (preloadSoloAuthority, game/soloBattleLoadingRuntime.ts) could finish, and the first battle be set up, before
// its own chunk's kernels did. The access owner's preload (soloBattleAccess.ts) now resolves once its own wait,
// soloKernelsSettled(), has: the kernels installed or failed, or SOLO_KERNELS_ENTRY_WAIT_MS passed since that wait began
// (round 4 F3; no top-level await in the chunk: the kernels' own chunk may import modules the bundler placed in it).
// Held through the page's own access owner and the chunk's real body; the authority (state.ts) and
// the browser's fetch of the module (world/soloWorldKernels.ts) are stand-ins, so each case loads in milliseconds:
// - kernels that land after the chunk's body ran: the entry's preload resolves only after they are installed;
// - a failed load: the entry goes on at once on the TypeScript, the failure reported;
// - a load still pending at the bound: the entry goes on at the bound, and the load, landing later, is installed for the
//   next battle; a load that settles first leaves no timer behind;
// - ?simKernels=ts: nothing loads and nothing waits;
// - (round 4 F3) the wait never rejects: an installer that throws is a failed load (reported, the TypeScript), a failure
//   report that throws leaves the TypeScript unreported, and either way the entry goes on and the page's re-ask of the
//   cached chunk resolves (a rejection there failed every solo entry for the document's life);
// - (round 4 F3) the bound is the entry's own, started at its wait: a garage dwell that outlasts the Battle intent's
//   preload (which evaluates the chunk) still leaves the covered entry its own bound for the kernels. So, while the load
//   is pending, every later preload on the access (a Battle Again's entry included) waits up to a bound of its own again;
// - (round 5 Q1) the load has one deadline of its own, SOLO_KERNELS_LOAD_DEADLINE_MS from its start (the chunk's body),
//   not from an entry: a load that never answers settles there as a failed one (reported 'timeout', its fetch aborted, a
//   late answer never installed), so the first entry waits at most its own bound, one that begins near the deadline goes
//   on at it, and every entry after it (a Battle Again's, a battle later) goes on at once. Before, the fetch had no
//   timeout and each entry for the document's life waited up to its own 3 s again. The real world/soloWorldKernels.ts
//   hands the deadline's signal to its fetch (a platform-like fetch double that answers nothing until aborted).
// Not reproduced here: a browser's fetch racing a real covered entry (the timing half; MANUAL solo-kernels-probe).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createSoloBattleRuntimeAccess } from './soloBattleAccess.ts';

const events = [];
globalThis.__soloKernelEntry = { events, load: null };
const AUTHORITY_STUB = `data:text/javascript,${encodeURIComponent(`
const noop = () => {};
export const createCollider = noop, prepareNextOpeningRoute = noop, resetProvingRange = noop, setProvingTargetsMoving = noop,
  setupBattle = noop, simStep = noop;
export function setSoloWorldKernels(kernels) {
  if (globalThis.__soloKernelEntry.installThrows) throw new Error('installer threw');
  globalThis.__soloKernelEntry.events.push(['installed', kernels]);
}
`)}`;
const KERNELS_STUB = `data:text/javascript,${encodeURIComponent(`
export function loadSoloWorldKernels(check, signal) { return globalThis.__soloKernelEntry.load(check, signal); }
`)}`;
// (round 5 Q1) the asset URL world/soloWorldKernels.ts imports through the bundler, for its own case below
const KERNELS_URL = 'https://kernels.test/cot_sim_wasm.wasm';
const KERNELS_URL_STUB = `data:text/javascript,${encodeURIComponent(`export default '${KERNELS_URL}';`)}`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes('/src/game/soloBattleRuntime.ts')) {
      if (specifier === './state.ts') return { url: AUTHORITY_STUB, shortCircuit: true };
      if (specifier === '../world/soloWorldKernels.ts') return { url: KERNELS_STUB, shortCircuit: true };
    }
    if (context.parentURL?.includes('/src/world/soloWorldKernels.ts') && specifier.endsWith('.wasm?url')) {
      return { url: KERNELS_URL_STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

// each wait's bound (a timer of a second or more, up to 10 s) and the load's deadline (round 5 Q1: a longer one),
// captured on a virtual clock and fired by hand or by advance(); shorter timers run as ever
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const bounds = [], deadlines = [], captured = new Set();
let clock = 0;
globalThis.setTimeout = (fn, ms, ...args) => {
  if (!(ms >= 1000)) return realSetTimeout(fn, ms, ...args);
  const timer = { fn, ms, due: clock + ms, cleared: false, fired: false };
  (ms <= 10_000 ? bounds : deadlines).push(timer);
  captured.add(timer);
  return timer;
};
globalThis.clearTimeout = (timer) => {
  if (captured.has(timer)) timer.cleared = true;
  else realClearTimeout(timer);
};
const turns = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve)); };
/** A fresh copy of the chunk (its body runs once a URL), behind the page's access owner. */
let copies = 0;
const entry = () => {
  const url = `./soloBattleRuntime.ts?entry=${++copies}`;
  const access = createSoloBattleRuntimeAccess(() => import(url));
  const preload = access.preload().then((runtime) => { events.push(['preloaded']); return runtime; });
  return { access, preload };
};
/** How a preload ended, never a throw (a rejection is the finding, not the receipt's crash). */
const outcome = (promise) => promise.then(() => 'resolved', (error) => `rejected: ${error?.message ?? error}`);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
/**
 * (round 5 Q1) Virtual time moves `ms`: what is pending sets its timers at the current time first, then each captured
 * timer due by then fires in due order, what it settles first.
 */
const advance = async (ms) => {
  await turns();
  const until = clock + ms;
  for (;;) {
    const due = [...bounds, ...deadlines].filter((timer) => !timer.cleared && !timer.fired && timer.due <= until);
    if (!due.length) break;
    const next = due.reduce((first, timer) => (timer.due < first.due ? timer : first));
    clock = next.due;
    next.fired = true;
    next.fn();
    await turns();
  }
  clock = until;
  await turns();
};

try {
  // ---- kernels that land after the chunk's body ran: the entry waits for them
  {
    events.length = 0;
    bounds.length = 0;
    const kernels = { provider: 'late' };
    const landing = deferred();
    let asked = 0;
    globalThis.__soloKernelEntry.load = (check) => { asked++; assert.equal(check, false, 'not the check mode'); return landing.promise; };
    const { access, preload } = entry();
    for (let i = 0; i < 50 && asked === 0; i++) await turns(1);
    assert.equal(asked, 1, 'the chunk\'s body asked for the kernels');
    await turns();
    assert.deepEqual(events, [], 'the battle entry\'s preload waits while the kernels load (it resolved with them still loading: '
      + 'the first battle was set up on the TypeScript)');
    assert.equal(access.isReady(), false, 'and the authority is not ready to set a battle up');
    landing.resolve(kernels);
    const runtime = await preload;
    assert.deepEqual(events, [['installed', kernels], ['preloaded']], 'the kernels are installed before the entry goes on');
    assert.equal(typeof runtime.setupBattle, 'function');
    assert.equal(bounds.length, 1, 'one bound');
    assert.ok(bounds[0].ms === runtime.SOLO_KERNELS_ENTRY_WAIT_MS && bounds[0].ms >= 1000 && bounds[0].ms <= 10_000,
      `the entry's bound, a few seconds (${bounds[0].ms} ms)`);
    assert.equal(bounds[0].cleared, true, 'a load that settles first leaves no timer behind');
    assert.ok(deadlines.every((deadline) => deadline.cleared), 'nor the load\'s deadline (round 5 Q1)');
  }

  // ---- a failed load: the entry goes on at once, on the TypeScript, and says why
  {
    events.length = 0;
    bounds.length = 0;
    globalThis.__soloKernelEntry.load = () => Promise.reject(new TypeError('Failed to fetch'));
    const { preload } = entry();
    await preload;
    assert.deepEqual(events, [['preloaded']], 'nothing installed');
    assert.equal(bounds[0]?.cleared, true, 'the bound never fired');
    assert.equal(globalThis.__SIM_KERNELS?.mode, 'ts');
    assert.equal(globalThis.__SIM_KERNELS?.reason, 'network', 'the failure is reported');
  }

  // ---- a load still pending at the bound: the entry goes on, and the kernels landing later carry the next battle
  {
    events.length = 0;
    bounds.length = 0;
    const kernels = { provider: 'slow' };
    const landing = deferred();
    globalThis.__soloKernelEntry.load = () => landing.promise;
    const { preload } = entry();
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    assert.equal(bounds.length, 1, 'the entry\'s wait set its bound');
    await turns();
    assert.deepEqual(events, [], 'the entry waits within the bound');
    bounds[0].fn();
    await preload;
    assert.deepEqual(events, [['preloaded']], 'past the bound the entry goes on (on the TypeScript)');
    landing.resolve(kernels);
    await turns();
    assert.deepEqual(events, [['preloaded'], ['installed', kernels]], 'the load goes on: installed when it lands, for the next battle');
  }

  // ---- ?simKernels=ts: nothing loads and nothing waits
  {
    events.length = 0;
    bounds.length = 0;
    let asked = 0;
    globalThis.__soloKernelEntry.load = () => { asked++; return new Promise(() => {}); };
    globalThis.location = { search: '?simKernels=ts' };
    try {
      const { preload } = entry();
      await preload;
    } finally {
      delete globalThis.location;
    }
    assert.equal(asked, 0, 'no load');
    assert.equal(bounds.length, 0, 'no bound');
    assert.deepEqual(events, [['preloaded']]);
    assert.equal(globalThis.__SIM_KERNELS?.reason, 'off');
  }

  // ---- (round 4 F3) an installer that throws: a failed load, never a rejection, and no wedge on the re-ask
  {
    events.length = 0;
    bounds.length = 0;
    globalThis.__soloKernelEntry.installThrows = true;
    globalThis.__soloKernelEntry.load = () => Promise.resolve({ provider: 'throws' });
    try {
      const { access, preload } = entry();
      assert.equal(await outcome(preload), 'resolved', 'an installer that throws is a failed load: the entry goes on');
      assert.equal(access.isReady(), true, 'on the TypeScript');
      assert.equal(globalThis.__SIM_KERNELS?.mode, 'ts');
      assert.equal(globalThis.__SIM_KERNELS?.reason, 'error', 'the failure is reported');
      // the page's next entry asks the chunk again (import() hands back the cached module): no wedge
      assert.equal(await outcome(access.preload()), 'resolved', 'the re-ask of the cached chunk resolves');
      assert.ok(bounds.length >= 1 && bounds.every((bound) => bound.cleared), 'no bound left running');
    } finally {
      globalThis.__soloKernelEntry.installThrows = false;
    }
  }

  // ---- (round 4 F3) a failure report that throws (an unprintable failure): the TypeScript stands, never a rejection
  {
    events.length = 0;
    bounds.length = 0;
    const unprintable = { toString() { throw new Error('unprintable failure'); } };
    globalThis.__soloKernelEntry.load = () => Promise.reject(unprintable);
    const { access, preload } = entry();
    assert.equal(await outcome(preload), 'resolved', 'a failure report that throws still settles the wait: the entry goes on');
    assert.equal(await outcome(access.preload()), 'resolved', 'and the re-ask of the cached chunk resolves');
    assert.deepEqual(events, [['preloaded']], 'nothing installed');
    assert.equal(access.isReady(), true);
  }

  // ---- (round 4 F3) the bound is the entry's own: a dwell past the Battle intent's bound still waits at the entry
  {
    events.length = 0;
    bounds.length = 0;
    const kernels = { provider: 'dwell' };
    const landing = deferred();
    globalThis.__soloKernelEntry.load = () => landing.promise;
    // the Battle intent's preload (game/battleIntentRuntime.ts) evaluates the chunk and starts the load
    const { access, preload: intent } = entry();
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    assert.equal(bounds.length, 1, 'the intent\'s wait set its bound');
    bounds[0].fn(); // the garage dwell outlasts it, the kernels still loading
    await intent;
    assert.deepEqual(events, [['preloaded']]);
    // the covered entry's barrier asks the authority (game/soloBattleLoadingRuntime.ts preloadSoloAuthority)
    events.length = 0;
    const entering = access.preload().then(() => { events.push(['entered']); });
    await turns();
    assert.deepEqual(events, [], 'the covered entry waits for the kernels on a bound of its own (it went on at once: the '
      + 'bound ran from the chunk\'s first load at the intent, spent in the garage, and the first battle was set up on the TypeScript)');
    assert.equal(bounds.length, 2, 'the entry\'s wait set its own bound, at the wait');
    landing.resolve(kernels);
    await entering;
    assert.deepEqual(events, [['installed', kernels], ['entered']], 'the kernels are installed before the entry goes on');
    assert.equal(bounds[1].cleared, true, 'and its bound is cleared');
  }

  // ---- (round 5 Q1) a load that never answers settles at its own deadline, from its start: the first entry waits at most
  // its own bound, and an entry after the deadline (a Battle Again's, a battle later) goes on at once
  {
    events.length = 0;
    bounds.length = 0;
    deadlines.length = 0;
    clock = 0;
    delete globalThis.__SIM_KERNELS;
    let signal = null;
    const late = deferred();
    globalThis.__soloKernelEntry.load = (check, abortSignal) => { signal = abortSignal ?? null; return late.promise; };
    // the first entry at 0 s: the chunk's body starts the load, which never answers
    const { access, preload } = entry();
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    assert.equal(bounds.length, 1, 'the first entry\'s wait set its bound');
    await advance(bounds[0].ms - 1);
    assert.deepEqual(events, [], 'the first entry waits for the kernels within its own bound');
    await advance(1);
    assert.deepEqual(events, [['preloaded']], 'the first entry waits at most its own bound, then goes on (the TypeScript)');
    const runtime = await preload;
    // a battle later (two minutes), the load still unanswered: the Battle Again's entry asks the cached chunk
    await advance(120_000 - clock);
    const again = access.preload().then(() => { events.push(['again', clock]); });
    await turns();
    assert.deepEqual(events, [['preloaded'], ['again', 120_000]], 'an entry after the load\'s deadline goes on at once '
      + '(it waited on a bound of its own again: a load that never answers held every solo entry up to 3 s for the '
      + 'document\'s life)');
    await again;
    assert.equal(globalThis.__SIM_KERNELS?.mode, 'ts', 'the load settled as a failed one: the TypeScript');
    assert.equal(globalThis.__SIM_KERNELS?.reason, 'timeout', 'reported, its reason the deadline');
    assert.equal(signal?.aborted, true, 'the deadline aborted the load\'s fetch');
    assert.equal(signal.reason?.name, 'TimeoutError');
    const deadline = runtime.SOLO_KERNELS_LOAD_DEADLINE_MS;
    assert.ok(Number.isFinite(deadline) && deadline > bounds[0].ms && deadline < 120_000,
      `the load's deadline (${deadline} ms) is longer than an entry's bound and shorter than a battle`);
    assert.equal(deadlines.length, 1, 'one deadline for the load');
    assert.ok(deadlines[0].ms === deadline && deadlines[0].due === deadline && deadlines[0].fired,
      'run from the load\'s start (the chunk\'s body), not from an entry');
    assert.ok(bounds.every((bound) => bound.fired || bound.cleared), 'no entry\'s bound left running');
    // a late answer (a compile past the deadline) is not installed: the battles and the report agree on the TypeScript
    late.resolve({ provider: 'late' });
    await turns();
    assert.deepEqual(events, [['preloaded'], ['again', 120_000]], 'a late answer is never installed');
    assert.equal(globalThis.__SIM_KERNELS?.reason, 'timeout');
  }

  // ---- (round 5 Q1) while the load is young each entry keeps its own bound, which the load's deadline can only cut short
  {
    events.length = 0;
    bounds.length = 0;
    deadlines.length = 0;
    clock = 0;
    globalThis.__soloKernelEntry.load = () => new Promise(() => {});
    const { access, preload } = entry();
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    await advance(bounds[0].ms);
    const runtime = await preload;
    const deadline = runtime.SOLO_KERNELS_LOAD_DEADLINE_MS;
    assert.ok(Number.isFinite(deadline) && deadline > 2 * bounds[0].ms,
      `the load has a deadline of its own (${deadline} ms)`);
    // a second entry a second after the first went on, the load still young: it waits up to its own bound
    await advance(bounds[0].ms + 1000 - clock);
    events.length = 0;
    const second = access.preload().then(() => { events.push(['second', clock]); });
    await advance(bounds[0].ms - 1);
    assert.deepEqual(events, [], 'a young load: the entry waits up to its own bound');
    await advance(1);
    await second;
    assert.deepEqual(events, [['second', 2 * bounds[0].ms + 1000]], 'and goes on at it');
    // an entry that begins a second before the deadline goes on at the deadline, not its own bound's end
    await advance(deadline - 1000 - clock);
    const third = access.preload().then(() => { events.push(['third', clock]); });
    await advance(1000 - 1);
    assert.deepEqual(events, [['second', 2 * bounds[0].ms + 1000]], 'it waits up to the deadline');
    await advance(1);
    await third;
    assert.deepEqual(events.at(-1), ['third', deadline], 'and goes on at the deadline, the load settled');
  }

  // ---- (round 5 Q1) the deadline's abort reaches the fetch: world/soloWorldKernels.ts hands the signal on
  {
    const realFetch = globalThis.fetch;
    const asked = [];
    // a platform-like fetch: a server that never answers, and a request that rejects with its signal's reason on an abort
    globalThis.fetch = (url, init) => new Promise((resolve, reject) => {
      asked.push(String(url));
      init?.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
    try {
      const { loadSoloWorldKernels } = await import('../world/soloWorldKernels.ts');
      const abort = new AbortController();
      const loading = outcome(loadSoloWorldKernels(false, abort.signal));
      await turns();
      assert.deepEqual(asked, [KERNELS_URL], 'the module is fetched');
      abort.abort(new DOMException('deadline', 'TimeoutError'));
      const result = await Promise.race([loading, turns().then(() => 'still pending')]);
      assert.equal(result, 'rejected: deadline', 'the abort stops the fetch (the request held its connection for the '
        + 'document\'s life)');
    } finally {
      globalThis.fetch = realFetch;
    }
  }
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  hook.deregister();
}

console.log('soloKernelEntry selftest passed: the solo battle entry waits for the world kernels its chunk loads (installed '
  + 'before the entry goes on), goes on at once after a failed load and at the bound after a slow one (installed later for '
  + 'the next battle), and loads and waits for nothing under ?simKernels=ts; the wait never rejects (a throwing installer '
  + 'or failure report, the re-ask of the cached chunk), and its bound runs from the entry\'s own wait, not the intent\'s; '
  + 'a load that never answers settles at its own deadline from its start (reported, its fetch aborted), after which every '
  + 'entry goes on at once');
