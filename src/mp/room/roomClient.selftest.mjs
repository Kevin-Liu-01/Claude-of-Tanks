// RoomClient receipt over real sockets against the in-process room service
// (server/rooms): create, join, readiness, start with per-seat tokens the
// match service accepts, chat, resume with the stored capability, a stranger
// refused, admin migration on leave, a lost match, rematch, leave.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { RoomClient } from './roomClient.ts';
import { RoomError } from './protocol.ts';
import { createRoomsServer } from '../../../server/rooms/serve.ts';
import { verifySeatToken } from '../../../server/match/seatToken.ts';

const SECRET = 'room-client-receipt-secret-0123456789';
const server = await createRoomsServer({ seatSecret: SECRET, world: 'terrain', countdownS: 1, battleLimitS: 30 });
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }; };
const clients = [];
function client(id, storage = memory()) {
  const created = new RoomClient({
    endpoint: server.url, player: { id, name: `Name ${id}` }, storage, clientBuild: 'receipt', pingIntervalMs: 0,
    transport: { createSocket: (url) => new WebSocket(url) },
  });
  clients.push(created);
  return created;
}
const until = (predicate, label, timeoutMs = 8000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const poll = () => {
    if (predicate()) return resolve();
    if (Date.now() - started > timeoutMs) return reject(new Error(`timeout: ${label}`));
    setTimeout(poll, 10);
  };
  poll();
});
const rejects = async (promise, code) => {
  let thrown = null;
  try { await promise; } catch (error) { thrown = error; }
  assert.ok(thrown instanceof RoomError, `expected RoomError ${code}, got ${thrown}`);
  assert.equal(thrown.code, code);
};

try {
  // ---- create / join / state
  const a = client('alice');
  const room = await a.create({ mode: 'private', selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant' } });
  assert.match(room.roomCode, /^[A-Z0-9]{6}$/);
  assert.equal(a.isAdmin, true);
  assert.equal(a.phase, 'joined');
  assert.ok(a.hasResumeCapability(room.roomCode), 'the capability is stored');
  const bStorage = memory();
  const b = client('bob', bStorage);
  const states = [];
  a.onState((state) => states.push(state.revision));
  const joined = await b.join({ roomCode: room.roomCode, selection: { specId: 't90m' } });
  assert.equal(joined.players.length, 2);
  assert.equal(b.me.team, 'bravo');
  await until(() => a.room?.players.length === 2, 'alice sees bob');
  await rejects(client('carol').join({ roomCode: 'NOPE99' }), 'room_not_found');
  await rejects(b.command({ type: 'set_map', mapId: 'alpine' }), 'admin_only');
  await rejects(b.setReady(true).then(() => b.command({ type: 'set_team', team: 'alpha' })), 'vehicle_locked');
  await a.setReady(true);
  await until(() => a.room?.players.every((p) => p.ready), 'both ready');

  // ---- chat
  const chat = [];
  a.onChat((entry) => chat.push(entry));
  await b.chat('  gg   wp ');
  await until(() => chat.length === 1, 'alice receives chat');
  assert.equal(chat[0].text, 'gg wp');
  assert.equal(chat[0].playerId, 'bob');

  // ---- start: per-seat tokens, an actor in the match service, resolvable match URL
  const starts = new Map();
  a.onMatchStart((payload) => starts.set('alice', payload));
  b.onMatchStart((payload) => starts.set('bob', payload));
  await a.start();
  await until(() => starts.size === 2, 'both seats receive match_start');
  const alice = starts.get('alice');
  const bob = starts.get('bob');
  assert.equal(alice.matchUrl, '/match');
  assert.equal(a.resolveUrl(alice.matchUrl), `${server.url}/match`);
  assert.notEqual(alice.seatToken, bob.seatToken);
  const verified = verifySeatToken(SECRET, bob.seatToken, Date.now());
  assert.equal(verified.ok, true);
  assert.equal(verified.claims.playerId, 'bob');
  assert.equal(verified.claims.roomId, room.roomCode);
  assert.ok(server.matchService.actors.get(room.roomCode), 'a MatchActor runs for the room');
  assert.equal(server.matchService.actors.get(room.roomCode).stats().bots, 2, 'bots fill the empty slots');
  await until(() => a.room?.phase === 'starting', 'room is starting');
  await rejects(b.setReady(false), 'lobby_locked');

  // ---- resume: bob's socket drops, a new client with the same storage takes the seat back and gets match_start again
  b.disconnect('reload');
  await until(() => a.room?.players.find((p) => p.id === 'bob')?.connected === false, 'alice sees bob disconnected');
  const b2 = client('bob', bStorage);
  const resumed = await b2.join({ roomCode: room.roomCode });
  assert.equal(resumed.players.length, 2, 'a resume keeps the seat');
  assert.equal(b2.matchStart?.seatToken, bob.seatToken, 'the seat token is re-sent to the resumed seat');
  await until(() => a.room?.players.find((p) => p.id === 'bob')?.connected === true, 'alice sees bob back');
  // a stranger with bob's id but no capability is refused; bob's own client stays
  await rejects(client('bob', memory()).join({ roomCode: room.roomCode }), 'resume_denied');
  assert.equal(b2.phase, 'joined');

  // ---- the container dies: two polls without an answer → match_lost, the room offers a rematch
  const statuses = [];
  b2.onMatchStatus((payload) => statuses.push(payload.status));
  server.matchService.removeActor(room.roomCode);
  const actor = server.roomService.room(room.roomCode);
  await actor.observeMatchNow();
  await actor.observeMatchNow();
  await until(() => statuses.includes('lost'), 'bob hears match_lost');
  await until(() => a.room?.phase === 'waiting' && a.room.lastResult?.reason === 'match_lost', 'room waiting again');

  // ---- rematch in the same room: fresh tokens, round 2
  await a.setReady(true);
  await b2.setReady(true);
  const restarts = [];
  b2.onMatchStart((payload) => restarts.push(payload));
  await a.start();
  await until(() => restarts.length === 1, 'bob receives the rematch');
  assert.equal(restarts[0].round, 2);
  assert.notEqual(restarts[0].seatToken, bob.seatToken);

  // ---- admin migration on explicit leave; the room survives; bob leaves too
  await a.leave();
  assert.equal(a.phase, 'closed');
  await until(() => b2.isAdmin, 'bob becomes admin at once');
  assert.equal(b2.room.players.length, 1);
  await b2.leave();
  assert.ok(server.roomService.rooms.get(room.roomCode)?.snapshot, 'the room outlives its last player');
  console.log('roomClient: PASS');
} finally {
  for (const entry of clients) entry.dispose();
  await server.close();
}
