// The room's Garage presence (src/mp/session/lobbyIntent.ts): the pending lobby the Play menu holds paints the
// Garage strip and warms the room's battlefield; the composition's owned room takes over the strip; Ready,
// the vehicle pick and the admin's Start reach the menu only for the room that is still current.
import assert from 'node:assert/strict';
import { createLobbyIntent, lobbyRoomStatus } from './lobbyIntent.ts';

const lobby = (over = {}) => ({
  roomCode: 'ABC123', mode: 'private', phase: 'waiting', mapId: 'verdant', hostId: 'host',
  players: [
    { id: 'host', name: 'Host', team: 'alpha', specId: 'm1a2', ready: false, connected: true, isHost: true },
    { id: 'guest', name: 'Guest', team: 'bravo', specId: 't90m', ready: true, connected: true, isHost: false },
    { id: 'watcher', name: 'Watcher', team: 'spectator', specId: null, ready: false, connected: true, isHost: false },
  ],
  ...over,
});

// ---- the strip's view of a seat
assert.deepEqual(lobbyRoomStatus(lobby(), 'host'),
  { roomCode: 'ABC123', mode: 'private', ready: false, canSetReady: true, readyCount: 1, total: 2 });
assert.equal(lobbyRoomStatus(lobby(), 'watcher').canSetReady, false, 'a spectator never readies');
assert.equal(lobbyRoomStatus(lobby({ phase: 'playing' }), 'host').canSetReady, false, 'only a waiting room readies');
assert.equal(lobbyRoomStatus(lobby(), 'stranger'), null, 'a seat outside the room has no status');

function harness() {
  const calls = [];
  const menu = {
    setReady: (ready) => { calls.push(['menu.setReady', ready]); return true; },
    syncGarageSelection: () => { calls.push(['menu.sync']); return true; },
    startRound: () => { calls.push(['menu.start']); return true; },
  };
  let menuPromise = Promise.resolve(menu);
  const preloaded = [];
  let phase = 'garage';
  const intent = createLobbyIntent({
    getMenu: () => menuPromise,
    setGarageStatus: (status) => calls.push(['garage', status]),
    preloader: {
      getGamePhase: () => phase,
      preloadPresentation: async () => preloaded.push('presentation'),
      preloadVisuals: async () => preloaded.push('visuals'),
      preloadBattleModules: async () => preloaded.push('battle-modules'),
      ensureTankBuilders: async (ids) => preloaded.push(`builders:${ids.join(',')}`),
      loadWorldModule: async () => preloaded.push('world-module'),
      cancelBackgroundWorldBuildsExcept: (mapId) => preloaded.push(`cancel-except:${mapId}`),
      prefetchWorld: (mapId, options) => preloaded.push(`prefetch:${mapId}:${options?.intent ? 'intent' : 'passive'}`),
    },
  });
  const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
  return { calls, menu, preloaded, intent, flush, setMenu: (value) => { menuPromise = value; }, setPhase: (value) => { phase = value; } };
}

assert.throws(() => createLobbyIntent({}), /requires its menu, Garage and preparation ports/);

// ---- a pending lobby paints the strip and warms the room's battlefield once
{
  const h = harness();
  h.intent.handleLobbyChange({ state: lobby(), playerId: 'host', role: 'host' });
  assert.deepEqual(h.calls, [['garage', { roomCode: 'ABC123', mode: 'private', ready: false, canSetReady: true, readyCount: 1, total: 2 }]]);
  await h.flush();
  assert.ok(h.preloaded.includes('presentation') && h.preloaded.includes('battle-modules') && h.preloaded.includes('visuals'));
  assert.ok(h.preloaded.includes('builders:m1a2,t90m'), 'only the roster builders transfer (no spectator seat)');
  assert.ok(h.preloaded.includes('prefetch:verdant:intent'), 'the fixed map warms with explicit intent');
  const transfers = () => h.preloaded.filter((entry) => !/^(prefetch|cancel-except):/.test(entry));
  const before = transfers().length;
  h.intent.handleLobbyChange({ state: lobby({ players: lobby().players.map((p) => ({ ...p, ready: true })) }), playerId: 'host', role: 'host' });
  await h.flush();
  assert.equal(transfers().length, before, 'a second lobby packet repeats no module or builder transfer');
  assert.equal(h.preloaded.filter((entry) => entry === 'prefetch:verdant:intent').length, 2,
    'the map intent is re-asserted on every waiting-room packet (the world coordinator deduplicates)');
  assert.equal(h.intent.prepareLobby(), true, 'explicit Battle intent prepares the room, not a solo roster');
  assert.equal(h.calls.at(-1)[1].readyCount, 2, 'the strip follows the newest packet');
  h.intent.handleLobbyChange(null);
  assert.deepEqual(h.calls.at(-1), ['garage', null], 'the menu closing clears the strip');
  assert.equal(h.intent.prepareLobby(), false);
  assert.equal(h.intent.setReady(true), false, 'no room, no click');
}

