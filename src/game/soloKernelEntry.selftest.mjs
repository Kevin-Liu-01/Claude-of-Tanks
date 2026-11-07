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
//   not from an entry, and no entry waits for the kernels past it: the first entry waits at most its own bound, one that
//   begins near the deadline goes on at it, and every entry after it (a Battle Again's, a battle later) goes on at once.
//   Before, the fetch had no timeout and each entry for the document's life waited up to its own 3 s again. The deadline
//   ends only the waits. The load's request is held to it from its own start (the real world/soloWorldKernels.ts, a
//   platform-like fetch double): one with no answer by then is aborted, the load failed, reported 'timeout', nothing
//   installed. A request with its answer is never cut, however slow its body or late its compile: installed when it
//   lands, for the next battle, and reported 'wasm' only then (the real soloWorldKernelProvider.ts), so the page's report
//   and the battles agree (round 5 review r1: the first fix dropped an answer past the deadline, yet the provider still
//   wrote 'wasm' over the 'timeout' report with nothing installed, and it cut a live load on a slow link for good).
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
export function loadSoloWorldKernels(check, answerWithinMs) { return globalThis.__soloKernelEntry.load(check, answerWithinMs); }
`)}`;
// (round 5 Q1) the real world/soloWorldKernels.ts (a chunk copy asked with kernels=real) over the real provider
// (world/soloWorldKernelProvider.ts); the stand-ins are the asset URL it imports through the bundler, the browser's fetch
// (each case's own double) and the compile (WebAssembly's, so a case can hold it)
const KERNELS_URL = 'https://kernels.test/cot_sim_wasm.wasm';
const KERNELS_URL_STUB = `data:text/javascript,${encodeURIComponent(`export default '${KERNELS_URL}';`)}`;
const COMPILE_STUB = `data:text/javascript,${encodeURIComponent(`
export function compileWorldKernels(bytes) { return globalThis.__soloKernelEntry.compile(bytes); }
`)}`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes('/src/game/soloBattleRuntime.ts')) {
      if (specifier === './state.ts') return { url: AUTHORITY_STUB, shortCircuit: true };
      if (specifier === '../world/soloWorldKernels.ts' && !context.parentURL.includes('kernels=real')) {
        return { url: KERNELS_STUB, shortCircuit: true };
      }
    }
    if (context.parentURL?.includes('/src/world/soloWorldKernels.ts')) {
      if (specifier.endsWith('.wasm?url')) return { url: KERNELS_URL_STUB, shortCircuit: true };
      if (specifier === './wasmWorldKernels.ts') return { url: COMPILE_STUB, shortCircuit: true };
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
/**
 * A fresh copy of the chunk (its body runs once a URL), behind the page's access owner; with `realKernels`, over the real
 * world/soloWorldKernels.ts (round 5 Q1).
 */
let copies = 0;
const entry = ({ realKernels = false } = {}) => {
  const url = `./soloBattleRuntime.ts?entry=${++copies}${realKernels ? '&kernels=real' : ''}`;
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
/** (round 5 Q1) A case on the virtual clock from 0, nothing reported yet, `fetch` the case's own double. */
const realFetch = globalThis.fetch;
const freshCase = (fetchDouble) => {
  events.length = 0;
  bounds.length = 0;
  deadlines.length = 0;
  clock = 0;
  delete globalThis.__SIM_KERNELS;
  globalThis.fetch = fetchDouble ?? realFetch;
};
/** A platform-like fetch's abort: what is pending rejects with the signal's reason. */
const onAbort = (signal, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
const installedOf = () => events.filter(([what]) => what === 'installed');

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

  // ---- (round 5 Q1) a load that never settles: its deadline, SOLO_KERNELS_LOAD_DEADLINE_MS from its start, ends every
  // entry's wait for it. The first entry waits at most its own bound, an entry after the deadline (a Battle Again's, a
  // battle later) goes on at once, and the load goes on: an answer that lands later is installed for the next battle
  {
    freshCase();
    let answerWithin = null;
    const late = deferred();
    globalThis.__soloKernelEntry.load = (check, answerWithinMs) => { answerWithin = answerWithinMs; return late.promise; };
    // the first entry at 0 s: the chunk's body starts the load, which never settles
    const { access, preload } = entry();
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    assert.equal(bounds.length, 1, 'the first entry\'s wait set its bound');
    await advance(bounds[0].ms - 1);
    assert.deepEqual(events, [], 'the first entry waits for the kernels within its own bound');
    await advance(1);
    assert.deepEqual(events, [['preloaded']], 'the first entry waits at most its own bound, then goes on (the TypeScript)');
    const runtime = await preload;
    // a battle later (two minutes), the load still pending: the Battle Again's entry asks the cached chunk
    await advance(120_000 - clock);
    const again = access.preload().then(() => { events.push(['again', clock]); });
    await turns();
    assert.deepEqual(events, [['preloaded'], ['again', 120_000]], 'an entry after the load\'s deadline goes on at once '
      + '(it waited on a bound of its own again: a load that never answers held every solo entry up to 3 s for the '
      + 'document\'s life)');
    await again;
    const deadline = runtime.SOLO_KERNELS_LOAD_DEADLINE_MS;
    assert.ok(Number.isFinite(deadline) && deadline > bounds[0].ms && deadline < 120_000,
      `the load's deadline (${deadline} ms) is longer than an entry's bound and shorter than a battle`);
    assert.equal(deadlines.length, 1, 'one deadline for the load');
    assert.ok(deadlines[0].ms === deadline && deadlines[0].due === deadline && deadlines[0].fired,
      'run from the load\'s start (the chunk\'s body), not from an entry');
    assert.ok(bounds.every((bound) => bound.fired || bound.cleared), 'no entry\'s bound left running');
    assert.equal(globalThis.__SIM_KERNELS, undefined, 'the deadline ends the waits only: a load still going is neither '
      + 'failed nor reported');
    // the load goes on: an answer past the deadline (a slow link's body, a late compile) carries the next battle
    late.resolve({ provider: 'late' });
    await turns();
    assert.deepEqual(events, [['preloaded'], ['again', 120_000], ['installed', { provider: 'late' }]], 'an answer past the '
      + 'deadline is installed for the next battle (it was dropped: a live load on a slow link left every battle on the '
      + 'TypeScript for the document\'s life)');
    assert.equal(answerWithin, deadline, 'the load\'s request is held to the same deadline (world/soloWorldKernels.ts '
      + 'aborts one with no answer by then)');
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
    assert.deepEqual(events, [['second', 2 * bounds[0].ms + 1000]], 'and goes on at it');
    await second;
    // an entry that begins a second before the deadline goes on at the deadline, not its own bound's end
    await advance(deadline - 1000 - clock);
    const third = access.preload().then(() => { events.push(['third', clock]); });
    await advance(1000 - 1);
    assert.deepEqual(events, [['second', 2 * bounds[0].ms + 1000]], 'it waits up to the deadline');
    await advance(1);
    assert.deepEqual(events.at(-1), ['third', deadline], 'and goes on at the deadline (it waited on its own bound, past '
      + 'the deadline)');
    await third;
  }

  // ---- (round 5 Q1) a request with no answer by the deadline: world/soloWorldKernels.ts (the real file, through the
  // chunk) aborts it, the load fails, reported 'timeout', nothing is installed, and the next entry goes on at once
  {
    const asked = [];
    // a platform-like fetch: a server that never answers, a request that rejects with its signal's reason on an abort
    freshCase((url, init) => new Promise((resolve, reject) => {
      asked.push({ url: String(url), signal: init?.signal ?? null });
      onAbort(init?.signal, reject);
    }));
    const { access, preload } = entry({ realKernels: true });
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    assert.deepEqual(asked.map(({ url }) => url), [KERNELS_URL], 'the chunk\'s body fetches the module');
    await advance(bounds[0].ms);
    const runtime = await preload;
    const deadline = runtime.SOLO_KERNELS_LOAD_DEADLINE_MS;
    await advance(deadline - 1 - clock);
    assert.ok(!asked[0].signal?.aborted, 'the request waits for its answer up to the deadline');
    await advance(1);
    assert.equal(asked[0].signal?.aborted, true, 'a request with no answer by the deadline is aborted (it held its '
      + 'connection for the document\'s life)');
    assert.equal(asked[0].signal.reason?.name, 'TimeoutError');
    assert.equal(globalThis.__SIM_KERNELS?.mode, 'ts', 'the load failed: the TypeScript');
    assert.equal(globalThis.__SIM_KERNELS?.reason, 'timeout', 'reported, its reason the deadline');
    assert.deepEqual(installedOf(), [], 'nothing installed: the report and the battles agree');
    const again = access.preload().then(() => { events.push(['again', clock]); });
    await turns();
    assert.deepEqual(events.at(-1), ['again', deadline], 'the next entry goes on at once');
    await again;
  }

  // ---- (round 5 Q1, review r1) an answered load whose compile ends past the deadline (the real world/soloWorldKernels.ts
  // and soloWorldKernelProvider.ts, through the chunk): installed for the next battle and reported 'wasm', the report and
  // the battles agreeing. The first fix dropped it, yet its provider wrote 'wasm' over the 'timeout' report, nothing installed
  {
    let signal = null;
    freshCase(async (url, init) => {
      signal = init?.signal ?? null;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    });
    const compiling = deferred();
    globalThis.__soloKernelEntry.compile = () => compiling.promise;
    const { access, preload } = entry({ realKernels: true });
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    await advance(bounds[0].ms);
    const runtime = await preload; // the first entry went on at its bound, the module still compiling
    const deadline = runtime.SOLO_KERNELS_LOAD_DEADLINE_MS;
    await advance(deadline + 1000 - clock);
    const again = access.preload().then(() => { events.push(['again', clock]); });
    await turns();
    assert.deepEqual(events, [['preloaded'], ['again', deadline + 1000]], 'past the deadline an entry goes on at once');
    await again;
    compiling.resolve({ compiled: 'late' });
    await turns();
    const installed = installedOf();
    assert.equal(globalThis.__SIM_KERNELS?.mode === 'wasm', installed.length === 1, 'the page\'s report and the battles '
      + `agree (__SIM_KERNELS ${JSON.stringify(globalThis.__SIM_KERNELS?.mode)}, ${installed.length} installed: it said `
      + '\'wasm\' with nothing installed, every battle on the TypeScript)');
    assert.equal(installed.length, 1, 'the late compile is installed for the next battle');
    assert.equal(typeof installed[0][1]?.mirrorGround, 'function', 'the real provider over the compiled module');
    assert.equal(globalThis.__SIM_KERNELS?.mode, 'wasm', 'and the page reports the kernels');
    assert.ok(!signal?.aborted, 'an answered request is never aborted');
  }

  // ---- (round 5 Q1, review r1) an answered request whose body is still coming at the deadline (a slow link, shared with
  // the Battle intent's preload wave) is never cut: the body lands, compiles and is installed for the next battle
  {
    const body = deferred();
    let signal = null;
    freshCase(async (url, init) => {
      signal = init?.signal ?? null;
      // a platform-like response: an abort of its request errors its body
      return { ok: true, status: 200, arrayBuffer: () => new Promise((resolve, reject) => { body.promise.then(resolve); onAbort(signal, reject); }) };
    });
    globalThis.__soloKernelEntry.compile = async () => ({ compiled: 'slow body' });
    const { preload } = entry({ realKernels: true });
    for (let i = 0; i < 50 && bounds.length === 0; i++) await turns(1);
    await advance(bounds[0].ms);
    const runtime = await preload;
    const deadline = runtime.SOLO_KERNELS_LOAD_DEADLINE_MS;
    await advance(3 * deadline - clock);
    assert.ok(!signal?.aborted, 'a request with its answer is never aborted, its body still coming (it was cut at '
      + 'the deadline: a live load on a slow link left every battle on the TypeScript for the document\'s life)');
    assert.equal(globalThis.__SIM_KERNELS, undefined, 'nor failed: nothing reported while it loads');
    body.resolve(new ArrayBuffer(8));
    await turns();
    assert.equal(installedOf().length, 1, 'the body lands, compiles and is installed for the next battle');
    assert.equal(globalThis.__SIM_KERNELS?.mode, 'wasm');
    assert.ok(deadlines.length === 2 && deadlines.some((timer) => timer.cleared && !timer.fired),
      'the request\'s own bound was cleared at its answer');
  }

  // ---- (round 5 Q1) the request's bound runs from its own start (the kernels' chunk may land late in the Battle intent's
  // wave): world/soloWorldKernels.ts aborts a request with no answer within it
  {
    const asked = [];
    freshCase((url, init) => new Promise((resolve, reject) => { asked.push(init?.signal ?? null); onAbort(init?.signal, reject); }));
    const { loadSoloWorldKernels } = await import('../world/soloWorldKernels.ts');
    await advance(40_000);
    const loading = loadSoloWorldKernels(false, 15_000).then(() => 'resolved', (error) => error);
    await turns();
    assert.equal(asked.length, 1, 'the module is fetched');
    const answerBound = deadlines.at(-1);
    assert.ok(answerBound?.ms === 15_000 && answerBound.due === 55_000, 'the request\'s bound runs from its own start');
    await advance(15_000 - 1);
    assert.ok(!asked[0]?.aborted, 'the request waits for its answer within its bound');
    await advance(1);
    const failure = await loading;
    assert.equal(failure?.name, 'TimeoutError', `a request with no answer within its bound is aborted (${failure?.message ?? failure})`);
  }
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  globalThis.fetch = realFetch;
  hook.deregister();
}

console.log('soloKernelEntry selftest passed: the solo battle entry waits for the world kernels its chunk loads (installed '
  + 'before the entry goes on), goes on at once after a failed load and at the bound after a slow one (installed later for '
  + 'the next battle), and loads and waits for nothing under ?simKernels=ts; the wait never rejects (a throwing installer '
  + 'or failure report, the re-ask of the cached chunk), and its bound runs from the entry\'s own wait, not the intent\'s; '
  + 'no entry waits past the load\'s own deadline from its start; a request with no answer by then is aborted (reported '
  + '\'timeout\', nothing installed), and an answered load is never cut: installed when it lands, then reported \'wasm\'');
