// soloKernelEntry.selftest.mjs — the solo battle entry waits for the world kernels (round 3 X10). Copyright © 2026 Kevin B. Liu.
//
// state.ts setupBattle chooses a battle's kernels once, at its setup (2026-11-02 audit S2): a battle set up before they
// landed runs its whole life on the TypeScript. The kernels load in the solo authority's own chunk
// (game/soloBattleRuntime.ts), and that chunk resolved as soon as its body ran, so the covered entry's barrier
// (preloadSoloAuthority, game/soloBattleLoadingRuntime.ts) could finish, and the first battle be set up, before its own
// chunk's kernels did. The chunk now resolves once they are installed or failed, or past SOLO_KERNELS_ENTRY_WAIT_MS.
// Held through the page's own access owner (soloBattleAccess.ts) and the chunk's real body; the authority (state.ts) and
// the browser's fetch of the module (world/soloWorldKernels.ts) are stand-ins, so each case loads in milliseconds:
// - kernels that land after the chunk's body ran: the entry's preload resolves only after they are installed;
// - a failed load: the entry goes on at once on the TypeScript, the failure reported;
// - a load still pending at the bound: the entry goes on at the bound, and the load, landing later, is installed for the
//   next battle; a load that settles first leaves no timer behind;
// - ?simKernels=ts: nothing loads and nothing waits.
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
export function setSoloWorldKernels(kernels) { globalThis.__soloKernelEntry.events.push(['installed', kernels]); }
`)}`;
const KERNELS_STUB = `data:text/javascript,${encodeURIComponent(`
export function loadSoloWorldKernels(check) { return globalThis.__soloKernelEntry.load(check); }
`)}`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes('/src/game/soloBattleRuntime.ts')) {
      if (specifier === './state.ts') return { url: AUTHORITY_STUB, shortCircuit: true };
      if (specifier === '../world/soloWorldKernels.ts') return { url: KERNELS_STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

// the chunk's bound, captured (a timer of a second or more) and fired by hand; shorter timers run as ever
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const bounds = [];
globalThis.setTimeout = (fn, ms, ...args) => {
  if (!(ms >= 1000)) return realSetTimeout(fn, ms, ...args);
  const timer = { fn, ms, cleared: false };
  bounds.push(timer);
  return timer;
};
globalThis.clearTimeout = (timer) => {
  if (bounds.includes(timer)) timer.cleared = true;
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
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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
      `the bound is the chunk's own, a few seconds (${bounds[0].ms} ms)`);
    assert.equal(bounds[0].cleared, true, 'a load that settles first leaves no timer behind');
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
    assert.equal(bounds.length, 1, 'the chunk set its bound');
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
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  hook.deregister();
}

console.log('soloKernelEntry selftest passed: the solo battle entry waits for the world kernels its chunk loads (installed '
  + 'before the entry goes on), goes on at once after a failed load and at the bound after a slow one (installed later for '
  + 'the next battle), and loads and waits for nothing under ?simKernels=ts');
