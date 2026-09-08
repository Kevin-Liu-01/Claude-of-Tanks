import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { awaitMapCaptureReadiness } from './mapCaptureReadiness.ts';
import { createSourcedTextureState } from '../world/sourcedTextureReceipt.ts';

const good = [{ target: 'terrain test/G', applied: true, failures: [] }];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const clock = () => {
  const tasks = new Map();
  let next = 0;
  return { tasks, schedule(fn) { tasks.set(++next, fn); return next; }, cancel(id) { tasks.delete(id); } };
};
const pending = deferred();
const world = { mapId: 'whiteout', minimapTextureState: createSourcedTextureState(pending.promise, Promise.resolve(good)) };
const time = clock();
let active = world;
let complete = false;
const ready = awaitMapCaptureReadiness(world, () => active, 120000, time).then((receipt) => { complete = true; return receipt; });
await Promise.resolve();
assert.equal(complete, false, 'capture cannot resolve before the actual swaps');
pending.resolve(good);
assert.deepEqual(await ready, { mapId: 'whiteout', requested: 2, applied: 2 });
assert.equal(time.tasks.size, 0, 'successful capture clears its timeout');

for (const state of [
  createSourcedTextureState(Promise.resolve([{ target: 'terrain/G', applied: false, failures: ['color.jpg'] }]), Promise.resolve(good)),
  createSourcedTextureState(Promise.resolve([{ target: 'terrain/G', applied: true, failures: ['roughness.jpg'] }]), Promise.resolve(good)),
  createSourcedTextureState(Promise.reject(new Error('source promise rejection')), Promise.resolve(good)),
  createSourcedTextureState(undefined, Promise.resolve(good)),
]) {
  const bad = { mapId: 'failed', minimapTextureState: state };
  const timer = clock();
  await assert.rejects(awaitMapCaptureReadiness(bad, () => bad, 120000, timer), /sourced texture capture failed/);
  assert.equal(timer.tasks.size, 0, 'failed receipt clears its timer without an unhandled rejection');
}
const rawRejection = { mapId: 'reject', minimapTextureState: { promise: Promise.reject(new Error('raw rejection')) } };
const rejectionClock = clock();
await assert.rejects(awaitMapCaptureReadiness(rawRejection, () => rawRejection, 1, rejectionClock), /raw rejection/);
assert.equal(rejectionClock.tasks.size, 0);
const stuck = deferred();
const slow = { mapId: 'stuck', minimapTextureState: createSourcedTextureState(stuck.promise, Promise.resolve(good)) };
const timeoutClock = clock();
const timed = awaitMapCaptureReadiness(slow, () => slow, 120000, timeoutClock);
for (const callback of timeoutClock.tasks.values()) callback();
await assert.rejects(timed, /timed out/);
assert.equal(timeoutClock.tasks.size, 0);
stuck.resolve(good);
await slow.minimapTextureState.promise;
assert.equal(slow.minimapTextureState.settled, true, 'capture timeout does not cancel shared production image work');
await assert.rejects(awaitMapCaptureReadiness(world, () => null), /stale/);
const changing = deferred();
const changed = { mapId: 'old', minimapTextureState: createSourcedTextureState(changing.promise, Promise.resolve(good)) };
active = changed;
const changedClock = clock();
const stale = awaitMapCaptureReadiness(changed, () => active, 120000, changedClock);
active = world;
changing.resolve(good);
await assert.rejects(stale, /changed while loading/);
assert.equal(changedClock.tasks.size, 0);

const main = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /bakeMinimapForMap: async[\s\S]{0,200}await import\('\.\/dev\/mapCaptureReadiness\.ts'\)/);
assert.match(main, /await awaitMapCaptureReadiness\(next, currentWorld\)[\s\S]{0,500}requireTextured: true[\s\S]{0,140}exportMinimapBackground\('image\/webp', 0\.92, true\)/);
const activation = await readFile(new URL('../world/worldActivationRuntime.ts', import.meta.url), 'utf8');
assert.doesNotMatch(activation, /awaitMapCaptureReadiness|minimapTextureState\.promise/, 'production world activation acquires no new blocking wait');
console.log('mapCaptureReadiness.selftest: deferred swaps, errors, timeout cleanup, stale worlds, capture-only wiring passed');
