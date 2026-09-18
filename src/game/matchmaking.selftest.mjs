import assert from 'node:assert/strict';

await import('../vehicles/tankFactory.ts');
const {
  ERA_NEIGHBOURS, GARAGE_HIDDEN_TANK_IDS, isBotTankId, isGarageVisibleTankId, rankMatchCandidates,
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

// matchmaking diversity r2 (owner 2026-09-17/18): the vehicles of the last two battles rank behind every fresh
// vehicle of the player's era AND of its contemporary eras; far eras still trail everything
const rotated = rankMatchCandidates([ent('t72b3m'), ent('t90m'), ent('type74', 'cold-war')], player, new Set(['t72b3m']));
assert.deepEqual(rotated.map((e) => e.specId), ['t90m', 'type74', 't72b3m'],
  'a vehicle that fought the last two battles yields to a fresh same-era vehicle and to a fresh contemporary');
const nextGen = ent('m1a3', 'next-generation');
const bands = rankMatchCandidates([
  ent('kf51', 'next-generation'), ent('leo2a7v', 'modern'), ent('kv2', 'ww2'), ent('t14', 'next-generation'),
], nextGen, new Set(['kf51']));
assert.deepEqual(bands.map((e) => e.specId), ['t14', 'leo2a7v', 'kf51', 'kv2'],
  'fresh own era, fresh contemporary, recent own era, far era — in that order');
const exhausted = rankMatchCandidates([
  ent('kf51', 'next-generation'), ent('leo2a7v', 'modern'), ent('kv2', 'ww2'), ent('t14', 'next-generation'),
], nextGen, new Set(['kf51', 't14', 'leo2a7v']));
assert.deepEqual(exhausted.map((e) => e.specId), ['kf51', 't14', 'leo2a7v', 'kv2'],
  'with both catalogs used up the recent own-era vehicles return before recent contemporaries; WW2 still trails');
assert.deepEqual(ERA_NEIGHBOURS.ww2, ['ww2'], 'a WW2 player has no contemporaries: modern hulls stay the far fallback');
const ww2 = rankMatchCandidates([ent('jpz_e100_x', 'ww2'), ent('m1a2', 'modern')], ent('kv2', 'ww2'), new Set(['jpz_e100_x']));
assert.deepEqual(ww2.map((e) => e.specId), ['jpz_e100_x', 'm1a2'], 'a recent same-era vehicle still beats a far-era one');

console.log('matchmaking.selftest: production bot eligibility, era priority, catalog variety, and two-band recent-roster rotation passed');
