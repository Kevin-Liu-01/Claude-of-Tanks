/**
 * roadPave.ts — the paved share of the ground a track runs on (FX lane, 2026-10-15; the engine lane's blind pairs on
 * the media take s92: "orange glow puffs either side of the lead tank"). A hull driving a road lays the track dust of
 * 'hard' ground (effects.ts dust()): the full earth wake, tan billows two to five metres across that climb for seconds.
 * On Steinburg's setts that wake stood as glowing columns at every hull's rear corners. A sett, concrete or stone street
 * has no loose earth to throw, so its tracks raise a low grit haze instead, and an unpaved road keeps its continuous
 * trail (the owner's ruling, 2026-10-12).
 *
 * The share is the one the terrain material paves a carriageway with (terrain.ts uRoadTex / uTownPave): 1 on a map
 * whose roads are paved, inside a paved town rect and on a bridge deck's stone; the map's road texture mix elsewhere on
 * the carriageway; 0 off it. The carriageway is getGroundType's 'hard' band (ROAD_HARD_M from a road's centre line).
 */

/** The carriageway's half-width as the height field's ground type reads it (terrain.ts getGroundType). */
export const ROAD_HARD_M = 4.3;

/** The map's road paving (its splat config's fields, terrain.ts SplatConfig). */
export interface RoadPaveSplat {
  readonly pavedRoads?: boolean;
  readonly roadTexMix?: number;
  readonly townPaving?: boolean;
}

/** The paved town rect (the layout's village; only with `townPaving`). */
export interface RoadPaveRect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/**
 * The paved share (0..1) of the ground at (x, z), given its distance to the nearest road's centre line and whether a
 * bridge deck covers it. Allocation-free per call.
 */
export function roadPaveSampler(splat: RoadPaveSplat | null | undefined, town: RoadPaveRect | null | undefined):
  (roadDistM: number, x: number, z: number, onDeck: boolean) => number {
  const base = splat?.pavedRoads ? 1 : Math.max(0, Math.min(1, splat?.roadTexMix ?? 0));
  const rect = splat?.townPaving && town ? town : null;
  return (roadDistM, x, z, onDeck) => {
    if (onDeck) return 1;
    if (!(roadDistM < ROAD_HARD_M)) return 0;
    if (rect && x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1) return 1;
    return base;
  };
}

/**
 * The share of a track's dust on a road of paved share `pave` that is street grit rather than the earth wake: none on
 * a dirt road (the maps' worn-road texture mixes stay under ~0.35), all on a sett, concrete or stone street.
 */
export function streetGritShare(pave: number): number {
  const t = Math.max(0, Math.min(1, (pave - 0.35) / 0.4));
  return t * t * (3 - 2 * t);
}
