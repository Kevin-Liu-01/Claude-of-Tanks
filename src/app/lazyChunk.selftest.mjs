// lazyChunk.selftest.mjs — the one failure policy for a lazy chunk (2026-11-02 audit R6): a failure is kept and nothing
// asks again by itself; a failed stylesheet (in any part of the load) or a removed chunk (404) is terminal, the removed
// one with the reload surface; any other failure is asked again by the next caller once the INFRA-P11 backoff has
// passed, capped at a minute and never spent, never offline, at once back online.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createLazyChunk, importAll, isStylesheetFailure } from './lazyChunk.ts';

const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(reason));
const settle = () => new Promise((resolve) => setImmediate(resolve));
const moduleFailure = () => new TypeError('Failed to fetch dynamically imported module: https://x.test/assets/a-12345678.js');
const cssFailure = () => new Error('Unable to preload CSS for https://x.test/assets/a-12345678.css');

// ---- the classification
assert.equal(isStylesheetFailure(cssFailure()), true);
assert.equal(isStylesheetFailure(moduleFailure()), false);
assert.equal(isStylesheetFailure('Unable to preload CSS for /assets/x.css'), true);
assert.equal(isStylesheetFailure(null), false);

// ---- idle -> loading -> ready, one request shared, no load once ready
{
  let calls = 0;
  const chunk = createLazyChunk(async () => { calls++; return 'module'; });
  assert.equal(chunk.state, 'idle');
  const a = chunk.load();
  const b = chunk.load();
  assert.equal(chunk.state, 'loading');
  assert.equal(a, b, 'a request in flight is shared');
  assert.equal(await a, 'module');
  assert.equal(chunk.state, 'ready');
  assert.equal(chunk.value, 'module');
  assert.equal(await chunk.load(), 'module');
  assert.equal(chunk.load(), chunk.load(), 'ready: the same settled promise (a per-frame caller allocates nothing)');
  assert.equal(calls, 1);
}

// ---- a module failure: kept; asked again by the next caller, at once after one failure, then past the backoff, never
// while offline
{
  let clock = 0;
  let onLine = true;
  let calls = 0;
  let fail = 3;
  const chunk = createLazyChunk(async () => { calls++; if (fail-- > 0) throw moduleFailure(); return 'late'; },
    { now: () => clock, online: () => onLine });
  await assert.rejects(chunk.load(), /dynamically imported module/);
  assert.equal(chunk.state, 'failed');
  assert.equal(chunk.terminal, false);
  assert.match(String(chunk.error), /dynamically imported module/);
  onLine = false;
  await assert.rejects(chunk.load());
  assert.equal(calls, 1, 'nothing asked again while offline');
  onLine = true;
  await assert.rejects(chunk.load(), /dynamically imported module/);
  assert.equal(calls, 2, 'after one failure the next ask asks again at once');
  await assert.rejects(chunk.load(), /dynamically imported module/, 'inside the backoff the kept failure answers');
  assert.equal(chunk.load(), chunk.load(), 'the same kept promise');
  assert.equal(calls, 2, 'nothing asked again inside the backoff');
  clock = 2_000;
  await assert.rejects(chunk.load());
  assert.equal(calls, 3, 'after two, the first ask past 2 s');
  clock = 5_000;
  await assert.rejects(chunk.load());
  assert.equal(calls, 3, 'after three, the backoff is 4 s');
  clock = 6_000;
  assert.equal(await chunk.load(), 'late', 'a transient failure no longer stands for the session');
  assert.equal(chunk.state, 'ready');
  assert.equal(chunk.error, null);
}

