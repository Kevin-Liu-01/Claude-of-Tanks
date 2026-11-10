// The host's boot plan derived from the room snapshot equals what the room's own planStart froze (seats, bots, ids,
// names, vehicles — the same match seed, room/roomBots.ts), a plan the room attaches to match_start wins, a malformed
// attached plan is ignored, co-operative modes seat their hostiles (gameplay-modes-228: v2 seated none, so the waves
// came up empty), disconnected players and seats without a vehicle are left out, and a host outside the plan is refused.
import assert from 'node:assert/strict';
import { createRoom, joinRoom, planStart, setPlayerConnected } from '../room/roomPolicy.ts';
import { planFromMatchStart, planFromRoom, planFromRoster, planHostBoot } from './hostPlan.ts';

const room = createRoom({ roomCode: 'PLAN01', mode: 'private', creator: { id: 'alice', name: 'Alice' }, selection: { specId: 'm1a1_abrams_hc', equipment: ['optics'] }, settings: { teamSize: 3, mapId: 'verdant' }, now: 1000 });
joinRoom(room, { player: { id: 'bob', name: 'Bob' }, selection: { specId: 't90am' }, team: null, now: 1001 });
joinRoom(room, { player: { id: 'carol', name: 'Carol' }, selection: { specId: 'leo2_improved' }, team: 'alpha', now: 1002 });
joinRoom(room, { player: { id: 'dave', name: 'Dave' }, selection: null, team: null, now: 1003 });
joinRoom(room, { player: { id: 'spec', name: 'Spec' }, selection: null, team: 'spectator', now: 1004 });
setPlayerConnected(room, 'carol', false, 1005);
setPlayerConnected(room, 'dave', false, 1005);
for (const player of room.players) player.ready = true;

const derived = planFromRoom(room, { seed: 7 });
const frozen = planStart(structuredClone(room), { seed: 7, now: 1006 });
assert.deepEqual(derived.seats.map((seat) => [seat.seat, seat.playerId, seat.name, seat.team, seat.specId, seat.equipment]),
  frozen.seats.map((seat) => [seat.seat, seat.playerId, seat.name, seat.team, seat.specId, seat.equipment]), 'the seats match the room\'s own plan');
assert.deepEqual(derived.bots, frozen.bots, 'the bots match the room\'s own plan (ids, names, teams, vehicles)');
assert.equal(derived.seats.some((seat) => seat.playerId === 'carol'), false, 'a disconnected player is not seated');
assert.equal(derived.seats.some((seat) => seat.playerId === 'dave'), false, 'a disconnected player without a vehicle is not seated either');
assert.equal(derived.seats.find((seat) => seat.playerId === 'spec')?.team, 'spectator');
assert.ok(derived.bots.length > 0, 'bots fill the empty slots');
assert.ok(derived.bots.some((bot) => bot.specId !== 'm1a1_abrams_hc' && bot.specId !== 't90am'), 'bots are no longer clones of a human\'s pick');
assert.notDeepEqual(planFromRoom(room, { seed: 8 }).bots.map((bot) => bot.specId), derived.bots.map((bot) => bot.specId), 'the seed decides the bots\' vehicles');
// (268) each seat carries its chosen camouflage to the actor (its spotting bonus, sim/camoPaint.ts), from the room's plan,
// its snapshot, and an elected host's roster fallback alike
{
  const painted = structuredClone(room);
  painted.players.find((player) => player.id === 'alice').camo = 'auto';
  painted.players.find((player) => player.id === 'bob').camo = 'winter';
  const fromRoom = planFromRoom(painted, { seed: 7 });
  const camoOf = (plan, id) => plan.seats.find((seat) => seat.playerId === id)?.camo;
  assert.deepEqual([camoOf(fromRoom, 'alice'), camoOf(fromRoom, 'bob')], ['auto', 'winter'], 'the snapshot\'s plan carries each seat\'s camo');
  const frozenPainted = planStart(structuredClone(painted), { seed: 7, now: 1006 });
  assert.deepEqual(fromRoom.seats.map((seat) => [seat.playerId, seat.camo]), frozenPainted.seats.map((seat) => [seat.playerId, seat.camo]), 'as the room\'s own plan does');
  const roster = fromRoom.seats.map((seat) => ({ seat: seat.seat, team: seat.team === 'bravo' ? 1 : seat.team === 'spectator' ? 2 : 0, bot: false, playerId: seat.playerId, name: seat.name, specId: seat.specId }));
  const elected = planFromRoster(roster, painted);
  assert.deepEqual([camoOf(elected, 'alice'), camoOf(elected, 'bob')], ['auto', 'winter'], 'an elected host\'s roster fallback reads the camo from the room snapshot');
  // round 8 Y2 (s4-04): the fallback's sources in order. A player still in the room keeps its room loadout (no resume
  // extras: the countdown restart's path); one who left the room names none, so its hull takes the authority's defaults
  // (matchHostCore.selftest [3] boots it), never an empty loadout ([] read as no equipment and no items)
  const seatOf = (planned, id) => planned.seats.find((seat) => seat.playerId === id);
  const alice = painted.players.find((player) => player.id === 'alice');
  assert.deepEqual([seatOf(elected, 'alice').equipment, seatOf(elected, 'alice').consumables], [alice.equipment, alice.consumables ?? []],
    'a present player keeps the room\'s equipment and items');
  const departed = structuredClone(painted);
  departed.players = departed.players.filter((player) => player.id !== 'bob');
  const withoutBob = planFromRoster(roster, departed);
  assert.deepEqual([seatOf(withoutBob, 'bob').equipment, seatOf(withoutBob, 'bob').consumables, seatOf(withoutBob, 'bob').camo], [null, null, null],
    'a player who left the room names no loadout: the authority\'s defaults, the factory paint');
  assert.deepEqual(seatOf(withoutBob, 'alice'), seatOf(elected, 'alice'), 'and the players still in the room are untouched by it');
  assert.deepEqual(planFromRoster(roster, null).seats.map((seat) => [seat.equipment, seat.consumables, seat.camo]), roster.map(() => [null, null, null]),
    'no room snapshot at all: every seat takes the defaults');
}

