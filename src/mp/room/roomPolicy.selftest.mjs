// Room policy receipt: v1's lobby rules at the v2 caps — 28 players auto-balanced
// 14v14, 8 spectators, manual moves, readiness gating, bot fill, admin
// seniority migration, co-op modes, the serialized shapes.
import assert from 'node:assert/strict';
import {
  ROOM_MAX_PLAYERS, ROOM_MAX_SPECTATORS, ROOM_MAX_TEAM_SIZE, RoomError, readRoomSnapshot,
} from './protocol.ts';
import {
  applyRoomCommand, assignAdmin, canStart, createRoom, finishMatch, joinRoom, markMatchPlaying, migrateAdminIfAbsent, planStart,
  recordMatch, removePlayer, roomToLobby, seniorPlayer, serializeRoom, setPlayerConnected,
} from './roomPolicy.ts';

const T0 = 1_700_000_000_000;
const reject = (fn, code) => {
  let thrown = null;
  try { fn(); } catch (error) { thrown = error; }
  assert.ok(thrown instanceof RoomError, `expected RoomError ${code}, got ${thrown}`);
  assert.equal(thrown.code, code);
};

function fullRoom({ teamSize = 14 } = {}) {
  const room = createRoom({ roomCode: 'ROOM01', mode: 'private', creator: { id: 'p1', name: 'One' }, selection: { specId: 'm1a2' }, settings: { teamSize }, now: T0 });
  for (let index = 2; index <= ROOM_MAX_PLAYERS; index++) {
    joinRoom(room, { player: { id: `p${index}`, name: `Player ${index}` }, selection: { specId: index % 2 ? 't90m' : 'm1a2' }, now: T0 + index });
  }
  return room;
}

// ---- capacity and balance
{
  const room = fullRoom();
  assert.equal(room.players.length, ROOM_MAX_PLAYERS);
  assert.equal(room.players.filter((p) => p.team === 'alpha').length, ROOM_MAX_TEAM_SIZE);
  assert.equal(room.players.filter((p) => p.team === 'bravo').length, ROOM_MAX_TEAM_SIZE);
  assert.equal(new Set(room.players.map((p) => p.seat)).size, ROOM_MAX_PLAYERS, 'seats are unique');
  reject(() => joinRoom(room, { player: { id: 'p29', name: 'Late' }, now: T0 + 99 }), 'room_full');
  for (let index = 1; index <= ROOM_MAX_SPECTATORS; index++) {
    const seat = joinRoom(room, { player: { id: `s${index}`, name: `Watcher ${index}` }, team: 'spectator', now: T0 + 100 + index });
    assert.equal(seat.team, 'spectator');
  }
  reject(() => joinRoom(room, { player: { id: 's9', name: 'Watcher 9' }, team: 'spectator', now: T0 + 200 }), 'spectators_full');
  assert.equal(room.players.length, 36);
  // a requested full team falls back to the other side; when both are full the join is refused
  const smaller = createRoom({ roomCode: 'ROOM02', mode: 'lan', creator: { id: 'a', name: 'A' }, settings: { teamSize: 1 }, now: T0 });
  const second = joinRoom(smaller, { player: { id: 'b', name: 'B' }, team: 'alpha', now: T0 + 1 });
  assert.equal(second.team, 'bravo', 'a full requested team auto-balances to the other side');
  reject(() => joinRoom(smaller, { player: { id: 'c', name: 'C' }, now: T0 + 2 }), 'room_full');
}

// ---- names, ids, selection validation
{
  const room = createRoom({ roomCode: 'ROOM03', mode: 'private', creator: { id: 'p1', name: '  One   Two ' }, now: T0 });
  assert.equal(room.players[0].name, 'One Two');
  reject(() => joinRoom(room, { player: { id: 'p1', name: 'Again' }, now: T0 }), 'already_joined');
  reject(() => joinRoom(room, { player: { id: 'bad id!', name: 'X' }, now: T0 }), 'invalid_player');
  reject(() => joinRoom(room, { player: { id: 'p2', name: '   ' }, now: T0 }), 'invalid_name');
  const suffixed = joinRoom(room, { player: { id: 'p2', name: 'one two' }, now: T0 + 1 });
  assert.equal(suffixed.name, 'one two 2', 'case-insensitive collisions are suffixed');
  reject(() => joinRoom(room, { player: { id: 'p3', name: 'Three' }, selection: { specId: 'Bad Spec' }, now: T0 }), 'invalid_vehicle');
  const equipped = joinRoom(room, { player: { id: 'p4', name: 'Four' }, selection: { specId: 'm1a2', equipment: ['a', 'b', 'c', 'd', 'a'], camo: 'desert' }, now: T0 });
  assert.deepEqual(equipped.equipment, ['a', 'b', 'c'], 'equipment is bounded and deduplicated');
  assert.equal(equipped.camo, 'desert');
}
{
  const room = createRoom({ roomCode: 'ROOM04', mode: 'private', creator: { id: 'p1', name: 'One' }, now: T0 });
  reject(() => joinRoom(room, { player: { id: 'p4', name: 'Four' }, selection: { specId: 'm1a2', camo: 'Factory!' }, now: T0 }), 'invalid_camo');
}

