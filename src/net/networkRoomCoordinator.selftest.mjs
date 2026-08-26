import assert from 'node:assert/strict';
import { createNetworkRoomCoordinator } from './networkRoomCoordinator.ts';

const calls = [];
let stateListener = null;
let chatListener = null;
const match = {
  playerId: 'p1',
  role: 'host',
  client: { closed: false },
  roomCommand(command) { calls.push(['command', command]); return true; },
  onRoomState(listener) { stateListener = listener; return () => { stateListener = null; }; },
  onRoomChat(listener) { chatListener = listener; return () => { chatListener = null; }; },
  getRoomChatHistory() { return [{ id: 'old' }]; },
  sendRoomChat(text) { calls.push(['chat-send', text]); return true; },
};
const menu = {
  attachActiveRoom(adapter) { calls.push(['attach-menu', adapter.state.roomCode]); },
  updateActiveRoom(state) { calls.push(['update-menu', state.round]); },
  detachActiveRoom() { calls.push(['detach-menu']); },
  showActiveRoom() { calls.push(['show-menu']); return true; },
  syncGarageSelection() { calls.push(['sync-selection']); },
};
const chat = {
  append(message) { calls.push(['chat', message.id]); },
  setPlayer(id) { calls.push(['chat-player', id]); },
  setActive(active) { calls.push(['chat-active', active]); },
  clear() { calls.push(['chat-clear']); },
};
const scheduled = [];
let result = false;
const room = (round = 1, phase = 'waiting') => ({
  roomCode: 'ABC123', mode: 'private', phase, round, mapId: 'verdant',
  players: [
    { id: 'p1', team: 'alpha', ready: false, specId: 'm1a2', camo: 'factory' },
    { id: 'p2', team: 'bravo', ready: true, specId: 't90m' },
  ],
});

const coordinator = createNetworkRoomCoordinator({
  getMatch: () => match,
  getPlayMenu: () => Promise.resolve(menu),
  loadRoomChat: async () => ({ createRoomChat: () => chat }),
  getPhase: () => 'battle',
  isSettingsOpen: () => false,
  hasResult: () => result,
  isKillcamActive: () => false,
  isSpectator: () => false,
  input: {},
  setGarageStatus: (status) => calls.push(['garage', status]),
  emitRoomState: (payload) => calls.push(['emit', payload]),
  preloadLobbyIntent: (state) => calls.push(['preload', state.roomCode]),
  equipmentFor: (id) => [`equipment:${id}`],
  camoFor: () => 'summer',
  onRematch: (state) => calls.push(['rematch', state.round]),
  onClose: (reason) => calls.push(['close', reason]),
  schedule: (callback) => scheduled.push(callback),
  randomUint32: () => 99,
});

coordinator.handleLobbyChange({ state: room(), playerId: 'p1', role: 'host' });
coordinator.syncPendingLobbySelection();
await Promise.resolve();
assert.ok(calls.some(([name]) => name === 'sync-selection'));

coordinator.attach(room());
await Promise.resolve();
await Promise.resolve();
assert.equal(coordinator.activePlayer.id, 'p1');
assert.ok(calls.some(([name, id]) => name === 'chat' && id === 'old'));

coordinator.syncVehicle('m1a2sepv3');
assert.ok(calls.some(([name, command]) =>
  name === 'command' && command.type === 'select_vehicle' && command.specId === 'm1a2sepv3'));
assert.ok(calls.some(([name, command]) =>
  name === 'command' && command.type === 'select_equipment'));
assert.ok(calls.some(([name, command]) =>
  name === 'command' && command.type === 'select_camo' && command.camo === 'summer'));

chatListener({ id: 'new' });
assert.ok(calls.some(([name, id]) => name === 'chat' && id === 'new'));
assert.equal(await coordinator.showActiveRoom(), true);
assert.equal(coordinator.setReady(true), true);
assert.equal(coordinator.startRound(), true);
assert.ok(calls.some(([name, command]) =>
  name === 'command' && command.type === 'start' && command.matchSeed === 99));

stateListener(room(2, 'starting'));
assert.equal(scheduled.length, 1, 'one new round schedules one rematch');
scheduled.shift()();
assert.ok(calls.some(([name, round]) => name === 'rematch' && round === 2));
assert.equal(coordinator.claimRematch(room(2, 'starting')), true);
coordinator.finishRematch();

result = true;
assert.equal(coordinator.shouldPreserveAfterResult(), true);
coordinator.clear();
await Promise.resolve();
assert.equal(coordinator.activeRoom, null);
assert.equal(stateListener, null);
assert.equal(chatListener, null);
assert.ok(calls.some(([name]) => name === 'detach-menu'));

console.log('networkRoomCoordinator.selftest: lobby, chat, commands, and rematch lifecycle passed');
