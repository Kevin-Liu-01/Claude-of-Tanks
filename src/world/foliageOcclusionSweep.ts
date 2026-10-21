/**
 * foliageOcclusionSweep.ts — the chase camera's foliage fade sweep, visiting only what it can change (2026-10-13, the
 * perf stream).
 *
 * vegetation.ts fades every near tree whose canopy stands in the camera→pivot capsule, and every bush beside the
 * player, easing each record's `fade` toward its target every frame. Its sweep walked every tree and every bush of the
 * map each frame (~1 % of the battle's main thread on Verdant), though a record outside the capsule's broadphase box has
 * a target of 0 and, at fade 0, nothing to do. A sweep here visits the records in the box (a uniform XZ grid of their
 * places, indexed once the build has planted them; places never move) and the records still easing (the fading set) —
 * every record the full walk could change — and calls the owner's ease on each exactly once. Each record's ease depends
 * on that record alone, so the fades and their uploads are the full walk's.
 */

interface FadeRecord {
  readonly x: number;
  readonly z: number;
  fade: number;
}

/** The broadphase cell (m): a capsule box of ~40 m spans at most 3 x 3 cells. */
export const FOLIAGE_OCCLUSION_CELL_M = 32;

interface FoliageFadeSweep<T extends FadeRecord> {
  /**
   * One frame: ease every record in the box [minX, maxX] x [minZ, maxZ] (when `boxActive`) and every record still
   * fading, once each. Returns whether any record's fade is non-zero afterwards (the walk's `any`).
   */
  run(records: ReadonlyArray<T>, boxActive: boolean, minX: number, maxX: number, minZ: number, maxZ: number): boolean;
  /** The records whose fade is non-zero after the last run (read-only; for receipts). */
  readonly fading: ReadonlySet<T>;
}

/**
 * A sweep over one record list. `ease(record)` computes the record's target, eases its fade and writes it where it
 * draws; it must leave a record outside the box at fade 0 untouched (its target there is 0), which is what makes the
 * visit of the box and the fading set equal to the full walk.
 */
export function createFoliageFadeSweep<T extends FadeRecord>(ease: (record: T) => void,
  cellM = FOLIAGE_OCCLUSION_CELL_M): FoliageFadeSweep<T> {
  const cells = new Map<number, number[]>();
  let indexedLength = -1;
  let indexedList: ReadonlyArray<T> | null = null;
  const fading = new Set<T>();
  const visited = new Set<T>();
  const key = (ix: number, iz: number): number => (ix + 32768) * 65536 + (iz + 32768);
  const index = (records: ReadonlyArray<T>): void => {
    if (indexedList === records && indexedLength === records.length) return;
    cells.clear();
    for (let i = 0; i < records.length; i++) {
      const r = records[i]!;
      const k = key(Math.floor(r.x / cellM), Math.floor(r.z / cellM));
      let list = cells.get(k);
      if (!list) cells.set(k, list = []);
      list.push(i);
    }
    indexedList = records;
    indexedLength = records.length;
  };
  const settle = (record: T): void => {
    ease(record);
    if (record.fade !== 0) fading.add(record);
    else fading.delete(record);
  };
  // hoisted visitors: no closure per frame
  const visitFading = (record: T): void => {
    if (!visited.has(record)) settle(record);
  };
  return {
    fading,
    run(records, boxActive, minX, maxX, minZ, maxZ) {
      index(records);
      visited.clear();
      if (boxActive) {
        const x0 = Math.floor(minX / cellM), x1 = Math.floor(maxX / cellM);
        const z0 = Math.floor(minZ / cellM), z1 = Math.floor(maxZ / cellM);
        for (let ix = x0; ix <= x1; ix++) {
          for (let iz = z0; iz <= z1; iz++) {
            const list = cells.get(key(ix, iz));
            if (!list) continue;
            for (let j = 0; j < list.length; j++) {
              const record = records[list[j]!]!;
              visited.add(record);
              settle(record);
            }
          }
        }
      }
      fading.forEach(visitFading);
      return fading.size > 0;
    },
  };
}
