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

assert.throws(() => createBattleEntryAcquisition({ now: null }), /requires a clock/);
await assert.rejects(acquisition.acquireSolo(null), /requires tasks/);

console.log('battleEntryAcquisition.selftest: solo and network dependency ownership passed');
