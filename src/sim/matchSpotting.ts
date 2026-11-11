/**
 * One spotting construction for both drivers (268; docs/ARCHITECTURE.md "One core, two drivers"): the solo battle
 * (game/state.ts createBattleSpotting) and the authority build a match's spotting here, so a bot sees on either driver
 * what it would on the other (src/sim/driverStepParity.selftest.mjs). Its rolls run on the match seed's stream; smoke
 * reads the match's screens over its ground; concealers are the world's; a hull's optics and foliage come from its
 * consumables and the kit applyEquipmentToCombat wrote (combat.equip, gated by the hull: round 4 F8, 2026-11-02 audit
 * M6; the solo battle's entity.equip is the seat's loadout, another array, so a saved item the hull cannot mount, a
 * live re-equip and Fresh Foliage's rebuild read another kit than the authority's); and its paint's bonus is a datum
 * the driver stamps on each hull at the battle's start (camoBonus: the solo battle reads the player's saved scheme
 * against the map's biome, the authority its seat record's).
 */
import { mulberry32 } from '../game/ai.ts';
import { consumableSpottingIds } from './consumableRules.ts';
import type { ConsumableState } from './consumableRules.ts';
import { smokeBlocks } from './smokeScreen.ts';
import type { SmokeScreen } from './smokeScreen.ts';
import { createSpottingSystem } from './spotting.ts';
import type { ConcealerDisc, SpottingRayHit, SpottingSystem, SpottingTank, SpottingVector3 } from './spotting.ts';

/** A hull spotting reads beyond its pose: its consumables, its kit (combat.equip) and its paint's bonus. */
type SpottingHull = SpottingTank & { combat?: { equip?: readonly string[] } | null; consumables?: ConsumableState | null; camoBonus?: number };

export function createMatchSpotting(match: {
  seed: number;
  getTanks: () => SpottingTank[];
  alwaysVisible: boolean;
  raycast: (origin: SpottingVector3, direction: SpottingVector3, maxDist: number) => SpottingRayHit | null | undefined;
  smokeScreens: () => Iterable<SmokeScreen>;
  timeS: () => number;
  groundHeightAt: (x: number, z: number) => number;
  concealers: ConcealerDisc[];
  /** The driver's own team names (the authority's alpha and bravo); the solo battle's are spotting's default. */
  teams?: readonly string[];
  /** Air Support's recon pass (sim/airSupport.ts): `team` holds tank `id` revealed now, whatever its eyes see. */
  revealed?: (id: string, team: string) => boolean;
}): SpottingSystem {
  return createSpottingSystem({
    getTanks: match.getTanks,
    alwaysVisible: match.alwaysVisible,
    raycast: match.raycast,
    opticalBlocked: (a, b) => smokeBlocks(match.smokeScreens(), a, b, match.timeS(), match.groundHeightAt),
    concealers: match.concealers,
    getCamoBonus: (tank) => (tank as SpottingHull).camoBonus ?? 0,
    getEquipment: (tank) => consumableSpottingIds((tank as SpottingHull).consumables, (tank as SpottingHull).combat?.equip, match.timeS()),
    rng: mulberry32(match.seed + 31000),
    ...(match.teams ? { teams: match.teams } : {}),
    ...(match.revealed ? { revealed: match.revealed } : {}),
  });
}
