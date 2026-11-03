// lazyChunk.selftest.mjs — the one failure policy for a lazy chunk (2026-11-02 audit R6): a failure is kept and nothing
// asks again by itself; a failed stylesheet is terminal (the chunk would run unstyled); any other failure is asked again
// by the next caller once the INFRA-P11 backoff has passed, never offline, and stops after the budget.
// Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createLazyChunk, isStylesheetFailure } from './lazyChunk.ts';

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
  assert.equal(calls, 1);
}

// ---- a module failure: kept, asked again by the next caller once the backoff passed, never while offline
{
  let clock = 0;
  let onLine = true;
  let calls = 0;
  let fail = 2;
  const chunk = createLazyChunk(async () => { calls++; if (fail-- > 0) throw moduleFailure(); return 'late'; },
    { now: () => clock, online: () => onLine });
  await assert.rejects(chunk.load(), /dynamically imported module/);
  assert.equal(chunk.state, 'failed');
  assert.equal(chunk.terminal, false);
  assert.match(String(chunk.error), /dynamically imported module/);
  await assert.rejects(chunk.load(), /dynamically imported module/, 'inside the backoff the kept failure answers');
  assert.equal(calls, 1, 'nothing asked again inside the backoff');
  clock = 2_000;
  onLine = false;
  await assert.rejects(chunk.load());
  assert.equal(calls, 1, 'nothing asked again while offline');
  onLine = true;
  await assert.rejects(chunk.load(), /dynamically imported module/);
  assert.equal(calls, 2, 'the first ask past 2 s asks again');
  clock = 5_000;
  await assert.rejects(chunk.load());
  assert.equal(calls, 2, 'the second backoff is 4 s');
  clock = 6_000;
  assert.equal(await chunk.load(), 'late', 'a transient failure no longer stands for the session');
  assert.equal(chunk.state, 'ready');
  assert.equal(chunk.error, null);
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

// ---- the budget: the fifth failure is terminal (lazyImportRetry LAZY_IMPORT_RETRY.maxFailures)
{
  let clock = 0;
  let calls = 0;
  const chunk = createLazyChunk(async () => { calls++; throw moduleFailure(); }, { now: () => clock });
  for (let i = 0; i < 5; i++) {
    await assert.rejects(chunk.load());
    clock += 60_000;
  }
  assert.equal(calls, 5);
  assert.equal(chunk.terminal, true);
  await assert.rejects(chunk.load());
  assert.equal(calls, 5, 'a spent budget asks no more');
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
  clock = 2_000;
  const module = await chunk.load();
  assert.equal(typeof module.importRetryDelayMs, 'function', 'the chunk asked again after the blip lands');
  hook.deregister();
}

await settle();
assert.deepEqual(unhandled, []);
console.log('lazyChunk.selftest: idle/loading/ready/failed; a failed stylesheet is terminal; a module failure is asked again past the 2/4 s backoff, never offline, five at most');
