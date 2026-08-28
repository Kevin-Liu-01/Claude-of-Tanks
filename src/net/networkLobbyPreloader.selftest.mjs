import assert from 'node:assert/strict';
import { createNetworkLobbyPreloader } from './networkLobbyPreloader.ts';

const calls = [];
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
  prefetchWorld: (mapId) => calls.push(`map:${mapId}`),
});

const waiting = {
  phase: 'waiting', mapId: 'fjord',
  players: [{ id: 'a', specId: 'm1a2' }, { id: 'b', specId: 't90m' }],
};
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

phase = 'battle';
assert.equal(preloader.preload(waiting), false, 'live battle packets cannot start garage work');

console.log('networkLobbyPreloader.selftest: coalescing, retry, roster delta and map intent passed');
