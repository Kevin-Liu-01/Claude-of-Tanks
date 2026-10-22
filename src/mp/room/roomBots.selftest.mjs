// Multiplayer bot seating (gameplay-modes-228): one planner (room/roomBots.ts) for the room's start plan and the p2p
// host's derivation. Pins: the co-op rooms seat their hostiles (the Horde's pool of twenty and four allies, Frontline's
// twelve defenders and three allies: v2 seated none and its waves came up empty); bots are no longer clones of a human's
// pick; MONO-NATION seats each side from one country (the humans' majority; never the host's on the enemy side); RANDOM
// mixes; at most six distinct bot vehicles a side; planStart and planFromRoom name the same bots for the same seed in
// every mode; TEAM NATIONS is the host's setting (a guest's set_arrangement is refused) and survives a mode change.
import assert from 'node:assert/strict';
import { GAME_MODE_IDS } from '../../sim/matchModes.ts';
import { applyRoomCommand, createRoom, joinRoom, planStart } from './roomPolicy.ts';
import { planFromRoom } from '../host/hostPlan.ts';
import { NATION_INDEX } from '../../sim/nationIndex.generated.ts';

const countryOf = new Map(NATION_INDEX.map(([id, country]) => [id, country]));
const room = (gameMode, { guest = false, teamNations = null } = {}) => {
  const r = createRoom({ roomCode: 'BOTS01', mode: 'private', creator: { id: 'host', name: 'Host' }, selection: { specId: 'm1a3' },
    settings: { gameMode, mapId: 'verdant', ...(teamNations ? { arrangement: { teamNations } } : {}) }, now: 0 });
  if (guest) joinRoom(r, { player: { id: 'guest', name: 'Guest' }, selection: { specId: 't90m' }, team: 'bravo', now: 0 });
  for (const player of r.players) player.ready = true;
  return r;
};
const seatBots = (r, seed) => {
  const fromRoom = planFromRoom(JSON.parse(JSON.stringify(r)), { seed }).bots;
  const started = planStart(JSON.parse(JSON.stringify(r)), { seed, now: 1 });
  assert.deepEqual(fromRoom, started.bots, `${r.settings.gameMode} seed ${seed}: the host derives the room's own bots`);
  return started;
};

for (const mode of GAME_MODE_IDS) for (const seed of [1, 2, 3]) {
  const plan = seatBots(room(mode), seed);
  if (mode === 'endless_horde') {
    assert.equal(plan.bots.filter((b) => b.team === 'bravo').length, 20, 'the Horde\'s pool');
    assert.equal(plan.bots.filter((b) => b.team === 'alpha').length, 4, 'and its four allies');
  }
  if (mode === 'frontline_assault') {
    assert.deepEqual([plan.bots.filter((b) => b.team === 'bravo').length, plan.bots.filter((b) => b.team === 'alpha').length], [12, 3]);
  }
  assert.ok(plan.bots.every((b) => /^(bot|mode)-(alpha|bravo)-\d+$/.test(b.playerId)), `${mode}: a bot id is a seat, never a vehicle id`);
  assert.ok(!plan.bots.length || !plan.bots.every((b) => b.specId === 'm1a3'), `${mode}: bots are not clones of the host's pick`);
  for (const team of ['alpha', 'bravo']) {
    const side = plan.bots.filter((b) => b.team === team);
    assert.ok(new Set(side.map((b) => b.specId)).size <= 6, `${mode} ${team}: at most six distinct bot vehicles`);
  }
  // MONO: one country a side (plus noted fills), never the host's on the enemy side
  const record = plan.teamNations;
  assert.equal(record.teamNations, 'mono');
  if (plan.bots.some((b) => b.team === 'bravo')) {
    assert.notEqual(record.enemy, 'usa', `${mode}: the enemy side is never the host's country`);
    const allowed = new Set([record.enemy, ...record.notes.filter((n) => n.side === 'bravo').map((n) => n.country)]);
    assert.ok(plan.bots.filter((b) => b.team === 'bravo').every((b) => allowed.has(countryOf.get(b.specId))), `${mode}: the enemy bots are one country`);
  }
}
// one human a side: each side its human's country
{
  const plan = seatBots(room('standard', { guest: true }), 5);
  assert.deepEqual([plan.teamNations.allied, plan.teamNations.enemy], ['usa', 'russia']);
  assert.ok(plan.bots.filter((b) => b.team === 'bravo').every((b) => countryOf.get(b.specId) === 'russia'));
}
// RANDOM: mixed on both sides
{
  const plan = seatBots(room('standard', { teamNations: 'random' }), 6);
  assert.equal(plan.teamNations.teamNations, 'random');
  assert.ok(new Set(plan.bots.map((b) => countryOf.get(b.specId))).size >= 3, 'RANDOM mixes countries');
}
// the host decides: a guest's set_arrangement is refused; a mode change keeps TEAM NATIONS
{
  const r = room('standard', { guest: true });
  assert.throws(() => applyRoomCommand(r, 'guest', { type: 'set_arrangement', arrangement: { teamNations: 'random' } }, 2), /admin|not_admin|forbidden/i);
  applyRoomCommand(r, 'host', { type: 'set_arrangement', arrangement: { teamNations: 'random', enemyNation: 'china' } }, 3);
  assert.equal(r.settings.arrangement.teamNations, 'random');
  applyRoomCommand(r, 'host', { type: 'set_game_mode', gameMode: 'capture_the_flag' }, 4);
  assert.equal(r.settings.arrangement?.teamNations, 'random', 'TEAM NATIONS survives a mode change');
  assert.equal(r.settings.arrangement?.enemyNation ?? null, null, 'the old mode\'s other fields do not');
}
// a new room takes the host's remembered TEAM NATIONS choice (the play menu sends its stored arrangement, which folds the
// per-player preference in): created RANDOM, it plans RANDOM (round 2, the critic's E10)
{
  const { readTeamArrangement, writeTeamNations } = await import('../../game/teamArrangement.ts');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  writeTeamNations('random', storage);
  const remembered = readTeamArrangement('standard', storage);
  assert.equal(remembered?.teamNations, 'random', 'the stored preference rides the arrangement the menu sends');
  const r = createRoom({ roomCode: 'BOTS02', mode: 'private', creator: { id: 'host', name: 'Host' }, selection: { specId: 'm1a3' },
    settings: { gameMode: 'standard', mapId: 'verdant', arrangement: remembered }, now: 0 });
  assert.equal(r.settings.arrangement?.teamNations, 'random', 'the new room keeps it');
  for (const player of r.players) player.ready = true;
  assert.equal(planStart(r, { seed: 3, now: 1 }).teamNations.teamNations, 'random', 'and plans by it');
}
console.log('roomBots.selftest: co-op rooms seat their hostiles, national bots (no clones, six profiles a side), host parity in every mode, the host\'s TEAM NATIONS, kept from its stored choice');