// ---- commands: readiness, vehicle lock, team switch, admin-only settings, moves, kicks
{
  const room = createRoom({ roomCode: 'ROOM05', mode: 'private', creator: { id: 'admin', name: 'Admin' }, selection: { specId: 'm1a2' }, settings: { teamSize: 2 }, now: T0 });
  joinRoom(room, { player: { id: 'g1', name: 'Guest' }, now: T0 + 1 });
  reject(() => applyRoomCommand(room, 'g1', { type: 'set_ready', ready: true }, T0 + 2), 'vehicle_required');
  applyRoomCommand(room, 'g1', { type: 'select_vehicle', specId: 't90m' }, T0 + 3);
  applyRoomCommand(room, 'g1', { type: 'set_ready', ready: true }, T0 + 4);
  reject(() => applyRoomCommand(room, 'g1', { type: 'select_vehicle', specId: 'm1a2' }, T0 + 5), 'vehicle_locked');
  reject(() => applyRoomCommand(room, 'g1', { type: 'set_team', team: 'alpha' }, T0 + 5), 'vehicle_locked');
  applyRoomCommand(room, 'g1', { type: 'set_ready', ready: false }, T0 + 6);
  applyRoomCommand(room, 'g1', { type: 'set_team', team: 'alpha' }, T0 + 7);
  assert.equal(room.players.find((p) => p.id === 'g1').team, 'alpha');
  reject(() => applyRoomCommand(room, 'g1', { type: 'set_map', mapId: 'alpine' }, T0 + 8), 'admin_only');
  reject(() => applyRoomCommand(room, 'g1', { type: 'set_team_size', teamSize: 3 }, T0 + 8), 'admin_only');
  reject(() => applyRoomCommand(room, 'g1', { type: 'kick', playerId: 'admin' }, T0 + 8), 'admin_only');
  applyRoomCommand(room, 'admin', { type: 'set_map', mapId: 'alpine' }, T0 + 9);
  assert.equal(room.settings.mapId, 'alpine');
  applyRoomCommand(room, 'admin', { type: 'set_locked', locked: true }, T0 + 10);
  reject(() => joinRoom(room, { player: { id: 'g2', name: 'Late' }, now: T0 + 11 }), 'room_locked');
  applyRoomCommand(room, 'admin', { type: 'set_locked', locked: false }, T0 + 12);
  reject(() => applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 0 }, T0 + 13), 'invalid_team_size');
  reject(() => applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 15 }, T0 + 13), 'invalid_team_size');
  // both on alpha with team size 1: reducing further is refused, the admin moves the guest across
  reject(() => applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 1 }, T0 + 14), 'team_size_too_small');
  applyRoomCommand(room, 'admin', { type: 'move_player', playerId: 'g1', team: 'bravo' }, T0 + 15);
  assert.equal(room.players.find((p) => p.id === 'g1').team, 'bravo');
  applyRoomCommand(room, 'admin', { type: 'set_team_size', teamSize: 1 }, T0 + 16);
}
{
  const room = createRoom({ roomCode: 'ROOM06', mode: 'private', creator: { id: 'admin', name: 'Admin' }, settings: { teamSize: 2, allowTeamSwitch: false }, now: T0 });
  joinRoom(room, { player: { id: 'g1', name: 'Guest' }, now: T0 + 1 });
  reject(() => applyRoomCommand(room, 'g1', { type: 'set_team', team: 'alpha' }, T0 + 2), 'team_switch_disabled');
  reject(() => applyRoomCommand(room, 'g1', { type: 'no_such_command' }, T0 + 2), 'invalid_command');
  reject(() => applyRoomCommand(room, 'nobody', { type: 'set_ready', ready: true }, T0 + 2), 'unknown_player');
  applyRoomCommand(room, 'admin', { type: 'kick', playerId: 'g1' }, T0 + 3);
  assert.equal(room.players.length, 1);
  reject(() => applyRoomCommand(room, 'admin', { type: 'kick', playerId: 'admin' }, T0 + 3), 'invalid_command');
}

