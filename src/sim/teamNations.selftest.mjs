// TEAM NATIONS (gameplay-modes-228; owner 2026-10-18: "make the allied/enemy tank country enforcement work properly" and
// "be able to select wehtehr we want team enemies to be mononation or just random"). The MONO-NATION planner over the
// real production index, for every country x era x seat shape the modes field: no country on both sides, the humans'
// picks kept, each side its primary country plus only the fills its notes name, the AUTO enemy never the player's
// country, contemporaries before far eras, the tier pairing, determinism, and the country tables the rest of the tree
// reads (the closest-ally order is pinned: a change here changes every fill).
import assert from 'node:assert/strict';
import { NATION_INDEX } from './nationIndex.generated.ts';
import { COUNTRIES, COUNTRY_ALLIES, ERA_NEIGHBOURS, countryBloc, countryFlag, countryOfNation, majorityCountry, pickNationalSides,
  teamNationsFlags, teamNationsSeed } from './teamNations.ts';
import { TEAM_NATIONS_RULES } from './matchRuleset.ts';

const rows = NATION_INDEX.map(([id, country, era, tier]) => ({ id, country, era, tier }));
assert.ok(rows.length >= 200, 'the index lists the production fleet');
assert.ok(rows.every((row) => row.country), 'every production vehicle maps to a country');

// the country table: thirteen countries, their aliases, flags and blocs
assert.equal(COUNTRIES.length, 13);
assert.equal(countryOfNation('USSR/Russia'), 'russia'); assert.equal(countryOfNation('US'), 'usa'); assert.equal(countryOfNation('Community'), null);
assert.equal(countryFlag('uk'), 'gb'); assert.equal(countryFlag('nope'), 'xx');
assert.equal(countryBloc('china'), 'east'); assert.equal(countryBloc('poland'), 'west');
assert.deepEqual(Object.fromEntries(Object.entries(COUNTRY_ALLIES).map(([c, list]) => [c, list.join(' ')])), {
  usa: 'uk germany france italy poland israel japan south_korea sweden ukraine',
  uk: 'usa germany france italy poland sweden israel japan south_korea ukraine',
  germany: 'france italy poland uk usa sweden ukraine israel japan south_korea',
  france: 'germany italy uk usa poland sweden ukraine israel japan south_korea',
  italy: 'germany france uk usa poland sweden ukraine israel japan south_korea',
  poland: 'ukraine germany usa uk sweden france italy israel japan south_korea',
  ukraine: 'poland uk usa germany sweden france italy israel japan south_korea',
  sweden: 'germany uk poland france usa italy ukraine israel japan south_korea',
  israel: 'usa uk germany france italy poland sweden ukraine japan south_korea',
  japan: 'usa south_korea uk france germany italy poland sweden israel ukraine',
  south_korea: 'usa japan uk germany france italy poland sweden israel ukraine',
  russia: 'china', china: 'russia',
}, 'the closest-ally order (study-country 3.2)');
for (const [c, list] of Object.entries(COUNTRY_ALLIES)) for (const ally of list) assert.equal(countryBloc(ally), countryBloc(c), `${c}: fills stay in its bloc`);

// the seat shapes the modes field (allied bots / enemy seats; the player is the one allied human)
const SHAPES = [['7v7', 6, 7], ['14v14', 13, 14], ['horde', 4, 20], ['frontline', 3, 12], ['juggernaut boss', 0, 12],
  ['juggernaut hunter', 5, 1], ['infected', 9, 5], ['ac130', 4, 12]];
