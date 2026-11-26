// A replay seats its recording's roster as recorded, whatever order the pool registered in (replay-fixes-277). Live 276:
// the replay indexer's Worker drew the roster again from the same seed and ordinal, but its pool (game.allTanks, built in
// the order the fleet registered) was not the page's, so it seated another roster, refused the replay, and the viewer
// said "This replay can't be played." The page itself matched, so neither the Node round trip nor the recorder's browser
// check saw it. Here: a draw on a pool in another order is another roster (the cause, kept visible), the recorded roster
// is seated exactly on either pool (pool hulls by id, same-nation repeats rebuilt, the sides as recorded), and the
// recorded setup hands the header's roster to setupBattle. No world. First-party tooling: Kevin B. Liu.
// (replay-notes-278) The TEAM NATIONS record seats as recorded, the planner's fill notes with it: rebuilt from the sides it
// lost them (an ally fill's note on the page, none in the replay: replayRoundTrip's dump after step 0 parted on it).
import assert from 'node:assert/strict';
import { createGameState } from '../stateCore.ts';
import { pickNationalBattle, seatRecordedRoster, spawnTanks } from '../rosterState.ts';
import { battleRosterPlan } from '../soloRosterPlan.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { teamNationsFlags } from '../../sim/teamNations.ts';
import { runRecordedSetup } from './replaySetup.ts';

const PLAYER = 'm1a3';
const plan = battleRosterPlan(matchRulesetFor('standard', null, null), null, true).national;
assert.ok(plan && plan !== 'random', 'the standard battle seats MONO-NATION sides');

function pool(seed, reorder = (list) => list) {
  const game = createGameState({ rosterSeed: seed });
  spawnTanks(game, { scene: { remove() {} } });
  game.allTanks = reorder(game.allTanks.slice());
  return game;
}
/** A draw as setup makes it, as the recorder keeps it: ids, specs, sides, the player first, and the TEAM NATIONS record
 *  (through JSON, as the header carries it). */
function recordedDraw(game, ordinal) {
  const drawn = pickNationalBattle(game, PLAYER, ordinal, plan);
  const allies = new Set(drawn.allies);
  const roster = drawn.participants.map((entity, index) => ({ id: entity.id, specId: entity.specId, team: index === 0 || allies.has(entity) ? 'player' : 'enemy' }));
  return { roster, teamNations: JSON.parse(JSON.stringify(drawn.record)) };
}
const key = (seats) => seats.map((seat) => `${seat.id}:${seat.specId}:${seat.team}`).join(',');

// 1. the cause: the same seed and ordinal on a pool in another order draws another roster
const reversed = (list) => list.reverse();
let differing = 0;
const cases = [];
for (const seed of [655843608, 1, 0x9e3779b9]) for (const ordinal of [1, 2]) {
  const { roster: recorded, teamNations } = recordedDraw(pool(seed), ordinal);
  const elsewhere = recordedDraw(pool(seed, reversed), ordinal).roster;
  if (key(recorded) !== key(elsewhere)) differing++;
  cases.push({ seed, ordinal, recorded, teamNations });
}
assert.ok(differing > 0, 'a pool in another registration order draws another roster (the indexer\'s refusal); none differed here');

// 2. the recorded roster is seated exactly on either pool, with its TEAM NATIONS record as recorded
let noted = 0;
for (const { seed, ordinal, recorded, teamNations } of cases) {
  if (teamNations.notes.length) noted++;
  for (const game of [pool(seed), pool(seed, reversed)]) {
    const seated = seatRecordedRoster(game, PLAYER, recorded, teamNations);
    assert.ok(seated, `seed ${seed} ordinal ${ordinal}: the recorded roster seats`);
    const sides = new Set(seated.allyIds);
    const got = seated.participants.map((entity, index) => ({ id: entity.id, specId: entity.specId,
      team: index === 0 || sides.has(entity.id) ? 'player' : 'enemy' }));
    assert.equal(key(got), key(recorded), `seed ${seed} ordinal ${ordinal}: seated as recorded`);
    assert.equal(seated.participants[0], game.tankById.get(PLAYER), 'the player\'s own hull leads');
    assert.deepEqual(JSON.parse(JSON.stringify(seated.record)), teamNations, `seed ${seed} ordinal ${ordinal}: the TEAM NATIONS record as recorded, notes and all`);
    assert.ok(Object.isFrozen(seated.record) && Object.isFrozen(seated.record.notes), 'the seated record is frozen, as the picker\'s is');
  }
}
// the notes are the point: some draw here must carry one (an ally fill, a repeat), or the check above proves nothing
assert.ok(noted > 0, 'a recorded draw carries a planner note');

// 3. a same-nation repeat (the picker's `allied:k:spec` clone) is rebuilt as the picker builds it; an unknown hull refuses
{
  const game = pool(1);
  const repeat = [{ id: PLAYER, specId: PLAYER, team: 'player' }, { id: 'enemy:0:t14_armata', specId: 't14_armata', team: 'enemy' },
    { id: `allied:1:${PLAYER}`, specId: PLAYER, team: 'player' }];
  const seated = seatRecordedRoster(game, PLAYER, repeat, null);
  assert.ok(seated);
  assert.deepEqual(seated.participants.map((entity) => entity.id), repeat.map((seat) => seat.id));
  assert.equal(seated.participants[1].matchReinforcement, true);
  assert.equal(seated.participants[2].matchReinforcement, true);
  assert.notEqual(seated.participants[2], seated.participants[0], 'a repeat of the player\'s spec is its own hull');
  assert.deepEqual([...seated.allyIds], [`allied:1:${PLAYER}`]);
  assert.equal(seated.record, null);
  assert.equal(seatRecordedRoster(game, PLAYER, [{ id: PLAYER, specId: PLAYER, team: 'player' }, { id: 'no_such_tank', specId: 'no_such_tank', team: 'enemy' }], null), null);
  assert.equal(seatRecordedRoster(game, PLAYER, [{ id: 't14_armata', specId: 't14_armata', team: 'enemy' }], null), null, 'the player leads');
}

// 4. the recorded setup hands setupBattle the header's roster
{
  const roster = cases[0].recorded;
  const header = { roster, teamNations: cases[0].teamNations, setup: { rosterSeed: 655843608, battleCount: 0, playerSpecId: PLAYER, seed: 6000, options: { random: true } } };
  const game = {};
  const options = runRecordedSetup(game, header, (playerSpecId, recorded) => { assert.equal(playerSpecId, PLAYER); return recorded; });
  assert.equal(key(options.recordedRoster), key(roster));
  assert.equal(options.recordedTeamNations, cases[0].teamNations, 'and its TEAM NATIONS record');
  // a 277 file's header has no record: setup seats none (a release refuses such a file on its digest first;
  // replayRoundTrip plays one on a dev build), and the load card and HUD read no nations from it, as a RANDOM battle's
  const { teamNations: _none, ...header277 } = header;
  const old = runRecordedSetup({}, header277, (_playerSpecId, recorded) => recorded);
  assert.equal(old.recordedTeamNations, null, 'a 277 header hands setup no record');
  assert.equal(seatRecordedRoster(pool(655843608), PLAYER, roster, old.recordedTeamNations)?.record, null, 'and the roster seats with none');
  assert.equal(teamNationsFlags(null), null, 'which shows no nations');
  assert.equal(game.rosterSeed, 655843608);
}

console.log(`replayRosterSeat: PASS (${differing}/${cases.length} draws differ on a reordered pool; every recorded roster seated exactly, `
  + `its TEAM NATIONS record with it (${noted}/${cases.length} with planner notes))`);
