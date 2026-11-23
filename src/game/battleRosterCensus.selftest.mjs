// Battle roster census (roster-mirror-fix, 2026-11-22). The owner's screenshot: a T95 battle's VS card listed seven T95s
// against seven KV-2s, tier II against tier I ("fix this from happening!"), and the follow-up: "make sure all our tanks
// including new ones are eligible to be in battles". A census, not a list: it walks the whole fleet registry, so a new or
// renamed vehicle is checked the day it registers.
//
// 1. Eligibility: every registered vehicle is selectable by the player and drawable as a bot, with an era band, a
//    country, a tech-tree tier, a role profile, facets and a current nation-index row (the rooms' pool), unless
//    rosterPolicy's one BATTLE_EXCLUDED_TANK_IDS list names it with a reason. A failure names the id and the cause.
// 2. Drawability: every eligible vehicle is actually drawn as a bot in a MONO-NATION battle of its own country, era and
//    tier band, through the solo planner the battle seats (rosterState.pickNationalBattle).
// 3. Variety and one tier band: every vehicle as the player fields thirteen distinct bots, never its own hull again,
//    every seat in the player's tier band and the two sides' mean tiers together.
// Each check has a negative control: the 271 fleet shape (three WW2 hulls, one a nation) cloned rosters, and a vehicle
// missing from the registries fails the census by name.
import assert from 'node:assert/strict';
import '../vehicles/fleetFactory.ts';
import { createGameState } from './stateCore.ts';
import { pickNationalBattle, rememberBattleBots, spawnTanks } from './rosterState.ts';
import { isBotTankId, isGarageVisibleTankId } from './matchmaking.ts';
import { ALL_TANK_IDS, PRODUCTION_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { BATTLE_EXCLUDED_TANK_IDS, isRetiredHistoricalTank } from '../vehicles/rosterPolicy.ts';
import { VEHICLE_ROLE_PROFILES } from '../vehicles/roleProfiles.ts';
import { vehicleFacetsForId } from '../vehicles/vehicleFacets.ts';
import { displayTier } from '../techTree/tiers.ts';
import { tankTier } from '../vehicles/tier.ts';
import { NATION_INDEX } from '../sim/nationIndex.generated.ts';
import { ERA_NEIGHBOURS, MATCH_TIER_SPREAD, countryOfVehicle, pickNationalSides } from '../sim/teamNations.ts';

// --- 1. eligibility -------------------------------------------------------------------------------------------------
const indexRow = new Map(NATION_INDEX.map(([id, country, era, tier]) => [id, { country, era, tier }]));
const LIVE = {
  spec: (id) => getSpec(id),
  production: (id) => PRODUCTION_TANK_IDS.includes(id),
  selectable: (id) => isGarageVisibleTankId(id),
  bot: (id) => isBotTankId(id),
  retired: (id) => isRetiredHistoricalTank(getSpec(id)),
  tier: (id) => displayTier(id),
  role: (id) => Object.prototype.hasOwnProperty.call(VEHICLE_ROLE_PROFILES, id),
  facets: (id) => !!vehicleFacetsForId(id),
  index: (id) => indexRow.get(id) ?? null,
};

/** Why `id` can never take a seat, as causes (empty: eligible). */
function eligibilityCauses(id, reg) {
  const spec = reg.spec(id);
  if (!spec) return ['no registered spec'];
  const causes = [];
  const country = countryOfVehicle(id, spec.nation);
  if (!ERA_NEIGHBOURS[spec.era]) causes.push(`era '${spec.era}' has no matchmaking band (countries.ts ERA_NEIGHBOURS)`);
  if (!country) causes.push(`nation '${spec.nation}' maps to no country (countries.ts)`);
  if (!reg.production(id)) causes.push('missing from PRODUCTION_TANK_IDS (rosterPolicy hidden)');
  if (reg.retired(id)) causes.push('retired by rosterPolicy (historical archive)');
  if (!reg.selectable(id)) causes.push('not selectable in the garage (matchmaking.isGarageVisibleTankId)');
  if (!reg.bot(id)) causes.push('not a bot vehicle (matchmaking.isBotTankId)');
  if (!(reg.tier(id) > 0)) causes.push('no tech-tree tier (techTree/tiers.ts)');
  if (!reg.role(id)) causes.push('no role profile (vehicles/roleProfiles.ts)');
  if (!reg.facets(id)) causes.push('no facets (vehicles/vehicleFacets.ts)');
  const row = reg.index(id);
  if (!row) causes.push('missing from the nation index (node tools/nation-index.mjs)');
  else if (row.country !== country || row.era !== spec.era || row.tier !== tankTier(id)) {
    causes.push(`stale nation index row (${row.country}/${row.era}/${row.tier} vs live ${country}/${spec.era}/${tankTier(id)})`);
  }
  return causes;
}

/** The census: every id not excluded must have no cause; every exclusion must be a registered id with a reason. */
function censusFailures(ids, reg, excluded) {
  const failures = [];
  for (const [id, reason] of Object.entries(excluded)) {
    if (!ids.includes(id)) failures.push(`${id}: excluded but not registered`);
    if (typeof reason !== 'string' || reason.trim().length < 8) failures.push(`${id}: an exclusion needs its reason`);
  }
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(excluded, id)) continue;
    const causes = eligibilityCauses(id, reg);
    if (causes.length) failures.push(`${id}: ${causes.join('; ')}`);
  }
  return failures;
}