const ERAS = ['cold-war', 'modern', 'next-generation'];
let cases = 0, filled = 0;
const fills = [];
for (const country of COUNTRIES.map((c) => c.id)) {
  for (const era of ERAS) {
    const player = rows.find((row) => row.country === country && row.era === era);
    if (!player) continue;
    for (const [shape, alliedSeats, enemySeats] of SHAPES) {
      const plan = pickNationalSides({ rows, alliedHumans: [player], alliedSeats, enemySeats, seed: teamNationsSeed(country, era, shape),
        rivalBlocWeight: TEAM_NATIONS_RULES.rivalBlocWeight, autoNeedsContemporaries: true });
      const label = `${country} ${era} ${shape}`;
      cases++;
      assert.equal(plan.allies.length, alliedSeats, `${label}: every allied seat`);
      assert.equal(plan.enemies.length, enemySeats, `${label}: every enemy seat`);
      assert.equal(plan.allied, country, `${label}: the allies are the player's country`);
      assert.ok(plan.enemy && plan.enemy !== country, `${label}: the enemy is another country`);
      assert.ok(!plan.allies.some((seat) => seat.id === player.id && !seat.repeat), `${label}: the player's pick is never a bot seat's original`);
      const countryOf = (id) => rows.find((row) => row.id === id).country;
      const sides = { alpha: new Set(plan.allies.map((s) => countryOf(s.id))), bravo: new Set(plan.enemies.map((s) => countryOf(s.id))) };
      sides.alpha.add(country);
      for (const c of sides.alpha) assert.ok(!sides.bravo.has(c), `${label}: ${c} on both sides`);
      for (const side of ['alpha', 'bravo']) {
        const allowed = new Set([side === 'alpha' ? plan.allied : plan.enemy, ...plan.notes.filter((n) => n.side === side).map((n) => n.country)]);
        for (const c of sides[side]) assert.ok(allowed.has(c), `${label}: ${side} fields ${c}, neither its country nor a listed fill`);
      }
      // contemporaries first: no far-era seat while the side's chain had contemporaries to give
      const band = ERA_NEIGHBOURS[era];
      const farEra = [...plan.allies, ...plan.enemies].filter((s) => !band.includes(rows.find((row) => row.id === s.id).era)).length;
      assert.ok(farEra === 0 || plan.notes.some((n) => n.reason === 'far-era'), `${label}: a far-era seat only as a noted last resort`);
      if (plan.notes.length) { filled++; if (fills.length < 12) fills.push(`${label}: ${plan.notes.map((n) => `${n.side} +${n.count} ${n.country} (${n.reason})`).join(', ')}`); }
      // deterministic
      assert.deepEqual(pickNationalSides({ rows, alliedHumans: [player], alliedSeats, enemySeats, seed: teamNationsSeed(country, era, shape),
        rivalBlocWeight: TEAM_NATIONS_RULES.rivalBlocWeight, autoNeedsContemporaries: true }), plan, `${label}: the seed decides`);
    }
  }
}
assert.ok(cases >= 250, `${cases} country x era x shape cases`);

