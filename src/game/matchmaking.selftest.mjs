import assert from 'node:assert/strict';
import {
  GARAGE_HIDDEN_TANK_IDS, isGarageVisibleTankId, rankMatchCandidates,
} from './matchmaking.js';

const tiers = { player: 8, peerA: 8, peerB: 9, far: 5, otherEra: 8, recon_tank: 8, q_heavy: 9 };
const tierOf = (id) => tiers[id] ?? 6;
const ent = (specId, era = 'modern') => ({ specId, spec: { era } });
const player = ent('player');

assert.ok(GARAGE_HIDDEN_TANK_IDS.has('recon_tank'));
assert.ok(GARAGE_HIDDEN_TANK_IDS.has('q_heavy'));
assert.equal(isGarageVisibleTankId('peerA'), true);

const ranked = rankMatchCandidates([
  ent('otherEra', 'ww2'), ent('far'), ent('recon_tank'),
  ent('peerB'), ent('q_heavy'), ent('peerA'),
], player, tierOf);
assert.deepEqual(ranked.map((e) => e.specId), ['peerA', 'peerB', 'far', 'otherEra'],
  'garage-visible same-era vehicles rank by tier before cross-era fallback');
assert.equal(ranked.some((e) => /recon_tank|q_heavy/.test(e.specId)), false,
  'generic hidden tanks never enter a player match');

const stable = rankMatchCandidates([ent('peerB'), ent('peerA')], player, () => 8);
assert.deepEqual(stable.map((e) => e.specId), ['peerB', 'peerA'],
  'seeded shuffle order survives equal matchmaking scores');

console.log('matchmaking.selftest: garage eligibility, era priority, tier ranking, and stable variety passed');