// ---- start gating and bot fill
{
  const room = createRoom({ roomCode: 'ROOM07', mode: 'private', creator: { id: 'admin', name: 'Admin' }, selection: { specId: 'm1a2' }, settings: { teamSize: 3, mapId: 'verdant' }, now: T0 });
  joinRoom(room, { player: { id: 'g1', name: 'Guest' }, selection: { specId: 't90m' }, now: T0 + 1 });
  joinRoom(room, { player: { id: 'w1', name: 'Watcher' }, team: 'spectator', now: T0 + 2 });
  reject(() => applyRoomCommand(room, 'admin', { type: 'start' }, T0 + 3), 'players_not_ready');
  applyRoomCommand(room, 'admin', { type: 'set_ready', ready: true }, T0 + 4);
  reject(() => applyRoomCommand(room, 'admin', { type: 'start' }, T0 + 5), 'players_not_ready');
  assert.equal(canStart(room), false);
  // a disconnected active seat cannot hold the start hostage: it is skipped
  setPlayerConnected(room, 'g1', false, T0 + 6);
  assert.equal(canStart(room), true);
  setPlayerConnected(room, 'g1', true, T0 + 7);
  applyRoomCommand(room, 'g1', { type: 'set_ready', ready: true }, T0 + 8);
  assert.equal(canStart(room), true);
  applyRoomCommand(room, 'admin', { type: 'start' }, T0 + 9);
  const plan = planStart(room, { seed: 0xabcdef, now: T0 + 10 });
  assert.equal(room.phase, 'starting');
  assert.equal(room.round, 1);
  assert.equal(room.settings.locked, true);
  assert.equal(plan.seats.length, 3, 'two players and the spectator are seated');
  assert.equal(plan.seats.find((s) => s.playerId === 'w1').team, 'spectator');
  assert.equal(plan.bots.length, 4, 'three per side minus one human each = four bots');
  assert.deepEqual(plan.bots.map((b) => b.team), ['alpha', 'alpha', 'bravo', 'bravo']);
  assert.equal(plan.mapId, 'verdant');
  reject(() => applyRoomCommand(room, 'g1', { type: 'set_ready', ready: false }, T0 + 11), 'lobby_locked');
  recordMatch(room, { id: 'm1', round: 1, mapId: 'verdant', seed: plan.seed, startedAt: T0 + 12 }, T0 + 12);
  assert.equal(room.match.status, 'starting');
  assert.equal(markMatchPlaying(room, T0 + 13), true);
  assert.equal(room.phase, 'playing');
  const result = finishMatch(room, { status: 'ended', result: 'bravo', reason: 'elimination' }, T0 + 20);
  assert.deepEqual(result, { round: 1, result: 'bravo', reason: 'elimination' });
  assert.equal(room.phase, 'waiting');
  assert.equal(room.settings.locked, false);
  assert.ok(room.players.every((p) => !p.ready), 'readiness clears after a round');
  // rematch: ready again and start again in the same room
  applyRoomCommand(room, 'admin', { type: 'set_ready', ready: true }, T0 + 21);
  applyRoomCommand(room, 'g1', { type: 'set_ready', ready: true }, T0 + 22);
  const second = planStart(room, { seed: 7, now: T0 + 23 });
  assert.equal(second.round, 2);
  recordMatch(room, { id: 'm2', round: 2, mapId: 'verdant', seed: 7, startedAt: T0 + 24 }, T0 + 24);
  finishMatch(room, { status: 'lost', reason: 'match_lost' }, T0 + 30);
  assert.deepEqual(room.lastResult, { round: 2, result: null, reason: 'match_lost' });
  assert.equal(room.match.status, 'lost');
  // bots fill off: only humans
  applyRoomCommand(room, 'admin', { type: 'set_bots_fill', botsFill: false }, T0 + 31);
  applyRoomCommand(room, 'admin', { type: 'set_ready', ready: true }, T0 + 32);
  applyRoomCommand(room, 'g1', { type: 'set_ready', ready: true }, T0 + 33);
  assert.equal(planStart(room, { seed: 1, now: T0 + 34 }).bots.length, 0);
}

