/**
 * roadPave.ts — the paved share of the ground a track runs on (FX lane, 2026-10-15; the engine lane's blind pairs on
 * the media take s92: "orange glow puffs either side of the lead tank"). A hull driving a road lays the track dust of
 * 'hard' ground (effects.ts dust()): the full earth wake, tan billows two to five metres across that climb for seconds.
 * On Steinburg's setts that wake stood as glowing columns at every hull's rear corners. A sett, concrete or stone street
 * has no loose earth to throw, so its tracks raise a low grit haze instead, and an unpaved road keeps its continuous
 * trail (the owner's ruling, 2026-10-12).
 *
 * The share is the one the terrain material paves a carriageway with (terrain.ts uRoadTex / uTownPave and the road
 * layer's classes): 1 on a map whose roads are paved, inside a paved town rect, on a road line whose own surface is
 * paved (built-env-270: the catalogue's) and on a bridge deck's stone; the map's road texture mix elsewhere on the
 * carriageway; 0 off it. The carriageway is getGroundType's 'hard' band (ROAD_HARD_M from a road's centre line).
 */

/** The carriageway's half-width as the height field's ground type reads it (terrain.ts getGroundType). */
export const ROAD_HARD_M = 4.3;

/** The map's road paving (its splat config's fields, terrain.ts SplatConfig). */
interface RoadPaveSplat {
  readonly pavedRoads?: boolean;
  readonly roadTexMix?: number;
  readonly townPaving?: boolean;
}

/** The paved town rect (the layout's village; only with `townPaving`). */
interface RoadPaveRect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/**
 * (built-env-270) The paving the catalogue lays (the map's built-environment row and its own path styles, as the terrain
 * material paints them): the streets paved whole ('all') or inside the town rect ('town'), and each road line, in the
 * layout's order, paved by its own surface.
 */
export interface RoadPaveCatalogue {
  readonly streets: 'all' | 'town' | null;
  readonly lines: readonly boolean[] | null;
  readonly roads: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

const LINE_CELL_M = 24;

/** The road line nearest (x, z) within ROAD_HARD_M, by a grid of the lines' segments built on the first call (-1: none). */
function nearestLineIndex(roads: RoadPaveCatalogue['roads']): (x: number, z: number) => number {
  let cells: Map<number, number[]> | null = null;
  const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  const build = (): Map<number, number[]> => {
    const out = new Map<number, number[]>();
    roads.forEach((line, li) => {
      for (let k = 1; k < line.length; k++) {
        const [ax, az] = line[k - 1], [bx, bz] = line[k];
        const i0 = Math.floor((Math.min(ax, bx) - ROAD_HARD_M) / LINE_CELL_M), i1 = Math.floor((Math.max(ax, bx) + ROAD_HARD_M) / LINE_CELL_M);
        const j0 = Math.floor((Math.min(az, bz) - ROAD_HARD_M) / LINE_CELL_M), j1 = Math.floor((Math.max(az, bz) + ROAD_HARD_M) / LINE_CELL_M);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const list = out.get(key(i, j));
          if (list) list.push(li, k); else out.set(key(i, j), [li, k]);
        }
      }
    });
    return out;
  };
  return (x, z) => {
    cells ??= build();
    const list = cells.get(key(Math.floor(x / LINE_CELL_M), Math.floor(z / LINE_CELL_M)));
    if (!list) return -1;
    let best = ROAD_HARD_M * ROAD_HARD_M, bestLine = -1;
    for (let n = 0; n < list.length; n += 2) {
      const line = roads[list[n]], k = list[n + 1];
      const ax = line[k - 1][0], az = line[k - 1][1], dx = line[k][0] - ax, dz = line[k][1] - az;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const ex = x - ax - dx * t, ez = z - az - dz * t, d2 = ex * ex + ez * ez;
      if (d2 < best) { best = d2; bestLine = list[n]; }
    }
    return bestLine;
  };
}

/**
 * The paved share (0..1) of the ground at (x, z), given its distance to the nearest road's centre line and whether a
 * bridge deck covers it. Allocation-free per call (the catalogue's line grid is built on the first road query).
 */
export function roadPaveSampler(splat: RoadPaveSplat | null | undefined, town: RoadPaveRect | null | undefined,
  catalogue: RoadPaveCatalogue | null = null): (roadDistM: number, x: number, z: number, onDeck: boolean) => number {
  const base = splat?.pavedRoads || catalogue?.streets === 'all' ? 1 : Math.max(0, Math.min(1, splat?.roadTexMix ?? 0));
  const rect = (splat?.townPaving || catalogue?.streets === 'town') && town ? town : null;
  const lines = catalogue?.lines?.some(Boolean) ? catalogue.lines : null;
  const nearest = lines ? nearestLineIndex(catalogue!.roads) : null;
  return (roadDistM, x, z, onDeck) => {
    if (onDeck) return 1;
    if (!(roadDistM < ROAD_HARD_M)) return 0;
    if (rect && x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1) return 1;
    if (nearest && lines![nearest(x, z)]) return 1;
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
