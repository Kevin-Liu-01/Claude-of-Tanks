/** Construction-only frontage geometry. No random draws or runtime update work. */
export interface RoadFrontageSite { x: number; z: number; tx: number; tz: number; side: number }
export interface FrontagePose { x: number; z: number; rot: number }
type Road = readonly (readonly [number, number])[];

// These axes are the actual doors/open bays in props.ts and villageKit.ts.
// Special compounds, industrial platforms and waterfront working faces retain
// their authored orientation until they have an explicit frontage contract.
const FRONT_AXIS: Readonly<Record<string, number>> = {
  cottage: 0, barn: 0, adobe: 0, farmhouse: -Math.PI / 2, granary: 0,
  logcabin: 0, alpine: 0, woodshed: Math.PI / 2,
};
export function roadBuildingDoorAxis(kind: string): number | undefined { return FRONT_AXIS[kind]; }
export const ROAD_FRONTAGE_CLEARANCE = 5.5; // 4.95 m outer road edge + a walkable verge

/** Conservative swept-road test in the building's local frame. Padding the
 * rectangle also protects its corners, unlike testing only the building centre
 * or sampling corners (which misses a road crossing the footprint). */
export function buildingFootprintClearsRoads(
  pose: FrontagePose, w: number, d: number, roads: readonly Road[], clearance = ROAD_FRONTAGE_CLEARANCE,
): boolean {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  const hx = w / 2 + clearance, hz = d / 2 + clearance;
  for (const road of roads) for (let i = 1; i < road.length; i++) {
    const ax = road[i - 1][0] - pose.x, az = road[i - 1][1] - pose.z;
    const bx = road[i][0] - pose.x, bz = road[i][1] - pose.z;
    const a = [ax * c - az * s, ax * s + az * c];
    const b = [bx * c - bz * s, bx * s + bz * c];
    if (segmentEntersRectangle(a, b, hx, hz)) return false;
  }
  return true;
}

/** Slab clipping against an axis-aligned rectangle in the building frame. */
function segmentEntersRectangle(a: number[], b: number[], hx: number, hz: number): boolean {
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 2; axis++) {
    const half = axis === 0 ? hx : hz, delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(a[axis]) >= half - 1e-8) { enter = 2; break; }
    } else {
      const u = (-half - a[axis]) / delta, v = (half - a[axis]) / delta;
      enter = Math.max(enter, Math.min(u, v)); leave = Math.min(leave, Math.max(u, v));
    }
  }
  return enter < leave - 1e-8;
}

export function roadBuildingFrontage(
  kind: string, site: RoadFrontageSite, original: FrontagePose, w: number, d: number,
): FrontagePose | null {
  const axis = roadBuildingDoorAxis(kind);
  if (axis === undefined) return null;
  const len = Math.hypot(site.tx, site.tz);
  if (len < 1e-8 || (site.side !== -1 && site.side !== 1)) return null;
  const nx = -site.tz / len * site.side, nz = site.tx / len * site.side;
  // +Z forward transforms to (sin yaw, cos yaw); a +X bay is yaw + pi/2.
  const rot = Math.atan2(-nx, -nz) - axis;
  const c = Math.cos(rot), s = Math.sin(rot);
  const radius = Math.abs(nx * c - nz * s) * w / 2 + Math.abs(nx * s + nz * c) * d / 2;
  const oldSetback = (original.x - site.x) * nx + (original.z - site.z) * nz;
  const setback = Math.max(oldSetback, radius + ROAD_FRONTAGE_CLEARANCE + 0.05);
  // A frontage fix must not relocate a landmark or jump to another parcel.
  if (setback - oldSetback > 8) return null;
  return { x: site.x + nx * setback, z: site.z + nz * setback, rot };
}

/** A blocked facing correction must not leave a building on the carriageway.
 * Search its original parcel in deterministic two-metre steps, preserving the
 * authored orientation. Search is capped at 24 metres; terrain and every
 * adjacent reservation still decide which poses are legal.
 */
export function roadBuildingClearanceCandidates(site: RoadFrontageSite, original: FrontagePose): FrontagePose[] {
  const len = Math.hypot(site.tx, site.tz);
  if (len < 1e-8 || (site.side !== -1 && site.side !== 1)) return [];
  const tx = site.tx / len, tz = site.tz / len;
  const nx = -tz * site.side, nz = tx * site.side;
  const offsets: { outward: number; along: number; distance2: number }[] = [];
  for (let outward = 0; outward <= 24; outward += 2) for (let along = -24; along <= 24; along += 2) {
    const distance2 = outward * outward + along * along;
    if (distance2 > 0 && distance2 <= 576) offsets.push({ outward, along, distance2 });
  }
  offsets.sort((a, b) => a.distance2 - b.distance2 || Math.abs(a.along) - Math.abs(b.along) || a.along - b.along);
  return offsets.map(({ outward, along }) => ({
    x: original.x + nx * outward + tx * along,
    z: original.z + nz * outward + tz * along, rot: original.rot,
  }));
}

/** Do not newly exclude a future road proposal. Each segment is
 * the complete authored setback interval on one side of a later station.
 * Circle/segment interval containment checks every possible seeded offset,
 * not just a midpoint. A vacated reservation may admit an earlier skipped
 * proposal; the production-stage regression also checks count and RNG stability.
 */
export function roadParcelAddsNoExclusion(original: FrontagePose, next: FrontagePose, radius: number,
  segments: readonly (readonly [readonly [number, number], readonly [number, number]])[]): boolean {
  const interval = (pose: FrontagePose, a: readonly [number, number], b: readonly [number, number]): number[] | null => {
    const dx = b[0] - a[0], dz = b[1] - a[1], x = a[0] - pose.x, z = a[1] - pose.z;
    const aa = dx * dx + dz * dz, cc = x * x + z * z - radius * radius;
    if (aa < 1e-12) return cc < 0 ? [0, 1] : null;
    const bb = 2 * (x * dx + z * dz), discriminant = bb * bb - 4 * aa * cc;
    if (discriminant <= 0) return null;
    const root = Math.sqrt(discriminant), low = Math.max(0, (-bb - root) / (2 * aa));
    const high = Math.min(1, (-bb + root) / (2 * aa));
    return low < high ? [low, high] : null;
  };
  return segments.every(([a, b]) => {
    const oldInterval = interval(original, a, b), newInterval = interval(next, a, b);
    return !newInterval || !!oldInterval
      && newInterval[0] >= oldInterval[0] - 1e-9 && newInterval[1] <= oldInterval[1] + 1e-9;
  });
}
