import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSharedInstall, InstallCallersGoneError } from './sharedInstall.ts';

// 2026-11-02 audit R3 (sky cloud bake): ensureCloudTexturesChunked / ensureCloudDecksChunked memoized their promise with
// `??=`, so a later caller (the world activation, a second covered load) joined the first caller's promise and
// inherited the first caller's tick: when that caller's covered load was superseded and its tick rejected, the joiner
// failed too (postLazyPasses.ts fixed the same class for the post warm). And the noise worker past its deadline was never
// terminated when the sliced fallback finished first. sharedInstall.ts keeps one install in flight but gives every
// caller its own fate; sky.ts routes both installs through it and retires the noise worker once every kind is in.

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function tickOf(label, log, { failAt = Infinity } = {}) {
  let calls = 0;
  return () => { calls += 1; log.push(label); return calls >= failAt ? Promise.reject(new Error(`${label} superseded`)) : Promise.resolve(); };
}

{
  // the first caller's tick rejects while the install waits on it (its covered load was superseded): it fails alone,
  // the joiner's ticks carry the same install to the end, and the work runs once
  const log = [];
  let runs = 0, steps = 0;
  let rejectFirst = null;
  const install = createSharedInstall(async (tick) => { runs += 1; for (let i = 0; i < 6; i++) { await tick(); steps += 1; } });
  let firstCalls = 0;
  const first = install(() => {
    firstCalls += 1; log.push('first');
    return firstCalls === 1 ? Promise.resolve() : new Promise((_resolve, reject) => { rejectFirst = reject; });
  });
  const firstResult = first.then(() => 'resolved', (error) => error.message);
  await flush();
  assert.ok(rejectFirst, 'the install waits on the first caller\'s second tick');
  const second = install(tickOf('second', log));
  rejectFirst(new Error('first superseded'));
  assert.equal(await firstResult, 'first superseded', 'the superseded caller fails with its own tick');
  await second;
  assert.equal(runs, 1, 'one install, shared');
  assert.equal(steps, 6, 'it ran to the end on the joiner\'s ticks');
  assert.equal(firstCalls, 2, 'the failed tick is never asked again');
  assert.equal(log.filter((entry) => entry === 'second').length, 5);
}

{
  // every caller gone: the install stops; a later call starts a fresh one
  let runs = 0;
  const install = createSharedInstall(async (tick) => { runs += 1; for (let i = 0; i < 4; i++) await tick(); });
  const gone = install(() => Promise.reject(new Error('gone')));
  await assert.rejects(gone, /gone/);
  await flush();
  const jobs = [];
  const tracked = createSharedInstall(async (tick) => { await tick(); }, (job) => jobs.push(job === null ? 'idle' : 'busy'));
  await tracked(() => Promise.resolve());
  await flush();
  assert.deepEqual(jobs, ['busy', 'idle'], 'onJob reports the job in flight, then none');
  await install(() => Promise.resolve());
  assert.equal(runs, 2, 'a call after the abandoned install starts its own');
  const lonely = createSharedInstall(async (tick) => { await tick(); });
  let error = null;
  try { await lonely(() => Promise.reject(new Error('only caller'))); } catch (caught) { error = caught; }
  assert.match(String(error?.message), /only caller/);
  assert.ok(new InstallCallersGoneError() instanceof Error);
}

{
  // a joiner that passed no tick still completes when the tick callers are gone (without yields for it)
  const install = createSharedInstall(async (tick) => { for (let i = 0; i < 3; i++) await tick(); });
  const ticked = install(() => Promise.reject(new Error('superseded')));
  const untimed = install();
  await assert.rejects(ticked, /superseded/);
  await untimed;
}

{
  // the production wiring (sky.ts): both chunked installs share through the owner; no `??=` memo of a caller's promise;
  // the noise worker is retired once the fallback has every kind
  const sky = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
  assert.match(sky, /const texturesInstall = createSharedInstall\(\(tick\) => installCloudTexturesChunked\(tick\)\);/);
  assert.match(sky, /const decksShared = createSharedInstall\(\(tick\) => installCloudDecksChunked\(tick\), \(job\) => \{ decksInstall = job; \}\);/);
  assert.doesNotMatch(sky, /(?:chunkedInstall|decksInstall) \?\?= /, 'no memo hands a joiner the first caller\'s tick');
  const ensureNoise = sky.slice(sky.indexOf('const ensureCloudNoise = (): void => {'), sky.indexOf('const bakeCloudNoiseSliced'));
  const sliced = sky.slice(sky.indexOf('const bakeCloudNoiseSliced'), sky.indexOf('// Per-deck flags keep'));
  assert.match(ensureNoise, /retireCloudNoiseWorker\(\);/, 'the synchronous fallback retires the worker');
  assert.match(sliced, /cloudNoiseSettled = true;\s*retireCloudNoiseWorker\(\);/, 'and the sliced fallback, once every kind is in');
  assert.match(sky, /const retireCloudNoiseWorker = \(\): void => \{\s*if \(!cloudNoiseWorker \|\| !CLOUD_NOISE_KINDS\.every\(\(kind\) => cloudNoiseUpload\[kind\]\)\) return;\s*cloudNoiseWorker\.terminate\(\);/);
}

console.log('sharedInstall selftest: one cloud install, each caller its own fate; the noise worker retired after the fallback');