assert.ok(ALL_TANK_IDS.length >= 313, `the registry holds the fleet (${ALL_TANK_IDS.length})`);
// 274's new and renamed ids are in the walk like any other (the census needs no list of them; this pins that it reached them)
for (const id of ['ttd', 't62_1975', 'strv103b_net', 'strv103e', 'strv152', 'ee_t3_osorio', 'ee_t4_osorio']) {
  assert.ok(ALL_TANK_IDS.includes(id), `${id} is registered`);
}
const failures = censusFailures(ALL_TANK_IDS, LIVE, BATTLE_EXCLUDED_TANK_IDS);
assert.deepEqual(failures, [], `vehicles no roster pool can pick:\n${failures.join('\n')}`);
for (const id of Object.keys(BATTLE_EXCLUDED_TANK_IDS)) assert.equal(isBotTankId(id), false, `${id}: an excluded vehicle takes no bot seat`);

// negative control: a vehicle missing from the tier map and the nation index fails by name; the same vehicle passes once
// the exclusion list names it with a reason, and an exclusion without one fails
{
  const ghost = 'census_ghost_tank';
  const ghostSpec = { id: ghost, nation: 'USA', era: 'modern' };
  const reg = { ...LIVE,
    spec: (id) => (id === ghost ? ghostSpec : LIVE.spec(id)),
    production: (id) => id === ghost || LIVE.production(id), selectable: () => true, bot: () => true,
    retired: (id) => id !== ghost && LIVE.retired(id),
    tier: (id) => (id === ghost ? 0 : LIVE.tier(id)), role: (id) => id === ghost || LIVE.role(id),
    facets: (id) => id === ghost || LIVE.facets(id), index: (id) => (id === ghost ? null : LIVE.index(id)) };
  const ids = [...ALL_TANK_IDS, ghost];
  const named = censusFailures(ids, reg, {});
  assert.equal(named.length, 1, `only the ghost fails (${named})`);
  assert.match(named[0], /^census_ghost_tank: .*no tech-tree tier.*missing from the nation index/, 'the failure names the id and its causes');
  assert.deepEqual(censusFailures(ids, reg, { [ghost]: 'a census negative control' }), [], 'an excluded id with a reason passes');
  assert.match(censusFailures(ids, reg, { [ghost]: '' })[0], /needs its reason/, 'an exclusion without a reason fails');
  // a stale nation-index row (the 274 renames) is a cause too
  const stale = { ...LIVE, index: (id) => (id === 'kv2' ? { ...LIVE.index(id), tier: 5 } : LIVE.index(id)) };
  assert.match(censusFailures(ALL_TANK_IDS, stale, {}).join('\n'), /^kv2: stale nation index row/m, 'a stale index row fails by name');
}