// ---- (round 4 F2) a lifecycle edge's ask (`{ backoff: false }`, a battle's covered entry) asks a failure again now,
// whatever the backoff other callers' asks raised; never offline, never a terminal failure. `failures` tells a first ask
// (0) from a re-ask (above 0), and a load resets it
{
  let clock = 0;
  let onLine = true;
  let calls = 0;
  let broken = true;
  const chunk = createLazyChunk(async () => { calls++; if (broken) throw moduleFailure(); return 'edge'; },
    { now: () => clock, online: () => onLine });
  assert.equal(chunk.failures, 0);
  const first = chunk.load();
  assert.equal(chunk.failures, 0, 'a first ask in flight');
  await assert.rejects(first);
  assert.equal(chunk.failures, 1);
  // a drag through the outage: the backoff grows to the minute's cap
  for (let i = 0; i < 1800; i++) { clock += 100; await chunk.load().catch(() => {}); }
  const dragged = calls;
  assert.ok(dragged >= 7 && dragged <= 9, `the drag asked at the backoff points (${dragged})`);
  assert.equal(chunk.failures, dragged);
  clock += 1_000;
  await assert.rejects(chunk.load());
  assert.equal(calls, dragged, 'a plain ask inside the minute gets the kept failure');
  onLine = false;
  await assert.rejects(chunk.load({ backoff: false }));
  assert.equal(calls, dragged, 'offline, an edge asks nothing');
  onLine = true;
  broken = false;
  const edge = chunk.load({ backoff: false });
  assert.equal(calls, dragged + 1, 'an edge asks now, inside the backoff');
  assert.equal(chunk.failures, dragged, 'a re-ask in flight: failures above 0');
  assert.equal(chunk.load({ backoff: false }), edge, 'one request at a time');
  assert.equal(await edge, 'edge');
  assert.equal(chunk.failures, 0, 'a load resets the count');
  assert.equal(chunk.load({ backoff: false }), chunk.load(), 'ready: the same settled promise');
  assert.equal(calls, dragged + 1);
  // terminal stays terminal: a stylesheet, an opener
  let sheetCalls = 0;
  const sheet = createLazyChunk(async () => { sheetCalls++; throw cssFailure(); });
  await assert.rejects(sheet.load());
  await assert.rejects(sheet.load({ backoff: false }));
  const opener = createLazyChunk(async () => { sheetCalls++; throw moduleFailure(); }, { opener: true });
  await assert.rejects(opener.load());
  await assert.rejects(opener.load({ backoff: false }));
  assert.equal(sheetCalls, 2, 'an edge never asks a terminal failure again');
}

// ---- a stylesheet failure is terminal: the chunk asked again would run unstyled
{
  let clock = 0;
  let calls = 0;
  const chunk = createLazyChunk(async () => { calls++; throw cssFailure(); }, { now: () => clock });
  await assert.rejects(chunk.load(), /preload CSS/);
  assert.equal(chunk.terminal, true);
  clock = 3_600_000;
  await assert.rejects(chunk.load(), /preload CSS/);
  assert.equal(calls, 1, 'never asked again in its document');
}

// ---- an opener's chunk: any failure is terminal (its trigger's next press reloads the page)
{
  let clock = 0;
  let calls = 0;
  const chunk = createLazyChunk(async () => { calls++; throw moduleFailure(); }, { now: () => clock, opener: true });
  await assert.rejects(chunk.load());
  assert.equal(chunk.terminal, true);
  clock = 60_000;
  await assert.rejects(chunk.load());
  assert.equal(calls, 1, 'an opener never asks again in its document');
}

// ---- no budget: a builder or a notice mends when the network does, however long it failed (an outage with
// navigator.onLine true: a captive portal, a CDN 5xx); the backoff stops growing at the policy's minute
{
  let clock = 0;
  let calls = 0;
  let broken = true;
  const chunk = createLazyChunk(async () => { calls++; if (broken) throw moduleFailure(); return 'mended'; },
    { now: () => clock });
  // the reviewer's outage: an ask every 500 ms for 16 s
  for (; clock <= 16_000; clock += 500) await chunk.load().catch(() => {});
  assert.equal(calls, 5, 'the backoff spaced the asks (0, 2, 4, 8 s after each failure)');
  assert.equal(chunk.terminal, false, 'five failures are not terminal');
  for (let i = 0; i < 6; i++) { clock += 120_000; await chunk.load().catch(() => {}); }
  assert.equal(calls, 11);
  clock += 59_999;
  await assert.rejects(chunk.load());
  assert.equal(calls, 11, 'inside the capped wait the kept failure answers');
  clock += 1;
  await assert.rejects(chunk.load());
  assert.equal(calls, 12, 'eleven failures in a row wait a minute, never more');
  broken = false;
  clock += 600_000;
  assert.equal(await chunk.load(), 'mended', 'ten minutes on, the network back, the next ask loads');
  assert.equal(chunk.state, 'ready');
}

// ---- a failure seen offline is asked again at once when the browser is back online (whatever the count)
{
  let clock = 0;
  let onLine = true;
  let calls = 0;
  let fail = 3;
  const chunk = createLazyChunk(async () => { calls++; if (fail-- > 0) throw moduleFailure(); return 'back'; },
    { now: () => clock, online: () => onLine });
  await assert.rejects(chunk.load());
  await assert.rejects(chunk.load());
  assert.equal(calls, 2);
  clock = 2_000;
  const third = chunk.load();
  onLine = false; // the network dropped while the third ask was in flight
  await assert.rejects(third);
  await assert.rejects(chunk.load());
  assert.equal(calls, 3, 'offline: nothing asked');
  onLine = true;
  clock = 2_001;
  assert.equal(await chunk.load(), 'back', 'back online: asked at once, not after the 4 s backoff');
  assert.equal(calls, 4);
}

