// Proof (implicit state machine audit F6, 2026-11-02): the Play menu's seat is one declared state with one owner.
// The menu spread it over ten variables; the hazards it bred, reproduced here by running the menu's own functions
// (cut from src/ui/playMenu.ts, their types stripped) against stubs, since the menu itself needs a DOM:
// (A) the battle handoff kept the menu's room observation live, so the hidden lobby re-rendered through the whole
//     first round (the roster, the URL, the page metadata, the stored mode, a non-null lobby to the Garage strip);
// (B) a handoff the battle owner rejected re-showed the menu, whose render began the same handoff again, without end;
// (C) every lobby render stored the room's mode as the player's own preference (a guest came home with the host's);
// (D) the host's mode choice was shown at once and never rolled back when the room refused it.
// (E) (2026-11-03, the round-1 review) a seat the menu released to the battle owner had no handoff latch: every
//     match_start the room re-sent (one per admission, so per room-socket blip) ran the composition's round entry
//     again, and its busy answer revealed the lobby over the loading battle.
// (F) (round 2 U8) the callers that start a connect, an adoption or a handoff carried on when moveSeat refused the move:
//     from 'attached' a connect went out and its room was adopted (`session` set while the seat stayed 'attached'), and
//     an own handoff from a seat that cannot hand off ran the battle owner's round entry.
// (G) (round 2 U8, Q4) seatRendersLobby was asserted here but read by nothing in the menu: the menu's own room observer
//     now renders through it, so only the lobby the menu holds renders from the room's updates.
// Plus the pure table (src/ui/playMenuSeat.ts) and the one locked rule every rules control reads.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { PLAY_MENU_SEAT_MOVES, nextPlayMenuSeat, roomRulesLocked, seatRendersLobby, shouldAutoHandoff } from './playMenuSeat.ts';

const source = await readFile(new URL('./playMenu.ts', import.meta.url), 'utf8');
/** One of the menu's inner functions (two-space indent, closed by the first `  }` line after it), types stripped. */
const cut = (name) => {
  const plain = source.indexOf(`\n  function ${name}(`);
  const start = plain >= 0 ? plain : source.indexOf(`\n  async function ${name}(`);
  assert.ok(start >= 0, `playMenu.ts has function ${name}`);
  const end = source.indexOf('\n  }\n', start);
  return stripTypeScriptTypes(source.slice(start, end + 4), { mode: 'strip' });
};
const settle = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

// ---- the table
{
  for (const [from, moves] of Object.entries(PLAY_MENU_SEAT_MOVES)) {
    for (const to of moves) assert.equal(nextPlayMenuSeat(from, to), to, `${from} → ${to}`);
    assert.equal(nextPlayMenuSeat(from, from), from, 'a same-state move stands');
  }
  assert.equal(nextPlayMenuSeat('none', 'handed_off'), null, 'nothing hands off a seat the menu does not hold');
  assert.equal(nextPlayMenuSeat('attached', 'lobby'), null, 'the battle owner\'s room never becomes the menu\'s own again');
  assert.equal(nextPlayMenuSeat('attached', 'handed_off'), null);
  assert.equal(nextPlayMenuSeat('connecting', 'handed_off'), null);
  assert.deepEqual(['none', 'connecting', 'lobby', 'handed_off', 'attached'].filter(seatRendersLobby), ['lobby'], 'only the menu\'s own lobby renders from the room');
  assert.equal(shouldAutoHandoff({ seat: 'lobby', role: 'client', phase: 'starting', matchId: 'm1', handedOffMatchId: null }), true);
  assert.equal(shouldAutoHandoff({ seat: 'lobby', role: 'client', phase: 'starting', matchId: 'm1', handedOffMatchId: 'm1' }), false, 'a refused match is not begun again');
  assert.equal(shouldAutoHandoff({ seat: 'lobby', role: 'client', phase: 'playing', matchId: 'm2', handedOffMatchId: 'm1' }), true, 'the next match is');
  assert.equal(shouldAutoHandoff({ seat: 'handed_off', role: 'client', phase: 'playing', matchId: 'm2', handedOffMatchId: null }), false);
  assert.equal(shouldAutoHandoff({ seat: 'lobby', role: 'host', phase: 'playing', matchId: 'm2', handedOffMatchId: null }), false, 'the host enters through its match_start');
  assert.equal(roomRulesLocked({ inLobby: false, role: null, phase: null }), false, 'outside a room the rules are the player\'s');
  assert.equal(roomRulesLocked({ inLobby: true, role: 'host', phase: 'waiting' }), false);
  assert.equal(roomRulesLocked({ inLobby: true, role: 'host', phase: 'playing' }), true);
  assert.equal(roomRulesLocked({ inLobby: true, role: 'client', phase: 'waiting' }), true);
}

