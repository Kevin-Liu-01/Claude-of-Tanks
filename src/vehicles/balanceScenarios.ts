import type { BalanceSeriesOptions } from './balanceSimulation.ts';

interface BalanceScenario extends BalanceSeriesOptions {
  id: string;
  purpose: string;
  minAScore?: number;
  maxAScore?: number;
}

// Physical side-mounted missile exits can change the first struck armor/module
// and therefore the seeded damage sequence. Preserve the original six seeds,
// add a fixed arithmetic holdout (chosen independently of outcomes), and check
// short/medium/long ranges instead of tuning a weapon to twelve duels.
const GUIDED_PEER_SEEDS = Object.freeze([
  101, 211, 307, 401, 503, 601,
  ...Array.from({ length: 36 }, (_, index) => 1009 + index * 997),
]);

/**
 * Curated peer and family-progression fights. These are intentionally small
 * enough for the normal selftest pass while spanning MBTs, IFVs, conventional
 * loaders, autoloaders, ERA-heavy armor, and guided weapons.
 */
export const BALANCE_SCENARIOS: readonly BalanceScenario[] = Object.freeze([
  { id: 'mirror-control', aId: 'm1a1_abrams_hc', bId: 'm1a1_abrams_hc', purpose: 'side-bias control', minAScore: 0.35, maxAScore: 0.65 },
  { id: 'moving-mirror-control', aId: 'm1a1_abrams_hc', bId: 'm1a1_abrams_hc', distanceM: 220, advanceToM: 105, purpose: 'moving-fire and acceleration side-bias control', minAScore: 0.35, maxAScore: 0.65 },
  { id: 'tier9-rifled-peers', aId: 'challenger1_mk2', bId: 't90am', purpose: 'Tier IX protected MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'nextgen-challengers', aId: 'challenger3_proto', bId: 'challenger3', purpose: 'base and survivability package sidegrades', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'nextgen-abrams-peer', aId: 'm1a3', bId: 'abramsx', purpose: 'next-generation US peer ceiling', minAScore: 0.2, maxAScore: 0.8 },
  { id: 't90-export-step', aId: 't90_1992', bId: 't90ms_2011', purpose: 'Tier X T-90 family progression', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'chieftain-tier8', aId: 'chieftain_mk9', bId: 'fv4034', purpose: 'late Cold War UK Tier VIII peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2-tier9-peer', aId: 'xk2_black_panther', bId: 'leo2a4', purpose: 'Tier IX modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2-tier9-mobile-peer', aId: 'xk2_black_panther', bId: 'leo2a4', distanceM: 220, advanceToM: 105, purpose: 'Tier IX mobility and firing-on-the-move peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2b-cross-tier', aId: 'k2b', bId: 'type10_tk_x', purpose: 'Tier IX K2B against a Tier X modern MBT', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'proryv-tier10-peer', aId: 't90m_proryv', bId: 'm1a1_abrams_hc', purpose: 'Tier X modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'merkava-tier7-peer', aId: 'merkava1b', bId: 't62_1975', purpose: 'Tier VII Cold War MBT ceiling', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'puma-tier8-peer', aId: 'spz_puma', bId: 'bmp3_rok', purpose: 'Tier VIII modern IFV peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'puma-s1-tier10-peer', aId: 'spz_wotan', bId: 'bmpt_t90', purpose: 'Tier X modern IFV guided-weapon peers', aShellSlot: 1, bShellSlot: 1, distanceM: 120, seeds: GUIDED_PEER_SEEDS, minAScore: 0.2, maxAScore: 0.8 },
  { id: 'puma-s1-tier10-close-peer', aId: 'spz_wotan', bId: 'bmpt_t90', purpose: 'Tier X modern IFV guided-weapon peers', aShellSlot: 1, bShellSlot: 1, distanceM: 90, seeds: GUIDED_PEER_SEEDS, minAScore: 0.2, maxAScore: 0.8 },
  { id: 'puma-s1-tier10-long-peer', aId: 'spz_wotan', bId: 'bmpt_t90', purpose: 'Tier X modern IFV guided-weapon peers', aShellSlot: 1, bShellSlot: 1, distanceM: 220, seeds: GUIDED_PEER_SEEDS, minAScore: 0.2, maxAScore: 0.8 },
  { id: 'leopard-heavy-peer', aId: 'leo2a4m', bId: 'strv121', purpose: 'Tier X Leopard-family protection packages', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'leopard-tier9-peer', aId: 'leo2a4m_can', bId: 't90a_2004', purpose: 'Tier IX modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'ifv-nextgen-peer', aId: 'raiju_ifv', bId: 'cv90_mk4_concept', purpose: 'next-generation IFV anti-armor weapons', aShellSlot: 1, minAScore: 0.2, maxAScore: 0.8 },
  { id: 'm60-guided-peer', aId: 'm60a2', bId: 't90a_2004', purpose: 'guided weapon cycle against Tier IX armor', aShellSlot: 1, minAScore: 0.2, maxAScore: 0.8 },
]);