// ---- Ready, the vehicle pick and Start reach the menu for the current room only
{
  const h = harness();
  h.intent.handleLobbyChange({ state: lobby(), playerId: 'host', role: 'host' });
  assert.equal(h.intent.setReady(true), true);
  await h.flush();
  assert.deepEqual(h.calls.filter(([name]) => name === 'menu.setReady'), [['menu.setReady', true]]);
  h.intent.syncSelection();
  await h.flush();
  assert.ok(h.calls.some(([name]) => name === 'menu.sync'));
  assert.equal(h.intent.startRound(), true, 'the admin of a waiting room may start it');
  await h.flush();
  assert.ok(h.calls.some(([name]) => name === 'menu.start'));
  // a guest never starts; a spectator never readies; a playing room takes neither
  h.intent.handleLobbyChange({ state: lobby(), playerId: 'guest', role: 'client' });
  assert.equal(h.intent.startRound(), false);
  h.intent.handleLobbyChange({ state: lobby(), playerId: 'watcher', role: 'client' });
  assert.equal(h.intent.setReady(true), false);
  h.intent.handleLobbyChange({ state: lobby({ phase: 'playing' }), playerId: 'host', role: 'host' });
  assert.equal(h.intent.setReady(true), false);
  assert.equal(h.intent.startRound(), false);
  // a click whose room was replaced before the menu resolved is dropped
  const gate = {};
  gate.promise = new Promise((resolve) => { gate.resolve = resolve; });
  h.setMenu(gate.promise);
  h.intent.handleLobbyChange({ state: lobby(), playerId: 'host', role: 'host' });
  const clicksBefore = h.calls.filter(([name]) => name === 'menu.setReady').length;
  assert.equal(h.intent.setReady(true), true);
  h.intent.handleLobbyChange({ state: lobby({ roomCode: 'ZZZ999' }), playerId: 'host', role: 'host' });
  gate.resolve(h.menu);
  await h.flush();
  assert.equal(h.calls.filter(([name]) => name === 'menu.setReady').length, clicksBefore, 'a replaced room drops the stale click');
  // a menu that never came (a failed import) drops the click without an unhandled rejection
  h.setMenu(Promise.reject(new Error('menu import failed')));
  h.intent.handleLobbyChange({ state: lobby(), playerId: 'host', role: 'host' });
  assert.equal(h.intent.setReady(true), true);
  await h.flush();
  h.setMenu(null);
  assert.equal(h.intent.setReady(true), false, 'no menu promise, no relay');
}

// ---- the owned room (the composition's, via the room-state event) takes the strip over from the pending lobby
{
  const h = harness();
  h.intent.handleLobbyChange({ state: lobby(), playerId: 'host', role: 'host' });
  h.intent.handleRoomState({ state: lobby({ roomCode: 'OWNED1', players: lobby().players.map((p) => ({ ...p, ready: true })) }), playerId: 'host', role: 'host' });
  assert.equal(h.intent.current.state.roomCode, 'OWNED1', 'the owned room wins');
  await h.flush();
  assert.ok(h.preloaded.includes('prefetch:verdant:intent'));
  const garageCalls = h.calls.filter(([name]) => name === 'garage').length;
  h.intent.handleLobbyChange(null);
  assert.equal(h.calls.filter(([name]) => name === 'garage').length, garageCalls,
    'the menu closing never clears the strip an owned room paints');
  assert.equal(h.intent.startRound(), true, 'the end screen Start for the owned room goes to the menu');
  assert.equal(h.intent.setReady(false), true);
  h.intent.handleRoomState(null);
  assert.equal(h.intent.current, null, 'the room released: nothing current');
  assert.equal(h.intent.prepareLobby(), false);
  h.intent.handleRoomState({ not: 'a context' });
  assert.equal(h.intent.current, null, 'a malformed event is no room');
  // the preparation stops outside the Garage and outside a waiting room
  h.setPhase('battle');
  h.intent.handleLobbyChange({ state: lobby({ roomCode: 'LATER1' }), playerId: 'host', role: 'host' });
  assert.equal(h.intent.prepareLobby(), false, 'no preparation while a battle is live');
}

console.log('lobbyIntent.selftest: the pending and owned rooms paint the Garage strip, warm the battlefield and relay the strip');