// --- 2. drawability -------------------------------------------------------------------------------------------------
const game = createGameState();
spawnTanks(game, {});
const countryOf = (id) => countryOfVehicle(id, getSpec(id).nation);
const eligible = ALL_TANK_IDS.filter((id) => !Object.prototype.hasOwnProperty.call(BATTLE_EXCLUDED_TANK_IDS, id));
const NO_ARRANGEMENT = { alliedSeats: 6, enemySeats: 7, campaignEnemy: null, arrangedEnemy: null, nationFirst: false };
/** The ids of `ids` no battle of their band draws as a bot from `pool`'s game, each with the players tried. */
function undrawn(pool, ids) {
  const neverDrawn = [];
  for (const id of ids) {
    const era = getSpec(id).era, tier = tankTier(id), country = countryOf(id);
    // the players whose battles may field it: its era in their band, the nearest tiers first; one of its own country
    // seats it among the allies, one of another country meets it as the arranged enemy
    const players = eligible.filter((other) => other !== id && (ERA_NEIGHBOURS[getSpec(other).era] ?? []).includes(era))
      .sort((a, b) => Math.abs(tankTier(a) - tier) - Math.abs(tankTier(b) - tier)
        || Number(getSpec(a).era !== era) - Number(getSpec(b).era !== era) || a.localeCompare(b));
    const own = players.filter((other) => countryOf(other) === country).slice(0, 2);
    const foreign = players.filter((other) => countryOf(other) !== country).slice(0, 3);
    assert.ok(own.length + foreign.length, `${id}: some player's band reaches its era`);
    let drawn = false;
    for (const player of [...own, ...foreign]) {
      const plan = { ...NO_ARRANGEMENT, arrangedEnemy: countryOf(player) === country ? null : country };
      // consecutive battles as the game plays them: the last two battles' bots rank behind every fresh vehicle
      // (state.ts rememberBattleBots), which is how the band's less-favoured vehicles reach a seat
      let previous = null;
      pool.recentBotSpecIds = null;
      for (let ordinal = 1; ordinal <= 48 && !drawn; ordinal++) {
        const bots = pickNationalBattle(pool, player, ordinal, plan).participants.slice(1);
        drawn = bots.some((entity) => entity.specId === id && !entity.matchReinforcement);
        const memory = rememberBattleBots(previous, bots.map((entity) => entity.specId));
        pool.recentBotSpecIds = memory.recent;
        previous = memory.previous;
      }
      pool.recentBotSpecIds = null;
      if (drawn) break;
    }
    if (!drawn) neverDrawn.push(`${id} (${country} ${era} tier ${tier}, against ${[...own, ...foreign].join(', ')})`);
  }
  return neverDrawn;
}
const neverDrawn = undrawn(game, eligible);
assert.deepEqual(neverDrawn, [], `vehicles no battle of their band drew as a bot:\n${neverDrawn.join('\n')}`);

// negative control: a vehicle the pool lost (its entity gone, as a stale or dropped registry would leave it) is named
{
  const lost = { ...game, allTanks: game.allTanks.filter((entity) => entity.specId !== 'kv2'), recentBotSpecIds: null };
  assert.deepEqual(undrawn(lost, ['kv2', 't55a']).map((line) => line.split(' ')[0]), ['kv2'], 'a vehicle no pool holds fails by name');
}

