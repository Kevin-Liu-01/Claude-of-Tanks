import assert from 'node:assert/strict';
import { createGameState } from './stateCore.ts';
import {
  planBattleCamoOverrides, planBattleParticipantIds, spawnTanks,
} from './rosterState.ts';
import { getSpec, PRODUCTION_TANK_IDS } from '../vehicles/specs.ts';
import { ENEMY_NATION_OPTIONS } from './teamArrangement.ts';

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
// sides (owner 2026-09-18): a 14 v 14 plan asks for 27 non-player seats and takes every one the catalog can fill
{
  const wide = planBattleParticipantIds(game, 'm1a2', true, [], 27, null);
  assert.equal(wide.length, Math.min(28, game.allTanks.length), 'a wider field takes every seat the catalog can fill');
  assert.equal(new Set(wide).size, wide.length, 'a wider field never repeats a vehicle');
  assert.equal(wide[0], 'm1a2');
}
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

// matchmaking diversity (owner 2026-09-17): the previous battle's bots rotate to the back of their era band
{
  game.battleCount = 0;
  const plan = planBattleParticipantIds(game, 'm1a2', true);
  game.recentBotSpecIds = new Set(plan.slice(1));
  const rotated = planBattleParticipantIds(game, 'm1a2', true);
  assert.equal(rotated[0], 'm1a2');
  assert.equal(rotated.length, 14);
  const modernPool = PRODUCTION_TANK_IDS.filter((id) => getSpec(id).era === getSpec('m1a2').era && id !== 'm1a2').length;
  const repeats = rotated.slice(1).filter((id) => game.recentBotSpecIds.has(id)).length;
  assert.equal(repeats, Math.max(0, 13 - (modernPool - 13)),
    `consecutive rosters repeat only what the era catalog forces (${repeats} of 13, pool ${modernPool})`);
  assert.deepEqual(planBattleParticipantIds(game, 'm1a2', true), rotated, 'the rotated plan is deterministic');
  game.recentBotSpecIds = null;
}
// same-nation waves by default (owner 2026-09-17): a wave mode with no arranged nation still fields ONE nation
// in its lead seats — every era of that nation before any other nation — rotating per battle ordinal
{
  const leads = [];
  for (let ordinal = 0; ordinal < 6; ordinal++) {
    game.battleCount = ordinal;
    const plan = planBattleParticipantIds(game, 'm1a2', true, [], 10, 8);
    assert.equal(plan.length, 11, 'two allies and eight enemies join the player');
    const lead = plan.slice(1, 9).map((id) => getSpec(id).nation);
    const option = ENEMY_NATION_OPTIONS.find((entry) => entry.specNations.includes(lead[0]));
    assert.ok(option, `lead nation ${lead[0]} is a fieldable nation`);
    assert.ok(lead.every((nation) => option.specNations.includes(nation)),
      `wave ${ordinal}: the eight lead seats share one nation (${lead.join(', ')})`);
    leads.push(option.id);
  }
  assert.ok(new Set(leads).size >= 2, `consecutive battles rotate the default wave nation (${leads.join(', ')})`);
  assert.deepEqual(planBattleParticipantIds(game, 'm1a2', true, [], 10, 8), planBattleParticipantIds(game, 'm1a2', true, [], 10, 8),
    'the default wave nation is deterministic per ordinal');
  game.battleCount = 0;
}

console.log('rosterPlanning.selftest: deterministic next-roster preload plan, recent-roster rotation, and same-nation waves passed');
