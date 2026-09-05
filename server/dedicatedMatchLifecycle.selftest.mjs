import assert from 'node:assert/strict';
import { DedicatedMatchRegistry } from './dedicatedMatchRegistry.ts';
import { dedicatedCollisionCacheStats } from './dedicatedWorldCollision.ts';

const players = [
  { id: 'lease-alpha', specId: 'm1a2', team: 'alpha' },
  { id: 'lease-bravo', specId: 'm1a2', team: 'bravo' },
];
const leases = () => dedicatedCollisionCacheStats().terrain.activeLeases;
const registry = new DedicatedMatchRegistry();
assert.equal(leases(), 0);
registry.createMatch({ matchId: 'lease_match_a', players });
registry.createMatch({ matchId: 'lease_match_b', players });
assert.equal(leases(), 2);
assert.strictEqual(registry.matches.get('lease_match_a').simulation.heightField,
  registry.matches.get('lease_match_b').simulation.heightField);
registry.removeMatch('lease_match_a');
registry.removeMatch('lease_match_a');
assert.equal(leases(), 1, 'removal releases exactly one active map lease');
registry.matches.get('lease_match_b').finishedAtMs = Date.now() - 31_000;
registry.advance(0);
assert.equal(leases(), 0, 'completed-match expiry releases terrain ownership');
registry.createMatch({ matchId: 'lease_match_c', players });
registry.createMatch({ matchId: 'lease_match_d', mapId: 'desert', players });
registry.close();
assert.equal(leases(), 0, 'registry close releases every map');

const invalid = new DedicatedMatchRegistry();
assert.throws(() => invalid.createMatch({
  matchId: 'lease_bad_spec', players: [{ ...players[0], specId: 'not-a-tank' }, players[1]],
}), /Unknown tank id: not-a-tank/);
assert.equal(leases(), 0, 'failed simulation creation releases its acquired terrain');
const failedRuntime = new DedicatedMatchRegistry({ runtimeFactory() { throw new Error('runtime failed'); } });
assert.throws(() => failedRuntime.createMatch({ matchId: 'lease_bad_runtime', players }), /runtime failed/);
assert.equal(leases(), 0, 'failed runtime creation releases its acquired terrain');
const throwingClose = new DedicatedMatchRegistry({
  runtimeFactory() { return { close() { throw new Error('close failed'); } }; },
});
throwingClose.createMatch({ matchId: 'lease_bad_close', players });
assert.throws(() => throwingClose.removeMatch('lease_bad_close'), /close failed/);
assert.equal(leases(), 0, 'even a failing transport close cannot leak terrain ownership');
const failingRegistryClose = new DedicatedMatchRegistry({
  runtimeFactory() { return { close() { throw new Error('close failed'); } }; },
});
failingRegistryClose.createMatch({ matchId: 'lease_close_a', players });
failingRegistryClose.createMatch({ matchId: 'lease_close_b', mapId: 'desert', players });
assert.throws(() => failingRegistryClose.close(), /dedicated registry close failed/);
assert.equal(leases(), 0, 'a failing close cannot skip other active matches');
assert.equal(failingRegistryClose.matches.size, 0);
const failingUnsubscribe = new DedicatedMatchRegistry();
failingUnsubscribe.createMatch({ matchId: 'lease_unsubscribe', players });
failingUnsubscribe.matches.get('lease_unsubscribe').players.get('lease-alpha').unsubscribeClose = () => {
  throw new Error('unsubscribe failed');
};
assert.throws(() => failingUnsubscribe.removeMatch('lease_unsubscribe'), /unsubscribe failed/);
assert.equal(leases(), 0, 'a failing channel unsubscribe cannot leak terrain ownership');
assert.equal(dedicatedCollisionCacheStats().terrain.idleMaps, 2);
console.log('dedicatedMatchLifecycle.selftest: remove, expiry, close, and failure release passed');
