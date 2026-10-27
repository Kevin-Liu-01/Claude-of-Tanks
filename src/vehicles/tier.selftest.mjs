import assert from 'node:assert/strict';
import './tankFactory.ts'; // evaluates every registration wave
import { SAVED_TANK_IDS } from './specs.ts';
import { tankTier } from './tier.ts';
import { displayTier, tierNumeral } from '../techTree/tiers.ts';

// Owner 2026-10-26 (258): matchmaking follows the tier the game shows, each vehicle's column in its national tree
// (src/techTree/tiers.ts; techTree.selftest.mjs checks it against the trees), so the two never diverge.
const missing = SAVED_TANK_IDS.filter((id) => !displayTier(id));
assert.deepEqual(missing, [], `registered tanks no tree draws: ${missing.join(', ')}`);
for (const id of SAVED_TANK_IDS) {
  const tier = tankTier(id);
  assert(Number.isInteger(tier) && tier >= 1 && tier <= 10, `${id}: tier ${tier} is outside I-X`);
  assert.equal(tier, displayTier(id), `${id}: matchmaking reads the shown tier`);
  assert.equal(tierNumeral(id), ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][tier], `${id}: its numeral`);
}
assert.equal(tierNumeral('unknown-dev-row'), '', 'an unknown shown tier stays blank, so missing data is visible');
assert.equal(tankTier('unknown-dev-row'), 6, 'an unknown developer row matches at the legacy VI');

console.log(`tier.selftest: ${SAVED_TANK_IDS.length} saved tanks match at the tier they show`);
