import assert from 'node:assert/strict';
import { createNetworkBattleIntentCover } from './networkBattleIntentCover.ts';

const calls = [];
const game = { result: 'victory', resultReason: 'elimination', timeS: 91, preBattleS: 0 };
const cover = createNetworkBattleIntentCover({
  game,
  battleLoad: {
    show: (info) => calls.push(['show', info]),
    progress: (fraction, label) => calls.push(['progress', fraction, label]),
    hide: async () => calls.push(['hide']),
  },
  rosterRows: (state, team, viewerId) => state.players
    .filter((player) => player.team === team)
    .map((player) => ({ id: player.specId, isPlayer: player.id === viewerId })),
  getMapPresentation: (mapId, fallback) => ({
    name: mapId ? `Map ${mapId}` : fallback,
    thumb: mapId ? `${mapId}.webp` : '',
    biome: mapId || 'none',
  }),
  coverRendering: () => calls.push(['cover']),
  uncoverRendering: () => calls.push(['uncover']),
});

cover.show({
  role: 'host',
  session: { roomInfo: { peerId: 'host' } },
  lobbyState: {
    mode: 'private',
    mapId: 'verdant',
    players: [
      { id: 'host', team: 'alpha', specId: 'm1a1' },
      { id: 'guest', team: 'bravo', specId: 't90m' },
    ],
  },
});

assert.deepEqual(game, {
  result: null, resultReason: null, timeS: 0, preBattleS: Infinity,
}, 'cold network intent clears the previous verdict and clock before any import or await');
assert.equal(calls[0][0], 'cover', 'render cover is acquired synchronously');
assert.equal(calls[1][0], 'show', 'the opaque room briefing follows in the same turn');
assert.equal(calls[1][1].mapName, 'Map verdant');
assert.deepEqual(calls[1][1].allies, [{ id: 'm1a1', isPlayer: true }]);
assert.deepEqual(calls[1][1].enemies, [{ id: 't90m', isPlayer: false }]);
assert.deepEqual(calls[2], ['progress', 0.005, 'Loading multiplayer runtime']);

await cover.releaseAfterFailure();
assert.deepEqual(calls.slice(-2).map(([name]) => name), ['uncover', 'hide'],
  'failed composition acquisition releases rendering before hiding the veil');

assert.throws(
  () => createNetworkBattleIntentCover({}),
  /requires loader, roster, and lifecycle ports/,
);

console.log('networkBattleIntentCover.selftest: synchronous cold intent cover passed');