// an operation's country is kept; when it is the player's own, the allied BOTS give way to its first ally
{
  const russian = rows.find((row) => row.country === 'russia' && row.era === 'modern');
  const plan = pickNationalSides({ rows, alliedHumans: [russian], alliedSeats: 3, enemySeats: 12, campaignEnemy: 'russia', seed: 4,
    rivalBlocWeight: 3, autoNeedsContemporaries: true });
  assert.equal(plan.enemy, 'russia', 'the story fixes the enemy');
  assert.equal(plan.allied, 'china', 'the allied bots give way to Russia\'s first ally');
  assert.ok(plan.notes.some((n) => n.reason === 'clash' && n.side === 'alpha'), 'and the receipt says so');
}
// an arranged enemy country is kept unless it is the player's own (then AUTO)
{
  const yank = rows.find((row) => row.country === 'usa' && row.era === 'modern');
  assert.equal(pickNationalSides({ rows, alliedHumans: [yank], alliedSeats: 6, enemySeats: 7, arrangedEnemy: 'china', seed: 1, rivalBlocWeight: 3 }).enemy, 'china');
  assert.notEqual(pickNationalSides({ rows, alliedHumans: [yank], alliedSeats: 6, enemySeats: 7, arrangedEnemy: 'usa', seed: 1, rivalBlocWeight: 3 }).enemy, 'usa');
}
// multiplayer: each side its humans' majority country; a tie goes to the first human (the host); same country -> AUTO + note
{
  const us = rows.filter((row) => row.country === 'usa').slice(0, 2), de = rows.find((row) => row.country === 'germany'), ru = rows.find((row) => row.country === 'russia');
  assert.equal(majorityCountry([us[0], de, us[1]]), 'usa'); assert.equal(majorityCountry([de, us[0]]), 'germany', 'a tie goes to the first human');
  const two = pickNationalSides({ rows, alliedHumans: [us[0]], enemyHumans: [ru], alliedSeats: 6, enemySeats: 6, seed: 9, rivalBlocWeight: 3, distinctPerSide: 6 });
  assert.deepEqual([two.allied, two.enemy], ['usa', 'russia']);
  const same = pickNationalSides({ rows, alliedHumans: [us[0]], enemyHumans: [us[1]], alliedSeats: 6, enemySeats: 6, seed: 9, rivalBlocWeight: 3 });
  assert.notEqual(same.enemy, 'usa', 'both sides\' humans American: the bravo bots take another country');
  assert.ok(same.notes.some((n) => n.reason === 'humans'), 'and the receipt notes the humans keep their picks');
  const budget = pickNationalSides({ rows, alliedHumans: [us[0]], alliedSeats: 13, enemySeats: 14, seed: 9, rivalBlocWeight: 3, distinctPerSide: 6 });
  assert.ok(new Set(budget.enemies.map((s) => s.id)).size <= 6 && new Set(budget.allies.map((s) => s.id)).size <= 6, 'the multiplayer profile budget');
}
// tier pairing: each enemy seat takes the candidate nearest the matching allied seat's tier
{
  const cold = rows.find((row) => row.country === 'germany' && row.era === 'cold-war');
  const plan = pickNationalSides({ rows, alliedHumans: [cold], alliedSeats: 6, enemySeats: 7, arrangedEnemy: 'russia', seed: 2, rivalBlocWeight: 3 });
  const tierOf = (id) => rows.find((row) => row.id === id).tier;
  const allied = [cold.tier, ...plan.allies.map((s) => tierOf(s.id))];
  const gap = plan.enemies.reduce((sum, s, k) => sum + Math.abs(tierOf(s.id) - allied[k % allied.length]), 0) / plan.enemies.length;
  assert.ok(gap <= 1, `cold-war Germany vs Russia: enemy tiers pair the allied ones (mean gap ${gap.toFixed(2)})`);
}
// a lone WW2 hull: its allies are its own type again, never a modern hull
{
  const ww2 = rows.find((row) => row.era === 'ww2' && row.country === 'germany');
  const plan = pickNationalSides({ rows, alliedHumans: [ww2], alliedSeats: 6, enemySeats: 7, seed: 3, rivalBlocWeight: 3 });
  assert.ok(plan.allies.every((s) => s.id === ww2.id && s.repeat), 'six clones of the player\'s own type');
}
// the flags the loading screen draws
assert.deepEqual(teamNationsFlags({ teamNations: 'mono', allied: 'usa', enemy: 'russia', notes: [{ side: 'alpha', country: 'uk', count: 2, reason: 'ally' }] }),
  { allied: 'USA', enemy: 'Russia', alliedFills: ['UK'], enemyFills: [] });
assert.equal(teamNationsFlags({ teamNations: 'random', allied: null, enemy: null, notes: [] }), null);
console.log(`teamNations.selftest: ${cases} country x era x shape cases — one country a side, no country on both, the picks kept, `
  + `fills only as noted (${filled} filled; e.g. ${fills.slice(0, 3).join('; ')}); the operation, the arrangement, the humans, the tier pairing and the budget`);
