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
  setReady(ready) { calls.push(['menu-ready', ready]); return true; },
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
  roomCode: 'ABC123', mode: 'private', gameMode: 'standard', phase,
  hostId: 'p1', maxPlayers: 2, maxSpectators: 2, allowTeamSwitch: true,
  locked: false, round, mapId: 'verdant', teamSize: 1, revision: round,
  matchSeed: phase === 'starting' ? 99 : null, lastResult: null,
  players: [
    { id: 'p1', name: 'Atlas', team: 'alpha', ready: false, specId: 'm1a2',
      equipment: [], camo: 'factory', connected: true, isHost: true, rating: null },
    { id: 'p2', name: 'Bishop', team: 'bravo', ready: true, specId: 't90m',
      equipment: [], camo: 'factory', connected: true, isHost: false, rating: null },
  ],
});

const options = {
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
  preloadLobbyIntent: (state) => { calls.push(['preload', state.roomCode]); return true; },
  equipmentFor: (id) => [`equipment:${id}`],
  camoFor: () => 'summer',
  onRematch: (state) => calls.push(['rematch', state.round]),
  onClose: (reason) => calls.push(['close', reason]),
  schedule: (callback) => scheduled.push(callback),
  randomUint32: () => 99,
};
const coordinator = createNetworkRoomCoordinator(options);

coordinator.handleLobbyChange({ state: room(), playerId: 'p1', role: 'host' });
coordinator.syncPendingLobbySelection();
await Promise.resolve();
assert.ok(calls.some(([name]) => name === 'sync-selection'));
assert.equal(calls.find(([name]) => name === 'garage')[1].canSetReady, true);
assert.equal(coordinator.setReady(true), true, 'Garage can ready in the initial lobby');
await Promise.resolve();
assert.deepEqual(calls.at(-1), ['menu-ready', true]);
const pendingReady = room();
pendingReady.players[0].ready = true;
coordinator.handleLobbyChange({ state: pendingReady, playerId: 'p1', role: 'host' });
assert.equal(coordinator.setReady(false), true, 'Garage can unready before the first battle');
await Promise.resolve();
assert.deepEqual(calls.at(-1), ['menu-ready', false]);

coordinator.attach(room());
await Promise.resolve();
await Promise.resolve();
assert.equal(coordinator.activePlayer.id, 'p1');
assert.ok(calls.some(([name, id]) => name === 'chat' && id === 'old'));
assert.equal(calls.filter(([name]) => name === 'attach-menu').length, 0,
  'an active battle keeps the hidden lobby DOM cold');

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
assert.equal(calls.filter(([name]) => name === 'attach-menu').length, 1,
  'explicit room presentation catches the menu up to the latest state');
stateListener({ phase: 'waiting', round: 1, revision: 2, players: [{ id: 'p1' }] });
assert.equal(await coordinator.showActiveRoom(), false,
  'a partial or malformed room packet cannot enter the complete lobby UI contract');
stateListener(room());
assert.equal(await coordinator.showActiveRoom(), true,
  'a later complete canonical room state restores lobby presentation');
assert.equal(coordinator.setReady(true), true);
assert.equal(coordinator.setReady(false), true, 'retained-room Garage can withdraw readiness');
assert.deepEqual(calls.at(-1), ['command', { type: 'set_ready', ready: false }]);
assert.equal(coordinator.startRound(), true);
assert.ok(calls.some(([name, command]) =>
  name === 'command' && command.type === 'start' && command.matchSeed === 99));

const visibleMenuUpdates = calls.filter(([name]) => name === 'update-menu').length;
stateListener(room(2, 'starting'));
assert.equal(coordinator.setReady(false), false, 'launch barrier rejects late Garage unready');
await Promise.resolve();
assert.equal(calls.filter(([name]) => name === 'update-menu').length, visibleMenuUpdates,
  'battle room revisions do not rebuild an invisible lobby');
