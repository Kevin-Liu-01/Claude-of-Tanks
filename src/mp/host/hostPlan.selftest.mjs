// The host's boot plan derived from the room snapshot equals what the room's own planStart froze (seats, bots, ids,
// names, vehicles), a plan the room attaches to match_start wins, a malformed attached plan is ignored, co-operative
// modes seat no bots, disconnected players and seats without a vehicle are left out, and a host outside the plan is
// refused.
import assert from 'node:assert/strict';
import { createRoom, joinRoom, planStart, setPlayerConnected } from '../room/roomPolicy.ts';
import { planFromMatchStart, planFromRoom, planHostBoot } from './hostPlan.ts';

const room = createRoom({ roomCode: 'PLAN01', mode: 'private', creator: { id: 'alice', name: 'Alice' }, selection: { specId: 'm1a2', equipment: ['optics'] }, settings: { teamSize: 3, mapId: 'verdant' }, now: 1000 });
joinRoom(room, { player: { id: 'bob', name: 'Bob' }, selection: { specId: 't90m' }, team: null, now: 1001 });
joinRoom(room, { player: { id: 'carol', name: 'Carol' }, selection: { specId: 'leo2a7v' }, team: 'alpha', now: 1002 });
joinRoom(room, { player: { id: 'dave', name: 'Dave' }, selection: null, team: null, now: 1003 });
joinRoom(room, { player: { id: 'spec', name: 'Spec' }, selection: null, team: 'spectator', now: 1004 });
setPlayerConnected(room, 'carol', false, 1005);
setPlayerConnected(room, 'dave', false, 1005);
for (const player of room.players) player.ready = true;

const derived = planFromRoom(room);
const frozen = planStart(structuredClone(room), { seed: 7, now: 1006 });
assert.deepEqual(derived.seats.map((seat) => [seat.seat, seat.playerId, seat.name, seat.team, seat.specId, seat.equipment]),
  frozen.seats.map((seat) => [seat.seat, seat.playerId, seat.name, seat.team, seat.specId, seat.equipment]), 'the seats match the room\'s own plan');
assert.deepEqual(derived.bots, frozen.bots, 'the bots match the room\'s own plan (ids, names, teams, vehicles)');
assert.equal(derived.seats.some((seat) => seat.playerId === 'carol'), false, 'a disconnected player is not seated');
assert.equal(derived.seats.some((seat) => seat.playerId === 'dave'), false, 'a disconnected player without a vehicle is not seated either');
assert.equal(derived.seats.find((seat) => seat.playerId === 'spec')?.team, 'spectator');
assert.ok(derived.bots.length > 0, 'bots fill the empty slots');

const matchStart = { matchId: 'm1', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 't', matchUrl: 'rtc://PLAN01/1', hostId: 'alice', expiresAt: 9 };
assert.deepEqual(planHostBoot(room, matchStart, 'alice').seats.map((seat) => seat.playerId), derived.seats.map((seat) => seat.playerId));
assert.throws(() => planHostBoot(room, matchStart, 'carol'), /not seated/);

// an attached plan wins; a malformed one is ignored
const attached = { ...matchStart, plan: { seats: [{ seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a2', equipment: [] }], bots: [{ playerId: 'bot-bravo-1', name: 'Bot 1', team: 'bravo', specId: 'm1a2', difficulty: 'hard' }] } };
const fromRoom = planFromMatchStart(attached);
assert.equal(fromRoom.seats.length, 1);
assert.equal(fromRoom.bots[0].difficulty, 'hard');
assert.deepEqual(planHostBoot(room, attached, 'alice').bots, fromRoom.bots);
assert.equal(planFromMatchStart({ ...matchStart, plan: { seats: [{ seat: 'x' }] } }), null);
assert.equal(planFromMatchStart({ ...matchStart, plan: 'nope' }), null);

// co-op: no bots
const coop = createRoom({ roomCode: 'PLAN02', mode: 'private', creator: { id: 'eve', name: 'Eve' }, selection: { specId: 'm1a2' }, settings: { teamSize: 2, gameMode: 'endless_horde', mapId: 'verdant' }, now: 1000 });
assert.deepEqual(planFromRoom(coop).bots, []);
console.log('hostPlan.selftest: the derived plan equals planStart, attached plans win, co-op seats no bots');
