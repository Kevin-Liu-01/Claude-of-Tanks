import assert from 'node:assert/strict';
import { createBattleEntryAcquisition } from './battleEntryAcquisition.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const soloEvents = [];
const soloA = deferred();
const soloB = deferred();
const acquisition = createBattleEntryAcquisition({ now: () => 100 });
const soloP = acquisition.acquireSolo([
  () => { soloEvents.push('interface'); return soloA.promise; },
  () => { soloEvents.push('world'); return soloB.promise; },
  () => { soloEvents.push('roster'); },
]);
await Promise.resolve();
assert.deepEqual(soloEvents, ['interface', 'world', 'roster'],
  'independent solo work begins in the same barrier');
soloA.resolve();
soloB.resolve();
await soloP;

const clientEvents = [];
const clientModules = deferred();
const clientWorld = deferred();
const clientConnect = deferred();
const published = [];
const timings = {};
let nowMs = 10;
const clientAcquisition = createBattleEntryAcquisition({ now: () => nowMs });
const clientP = clientAcquisition.acquireNetwork({
  loadModules: () => { clientEvents.push('modules'); return clientModules.promise; },
  loadWorld: () => { clientEvents.push('world'); return clientWorld.promise; },
  connect: () => { clientEvents.push('connect'); return clientConnect.promise; },
  publishMatch: (match) => published.push(match),
  timings,
});
await Promise.resolve();
assert.deepEqual(clientEvents, ['modules', 'world', 'connect'],
  'a remote client overlaps transport, modules, and world');
nowMs = 20;
clientConnect.resolve({ id: 'client-match' });
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(published, [{ id: 'client-match' }],
  'the match is published before the rest of the barrier completes');
clientModules.resolve('modules');
clientWorld.resolve('world');
assert.deepEqual(await clientP, {
  modules: 'modules', world: 'world', match: { id: 'client-match' },
});
assert.deepEqual(timings, { connectMs: 10, modulesMs: 10, worldMs: 10 });

const hostEvents = [];
const hostWorld = deferred();
const hostP = acquisition.acquireNetwork({
  loadModules: () => { hostEvents.push('modules'); return 'host-modules'; },
  loadWorld: () => { hostEvents.push('world'); return hostWorld.promise; },
  connect: () => { hostEvents.push('connect'); return { id: 'reused-match' }; },
  publishMatch: (match) => hostEvents.push(`publish:${match.id}`),
  connectAfterWorld: true,
});
await Promise.resolve();
assert.deepEqual(hostEvents, ['modules', 'world'],
  'browser authority does not connect before exact world collision exists');
hostWorld.resolve('host-world');
assert.deepEqual(await hostP, {
  modules: 'host-modules', world: 'host-world', match: { id: 'reused-match' },
});
assert.deepEqual(hostEvents, ['modules', 'world', 'connect', 'publish:reused-match'],
  'a synchronous cached rematch is accepted after the world dependency');

const failingModules = deferred();
let failureMatch = null;
const failingP = acquisition.acquireNetwork({
  loadModules: () => failingModules.promise,
  loadWorld: () => 'world',
  connect: () => ({ id: 'must-close' }),
  publishMatch: (match) => { failureMatch = match; },
});
await Promise.resolve();
await Promise.resolve();
failingModules.reject(new Error('module failed'));
await assert.rejects(failingP, /module failed/);
assert.deepEqual(failureMatch, { id: 'must-close' },
  'later failures retain the connected match for caller cleanup');

for (const rejectWorld of [false, true]) {
  const world = deferred();
  const modules = deferred();
  const transport = deferred();
  const originalError = new Error('visual module failed');
  const events = [];
  let settled = false;
  const loading = acquisition.acquireNetwork({
    loadModules: () => modules.promise,
    loadWorld: async () => {
      await world.promise;
      events.push('activate-world');
      return 'world';
    },
    connect: () => transport.promise,
    publishMatch: () => events.push('publish'),
  });
  const failedLoading = assert.rejects(loading, (error) => error === originalError)
    .then(() => { settled = true; events.push('restore-garage'); });
  modules.reject(originalError);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false,
    'module rejection must not restore Garage while the world can still activate');
  if (rejectWorld) world.reject(new Error('world failed after modules'));
  else world.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, true, 'failed entry must not wait for a hung transport');
  await failedLoading;
  assert.deepEqual(events, rejectWorld ? ['restore-garage'] : ['activate-world', 'restore-garage']);
  // The transport may reject only after caller cleanup aborts the connection.
  // Its original Promise.all observer must still own this late rejection.
  transport.reject(new Error('connection aborted during cleanup'));
  await new Promise((resolve) => setImmediate(resolve));
}

const rejectedHostWorld = new Error('host world failed');
const hostFailureEvents = [];
await assert.rejects(acquisition.acquireNetwork({
  loadModules: () => 'modules',
  loadWorld: () => { throw rejectedHostWorld; },
  connect: () => { hostFailureEvents.push('connect'); },
  publishMatch: () => hostFailureEvents.push('publish'),
  connectAfterWorld: true,
}), (error) => error === rejectedHostWorld);
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(hostFailureEvents, [],
  'a failed host world must neither connect nor leak the dependent rejection');

assert.throws(() => createBattleEntryAcquisition({ now: null }), /requires a clock/);
await assert.rejects(acquisition.acquireSolo(null), /requires tasks/);

console.log('battleEntryAcquisition.selftest: solo and network dependency ownership passed');
