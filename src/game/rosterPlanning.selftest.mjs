import assert from 'node:assert/strict';
import { createGameState } from './stateCore.ts';
import {
  planBattleCamoOverrides, planBattleParticipantIds, spawnTanks,
} from './rosterState.ts';
import { getSpec, PRODUCTION_TANK_IDS } from '../vehicles/specs.ts';

const game = createGameState();
spawnTanks(game, {});
assert.deepEqual(game.allTanks.map((tank) => tank.specId), PRODUCTION_TANK_IDS,
  'solo battles lazily instantiate every production-visible vehicle');
assert.equal(game.tankById.has('m1a2_legacy'), false,
  'a player-hidden development vehicle cannot enter a production bot roster');
const beforeCount = game.battleCount;
const first = planBattleParticipantIds(game, 'm1a2', true);
const again = planBattleParticipantIds(game, 'm1a2', true);

assert.equal(game.battleCount, beforeCount, 'planning does not consume a battle ordinal');
assert.deepEqual(again, first, 'planning is deterministic until a battle starts');
assert.equal(first[0], 'm1a2', 'player remains the first participant');
assert.equal(first.length, 14, 'random battle plan covers the full 7v7 roster');
assert.equal(new Set(first).size, first.length, 'planned participant ids are unique');
// batch 19 (2026-09-14): a campaign operation's formation fills the enemy seats first — same-era vehicles of
// the named nations lead the plan (at most ten, leaving seats for the allies); no formation keeps the standard plan
{
  const russian = ['Russia', 'USSR', 'USSR/Russia', 'RU'];
  const playerEra = getSpec('m1a2').era;
  const contemporaries = { ww2: ['ww2'], 'cold-war': ['cold-war', 'modern'], modern: ['modern', 'cold-war', 'next-generation'], 'next-generation': ['next-generation', 'modern'] }[playerEra];
  const inFormation = (id) => russian.includes(getSpec(id).nation) && contemporaries.includes(getSpec(id).era);
  const formation = planBattleParticipantIds(game, 'm1a2', true, russian);
  assert.equal(formation.length, 14); assert.equal(formation[0], 'm1a2');
  assert.equal(new Set(formation).size, formation.length);
  const available = game.allTanks.filter((tank) => tank.specId !== 'm1a2' && inFormation(tank.specId)).length;
  assert.ok(available >= 3, `the production catalog fields same-era Russian vehicles (${available})`);
  const lead = formation.slice(1, 11).filter(inFormation).length;
  assert.equal(lead, Math.min(10, available), 'up to ten contemporary formation vehicles lead the roster');
  const sameEraLead = formation.slice(1, 11).filter((id) => inFormation(id) && getSpec(id).era === playerEra).length;
  const sameEraAvailable = game.allTanks.filter((tank) => tank.specId !== 'm1a2' && inFormation(tank.specId) && getSpec(tank.specId).era === playerEra).length;
  assert.equal(sameEraLead, Math.min(10, sameEraAvailable), 'the player\'s own era fills the formation before its contemporaries');
  assert.deepEqual(planBattleParticipantIds(game, 'm1a2', true, []), first, 'no formation keeps the standard plan');
  assert.deepEqual(planBattleParticipantIds(game, 'm1a2', true, russian), formation, 'the formation plan is deterministic');
}
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
const staged = planBattleParticipantIds(game, 'm1a2', false);
assert.equal(staged.length, 8,
  'deterministic capture staging keeps a complete eight-vehicle roster');
assert.equal(new Set(staged).size, staged.length,
  'deterministic capture staging uses unique production vehicles');

game.battleCount++;
const second = planBattleParticipantIds(game, 'm1a2', true);
assert.notDeepEqual(second, first, 'the next battle ordinal produces a new seeded roster');

const catalogByEra = Map.groupBy(PRODUCTION_TANK_IDS, (id) => getSpec(id).era);
for (const [era, ids] of catalogByEra) {
  const playerId = ids.find((id) => getSpec(id).roster?.productionVisible) || ids[0];
  const sameEraCatalog = ids.filter((id) => id !== playerId);
  const seenSameEraBots = new Set();
  for (let ordinal = 0; ordinal < 1024; ordinal++) {
    game.battleCount = ordinal;
    for (const id of planBattleParticipantIds(game, playerId, true).slice(1)) {
      if (getSpec(id).era === era) seenSameEraBots.add(id);
    }
  }
  assert.deepEqual(seenSameEraBots, new Set(sameEraCatalog),
    `${era}: ordinary solo random battles rotate through the production era catalog`);
}

console.log('rosterPlanning.selftest: deterministic next-roster preload plan passed');