// --- 3. variety and one tier band -----------------------------------------------------------------------------------
/** What is wrong with a battle's seats for a player of `tier` (empty: a proper roster). */
function rosterProblems(playerId, allies, enemies, tier) {
  const problems = [];
  const bots = [...allies, ...enemies];
  const ids = bots.map((seat) => seat.id);
  if (bots.some((seat) => seat.repeat)) problems.push(`a repeated vehicle (${ids})`);
  if (new Set(ids).size !== ids.length) problems.push(`a vehicle twice (${ids})`);
  if (ids.includes(playerId)) problems.push('a clone of the player');
  const outside = bots.filter((seat) => Math.abs(seat.tier - tier) > MATCH_TIER_SPREAD);
  if (outside.length) problems.push(`outside the tier band ${tier}±${MATCH_TIER_SPREAD}: ${outside.map((seat) => `${seat.id}:${seat.tier}`)}`);
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const gap = Math.abs(mean([tier, ...allies.map((seat) => seat.tier)]) - mean(enemies.map((seat) => seat.tier)));
  if (gap > 0.75) problems.push(`the sides' mean tiers ${gap.toFixed(2)} apart`);
  return problems;
}

let battles = 0;
const bad = [];
for (const id of eligible) {
  for (const ordinal of [1, 9]) {
    const battle = pickNationalBattle(game, id, ordinal, NO_ARRANGEMENT);
    const allyIds = new Set(battle.allies.map((entity) => entity.id));
    const seat = (entity) => ({ id: entity.specId, tier: tankTier(entity.specId), repeat: !!entity.matchReinforcement });
    const bots = battle.participants.slice(1);
    const problems = rosterProblems(id, bots.filter((e) => allyIds.has(e.id)).map(seat), bots.filter((e) => !allyIds.has(e.id)).map(seat), tankTier(id));
    if (bots.length !== 13) problems.push(`${bots.length} bots`);
    if (problems.length) bad.push(`${id} @${ordinal}: ${problems.join('; ')}`);
    battles++;
  }
}
assert.deepEqual(bad, [], `${bad.length} of ${battles} rosters are not a proper mix:\n${bad.slice(0, 40).join('\n')}`);

// the screenshot's T95: thirteen distinct tanks, its own country's beside it, all within tier II's band
{
  const battle = pickNationalBattle(game, 't95', 1, NO_ARRANGEMENT);
  const allies = battle.allies.map((entity) => entity.specId);
  assert.equal(new Set(battle.participants.map((entity) => entity.specId)).size, 14, `t95: fourteen distinct vehicles (${battle.participants.map((e) => e.specId)})`);
  assert.ok(allies.filter((id) => countryOf(id) === 'usa').length >= 4, `t95: American allies (${allies})`);
}

// negative control: the 271 fleet shape (three WW2 hulls, one a nation) cannot field distinct sides, and the checker says so
{
  const rows = ['t95', 'kv2', 'jpz_e100'].map((id) => ({ id, country: countryOf(id), era: 'ww2', tier: tankTier(id) }));
  const plan = pickNationalSides({ rows, alliedHumans: [rows[0]], alliedSeats: 6, enemySeats: 7, seed: 3, rivalBlocWeight: 3, autoNeedsContemporaries: true });
  const tierOf = (id) => rows.find((row) => row.id === id).tier;
  const seats = (list) => list.map((s) => ({ id: s.id, tier: tierOf(s.id), repeat: s.repeat }));
  const problems = rosterProblems('t95', seats(plan.allies), seats(plan.enemies), tierOf('t95'));
  assert.ok(problems.some((p) => p.startsWith('a repeated vehicle')), `the checker catches a cloned roster (${problems})`);
  // and the screenshot's own roster: seven T95s against seven KV-2s
  const shot = rosterProblems('t95', Array(6).fill({ id: 't95', tier: 2, repeat: true }), Array(7).fill({ id: 'kv2', tier: 1, repeat: true }), 2);
  assert.ok(shot.some((p) => p.includes('clone of the player')) && shot.some((p) => p.includes('mean tiers')), `the screenshot fails (${shot})`);
}

console.log(`battle roster census: ${ALL_TANK_IDS.length} registered, ${Object.keys(BATTLE_EXCLUDED_TANK_IDS).length} excluded, every other one drawable; ${battles} rosters, each thirteen distinct bots in one tier band`);