// ---- the menu's wiring: one writer of the seat, one locked rule
{
  const writes = (name) => [...source.matchAll(new RegExp(`\\n\\s+${name} = `, 'g'))].length;
  assert.equal(writes('seat'), 1, 'moveSeat is the seat\'s one writer');
  assert.equal(writes('handedOff'), 1, 'the handoff flag is a view moveSeat writes');
  assert.equal(writes('connecting'), 1, 'so is the connecting flag');
  assert.doesNotMatch(source, /role !== 'host' \|\| (?:state\??|next)\.phase !== 'waiting'|role === 'host' && (?:state|next)\.phase === 'waiting'/,
    'no rules control computes the locked rule on its own');
  assert.ok([...source.matchAll(/rulesLocked\(/g)].length >= 9, 'the rules controls read rulesLocked');
}

// ---- (A) and (B): the handoff, run with the menu's own functions over stub ports
function handoffRig({ start }) {
  const calls = { observe: 0, unobserve: 0, starts: 0, shows: 0, statuses: [] };
  const lastMatchStart = { matchId: 'm1-0000a0a0' };
  const own = { lastMatchStart, roomInfo: { peerId: 'me' } };
  const lobby = { phase: 'starting', hostId: 'admin', players: [] };
  const context = {
    console, Promise,
    seat: 'lobby', session: own, activeRoom: null, state: lobby, role: 'client', handedOff: false, connecting: false,
    handedOffMatchId: null,
    unsubscribeState: () => { calls.unobserve++; },
    nextPlayMenuSeat, shouldAutoHandoff, seatRendersLobby,
    roomConnection: { current: { session: own }, observe(listener) { calls.observe++; listener(lobby); return () => { calls.unobserve++; }; } },
    onNetworkStart: () => { calls.starts++; return start(); },
    notifyLobbyChange: () => {}, hide: () => {}, setStatus: (text, error) => calls.statuses.push([text, error]), errorMessage: (error) => String(error?.message ?? error),
    t: (key) => key,
    // the menu's render begins a guest's handoff on its own, as renderLobby does
    renderLobby: (next) => { if (context.shouldBeginClientHandoff(next)) context.beginNetworkHandoff(next, 'client'); },
    show: () => { calls.shows++; context.renderLobby(context.state); },
  };
  runInNewContext(['moveSeat', 'hasMatchStart', 'matchIdOf', 'shouldBeginClientHandoff', 'beginNetworkHandoff', 'returnToLobby', 'renderOwnLobby'].map(cut).join('\n'), context);
  return { context, calls, lobby, own };
}
{
  // (A) a handoff the battle owner takes: the hidden lobby stops observing the room
  const { context, calls, lobby } = handoffRig({ start: () => new Promise(() => {}) });
  context.renderLobby(lobby);
  assert.equal(calls.starts, 1, 'the guest\'s render began the handoff');
  assert.equal(context.seat, 'handed_off');
  assert.equal(context.handedOff, true);
  assert.equal(calls.unobserve, 1, 'the handoff ends the menu\'s observation of the room');
  assert.equal(context.unsubscribeState, null);
}
{
  // (B) a rejected handoff: the lobby comes back, observed again, and the same match is not begun again on its own
  const { context, calls, lobby } = handoffRig({ start: () => Promise.reject(new Error('composition chunk failed')) });
  context.renderLobby(lobby);
  await settle();
  assert.equal(calls.starts, 1, `one attempt for the refused match (${calls.starts})`);
  assert.equal(context.seat, 'lobby', 'the menu holds its lobby again');
  assert.equal(calls.observe, 1, 'and observes the room again');
  assert.equal(context.handedOffMatchId, 'm1-0000a0a0');
  assert.ok(calls.statuses.some(([text, error]) => error && /chunk/.test(text)), 'the refusal is on the status line');
  // the room's next match is entered on its own again
  context.session.lastMatchStart = { matchId: 'm2-0000b0b0' };
  context.renderLobby(lobby);
  assert.equal(calls.starts, 2, 'the next match hands off');
}

// ---- (E) the attached seat: one automatic handoff per match; a Rejoin press may try again
function attachedRig({ start }) {
  const calls = { starts: 0, shows: 0 };
  const released = { lastMatchStart: { matchId: 'm2-0000c0c0' }, roomInfo: { peerId: 'me' } };
  const lobby = { phase: 'starting', hostId: 'admin', players: [] };
  const connection = { session: released, role: 'client' };
  const context = {
    console, Promise,
    seat: 'attached', session: null, activeRoom: { session: released }, state: lobby, role: 'client', handedOff: false, connecting: false,
    handedOffMatchId: null, unsubscribeState: null,
    nextPlayMenuSeat, shouldAutoHandoff,
    roomConnection: { current: null, observe() { return () => {}; } },
    onNetworkStart: () => { calls.starts++; return start(calls.starts); },
    notifyLobbyChange: () => {}, hide: () => {}, setStatus: () => {}, errorMessage: (error) => String(error?.message ?? error),
    t: (key) => key, clearFailure: () => {},
    show: () => { calls.shows++; },
  };
  runInNewContext(['moveSeat', 'hasMatchStart', 'matchIdOf', 'beginNetworkHandoff', 'returnToLobby', 'adoptRoomConnection', 'hostStarted'].map(cut).join('\n'), context);
  return { context, calls, lobby, connection, released };
}
{
  // the composition's round entry runs under lifecycle.run: busy (false) while the first entry is still pending
  const { context, calls, lobby, connection, released } = attachedRig({ start: (count) => (count === 1 ? new Promise(() => {}) : Promise.resolve(false)) });
  context.hostStarted(lobby, connection, 'released');
  await settle();
  context.hostStarted(lobby, connection, 'released');
  await settle();
  assert.equal(calls.starts, 1, `a re-sent match_start does not enter the round again (${calls.starts} entries)`);
  assert.equal(calls.shows, 0, 'nor reveals the lobby over the loading battle');
  assert.equal(context.seat, 'attached', 'the battle owner keeps the seat');
  assert.equal(context.session, null, 'the menu never takes the released room back as its own');
  // Rejoin battle is a press: it may try the same match again, and its refusal shows the room
  assert.equal(context.beginNetworkHandoff(lobby, 'client', { pressed: true }), true);
  await settle();
  assert.equal(calls.starts, 2);
  assert.equal(calls.shows, 1, 'a Rejoin the battle owner could not present shows the room again');
  // the room's next round is entered on its own
  released.lastMatchStart = { matchId: 'm3-0000d0d0' };
  context.hostStarted(lobby, connection, 'released');
  await settle();
  assert.equal(calls.starts, 3, 'the next match hands off');
  assert.equal(calls.shows, 1, 'and an automatic false answer leaves the battle alone');
}
{
  // the menu's own seat hands off its round, the battle owner attaches the room, and the room re-sends that match_start
  const { context, calls, lobby, connection, released } = attachedRig({ start: () => new Promise(() => {}) });
  Object.assign(context, { seat: 'lobby', session: released, activeRoom: null });
  context.hostStarted(lobby, connection, 'menu');
  assert.equal(context.seat, 'handed_off');
  Object.assign(context, { seat: 'attached', handedOff: false, session: null, activeRoom: { session: released } });
  context.hostStarted(lobby, connection, 'released');
  await settle();
  assert.equal(calls.starts, 1, 'the round the menu handed off is not entered again once attached');
}

// ---- (C) and (D): the mode the menu shows and the one it stores
function modeRig({ commandResult }) {
  const stored = [];
  const shown = [];
  const context = {
    Promise, selectedGameMode: 'standard', state: null, role: 'host', activeRoom: null,
    session: { command: () => commandResult(), submit: () => commandResult() },
    GAME_MODE_KEY: 'cot.mode',
    normalizeGameMode: (value) => String(value || 'standard'),
    remember: (key, value) => stored.push([key, value]),
    root: { querySelector: () => null },
    rulesModePicker: null, lobbyModePicker: null,
    showModeTrigger: () => {}, renderArrangement: () => {}, renderBrain: () => {},
    requiredElement: () => ({ textContent: '' }),
    t: (key) => key, setStatus: () => {}, errorMessage: (error) => String(error),
    rulesLocked: (inLobby) => roomRulesLocked({ inLobby: inLobby && !!context.state, role: context.role, phase: context.state?.phase }),
  };
  runInNewContext(['showSelectedGameMode', 'chooseMode', 'command'].map(cut).join('\n'), context);
  const show = context.showSelectedGameMode;
  context.showSelectedGameMode = (next, options) => { shown.push(next); show(next, options); };
  return { context, stored, shown };
}
{
  // (C) a lobby's render shows the room's mode and stores nothing; the player's own choice outside a room is stored
  const { context, stored } = modeRig({ commandResult: () => Promise.resolve({}) });
  context.showSelectedGameMode('mars', { fromLobby: true });
  assert.equal(context.selectedGameMode, 'mars', 'the lobby shows the room\'s mode');
  assert.deepEqual(stored, [], 'a lobby render never stores the room\'s mode as the player\'s');
  context.chooseMode('infected');
  assert.deepEqual(stored, [['cot.mode', 'infected']], 'the player\'s own choice outside a room is its preference');
  assert.match(source, /if \(hadLobby\) showSelectedGameMode\(preferredGameMode\(\)\);/, 'leaving a room shows the preference again');
}
{
  // (D) the room refuses the host's mode: the picker shows the room's again
  const { context, stored, shown } = modeRig({ commandResult: () => Promise.reject(new Error('lobby_locked')) });
  context.state = { phase: 'waiting', gameMode: 'standard' };
  context.chooseMode('mars');
  assert.equal(context.selectedGameMode, 'mars', 'shown at once');
  await settle();
  assert.equal(context.selectedGameMode, 'standard', 'and rolled back to the room\'s mode when the room refuses it');
  assert.deepEqual(shown, ['mars', 'standard']);
  assert.deepEqual(stored, [], 'a refused choice is no preference');
  const accepted = modeRig({ commandResult: () => Promise.resolve({ revision: 2 }) });
  accepted.context.state = { phase: 'waiting', gameMode: 'standard' };
  accepted.context.chooseMode('mars');
  await settle();
  assert.deepEqual(accepted.stored, [['cot.mode', 'mars']], 'an accepted choice is the host\'s own preference');
}
// ---- (F) a refused seat move stops the connect, the adoption and the handoff that asked for it
function refusalRig({ seat, session = null, activeRoom = null }) {
  const calls = { connects: 0, starts: 0, observes: 0, closes: 0 };
  const connection = { session: { lastMatchStart: { matchId: 'm4-0000e0e0' }, roomInfo: { peerId: 'me', roomCode: 'ROOM01' } }, role: 'client', roomInfo: { roomCode: 'ROOM01' } };
  const element = () => ({ setAttribute() {}, disabled: false, value: '', classList: { add() {}, remove() {} } });
  const context = {
    console, Promise, Number, Object, Error,
    seat, session, activeRoom, state: null, role: null, handedOff: seat === 'handed_off', connecting: seat === 'connecting',
    handedOffMatchId: null, unsubscribeState: null, requestGeneration: 1, mode: 'private', ownPlayerId: 'me',
    nextPlayMenuSeat, shouldAutoHandoff, seatRendersLobby,
    room: element(), createBtn: element(), joinBtn: element(), codeInput: { value: 'ROOM01' }, nameInput: { value: 'Me' }, createSizeSelect: { value: '2' },
    getSelection: () => ({ specId: 'm1a1_abrams_hc', mapId: 'verdant', equipment: [], camo: 'factory' }), currentArrangement: () => null, selectedGameMode: 'standard',
    normalizePlayerName: (name) => name, automaticPlayerName: () => 'Me', remember: () => {}, menuRoomsUrl: () => 'ws://rooms.test',
    normalizeRoomCode: (code) => String(code), PLAYER_NAME_KEY: 'name', ROOM_SIZE_KEY: 'size',
    roomConnection: {
      connecting: false, current: null,
      async connect() { calls.connects++; context.roomConnection.current = connection; return connection; },
      observe() { calls.observes++; return () => {}; },
      close() { calls.closes++; context.roomConnection.current = null; },
    },
    onNetworkStart: () => { calls.starts++; return new Promise(() => {}); },
    closeCurrentSession: () => {}, observeConnectedRoom: () => { calls.observes++; }, clearFailure: () => {},
    notifyLobbyChange: () => {}, hide: () => {}, setStatus: () => {}, errorMessage: (error) => String(error?.message ?? error), t: (key) => key, show: () => {},
    renderLobby: () => {},
  };
  runInNewContext(['moveSeat', 'setConnecting', 'hasMatchStart', 'matchIdOf', 'beginNetworkHandoff', 'returnToLobby', 'adoptRoomConnection', 'hostStarted', 'connectRoom'].map(cut).join('\n'), context);
  return { context, calls, connection };
}
{
  // the battle owner holds the room (attached): a create or join from the menu sends nothing and adopts nothing
  const attached = { session: { lastMatchStart: null }, playerId: 'me' };
  const { context, calls } = refusalRig({ seat: 'attached', activeRoom: attached });
  assert.equal(await context.connectRoom('join', 1), false, '(F) a connect from the attached seat is refused');
  assert.equal(calls.connects, 0, `(F) no room request goes out while the battle owner holds the room (${calls.connects})`);
  assert.equal(context.session, null, '(F) and no room is adopted beside the attached one');
  assert.equal(context.seat, 'attached');
}
{
  // a match_start of the menu's own connection reaching a seat that cannot hold it adopts nothing and hands nothing off
  const { context, calls, connection } = refusalRig({ seat: 'attached', activeRoom: { session: {}, playerId: 'me' } });
  context.hostStarted({ phase: 'starting', hostId: 'admin', players: [] }, connection, 'menu');
  assert.equal(context.session, null, '(F) the attached seat adopts no room of its own');
  assert.equal(calls.starts, 0, `(F) and starts no handoff (${calls.starts})`);
}
{
  // an own handoff whose move the table refuses (the drift: the menu's room adopted while attached) starts nothing
  const own = { lastMatchStart: { matchId: 'm5-0000f0f0' }, roomInfo: { peerId: 'me' } };
  const { context, calls } = refusalRig({ seat: 'attached', session: own });
  assert.equal(context.beginNetworkHandoff({ phase: 'starting', hostId: 'admin', players: [] }, 'client'), false, '(F) a handoff the seat cannot make is refused');
  assert.equal(calls.starts, 0, `(F) and the battle owner's round entry never runs (${calls.starts})`);
  assert.equal(context.handedOffMatchId, null, '(F) nor is the match marked handed off');
}
{
  // the ordinary connect still runs: none -> connecting -> lobby, observed once
  const { context, calls } = refusalRig({ seat: 'none' });
  assert.equal(await context.connectRoom('join', 1), true);
  assert.equal(calls.connects, 1);
  assert.equal(context.seat, 'lobby', '(F) the connect the table allows adopts its room');
  assert.equal(calls.observes, 1);
}

// ---- (G) the menu's own room observer renders through seatRendersLobby
{
  const renders = [];
  const context = { seat: 'lobby', seatRendersLobby, renderLobby: (next) => renders.push([context.seat, next.phase]) };
  runInNewContext(cut('renderOwnLobby'), context);
  for (const seat of ['none', 'connecting', 'lobby', 'handed_off', 'attached']) {
    context.seat = seat;
    context.renderOwnLobby({ phase: 'waiting' });
  }
  assert.deepEqual(renders, [['lobby', 'waiting']], '(G) only the lobby the menu holds renders from its room\'s updates');
  const observers = [...source.matchAll(/roomConnection\.observe\(([^)]*)\)/g)].map((match) => match[1]);
  assert.ok(observers.length >= 2, 'setup: the menu observes its own room');
  assert.deepEqual([...new Set(observers)], ['renderOwnLobby'], `(G) every observer of the menu's own room goes through the seat (${observers.join(', ')})`);
}
console.log('playMenuSeat.selftest: one seat writer and table; the handoff stops the lobby\'s observation; a refused handoff is not begun again; the room\'s mode is never stored; a refused mode rolls back; a re-sent match_start never re-enters a round already handed off; a refused move stops its connect, adoption or handoff; only the held lobby renders from the room');