assert.equal(scheduled.length, 1, 'one new round schedules one rematch');
scheduled.shift()();
assert.ok(calls.some(([name, round]) => name === 'rematch' && round === 2));
assert.equal(coordinator.claimRematch(room(2, 'starting')), true);
coordinator.finishRematch();

assert.equal(result, false, 'fixture exits before a result exists');
assert.equal(coordinator.shouldPreserveOnBattleExit(), true,
  'manual battle exit retains a healthy private room before the round result');
result = true;
assert.equal(coordinator.shouldPreserveOnBattleExit(), true,
  'result-screen exit retains the same room for rematches');
coordinator.clear();
await Promise.resolve();
assert.equal(coordinator.activeRoom, null);
assert.equal(coordinator.pendingLobby, null, 'closed room leaves no stale lobby reminder');
assert.equal(stateListener, null);
assert.equal(chatListener, null);
assert.ok(calls.some(([name]) => name === 'detach-menu'));

// Resolve an imported menu after another acquisition has started, including
// a rejoin of the very same room code. Room-code equality is not ownership.
for (const successor of ['lobby', 'match']) {
  let resolveMenu;
  const delayedMenu = new Promise((resolve) => { resolveMenu = resolve; });
  const delayed = createNetworkRoomCoordinator({ ...options, getPlayMenu: () => delayedMenu });
  delayed.attach(room());
  delayed.clear();
  if (successor === 'lobby') delayed.handleLobbyChange({ state: room(), playerId: 'p1' });
  else delayed.attach(room());
  const before = calls.filter(([name]) => name === 'detach-menu').length;
  resolveMenu(menu);
  await Promise.resolve();
  assert.equal(calls.filter(([name]) => name === 'detach-menu').length, before,
    `an old deferred clear cannot detach its successor ${successor}`);
  delayed.clear();
  await Promise.resolve();
}

{
  let resolveMenu;
  const delayedMenu = new Promise((resolve) => { resolveMenu = resolve; });
  const delayed = createNetworkRoomCoordinator({ ...options, getPlayMenu: () => delayedMenu });
  delayed.attach(room());
  const showing = delayed.showActiveRoom();
  delayed.clear();
  const before = calls.filter(([name]) => name === 'attach-menu' || name === 'show-menu').length;
  resolveMenu(menu);
  assert.equal(await showing, false, 'closing during menu import cancels room presentation');
  assert.equal(calls.filter(([name]) => name === 'attach-menu' || name === 'show-menu').length, before);
}

{
  let currentMatch = match;
  let adapter;
  const pendingRematches = [];
  const guarded = createNetworkRoomCoordinator({
    ...options,
    getMatch: () => currentMatch,
    getPlayMenu: () => Promise.resolve({ ...menu, attachActiveRoom(value) { adapter = value; } }),
    schedule: (callback) => pendingRematches.push(callback),
  });
  guarded.attach(room());
  assert.equal(await guarded.showActiveRoom(), true);
  const oldAdapter = adapter;
  stateListener(room(2, 'starting'));
  guarded.clear();
  currentMatch = { ...match };
  guarded.attach(room());
  const before = calls.filter(([name]) => ['command', 'close', 'rematch'].includes(name)).length;
  oldAdapter.command({ type: 'set_ready', ready: true });
  oldAdapter.leave('left_room');
  pendingRematches.shift()();
  assert.equal(calls.filter(([name]) => ['command', 'close', 'rematch'].includes(name)).length, before,
    'retired controls and scheduled rematches cannot act on a replacement owner');
  guarded.clear();
  await Promise.resolve();
}