// ---- a removed chunk (a hashed chunk that answers 404): terminal, the reload surface once, never asked again
{
  let clock = 0;
  let calls = 0;
  const surfaced = [];
  const classified = [];
  const chunk = createLazyChunk(async () => { calls++; throw moduleFailure(); }, {
    now: () => clock,
    classify: async (error) => { classified.push(error); return 'missing'; },
    onMissing: (error) => surfaced.push(error),
  });
  await assert.rejects(chunk.load());
  await settle();
  assert.equal(chunk.terminal, true);
  assert.equal(surfaced.length, 1, 'the reload surface shows');
  clock = 3_600_000;
  await assert.rejects(chunk.load());
  await settle();
  assert.equal(calls, 1, 'a removed chunk is never asked again');
  assert.equal(surfaced.length, 1);
  assert.equal(classified.length, 1);
  // a transient verdict keeps the re-ask; an opener or a stylesheet is terminal without a probe
  let probes = 0;
  const transient = createLazyChunk(async () => { throw moduleFailure(); }, { classify: async () => { probes++; return 'transient'; } });
  await assert.rejects(transient.load());
  await settle();
  assert.equal(transient.terminal, false);
  const opener = createLazyChunk(async () => { throw moduleFailure(); }, { opener: true, classify: async () => { probes++; return 'missing'; } });
  await assert.rejects(opener.load());
  await settle();
  assert.equal(probes, 1, 'an opener is not probed (its trigger reloads)');
  // outside a document the platform classifier sends no probe (no fetch in a Node receipt)
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; return { status: 404 }; };
  const plain = createLazyChunk(async () => { throw moduleFailure(); });
  await assert.rejects(plain.load());
  await settle();
  globalThis.fetch = realFetch;
  assert.equal(fetched, 0);
  assert.equal(plain.terminal, false);
}

// ---- a load of several parts: a module that failed first cannot hide its stylesheet's failure (Promise.all keeps the
// first rejection; importAll settles every part)
{
  const parts = () => {
    const css = new Promise((_, reject) => setTimeout(() => reject(cssFailure()), 5));
    const module = Promise.reject(moduleFailure());
    css.catch(() => {});
    module.catch(() => {});
    return [module, css];
  };
  const raced = createLazyChunk(() => Promise.all(parts()));
  await assert.rejects(raced.load(), /dynamically imported module/);
  assert.equal(raced.terminal, false, 'Promise.all: the module rejected first and the stylesheet failure is lost');
  let calls = 0;
  const settledParts = createLazyChunk(() => { calls++; return importAll(parts()); });
  await assert.rejects(settledParts.load(), /preload CSS/);
  assert.equal(settledParts.terminal, true, 'importAll: a stylesheet failure in any part is terminal');
  await assert.rejects(settledParts.load(), /preload CSS/);
  assert.equal(calls, 1, 'never asked again: it would run unstyled');
  assert.deepEqual(await importAll([Promise.resolve(1), 'two', Promise.resolve(3)]), [1, 'two', 3]);
  await assert.rejects(importAll([Promise.resolve(1), Promise.reject(moduleFailure())]), /dynamically imported module/);
}

// ---- a loader that throws synchronously fails the same way; a dropped promise is never an unhandled rejection
{
  const chunk = createLazyChunk(() => { throw moduleFailure(); });
  void chunk.load();
  await settle();
  assert.equal(chunk.state, 'failed');
  void chunk.load();
  await settle();
  assert.deepEqual(unhandled, [], 'a dropped load() is handled');
}

// ---- a real dynamic import that fails once (an offline blip): Node, like Chrome 156, loads it when asked again
{
  let fail = 1;
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.endsWith('lazyImportRetry.ts?lazy-chunk-blip') && fail-- > 0) throw moduleFailure();
      return next(specifier, context);
    },
  });
  let clock = 0;
  const chunk = createLazyChunk(() => import('./lazyImportRetry.ts?lazy-chunk-blip'), { now: () => clock });
  await assert.rejects(chunk.load(), /dynamically imported module/);
  const module = await chunk.load();
  assert.equal(typeof module.importRetryDelayMs, 'function', 'the chunk asked again after the blip lands');
  hook.deregister();
}

await settle();
assert.deepEqual(unhandled, []);
console.log('lazyChunk.selftest: idle/loading/ready/failed; a failed stylesheet (any part), a removed chunk or an opener\'s chunk is terminal; a module failure is asked again at once, then past the backoff capped at a minute, never offline, with no budget; a lifecycle edge asks past the backoff');
