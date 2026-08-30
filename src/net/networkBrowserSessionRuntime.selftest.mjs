import assert from 'node:assert/strict';
import { createNetworkBrowserSessionRuntime } from './networkBrowserSessionRuntime.ts';

const events = [];
const client = {
  closed: false,
  connected: true,
  lastSubmittedInputSeq: null,
  onConnection: () => () => events.push('unsubscribe'),
};
function match(id) {
  return {
    id,
    role: 'client',
    client,
    ready: () => events.push(`ready:${id}`),
    close: (reason) => events.push(`close:${id}:${reason}`),
    advance: () => null,
    update: () => null,
    submitInput: () => false,
  };
}
function bridge(id) {
  return {
    id,
    entities: new Map([['tank', { id: 'tank' }]]),
    apply: () => {},
    recordInput: () => {},
    dispose: () => events.push(`bridge:${id}`),
  };
}
function status(id) {
  return {
    id,
    set: () => {},
    update: () => {},
    dispose: () => events.push(`status:${id}`),
  };
}

const runtime = createNetworkBrowserSessionRuntime({
  getPlayer: () => null,
  isBattleActive: () => false,
  shouldPresentDisconnect: () => false,
  nextFrame: async () => {},
});
const firstMatch = match('one');
const firstBridge = bridge('one');
const firstStatus = status('one');
runtime.publishMatch(firstMatch);
runtime.publishBridge(firstBridge);
runtime.publishStatus(firstStatus);
runtime.attachRecovery();
runtime.setSpectator(true);
assert.equal(runtime.match, firstMatch);
assert.equal(runtime.bridge, firstBridge);
assert.equal(runtime.status, firstStatus);
assert.equal(runtime.spectator, true);
assert.deepEqual(runtime.resolveEntity('tank'), { id: 'tank' });

const duplicateMatch = match('two');
assert.throws(() => runtime.publishMatch(duplicateMatch), /different network match/);
assert.ok(events.includes('close:two:superseded_before_publish'),
  'a late second transport is closed instead of replacing the live match');
const duplicateBridge = bridge('two');
assert.throws(() => runtime.publishBridge(duplicateBridge), /different network bridge/);
assert.ok(events.includes('bridge:two'),
  'a late second bridge is disposed before its publication is rejected');
const duplicateStatus = status('two');
assert.throws(() => runtime.publishStatus(duplicateStatus), /different network status/);
assert.ok(events.includes('status:two'),
  'a late second status surface is disposed before publication is rejected');

runtime.close('explicit_leave');
assert.equal(runtime.match, null);
assert.equal(runtime.bridge, null);
assert.equal(runtime.status, null);
assert.equal(runtime.spectator, false);
assert.deepEqual(events.slice(-4), [
  'close:one:explicit_leave',
  'unsubscribe',
  'bridge:one',
  'status:one',
]);

assert.throws(() => createNetworkBrowserSessionRuntime({}), /requires player, phase, and frame ports/);

const incompleteRuntime = createNetworkBrowserSessionRuntime({
  getPlayer: () => null,
  isBattleActive: () => false,
  shouldPresentDisconnect: () => false,
  nextFrame: async () => {},
});
incompleteRuntime.publishMatch({
  ...match('incomplete'),
  update: () => ({
    tick: 1,
    entities: [{ id: 'viewer' }],
    meta: { phase: 'playing' },
  }),
});
incompleteRuntime.pump(1 / 60, 0);
await assert.rejects(
  incompleteRuntime.waitForInitialSnapshot({ viewerId: 'viewer' }),
  /incomplete sampled snapshot/,
  'cold entry rejects a partial transport sample before bridge activation',
);
assert.equal(incompleteRuntime.latestSnapshot, null,
  'partial snapshots are never exposed through the typed presentation view');
incompleteRuntime.close('test_complete');

console.log('networkBrowserSessionRuntime.selftest: single ownership and teardown order passed');
