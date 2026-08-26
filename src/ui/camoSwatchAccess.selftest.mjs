import assert from 'node:assert/strict';
import { createCamoSwatchAccess } from './camoSwatchAccess.ts';

const jobs = [];
const schedule = (callback, delayMs) => {
  const job = { callback, delayMs, cancelled: false };
  jobs.push(job);
  return job;
};
const cancel = (job) => { job.cancelled = true; };
const runNext = () => {
  const job = jobs.shift();
  assert.ok(job, 'a deferred job exists');
  if (!job.cancelled) job.callback();
  return job;
};

let playable = false;
let loads = 0;
let fail = true;
const access = createCamoSwatchAccess({
  isPlayable: () => playable,
  schedule,
  cancel,
  readyPollMs: 120,
  postReadyDelayMs: 400,
  load: async () => {
    loads++;
    if (fail) throw new Error('injected swatch transfer failure');
    return { paint: true };
  },
});

const first = access.preload();
assert.equal(loads, 0, 'decorative module does not load during boot');
assert.equal(runNext().delayMs, 120, 'boot readiness is polled at the bounded cadence');
playable = true;
assert.equal(runNext().delayMs, 120, 'the readiness poll observes the explicit playable contract');
assert.equal(loads, 0, 'post-ready decoration still honors its quiet delay');
assert.equal(runNext().delayMs, 400, 'exact painter begins after the post-ready quiet window');
await assert.rejects(first, /injected swatch transfer failure/);
assert.equal(access.isReady(), false);

fail = false;
const retry = access.preload();
const shared = access.preload({ immediate: true });
assert.equal(retry, shared, 'intent promotes the existing retry instead of duplicating it');
assert.equal(loads, 2, 'promotion starts exactly one retry generation');
assert.deepEqual(await retry, { paint: true });
assert.equal(access.isReady(), true);
assert.deepEqual(await access.preload(), { paint: true });
assert.equal(loads, 2, 'resident painter is reused');

console.log('camoSwatchAccess.selftest: PASS');