// The Garage shortcut must be just as strict as the full lobby: neither an
// incomplete seat nor a retired/launching owner can submit readiness changes.
for (const reason of ['spectator', 'disconnected', 'no-vehicle', 'unknown', 'starting', 'playing']) {
  const deniedRoom = room();
  if (reason === 'spectator') deniedRoom.players[0].team = 'spectator';
  if (reason === 'disconnected') deniedRoom.players[0].connected = false;
  if (reason === 'no-vehicle') deniedRoom.players[0].specId = null;
  if (reason === 'unknown') deniedRoom.players = deniedRoom.players.slice(1);
  if (reason === 'starting' || reason === 'playing') deniedRoom.phase = reason;
  for (const owner of ['initial', 'retained']) {
    const guard = createNetworkRoomCoordinator(options);
    if (owner === 'initial') guard.handleLobbyChange({ state: deniedRoom, playerId: 'p1' });
    else guard.attach(deniedRoom);
    const before = calls.filter(([name]) => name === 'command' || name === 'menu-ready').length;
    assert.equal(guard.setReady(false), false, `${owner} ${reason} cannot change readiness`);
    await Promise.resolve();
    assert.equal(calls.filter(([name]) => name === 'command' || name === 'menu-ready').length, before);
    const status = calls.filter(([name]) => name === 'garage').at(-1)?.[1];
    assert.equal(status?.canSetReady ?? false, false, `${owner} ${reason} disables the Garage shortcut`);
    guard.clear();
    await Promise.resolve();
  }
}

for (const unavailable of ['no-match', 'replaced-owner', 'closed-client', 'no-command', 'rejected-command']) {
  let unavailableMatch = { ...match, client: { closed: false } };
  const guard = createNetworkRoomCoordinator({ ...options, getMatch: () => unavailableMatch });
  guard.attach(room());
  if (unavailable === 'no-match') unavailableMatch = null;
  if (unavailable === 'replaced-owner') unavailableMatch = { ...match };
  if (unavailable === 'closed-client') unavailableMatch.client.closed = true;
  if (unavailable === 'no-command') unavailableMatch.roomCommand = undefined;
  if (unavailable === 'rejected-command') unavailableMatch.roomCommand = () => false;
  const before = calls.filter(([name]) => name === 'command').length;
  assert.equal(guard.setReady(false), false, `${unavailable} cannot acknowledge a readiness change`);
  assert.equal(calls.filter(([name]) => name === 'command').length, before);
  guard.clear();
  await Promise.resolve();
}

for (const successor of ['closed', 'same-code-rejoin', 'other-room', 'starting', 'spectator', 'disconnected', 'retained']) {
  let resolveMenu;
  const deferred = new Promise((resolve) => { resolveMenu = resolve; });
  const guard = createNetworkRoomCoordinator({ ...options, getPlayMenu: () => deferred });
  guard.handleLobbyChange({ state: room(), playerId: 'p1' });
  assert.equal(guard.setReady(false), true, 'valid initial-lobby click waits for the menu owner');
  if (successor === 'closed' || successor === 'same-code-rejoin') guard.clear();
  if (successor === 'same-code-rejoin') guard.handleLobbyChange({ state: room(), playerId: 'p1' });
  if (successor === 'other-room') {
    guard.handleLobbyChange({ state: { ...room(), roomCode: 'OTHER2' }, playerId: 'p1' });
  }
  if (successor === 'starting') guard.handleLobbyChange({ state: room(1, 'starting'), playerId: 'p1' });
  if (successor === 'spectator' || successor === 'disconnected') {
    const changed = room();
    if (successor === 'spectator') changed.players[0].team = 'spectator';
    else changed.players[0].connected = false;
    guard.handleLobbyChange({ state: changed, playerId: 'p1' });
  }
  if (successor === 'retained') guard.attach(room());
  const before = calls.filter(([name]) => name === 'menu-ready').length;
  resolveMenu(menu);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.filter(([name]) => name === 'menu-ready').length, before,
    `deferred initial-lobby readiness cannot leak into ${successor}`);
  guard.clear();
  await Promise.resolve();
}

console.log('networkRoomCoordinator.selftest: lobby, chat, readiness guards, commands, and rematch lifecycle passed');
