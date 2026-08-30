import assert from 'node:assert/strict';
import { createNetworkBattleComposition } from './networkBattleComposition.ts';

const seen = {};
const calls = [];
const round = {
  disposePresentation: () => calls.push('dispose'),
  clearRound: () => calls.push('clear-round'),
  resetBattleState: () => calls.push('reset'),
  close: (reason) => calls.push(`close:${reason}`),
};
const activation = { activate: () => calls.push('activate') };
const presentation = {
  preload: () => Promise.resolve('presentation'),
  present: () => Promise.resolve('presented'),
};
const launcher = {
  beginPrivate: () => Promise.resolve(true),
  beginRematch: () => { calls.push('rematch'); return Promise.resolve(true); },
  beginRanked: () => Promise.resolve(),
  cancel: () => calls.push('cancel'),
};
const lobby = {
  preload: () => { calls.push('preload-lobby'); return true; },
  pendingCount: 0,
  preparedBuilderCount: 0,
};
const room = {
  clear: () => calls.push('clear-room'),
};

const runtime = createNetworkBattleComposition({
  round: { game: {}, session: {} },
  presentation: { presentation: {} },
  launcher: {},
  lobby: {},
  room: {},
  activation: {},
}, {
  createRound(options) { seen.round = options; return round; },
  createPresentation(options) { seen.presentation = options; return presentation; },
  createLauncher(options) { seen.launcher = options; return launcher; },
  createLobby(options) { seen.lobby = options; return lobby; },
  createRoom(options) { seen.room = options; return room; },
  createActivation(options) { seen.activation = options; return activation; },
});

assert.equal(runtime.round, round);
assert.equal(runtime.activation, activation);
assert.equal(runtime.presentation, presentation);
assert.equal(runtime.launcher, launcher);
assert.equal(runtime.lobby, lobby);
assert.equal(runtime.room, room);

assert.equal(seen.round.getEntryOwner(), launcher,
  'round teardown resolves the final launcher owner');
assert.equal(seen.round.getRoomOwner(), room,
  'round teardown resolves the final room owner');
assert.equal(seen.launcher.getRoomCoordinator(), room,
  'launcher resolves the same retained room owner');
assert.equal(seen.launcher.resetBattleState, round.resetBattleState);
assert.equal(seen.launcher.presentBattle, presentation.present);
assert.equal(seen.launcher.disposePresentation, round.disposePresentation);
assert.equal(seen.launcher.clearNetworkRound, round.clearRound);
assert.equal(seen.launcher.closeMatch, round.close);
assert.equal(seen.lobby.preloadPresentation, presentation.preload);
assert.equal(seen.room.preloadLobbyIntent, lobby.preload);
assert.equal(seen.room.onRematch, launcher.beginRematch);
assert.equal(seen.room.onClose, round.close);

const presentationOptions = seen.presentation.options();
assert.equal(presentationOptions.presentation.resetRoundState, round.resetBattleState);
assert.equal(presentationOptions.presentation.activate, activation.activate);

seen.room.preloadLobbyIntent();
await seen.room.onRematch({ players: [] });
seen.room.onClose('owner-left');
presentationOptions.presentation.resetRoundState();
presentationOptions.presentation.activate({});
assert.deepEqual(calls, [
  'preload-lobby',
  'rematch',
  'close:owner-left',
  'reset',
  'activate',
]);

console.log('networkBattleComposition.selftest: circular lifecycle ownership passed');
