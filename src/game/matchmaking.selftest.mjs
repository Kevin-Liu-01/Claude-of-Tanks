import assert from 'node:assert/strict';

await import('../vehicles/tankFactory.ts');
const {
  GARAGE_HIDDEN_TANK_IDS, isBotTankId, isGarageVisibleTankId, rankMatchCandidates,
} = await import('./matchmaking.ts');

const ent = (specId, era = 'modern') => ({ specId, spec: { era } });
const player = ent('m1a2');

assert.ok(GARAGE_HIDDEN_TANK_IDS.has('recon_tank'));
assert.ok(GARAGE_HIDDEN_TANK_IDS.has('q_heavy'));
assert.equal(isGarageVisibleTankId('m1a2'), true,
  'canonical Tejas M1A2 remains visible in the player garage');
assert.equal(isGarageVisibleTankId('m1a2_legacy'), false,
  'retired M1A2 remains available to tools but not the player garage');
assert.equal(isBotTankId('m1a2_legacy'), false,
  'player-hidden development tanks are unavailable to production bots');
assert.equal(isBotTankId('recon_tank'), false,
  'reference placeholders remain unavailable to bots');

const ranked = rankMatchCandidates([
  ent('type74', 'cold-war'), ent('t72b3m'), ent('recon_tank'),
  ent('t90m'), ent('q_heavy'), ent('m1a2_legacy'),
], player);
assert.deepEqual(ranked.map((e) => e.specId), ['t72b3m', 't90m', 'type74'],
  'the production bot catalog preserves seeded same-era variety before cross-era fallback');
assert.equal(ranked.some((e) => /recon_tank|q_heavy/.test(e.specId)), false,
  'generic reference tanks never enter a bot roster');

const stable = rankMatchCandidates([ent('t90m'), ent('t72b3m')], player);
assert.deepEqual(stable.map((e) => e.specId), ['t90m', 't72b3m'],
  'seeded shuffle order survives equal matchmaking scores');

// matchmaking diversity (owner 2026-09-17): last battle's vehicles rotate to the back of their era band
const rotated = rankMatchCandidates([ent('t72b3m'), ent('t90m'), ent('type74', 'cold-war')], player, new Set(['t72b3m']));
assert.deepEqual(rotated.map((e) => e.specId), ['t90m', 't72b3m', 'type74'],
  'a vehicle that fought the previous battle yields its band position; the cross-era fallback still trails');

console.log('matchmaking.selftest: production bot eligibility, era priority, catalog variety, and recent-roster rotation passed');
