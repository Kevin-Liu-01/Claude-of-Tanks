// Road footprint clearance (maps-and-layouts lane, 2026-10-02). The rubble, boulder, field-work, wreck and well passes
// used to clear only a solid's centre from the roads. A 10 m wreck centred 7 m off a road reached 2 m into the
// carriageway, and a 3 m boulder 6 m off one reached its edge. A placement now keeps its whole footprint out of the
// road core. The core is the layout brief's 3.5 m carriageway (ROAD_CORE_M in tools/map-layout-metrics.mjs), plus half
// a metre for the 4 m road-distance grid's bilinear reading and the 1 m perimeter sampling below.

/** Every point of a solid's footprint stays at least this far from every road centreline. */
export const ROAD_FOOTPRINT_CLEAR_M = 4;

/** The terrain's road-distance reading (HeightField._roadDist): metres to the nearest road centreline. */
interface RoadDistanceField {
  _roadDist(x: number, z: number): number;
}

/** Whether a disc of radius `r` centred on (x, z) stays out of the road core. The distance field is 1-Lipschitz, so
 * the disc's nearest point lies at least `distance - r` from a road. */
export function discClearOfRoadCore(field: RoadDistanceField, x: number, z: number, r: number): boolean {
  return field._roadDist(x, z) >= ROAD_FOOTPRINT_CLEAR_M + r;
}

/**
 * Whether an oriented rectangle centred on (x, z) stays out of the road core: half width `hw` across, half length
 * `hl` along the forward (sin yaw, cos yaw) — the collision OBB convention (world/collision.ts setObbShape). Its
 * perimeter is sampled at most 1 m apart, corners included; a road crossing the rectangle crosses the perimeter.
 */
export function boxClearOfRoadCore(field: RoadDistanceField, x: number, z: number, hw: number, hl: number,
  yaw: number): boolean {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  const steps = Math.max(1, Math.ceil(Math.max(hw, hl) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = -1 + (2 * i) / steps;
    const across = t * hw, along = t * hl;
    if (field._roadDist(x + rx * across + fx * hl, z + rz * across + fz * hl) < ROAD_FOOTPRINT_CLEAR_M
      || field._roadDist(x + rx * across - fx * hl, z + rz * across - fz * hl) < ROAD_FOOTPRINT_CLEAR_M
      || field._roadDist(x + rx * hw + fx * along, z + rz * hw + fz * along) < ROAD_FOOTPRINT_CLEAR_M
      || field._roadDist(x - rx * hw + fx * along, z - rz * hw + fz * along) < ROAD_FOOTPRINT_CLEAR_M) return false;
  }
  return true;
}

/** A road network's sharp bends: every interior vertex where a route turns by more than `minTurnDeg`. */
export function sharpRoadBends(roads: readonly (readonly (readonly [number, number])[])[],
  minTurnDeg = 40): [number, number][] {
  const out: [number, number][] = [];
  const min = (minTurnDeg * Math.PI) / 180;
  for (const route of roads) {
    for (let i = 1; i + 1 < route.length; i++) {
      const [ax, az] = route[i - 1], [bx, bz] = route[i], [cx, cz] = route[i + 1];
      const turn = Math.atan2(cx - bx, cz - bz) - Math.atan2(bx - ax, bz - az);
      if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > min) out.push([bx, bz]);
    }
  }
  return out;
}

/** Whether an oriented rectangle (boxClearOfRoadCore's convention) keeps at least `clearM` from every point. */
export function boxClearOfPoints(points: readonly (readonly [number, number])[], x: number, z: number, hw: number,
  hl: number, yaw: number, clearM: number): boolean {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  for (const [px, pz] of points) {
    const dx = px - x, dz = pz - z;
    const across = Math.max(0, Math.abs(dx * rx + dz * rz) - hw), along = Math.max(0, Math.abs(dx * fx + dz * fz) - hl);
    if (across * across + along * along < clearM * clearM) return false;
  }
  return true;
}

/**
 * The nearest seat for a footprint that keeps out of the road core: (x, z) itself when it already does, else the
 * point straight away from the nearest road (the road distance's gradient at (x, z)), whole metres out up to
 * `maxShiftM`, where `clear` first holds. null when no such seat exists. Pure: no draws, so a caller's seeded stream
 * keeps every later placement.
 */
export function shiftClearOfRoadCore(field: RoadDistanceField, x: number, z: number,
  clear: (x: number, z: number) => boolean, maxShiftM = 8): [number, number] | null {
  if (clear(x, z)) return [x, z];
  const gx = field._roadDist(x + 1, z) - field._roadDist(x - 1, z);
  const gz = field._roadDist(x, z + 1) - field._roadDist(x, z - 1);
  const g = Math.hypot(gx, gz);
  if (!(g > 1e-6)) return null;
  const ux = gx / g, uz = gz / g;
  for (let shift = 1; shift <= maxShiftM; shift++) {
    const px = x + ux * shift, pz = z + uz * shift;
    if (clear(px, pz)) return [px, pz];
  }
  return null;
}
