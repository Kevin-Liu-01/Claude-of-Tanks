// (2026-11-02 audit M9, fix-up round 2) A felled tree's canopy found in constant time.
//
// spotting.ts fellConcealersAt fells every concealment disc centred within 1 cm of a trunk by scanning the world's whole
// disc list. Once both worlds' tree crushes felled their canopy with it (felledTrees.ts fell; the headless world's
// crushObstacle), a whole destroyed set restored at once — the authority's restoreDestroyedObstacles on a host
// migration, keyframe, rejoin or rematch; a late joiner's presentation applying the destroyed list — became trees x discs
// (Saltwind: 2,762 trees x 4,095 discs, 11.3 M tests), breaking server/collisionRestoreIndex.selftest.mjs's linear-time
// restore. Here the discs are bucketed by their centre once, at the first fell, in cells twice the reach wide: a trunk's
// discs lie in its own cell or a neighbour's, and the same 1 cm test as fellConcealersAt decides each candidate.
import type { ConcealerDisc } from '../sim/spotting.ts';

/** fellConcealersAt's reach: a canopy disc is a trunk's when its centre is within 1 cm of the trunk's on both axes. */
const REACH_M = 0.01;
const CELL_M = 2 * REACH_M;
// A cell's key: rows of 2^22 cells (84 km at 2 cm, wider than any map). A key two cells share only adds candidates; the
// reach test decides.
const ROW = 4194304;

export interface ConcealerIndex {
  /** Fell every standing disc centred within 1 cm of (x, z), as fellConcealersAt does; returns how many. */
  fellAt(x: number, z: number): number;
}

/** The world's discs by their centre. Built at the first fell (after the world's build placed and trimmed them), and
 *  again if the list's length changed since. */
export function createConcealerIndex(concealers: readonly ConcealerDisc[]): ConcealerIndex {
  let cells: Map<number, ConcealerDisc[]> | null = null;
  let indexedLength = -1;

  function build(): Map<number, ConcealerDisc[]> {
    const map = new Map<number, ConcealerDisc[]>();
    for (let i = 0; i < concealers.length; i++) {
      const disc = concealers[i]!;
      const key = Math.floor(disc.x / CELL_M) * ROW + Math.floor(disc.z / CELL_M);
      const cell = map.get(key);
      if (cell) cell.push(disc);
      else map.set(key, [disc]);
    }
    indexedLength = concealers.length;
    return map;
  }

  function fellAt(x: number, z: number): number {
    if (!cells || indexedLength !== concealers.length) cells = build();
    const ix = Math.floor(x / CELL_M), iz = Math.floor(z / CELL_M);
    let felled = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = cells.get((ix + dx) * ROW + iz + dz);
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const disc = cell[k]!;
          if (!disc.dead && Math.abs(disc.x - x) <= REACH_M && Math.abs(disc.z - z) <= REACH_M) { disc.dead = true; felled++; }
        }
      }
    }
    return felled;
  }

  return { fellAt };
}
