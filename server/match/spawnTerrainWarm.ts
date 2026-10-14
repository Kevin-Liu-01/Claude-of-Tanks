// server/match/spawnTerrainWarm.ts — the terrain a match's first minute will read, warmed during its countdown (2026-10-13,
// the perf stream). The authority samples the base field's lazy grids: the 1 m fast grid (rays, probes; filled a 16 m tile
// or four vertices at a time) and the contact surface (track contact; filled a vertex at a time). Each first-touch fill
// is an analytic height (20-100 us; Badlands' first-minute ticks paid +0.5 ms for them). The client warms its own fast
// tiles round the hulls before the reveal (battleWarmRuntime.ts warmBattleTerrainTiles); the host's actor runs this
// generator a slice per countdown tick (matchActor.ts): the fast tiles within 48 m of every hull's spawn, then the contact
// vertices within 10 m. Filling a grid early stores the values a later read would have stored, so no result changes.

interface WarmField {
  warmFastTilesAround?(points: Array<{ x: number; z: number; radiusM: number }>): Iterable<number>;
  getContactHeightAt?(x: number, z: number): number;
}
interface WarmEntity { readonly state?: { readonly pos?: { readonly x: number; readonly z: number } | null } | null }

/** The fast grid's reach round each spawn, and the contact surface's (metres). */
export const SPAWN_FAST_RADIUS_M = 48;
export const SPAWN_CONTACT_RADIUS_M = 10;
/** The contact surface's vertex pitch (terrainContactSurface.ts: 128 m chunks of 96 segments). */
const CONTACT_STEP_M = 128 / 96;

/** One unit of work per step: a fast tile, or one row of contact vertices round one hull. */
export function* createSpawnTerrainWarm(field: WarmField, entities: Iterable<WarmEntity>): Generator<number, void, void> {
  const points: Array<{ x: number; z: number; radiusM: number }> = [];
  for (const entity of entities) {
    const pos = entity.state?.pos;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) points.push({ x: pos.x, z: pos.z, radiusM: SPAWN_FAST_RADIUS_M });
  }
  if (typeof field.warmFastTilesAround === 'function') {
    for (const tile of field.warmFastTilesAround(points)) yield tile;
  }
  if (typeof field.getContactHeightAt === 'function') {
    const r = SPAWN_CONTACT_RADIUS_M;
    for (const point of points) {
      for (let dz = -r; dz <= r + 1e-9; dz += CONTACT_STEP_M) {
        for (let dx = -r; dx <= r + 1e-9; dx += CONTACT_STEP_M) field.getContactHeightAt(point.x + dx, point.z + dz);
        yield -1;
      }
    }
  }
}
