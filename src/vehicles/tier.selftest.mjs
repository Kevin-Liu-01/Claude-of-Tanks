import assert from 'node:assert/strict';
import './tankFactory.js'; // evaluates every registration wave
import { ALL_TANK_IDS } from './specs.js';
import { ROMAN_TIER, TANK_TIER, tankTier, tierNumeral } from './tier.js';

const missing = ALL_TANK_IDS.filter((id) => !Object.hasOwn(TANK_TIER, id));
assert.deepEqual(missing, [], `registered tanks missing a tier: ${missing.join(', ')}`);

for (const id of ALL_TANK_IDS) {
  const tier = TANK_TIER[id];
  assert(Number.isInteger(tier) && tier >= 1 && tier <= 10, `${id}: tier ${tier} is outside I-X`);
  assert.equal(tankTier(id), tier, `${id}: numeric lookup`);
  assert.equal(tierNumeral(id), ROMAN_TIER[tier], `${id}: Roman lookup`);
}

assert.equal(tierNumeral('m1a2_sepv3'), 'X', 'SEPv3 no longer renders a blank tier');
assert.equal(tankTier('t80bv'), 9, 'T-80BV UI and matchmaking agree at tier IX');
assert.equal(tierNumeral('unknown-dev-row'), '', 'unknown UI tiers stay visible as missing');
assert.equal(tankTier('unknown-dev-row'), 6, 'unknown matchmaking tier keeps the legacy fallback');

console.log(`tier.selftest: ${ALL_TANK_IDS.length} registered tanks covered by one tier table`);
