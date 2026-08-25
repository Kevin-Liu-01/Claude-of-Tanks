import assert from 'node:assert/strict';
import {
  createGameState, planBattleCamoOverrides, planBattleParticipantIds, spawnTanks,
} from './state.js';

const game = createGameState();
spawnTanks(game, {});
const beforeCount = game.battleCount;
const first = planBattleParticipantIds(game, 'm1a2', true);
const again = planBattleParticipantIds(game, 'm1a2', true);

assert.equal(game.battleCount, beforeCount, 'planning does not consume a battle ordinal');
assert.deepEqual(again, first, 'planning is deterministic until a battle starts');
assert.equal(first[0], 'm1a2', 'player remains the first participant');
assert.equal(first.length, 14, 'random battle plan covers the full 7v7 roster');
assert.equal(new Set(first).size, first.length, 'planned participant ids are unique');
const firstCamo = planBattleCamoOverrides(game, 'm1a2', 'verdant', true);
assert.deepEqual(planBattleCamoOverrides(game, 'm1a2', 'verdant', true), firstCamo,
  'planned bot camouflage is deterministic until a battle starts');
assert.ok(firstCamo.every((id) => first.includes(id) && id !== 'm1a2'),
  'planned AUTO overrides are restricted to non-player participants');
assert.deepEqual(
  planBattleCamoOverrides(game, 'm1a2', 'winter', true), first.slice(1),
  'high-contrast battlefields plan AUTO camouflage for every bot');
assert.deepEqual(planBattleCamoOverrides(game, 'm1a2', 'verdant', false), [],
  'non-random staged rosters do not invent bot camouflage overrides');

game.battleCount++;
const second = planBattleParticipantIds(game, 'm1a2', true);
assert.notDeepEqual(second, first, 'the next battle ordinal produces a new seeded roster');

console.log('rosterPlanning.selftest: deterministic next-roster preload plan passed');
