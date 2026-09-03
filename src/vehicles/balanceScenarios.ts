import type { BalanceSeriesOptions } from './balanceSimulation.ts';

export interface BalanceScenario extends BalanceSeriesOptions {
  id: string;
  purpose: string;
  minAScore?: number;
  maxAScore?: number;
}

/**
 * Curated peer and family-progression fights. These are intentionally small
 * enough for the normal selftest pass while spanning MBTs, IFVs, conventional
 * loaders, autoloaders, ERA-heavy armor, and guided weapons.
 */
export const BALANCE_SCENARIOS: readonly BalanceScenario[] = Object.freeze([
  { id: 'mirror-control', aId: 'm1a2', bId: 'm1a2', purpose: 'side-bias control', minAScore: 0.35, maxAScore: 0.65 },
  { id: 'moving-mirror-control', aId: 'm1a2', bId: 'm1a2', distanceM: 220, advanceToM: 105, purpose: 'moving-fire and acceleration side-bias control', minAScore: 0.35, maxAScore: 0.65 },
  { id: 'tier9-rifled-peers', aId: 'challenger1', bId: 't90m', purpose: 'Tier IX protected MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'nextgen-challengers', aId: 'challenger_3', bId: 'challenger_3x', purpose: 'base and survivability package sidegrades', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'nextgen-abrams-peer', aId: 'm1a3', bId: 'abramsx', purpose: 'next-generation US peer ceiling', minAScore: 0.2, maxAScore: 0.8 },
  { id: 't90-export-step', aId: 't90', bId: 't90ms', purpose: 'Tier X T-90 family progression', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'chieftain-tier8', aId: 'chieftain_mk10', bId: 'fv4034', purpose: 'late Cold War UK Tier VIII peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2-tier9-peer', aId: 'k2', bId: 'leo2a6', purpose: 'Tier IX modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2-tier9-mobile-peer', aId: 'k2', bId: 'leo2a6', distanceM: 220, advanceToM: 105, purpose: 'Tier IX mobility and firing-on-the-move peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2-tier10-step', aId: 'k2b', bId: 'type10', purpose: 'Tier X modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'proryv-tier10-peer', aId: 't90m_proryv', bId: 'm1a2', purpose: 'Tier X modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'merkava-tier7-peer', aId: 'merkava1b', bId: 't62mv1', purpose: 'Tier VII Cold War MBT ceiling', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'puma-tier8-peer', aId: 'spz_puma', bId: 'bmp3_rok', purpose: 'Tier VIII modern IFV peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'puma-s1-tier10-peer', aId: 'spz_puma_s1', bId: 'bmpt_t90', purpose: 'Tier X modern IFV guided-weapon peers', aShellSlot: 1, bShellSlot: 1, minAScore: 0.2, maxAScore: 0.8 },
  { id: 'leopard-heavy-peer', aId: 'leo2a5_a5nl', bId: 'strv122', purpose: 'Tier X Leopard-family protection packages', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'leopard-tier9-peer', aId: 'leo2a4m', bId: 't90a', purpose: 'Tier IX modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'ifv-nextgen-peer', aId: 'type89_light_tiger', bId: 'cv90_mkiv', purpose: 'next-generation IFV anti-armor weapons', aShellSlot: 1, minAScore: 0.2, maxAScore: 0.8 },
  { id: 'm60-guided-peer', aId: 'm60a2', bId: 't90a', purpose: 'guided weapon cycle against Tier IX armor', aShellSlot: 1, minAScore: 0.2, maxAScore: 0.8 },
]);
