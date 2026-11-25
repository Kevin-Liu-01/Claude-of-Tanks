import type { BalanceSeriesOptions } from './balanceSimulation.ts';

interface BalanceScenario extends BalanceSeriesOptions {
  id: string;
  purpose: string;
  minAScore?: number;
  maxAScore?: number;
  /** Why the band is what it is, when it is not the reviewed 0.2-0.8 (an owner ruling, with the commit that moved it). */
  ruling?: string;
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
 * 258: peers are pairs at one shown tier (matchmaking reads it); twelve pairs the
 * re-tier split were re-chosen inside their bands, and three with no in-band
 * same-tier partner say so in their purpose.
 */
export const BALANCE_SCENARIOS: readonly BalanceScenario[] = Object.freeze([
  { id: 'mirror-control', aId: 'm1a1_abrams_hc', bId: 'm1a1_abrams_hc', purpose: 'side-bias control', minAScore: 0.35, maxAScore: 0.65 },
  { id: 'moving-mirror-control', aId: 'm1a1_abrams_hc', bId: 'm1a1_abrams_hc', distanceM: 220, advanceToM: 105, purpose: 'moving-fire and acceleration side-bias control', minAScore: 0.35, maxAScore: 0.65 },
  { id: 'tier9-rifled-peers', aId: 'challenger1_mk2', bId: 'leo2a4m_can', purpose: 'Tier VIII protected MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'nextgen-challengers', aId: 'challenger3_proto', bId: 'm1a1_abrams_hc', purpose: 'Tier VIII Challenger 3 prototype against an M1A1 peer', minAScore: 1, maxAScore: 1,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 17d796abac (forward turret faces read the plate they lie over: 0.5 -> 0.833) and c173d23de5 (the rebuilt M1A1s: 1.0); the score 1 is pinned, so any move is reviewed again' },
  { id: 'nextgen-abrams-peer', aId: 'm1a3', bId: 'abramsx', purpose: 'next-generation US peer ceiling', minAScore: 0.75, maxAScore: 0.75,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 80ad14b38d (merge of gunface-span-265, the gun-face split: 0.75 -> 0.833), then f57a29696b (merge of sim-det-trig-b, the measured combat rig) with the 276 regen 038697d93d: 0.833 -> 0.75 (Main 2026-11-24); the score 0.75 is pinned, so any move is reviewed again' },
  { id: 't90-export-step', aId: 't90_1992', bId: 'k2b', purpose: 'Tier VII T-90 against a K2 prototype peer', minAScore: 0.083, maxAScore: 0.083,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 17d796abac (forward turret faces read the plate they lie over), then f57a29696b (merge of sim-det-trig-b, the measured combat rig) with the 276 regen 038697d93d: 0 -> 0.083 (Main 2026-11-24); the score 0.083 is pinned, so any move is reviewed again' },
  { id: 'chieftain-tier8', aId: 'chieftain_mk9', bId: 'fv4034', purpose: 'late Cold War UK Tier VIII peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2-tier9-peer', aId: 'xk2_black_panther', bId: 'type96_80_feng', purpose: 'Tier VI modern MBT peers', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'k2-tier9-mobile-peer', aId: 'xk2_black_panther', bId: 'c1_ariete', distanceM: 220, advanceToM: 105, purpose: 'Tier VI mobility and firing-on-the-move peers', minAScore: 0.2, maxAScore: 0.8 },
  // 263: the T-84U Oplot (t84bm_oplot_m) moved to VI with the new Tier X Oplots; the T-80U Yun is its modern VII successor
  { id: 'k2b-cross-tier', aId: 'k2b', bId: 't80u_yun', purpose: 'Tier VII K2B against a modern MBT peer', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'proryv-tier10-peer', aId: 't90m_proryv', bId: 't90m', purpose: 'Tier X modern MBT peers', minAScore: 0.917, maxAScore: 0.917,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 17d796abac (forward turret faces read the plate they lie over: 0.667 -> 0.917); the score 0.917 is pinned, so any move is reviewed again' },
  // olifant-turret-276: the Centurion/Olifant line had no scenario (Main 2026-11-24); the Mk 2 against its donor at III
  { id: 'olifant-tier3-peer', aId: 'olifant_mk2', bId: 'centurion5_2', purpose: 'Tier III Olifant Mk 2 against the Centurion Mk 5/2 it was cloned from', minAScore: 0.75, maxAScore: 0.75,
    ruling: 'Main 2026-11-24 (owner rule "update the target ranges, keep the stats"): measured at 8139b49125 (olifant-turret-276, the Mk 2 on the TTD\'s Loggim turret) with the Mk 2\'s anatomy regenerated: 0.75 (0.583 on the 262 box turret); the score 0.75 is pinned, so any move on this line is reviewed again' },
  { id: 'merkava-tier7-peer', aId: 'merkava1b', bId: 't62_1975', purpose: 'Tier VII Cold War MBT ceiling', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'puma-tier8-peer', aId: 'spz_puma', bId: 'bmp3_rok', purpose: 'Tier IV Puma against a Tier III IFV (no Tier IV IFV duels inside the band)', minAScore: 0, maxAScore: 0,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 425b729b23 (268 regen for the twelve moved ids); the score 0 is pinned, so any move is reviewed again' },
  { id: 'puma-s1-tier10-peer', aId: 'spz_wotan', bId: 'bmpt_t90', purpose: 'Tier X modern IFV guided-weapon peers', aShellSlot: 1, bShellSlot: 1, distanceM: 120, seeds: GUIDED_PEER_SEEDS, minAScore: 0, maxAScore: 0,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 07fc1eb544 (t90 source-X twins, first per-id regen pass); the score 0 is pinned, so any move is reviewed again' },
  { id: 'puma-s1-tier10-close-peer', aId: 'spz_wotan', bId: 'bmpt_t90', purpose: 'Tier X modern IFV guided-weapon peers', aShellSlot: 1, bShellSlot: 1, distanceM: 90, seeds: GUIDED_PEER_SEEDS, minAScore: 0, maxAScore: 0,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 07fc1eb544 (t90 source-X twins, first per-id regen pass); the score 0 is pinned, so any move is reviewed again' },
  { id: 'puma-s1-tier10-long-peer', aId: 'spz_wotan', bId: 'bmpt_t90', purpose: 'Tier X modern IFV guided-weapon peers', aShellSlot: 1, bShellSlot: 1, distanceM: 220, seeds: GUIDED_PEER_SEEDS, minAScore: 0, maxAScore: 0,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 07fc1eb544 (t90 source-X twins, first per-id regen pass); the score 0 is pinned, so any move is reviewed again' },
  { id: 'leopard-heavy-peer', aId: 'leo2a4m', bId: 'leo2_improved', purpose: 'Tier VIII Leopard-family protection packages', minAScore: 0.2, maxAScore: 0.8 },
  { id: 'leopard-tier9-peer', aId: 'leo2a4m_can', bId: 'm1a1', purpose: 'Tier VIII modern MBT peers', minAScore: 0.917, maxAScore: 0.917,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 17d796abac (forward turret faces read the plate they lie over), then f57a29696b (merge of sim-det-trig-b, the measured combat rig) with the 276 regen 038697d93d: 1 -> 0.917 (Main 2026-11-24); the score 0.917 is pinned, so any move is reviewed again' },
  { id: 'ifv-nextgen-peer', aId: 'raiju_ifv', bId: 'cv90_mk4_concept', purpose: 'Tier X Raijū anti-armor weapons against a Tier VII IFV (no Tier X IFV duels inside the band)', aShellSlot: 1, minAScore: 1, maxAScore: 1,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 9f47c96b7d (267 changed-only regen for the CV90s, Raiju and Wotan); the score 1 is pinned, so any move is reviewed again' },
  { id: 'm60-guided-peer', aId: 'm60a2', bId: 't90a_2004', purpose: 'Tier II guided weapon cycle against Tier IX armor (a deliberate cross-tier check)', aShellSlot: 1, minAScore: 0, maxAScore: 0,
    ruling: 'owner 2026-11-23 (Kevin, via Main): "update the target ranges, keep the stats"; reviewed band 0.2-0.8 until 4f02741997 (the M60 gun-rig rows re-measured at true size); the score 0 is pinned, so any move is reviewed again' },
]);
