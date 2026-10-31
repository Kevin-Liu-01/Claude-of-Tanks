import assert from 'node:assert/strict';
import '../tankFactory.ts';
import { tankTier } from '../tier.ts';
import { tierNumeral } from '../../techTree/tiers.ts';

// 2026-10-30 (lane t90-family-266): the obr. 1992 and T-90MS courses are now their source-X twins' (t90XTwins.selftest.mjs
// holds the wiring; the twins' own receipts hold their sprockets and courses). The tier rows remain.
// The UI shows each vehicle's column in its national tree (owner 2026-10-25; re-tiered by capability for 257).
// Matchmaking reads the shown tier since 258.
for (const [id, gameplay, shown] of [['t90_1992', 7, 'VII'], ['t90a_burlak_proto', 9, 'IX'], ['t90ms_2011', 9, 'IX']]) {
  assert.equal(tankTier(id), gameplay, `${id}: gameplay tier is ${gameplay}`);
  assert.equal(tierNumeral(id), shown, `${id}: UI tier is its tree column, ${shown}`);
}

console.log('t90SprocketTier.selftest: the T-90 tier metadata pass');
