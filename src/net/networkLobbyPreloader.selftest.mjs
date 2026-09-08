import assert from 'node:assert/strict';
import { createNetworkLobbyPreloader } from './networkLobbyPreloader.ts';

const calls = [];
const mapRequests = [];
let phase = 'garage';
let failChat = true;
const preloader = createNetworkLobbyPreloader({
  getGamePhase: () => phase,
  preloadPresentation: async () => { calls.push('presentation'); },
  preloadVisuals: async () => { calls.push('visuals'); },
  preloadBattleModules: async () => { calls.push('modules'); },
  preloadChat: async () => {
    calls.push('chat');
    if (failChat) throw new Error('cold chunk failed');
  },
  ensureTankBuilders: async (ids) => { calls.push(`builders:${ids.join(',')}`); },
  loadWorldModule: async () => { calls.push('world-module'); },
  cancelBackgroundWorldBuildsExcept: (mapId) => calls.push(`cancel:${mapId}`),
  prefetchWorld: (mapId, options) => {
    mapRequests.push({ mapId, options });
    calls.push(`map:${mapId}`);
  },
});

const waiting = {
  phase: 'waiting', mapId: 'fjord',
  players: [{ id: 'a', specId: 'm1a2' }, { id: 'b', specId: 't90m' }],
};
for (const state of [null, undefined, { ...waiting, phase: 'starting' },
  { ...waiting, phase: 'battle' }]) {
  assert.equal(preloader.preload(state), false,
    'only a joined waiting room can start preparation');
}
assert.deepEqual(calls, [], 'absent and nonwaiting rooms do not prepare or cancel maps');
assert.equal(preloader.preload(waiting), true);
assert.equal(preloader.preload(waiting), true, 'duplicate room packets remain accepted');
await Promise.resolve();
await Promise.resolve();
assert.equal(calls.filter((entry) => entry === 'presentation').length, 1,
  'settled core transfers do not repeat');
assert.equal(calls.filter((entry) => entry.startsWith('builders:')).length, 1,
  'identical roster builders coalesce');
assert.equal(calls.filter((entry) => entry === 'map:fjord').length, 1,
  'identical map intent does not restart background construction');
assert.deepEqual(mapRequests, [{ mapId: 'fjord', options: { intent: true } }],
  'a fixed joined-room map uses the existing explicit-intent background lane');
assert.ok(calls.indexOf('cancel:fjord') < calls.indexOf('map:fjord'),
  'stale map cancellation precedes new intent construction');

failChat = false;
await Promise.resolve();
preloader.preload(waiting);
await Promise.resolve();
assert.equal(calls.filter((entry) => entry === 'chat').length, 2,
  'a failed optional transfer retries from the next room packet');

preloader.preload({
  ...waiting,
  mapId: 'random',
  players: [...waiting.players, { id: 'c', specId: 'leclerc' }],
});
await Promise.resolve();
assert.ok(calls.includes('cancel:null'), 'random map intent cancels fixed-map background work');
assert.ok(calls.some((entry) => entry === 'builders:leclerc'), 'new players warm only missing builders');
preloader.preload({ ...waiting, mapId: undefined });
assert.equal(mapRequests.length, 1, 'random and absent map choices never construct a map');

preloader.preload({ ...waiting, mapId: 'alpine' });
preloader.preload({ ...waiting, mapId: 'alpine' });
assert.deepEqual(mapRequests, [
  { mapId: 'fjord', options: { intent: true } },
  { mapId: 'alpine', options: { intent: true } },
], 'a changed fixed map starts exactly one new intent request');
assert.ok(calls.indexOf('cancel:alpine') < calls.indexOf('map:alpine'),
  'changing a fixed map still cancels its stale predecessor first');

phase = 'battle';
const callsBeforeBattlePacket = calls.slice();
assert.equal(preloader.preload(waiting), false, 'live battle packets cannot start garage work');
assert.deepEqual(calls, callsBeforeBattlePacket, 'live battle packets cannot build or cancel worlds');

console.log('networkLobbyPreloader.selftest: coalescing, retry, roster delta and map intent passed');