// ---- admin seniority migration
{
  const room = createRoom({ roomCode: 'ROOM08', mode: 'private', creator: { id: 'admin', name: 'Admin' }, now: T0 });
  joinRoom(room, { player: { id: 'second', name: 'Second' }, now: T0 + 1 });
  joinRoom(room, { player: { id: 'third', name: 'Third' }, now: T0 + 2 });
  setPlayerConnected(room, 'second', false, T0 + 3);
  assert.equal(seniorPlayer(room, 'admin').id, 'third', 'the most senior CONNECTED seat wins');
  removePlayer(room, 'admin', T0 + 4);
  assert.equal(room.adminId, 'third');
  assert.equal(room.players.find((p) => p.id === 'third').isAdmin, true);
  assert.equal(room.players.filter((p) => p.isAdmin).length, 1);
  // disconnect-then-grace: nothing moves while the admin is connected; migrates once absent
  assert.equal(migrateAdminIfAbsent(room, T0 + 5), false);
  setPlayerConnected(room, 'third', false, T0 + 6);
  assert.equal(migrateAdminIfAbsent(room, T0 + 7), false, 'no connected seat to migrate to');
  setPlayerConnected(room, 'second', true, T0 + 8);
  assert.equal(migrateAdminIfAbsent(room, T0 + 9), true);
  assert.equal(room.adminId, 'second');
  assert.equal(assignAdmin(room, room.players.find((p) => p.id === 'second'), T0 + 10), false, 'idempotent');
  removePlayer(room, 'second', T0 + 11);
  removePlayer(room, 'third', T0 + 12);
  assert.equal(room.players.length, 0, 'the room survives its last player (expiry closes it, not departure)');
}

// ---- co-op modes keep everyone on Alpha within the sim's cap
{
  const room = createRoom({ roomCode: 'ROOM09', mode: 'private', creator: { id: 'admin', name: 'Admin' }, settings: { gameMode: 'endless_horde', teamSize: 14 }, now: T0 });
  assert.equal(room.settings.teamSize, 7);
  for (let index = 2; index <= 7; index++) joinRoom(room, { player: { id: `p${index}`, name: `P${index}` }, team: 'bravo', now: T0 + index });
  assert.ok(room.players.every((p) => p.team === 'alpha'));
  reject(() => joinRoom(room, { player: { id: 'p8', name: 'P8' }, now: T0 + 8 }), 'coop_capacity');
  reject(() => applyRoomCommand(room, 'p2', { type: 'set_team', team: 'bravo' }, T0 + 9), 'cooperative_team');
  applyRoomCommand(room, 'admin', { type: 'set_game_mode', gameMode: 'standard' }, T0 + 10);
  assert.equal(room.settings.arrangement, null);
  const std = createRoom({ roomCode: 'ROOM10', mode: 'private', creator: { id: 'admin', name: 'Admin' }, settings: { teamSize: 14 }, now: T0 });
  for (let index = 2; index <= 8; index++) joinRoom(std, { player: { id: `p${index}`, name: `P${index}` }, now: T0 + index });
  reject(() => applyRoomCommand(std, 'admin', { type: 'set_game_mode', gameMode: 'frontline_assault' }, T0 + 20), 'coop_capacity');
}

// ---- serialization: the snapshot validates, never carries capabilities, and maps to the v1 lobby shape
{
  const room = fullRoom({ teamSize: 14 });
  const serialized = serializeRoom(room);
  assert.notEqual(serialized.players, room.players);
  const parsed = readRoomSnapshot(JSON.parse(JSON.stringify(serialized)));
  assert.equal(parsed.players.length, 28);
  assert.ok(!JSON.stringify(serialized).includes('resume'), 'no capability field in the snapshot');
  const lobby = roomToLobby(room);
  assert.equal(lobby.hostId, 'p1');
  assert.equal(lobby.maxPlayers, 28);
  assert.equal(lobby.teamSize, 14);
  assert.equal(lobby.players.filter((p) => p.isHost).length, 1);
  assert.deepEqual(Object.keys(lobby.players[0]).sort(), ['camo', 'connected', 'equipment', 'id', 'isHost', 'name', 'rating', 'ready', 'specId', 'team'].sort());
  assert.throws(() => readRoomSnapshot({ ...serialized, adminId: 'ghost' }), /identity/);
  assert.throws(() => readRoomSnapshot({ ...serialized, v: 1 }), /version/);
}

console.log('roomPolicy: PASS');
