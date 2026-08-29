import assert from 'node:assert/strict';
import { createGameState } from './stateCore.ts';
import {
  planBattleCamoOverrides, planBattleParticipantIds, spawnTanks,
} from './rosterState.ts';
import { BOT_TANK_IDS, getSpec, PRODUCTION_TANK_IDS } from '../vehicles/specs.js';

const game = createGameState();
spawnTanks(game, {});
assert.deepEqual(game.allTanks.map((tank) => tank.specId), BOT_TANK_IDS,
  'solo battles lazily instantiate every production-visible vehicle');
assert.deepEqual(BOT_TANK_IDS, PRODUCTION_TANK_IDS,
  'solo bot eligibility exactly matches the production catalog');
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

const catalogByEra = Map.groupBy(BOT_TANK_IDS, (id) => getSpec(id).era);
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
