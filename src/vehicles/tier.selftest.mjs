import assert from 'node:assert/strict';
import './tankFactory.ts'; // evaluates every registration wave
import { SAVED_TANK_IDS } from './specs.ts';
import { ROMAN_TIER, TANK_TIER, matchTierNumeral, tankTier } from './tier.ts';
import { displayTier, tierNumeral } from '../techTree/tiers.ts';

const missing = SAVED_TANK_IDS.filter((id) => !Object.hasOwn(TANK_TIER, id));
assert.deepEqual(missing, [], `registered tanks missing a tier: ${missing.join(', ')}`);

for (const id of SAVED_TANK_IDS) {
  const tier = TANK_TIER[id];
  assert(Number.isInteger(tier) && tier >= 1 && tier <= 10, `${id}: tier ${tier} is outside I-X`);
  assert.equal(tankTier(id), tier, `${id}: numeric lookup`);
  assert.equal(matchTierNumeral(id), ROMAN_TIER[tier], `${id}: Roman lookup`);
}

assert.equal(matchTierNumeral('m1a1_abrams_fep'), 'X', 'SEPv3 no longer has a blank matchmaking numeral');
assert.equal(tankTier('ajax'), 10, 'Ajax matches at tier X');
assert.equal(tankTier('kv2'), 7, 'KV-2 is balanced as a Tier VII vehicle');
assert.equal(tankTier('challenger1_mk2'), 9, 'Challenger 1 matches at tier IX');
assert.equal(tankTier('t80bv'), 9, 'T-80BV matches at tier IX');
assert.equal(tankTier('chieftain_mk9'), 8, 'Chieftain Mk 10 matches at tier VIII');
assert.deepEqual(['k2_black_panther', 'k1a1', 'k2b', 'xk2_black_panther', 'k1e1'].map(tankTier),
  [10, 10, 9, 9, 8], 'K2/K1A1 are X, K2B/XK2 are IX, and legacy K1E1 remains VIII');
assert.deepEqual(
  ['type90_kyumaru', 'type90a', 'type10_tk_x', 'type10b'].map(tankTier),
  [9, 9, 10, 10],
  'Japanese Type 90 and Type 10 families occupy tiers IX and X respectively',
);
assert.deepEqual(
  ['merkava2b', 'merkava3c', 'merkava3_baz', 'merkava3d', 'merkava4', 'merkava4b',
    'merkava4_trophy', 'merkava4_barak', 'namer_ifv'].map(tankTier),
  [8, 9, 9, 9, 9, 9, 10, 10, 9],
  'Merkava 3D/baseline Mk 4/Namer are IX while Trophy and Barak are X',
);
assert.deepEqual(
  ['m48a5_patton', 'm60a1', 'm60a3', 'm60a2', 'm3a3_bradley'].map(tankTier),
  [8, 8, 8, 9, 10],
  'Patton family and M3A3 match at VIII/VIII/VIII/IX/X',
);
assert.equal(matchTierNumeral('unknown-dev-row'), '', 'an unknown matchmaking numeral stays blank');
// Owner 2026-10-25 ("that includes the new tier updates tho!"): the tier the game shows is the vehicle's column in its
// national tree (src/techTree/tiers.ts; techTree.selftest.mjs checks it against the trees), and matchmaking keeps this
// table, so the two diverge on purpose.
assert.deepEqual(['m60a1', 'kv2', 'ajax'].map((id) => [tankTier(id), displayTier(id), tierNumeral(id)]),
  [[8, 1, 'I'], [7, 1, 'I'], [10, 5, 'V']], 'matchmaking tier against the tier shown (the 257 capability re-tier)');
assert.equal(tierNumeral('unknown-dev-row'), '', 'an unknown shown tier stays blank, so missing data is visible');
assert.equal(tankTier('unknown-dev-row'), 6, 'unknown matchmaking tier keeps the legacy fallback');

console.log(`tier.selftest: ${SAVED_TANK_IDS.length} saved tanks covered by the matchmaking table; the shown tier is the trees'`);
