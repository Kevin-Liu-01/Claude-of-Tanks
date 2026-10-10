/**
 * The drawn ground a battle vehicle's running gear rests on — the vehicle-contact lane, 2026-10-09 (owner: "tracks
 * shouldnt glitch through the bridge or textures, like how they do on the bridge in aegis crossing").
 *
 * The movement solve stands a hull on the terrain's contact surface or on the standable collision tops under it (a
 * bridge deck, a roof, a slab: sim/structureSupport.ts). The drawn wheels used to read the terrain alone, so over Aegis
 * Crossing's viaduct they sampled the gorge bed 30 m down, every road wheel fell to its droop and the tracks were drawn
 * 21-32 cm inside the deck while the hull rode on top of it. This sampler gives the visual the same surface the solve
 * stands on: with a `ceiling` (the highest top the caller admits at the point — a wheel's contact plane plus the hull
 * step-up) it returns the higher of the terrain contact and the standable tops at or under that ceiling, by the solve's
 * own rule (structureTopAt). Without a ceiling it is the terrain contact alone, as every other caller expects.
 *
 * `prepareHull` gathers the standable records within reach of one hull before its wheels sample: one candidate query per
 * hull per conform, then each sample loops over that short list. A sample outside the prepared box (track debris, any
 * other caller) makes its own point query. Allocation-free after warm-up; DOM-free and Node-runnable, so the receipts
 * drive the same sampler the solo battle and the multiplayer client hand their vehicles.
 */
import type { CollisionRecord, ObstacleQuery } from './collision.ts';
import { SUPPORT_MIN_HEIGHT_M, SUPPORT_STEP_UP_M, structureTopAt } from '../sim/structureSupport.ts';

interface VehicleGroundWorld {
  queryObstacles?: ObstacleQuery | null;
}

export type VehicleGroundSampler = ((x: number, z: number, ceiling?: number) => number) & {
  prepareHull(x: number, z: number, reachM: number): void;
};

/**
 * @param terrainContact the terrain's rendered contact surface (heightField.getContactHeightAt)
 * @param world the live collision world (its movement obstacle grid), or null between battles
 */
export function createVehicleGroundSampler(
  terrainContact: (x: number, z: number) => number,
  world: () => VehicleGroundWorld | null | undefined,
): VehicleGroundSampler {
  const queried: CollisionRecord[] = [];
  const standable: CollisionRecord[] = [];
  const point: CollisionRecord[] = [];
  let count = 0;
  let boxQuery: ObstacleQuery | null = null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const sampler = ((x: number, z: number, ceiling?: number): number => {
    const ground = terrainContact(x, z);
    if (ceiling === undefined || !(ceiling > ground)) return ground;
    const query = world()?.queryObstacles ?? null;
    if (!query) return ground;
    let top: number;
    if (query === boxQuery && x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      if (count === 0) return ground;
      top = structureTopAt(standable, count, x, z, ceiling - SUPPORT_STEP_UP_M);
    } else {
      const candidates = query(x - 0.01, z - 0.01, x + 0.01, z + 0.01, point);
      top = structureTopAt(candidates, candidates.length, x, z, ceiling - SUPPORT_STEP_UP_M);
    }
    return top > ground ? top : ground;
  }) as VehicleGroundSampler;
  sampler.prepareHull = (x: number, z: number, reachM: number): void => {
    const query = world()?.queryObstacles ?? null;
    boxQuery = query;
    count = 0;
    if (!query || !(reachM >= 0)) { minX = minZ = Infinity; maxX = maxZ = -Infinity; return; }
    minX = x - reachM; minZ = z - reachM; maxX = x + reachM; maxZ = z + reachM;
    query(minX, minZ, maxX, maxZ, queried);
    // Height is fixed per record; crushed, dead and crushable stay live tests inside structureTopAt.
    for (let i = 0; i < queried.length; i++) {
      const record = queried[i];
      if (record.max[1] - record.min[1] < SUPPORT_MIN_HEIGHT_M) continue;
      if (count < standable.length) standable[count] = record; else standable.push(record);
      count++;
    }
  };
  return sampler;
}
