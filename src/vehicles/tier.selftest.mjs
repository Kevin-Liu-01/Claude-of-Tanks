import assert from 'node:assert/strict';
import './profiles/t90SprocketTier.selftest.mjs';
import './tankFactory.ts'; // evaluates every registration wave
import { SAVED_TANK_IDS } from './specs.ts';
import { ROMAN_TIER, TANK_TIER, tankTier, tierNumeral } from './tier.ts';

const missing = SAVED_TANK_IDS.filter((id) => !Object.hasOwn(TANK_TIER, id));
assert.deepEqual(missing, [], `registered tanks missing a tier: ${missing.join(', ')}`);

for (const id of SAVED_TANK_IDS) {
  const tier = TANK_TIER[id];
  assert(Number.isInteger(tier) && tier >= 1 && tier <= 10, `${id}: tier ${tier} is outside I-X`);
  assert.equal(tankTier(id), tier, `${id}: numeric lookup`);
  assert.equal(tierNumeral(id), ROMAN_TIER[tier], `${id}: Roman lookup`);
}

assert.equal(tierNumeral('m1a2_sepv3'), 'X', 'SEPv3 no longer renders a blank tier');
assert.equal(tankTier('kv2'), 7, 'KV-2 is balanced and presented as a Tier VII vehicle');
assert.equal(tankTier('t80bv'), 9, 'T-80BV UI and matchmaking agree at tier IX');
assert.equal(tankTier('chieftain_mk10'), 8,
  'Chieftain Mk 10 UI and matchmaking agree at tier VIII');
assert.equal(tierNumeral('k2b'), 'X', 'K2B is presented and matched as a Tier X vehicle');
assert.deepEqual(
  ['type90', 'type90a', 'type10', 'type10b'].map(tankTier),
  [9, 9, 10, 10],
  'Japanese Type 90 and Type 10 families occupy tiers IX and X respectively',
);
assert.deepEqual(
  ['merkava2b', 'merkava3c', 'merkava3d', 'merkava4b'].map(tankTier),
  [8, 9, 10, 10],
  'Merkava 2B/3C/3D/4B progression is VIII/IX/X/X everywhere',
);
assert.deepEqual(
  ['m48', 'm60a1', 'm60a3', 'm60a2', 'm3a3_bradley'].map(tankTier),
  [8, 8, 8, 9, 10],
  'Patton family and M3A3 assignments are VIII/VIII/VIII/IX/X everywhere',
);
assert.equal(tierNumeral('unknown-dev-row'), '', 'unknown UI tiers stay visible as missing');
assert.equal(tankTier('unknown-dev-row'), 6, 'unknown matchmaking tier keeps the legacy fallback');

console.log(`tier.selftest: ${SAVED_TANK_IDS.length} saved tanks covered by one tier table`);