const matchStart = { matchId: 'm1', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 't', matchUrl: 'rtc://PLAN01/1', hostId: 'alice', expiresAt: 9 };
assert.deepEqual(planHostBoot(room, matchStart, 'alice').seats.map((seat) => seat.playerId), derived.seats.map((seat) => seat.playerId));
assert.deepEqual(planHostBoot(room, matchStart, 'alice').bots, frozen.bots, 'the host boots with the match seed: the room\'s own bots');
assert.throws(() => planHostBoot(room, matchStart, 'carol'), /not seated/);

// an attached plan wins; a malformed one is ignored
const attached = { ...matchStart, plan: { seats: [{ seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', equipment: [] }], bots: [{ playerId: 'bot-bravo-1', name: 'Bot 1', team: 'bravo', specId: 'm1a1_abrams_hc', difficulty: 'hard' }] } };
const fromRoom = planFromMatchStart(attached);
assert.equal(fromRoom.seats.length, 1);
assert.equal(fromRoom.bots[0].difficulty, 'hard');
assert.deepEqual(planHostBoot(room, attached, 'alice').bots, fromRoom.bots);
assert.equal(planFromMatchStart({ ...matchStart, plan: { seats: [{ seat: 'x' }] } }), null);
assert.equal(planFromMatchStart({ ...matchStart, plan: 'nope' }), null);
// (268, item 6) a bot's paint: an elected host's roster fallback keeps the paint the old authority rolled; a plan naming a
// paint no bot can wear is ignored
{
  const roster = [
    { seat: 0, team: 0, bot: false, playerId: 'alice', name: 'Alice', specId: 'm1a1_abrams_hc' },
    { seat: 255, team: 1, bot: true, playerId: 'bot-1', name: 'Bot 1', specId: 't90am', camo: 'auto' },
    { seat: 255, team: 0, bot: true, playerId: 'bot-2', name: 'Bot 2', specId: 't90am', camo: 'factory' },
  ];
  assert.deepEqual(planFromRoster(roster, null).bots.map((bot) => [bot.playerId, bot.camo]), [['bot-1', 'auto'], ['bot-2', 'factory']],
    'an elected host keeps each bot\'s rolled paint');
  assert.equal(planFromRoster([{ ...roster[1], camo: undefined }], null).bots[0].camo, undefined, 'no paint in the roster leaves the roll to the authority');
  const painted = { ...matchStart, plan: { ...attached.plan, bots: [{ ...attached.plan.bots[0], camo: 'auto' }] } };
  assert.equal(planFromMatchStart(painted).bots[0].camo, 'auto', 'an attached plan may carry a bot\'s paint');
  assert.equal(planFromMatchStart({ ...matchStart, plan: { ...attached.plan, bots: [{ ...attached.plan.bots[0], camo: 'winter' }] } }), null,
    'a bot paint outside AUTO and factory is a malformed plan');
}

// co-op (gameplay-modes-228): the Horde seats its twenty-strong pool and four allied bots; Frontline its twelve defenders
// and three allies — the waves have hostiles in a room, and the host derives exactly the room's own seating
const coop = createRoom({ roomCode: 'PLAN02', mode: 'private', creator: { id: 'eve', name: 'Eve' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, gameMode: 'endless_horde', mapId: 'verdant' }, now: 1000 });
const coopBots = planFromRoom(coop, { seed: 3 }).bots;
assert.equal(coopBots.filter((bot) => bot.team === 'bravo').length, 20, 'the Horde\'s pool is seated');
assert.equal(coopBots.filter((bot) => bot.team === 'alpha').length, 4, 'and its four allied bots');
for (const player of coop.players) player.ready = true;
assert.deepEqual(planStart(structuredClone(coop), { seed: 3, now: 1001 }).bots, coopBots, 'the room and the host seat the same co-op bots');
const front = createRoom({ roomCode: 'PLAN03', mode: 'private', creator: { id: 'fay', name: 'Fay' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, gameMode: 'frontline_assault', mapId: 'verdant' }, now: 1000 });
const frontBots = planFromRoom(front, { seed: 3 }).bots;
assert.deepEqual([frontBots.filter((bot) => bot.team === 'bravo').length, frontBots.filter((bot) => bot.team === 'alpha').length], [12, 3], 'Frontline: twelve defenders, three allies');
console.log('hostPlan.selftest: the derived plan equals planStart (bots by the match seed), attached plans win, co-op rooms seat their hostiles, every source carries each seat\'s camo');
