// The battle pool is in one order wherever it is built (replay-fixes-277). Live 276: the bundle evaluates the spec packs in
// another order than Node and the Workers, so the catalogs (registration order) parted at the 80th hull between the page
// and the replay indexer, and one seed drew another roster in each. spawnTanks builds game.allTanks from the production
// ids in botPoolOrder (id order): here the catalog is permuted as another environment's registration would permute it,
// and the pool, its entity seeds and a seeded draw come out the same. tools/replay-ui-flow.browser.selftest.mjs holds the
// built page's pool to Node's. No world. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { createGameState } from './stateCore.ts';
import { botPoolOrder, pickNationalBattle, spawnTanks } from './rosterState.ts';
import { battleRosterPlan } from './soloRosterPlan.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { PRODUCTION_TANK_IDS } from '../vehicles/specs.ts';

const plan = battleRosterPlan(matchRulesetFor('standard', null, null), null, true).national;
const original = PRODUCTION_TANK_IDS.slice();
function build(order) {
  PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length, ...order);
  try {
    const game = createGameState({ rosterSeed: 655843608 });
    spawnTanks(game, { scene: { remove() {} } });
    const draw = pickNationalBattle(game, 'm1a3', 1, plan).participants.map((entity) => entity.id).join(',');
    return { pool: game.allTanks.map((entity) => `${entity.id}@${entity._camoSeed}`).join(','), draw };
  } finally { PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length, ...original); }
}
const base = build(original);
// another registration order: reversed, and the tail rotated (as the bundle moved whole packs ahead of others)
for (const order of [original.slice().reverse(), [...original.slice(79), ...original.slice(0, 79)]]) {
  const other = build(order);
  assert.equal(other.pool, base.pool, 'the pool (ids and seeds) does not follow the catalog\'s registration order');
  assert.equal(other.draw, base.draw, 'one seed draws one roster whatever the registration order');
}
assert.deepEqual(base.pool.split(',').map((entry) => entry.split('@')[0]), botPoolOrder(original), 'the pool is the production ids in id order');
assert.equal(new Set(original).size, original.length);
console.log(`battlePoolOrder: PASS (${original.length} hulls in one order under 3 registration orders)`);
