import assert from 'node:assert/strict';

await import('../vehicles/tankFactory.ts');
const {
  ERA_NEIGHBOURS, GARAGE_HIDDEN_TANK_IDS, isBotTankId, isGarageVisibleTankId, rankMatchCandidates,
} = await import('./matchmaking.ts');

const ent = (specId, era = 'modern') => ({ specId, spec: { era } });
const player = ent('m1a1_abrams_hc');

assert.equal(GARAGE_HIDDEN_TANK_IDS.size, 0,
  'no production-hidden record remains (hidden fleet retired 2026-09-23)');
assert.equal(isGarageVisibleTankId('m1a1_abrams_hc'), true,
  'canonical Tejas M1A2 remains visible in the player garage');
assert.equal(isBotTankId('m1a1_abrams_hc'), true, 'production vehicles seat bots');
assert.equal(isBotTankId('retired_study_hull'), false,
  'ids outside the production catalog are unavailable to production bots');

const ranked = rankMatchCandidates([
  ent('type74', 'cold-war'), ent('t72b3m_2022'), ent('retired_study_hull'),
  ent('t90am'), ent('reference_placeholder'), ent('unknown_record'),
], player);
assert.deepEqual(ranked.map((e) => e.specId), ['t72b3m_2022', 't90am', 'type74'],
  'the production bot catalog preserves seeded same-era variety before cross-era fallback');
assert.equal(ranked.some((e) => /retired_study_hull|reference_placeholder|unknown_record/.test(e.specId)), false,
  'ids outside the production catalog never enter a bot roster');

const stable = rankMatchCandidates([ent('t90am'), ent('t72b3m_2022')], player);
assert.deepEqual(stable.map((e) => e.specId), ['t90am', 't72b3m_2022'],
  'seeded shuffle order survives equal matchmaking scores');

// matchmaking diversity r2 (owner 2026-09-17/18): the vehicles of the last two battles rank behind every fresh
// vehicle of the player's era AND of its contemporary eras; far eras still trail everything
const rotated = rankMatchCandidates([ent('t72b3m_2022'), ent('t90am'), ent('type74', 'cold-war')], player, new Set(['t72b3m_2022']));
assert.deepEqual(rotated.map((e) => e.specId), ['t90am', 'type74', 't72b3m_2022'],
  'a vehicle that fought the last two battles yields to a fresh same-era vehicle and to a fresh contemporary');
const nextGen = ent('m1a3', 'next-generation');
const bands = rankMatchCandidates([
  ent('kf51_evo', 'next-generation'), ent('leo2_improved', 'modern'), ent('kv2', 'ww2'), ent('object148_proto', 'next-generation'),
], nextGen, new Set(['kf51_evo']));
assert.deepEqual(bands.map((e) => e.specId), ['object148_proto', 'leo2_improved', 'kf51_evo', 'kv2'],
  'fresh own era, fresh contemporary, recent own era, far era — in that order');
const exhausted = rankMatchCandidates([
  ent('kf51_evo', 'next-generation'), ent('leo2_improved', 'modern'), ent('kv2', 'ww2'), ent('object148_proto', 'next-generation'),
], nextGen, new Set(['kf51_evo', 'object148_proto', 'leo2_improved']));
assert.deepEqual(exhausted.map((e) => e.specId), ['kf51_evo', 'object148_proto', 'leo2_improved', 'kv2'],
  'with both catalogs used up the recent own-era vehicles return before recent contemporaries; WW2 still trails');
assert.deepEqual(ERA_NEIGHBOURS.ww2, ['ww2'], 'a WW2 player has no contemporaries: modern hulls stay the far fallback');
const ww2 = rankMatchCandidates([ent('jpz_e100', 'ww2'), ent('m1a1_abrams_hc', 'modern')], ent('kv2', 'ww2'), new Set(['jpz_e100']));
assert.deepEqual(ww2.map((e) => e.specId), ['jpz_e100', 'm1a1_abrams_hc'], 'a recent same-era vehicle still beats a far-era one');

console.log('matchmaking.selftest: production bot eligibility, era priority, catalog variety, and two-band recent-roster rotation passed');
