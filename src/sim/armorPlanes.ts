// The authored main plates of a frame as planes and outlines (262), and the plate a shot reads along its line (267). The
// scoped paint's zones (sim/armorZones.ts, which re-exports these) and the authority's trace (sim/armor.ts plateAlongShot)
// build on them. The trace runs in every boot: this module imports nothing, so it shares no chunk with the paint's weights.
//
// Pure numbers (no three.js), deterministic (Math.sqrt only).

/**
 * A plate facing a direction less than this (n·d) never meets it: nearestPlate's floor (vehicles/combatAnatomy.ts), the
 * paint's ZONE_FACING_MIN (sim/armorZoneWeights.ts; armorAlongShot.selftest.mjs holds the two equal).
 */
export const PLANE_FACING_MIN = 0.12;

interface ZonePlateSource {
  readonly verts: readonly (readonly number[])[];
  readonly kind?: string;
  readonly name?: string;
}

/** A main plate so named is a mantlet or gun notch: it carries a footprint. */
const MANTLET_NAME = /mantlet|gun_notch/i;
/** Metres the footprint reaches past the plate's height, and past its z range. */
const FOOTPRINT_Y_M = 0.1;
const FOOTPRINT_Z_M = 0.35;

type Point = [number, number, number];

export interface ZonePlate {
  readonly plate: unknown;
  readonly normal: Point;
  /** d(x) = normal·x + offset */
  readonly offset: number;
  /** Outward edge planes of the outline: e(x) = normal·x + offset, positive outside that edge. */
  readonly edges: ReadonlyArray<{ readonly normal: Point; readonly offset: number }>;
  /** A mantlet's or gun notch's footprint box (frame-local): a forward surface inside it is this plate's. */
  readonly footprint: { readonly min: Point; readonly max: Point } | null;
}

const sub = (a: readonly number[], b: readonly number[]): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): Point =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unit(a: readonly number[]): Point | null {
  const size = Math.sqrt(dot(a, a));
  return size > 1e-12 ? [a[0] / size, a[1] / size, a[2] / size] : null;
}

/** The main plates of one frame as zones (the plates nearestPlate assigns the cells' faces). */
export function zonePlates(plates: readonly ZonePlateSource[] | undefined): ZonePlate[] {
  const out: ZonePlate[] = [];
  for (const plate of plates || []) {
    if ((plate.kind || 'main') !== 'main') continue;
    const verts = plate.verts || [];
    if (verts.length < 3) continue;
    // combatAnatomy plateDescriptor's normal: (v1 - v0) × (vLast - v0), outward
    const normal = unit(cross(sub(verts[1], verts[0]), sub(verts[verts.length - 1], verts[0])));
    if (!normal) continue;
    const center = [0, 0, 0];
    for (const point of verts) for (let axis = 0; axis < 3; axis++) center[axis] += point[axis] / verts.length;
    // winding: counter-clockwise about the normal, so edge × normal points out of the outline
    let turn = 0;
    for (let i = 0; i < verts.length; i++) turn += dot(cross(sub(verts[i], center), sub(verts[(i + 1) % verts.length], center)), normal);
    const ordered = turn >= 0 ? verts : [...verts].reverse();
    const edges: Array<{ normal: Point; offset: number }> = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i], b = ordered[(i + 1) % ordered.length];
      const side = unit(cross(sub(b, a), normal));
      if (side) edges.push({ normal: side, offset: -dot(side, a) });
    }
    let footprint: ZonePlate['footprint'] = null;
    if (MANTLET_NAME.test(plate.name || '')) {
      const min: Point = [Infinity, Infinity, Infinity], max: Point = [-Infinity, -Infinity, -Infinity];
      for (const point of verts) for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
      min[1] -= FOOTPRINT_Y_M; max[1] += FOOTPRINT_Y_M;
      min[2] -= FOOTPRINT_Z_M; max[2] += FOOTPRINT_Z_M;
      footprint = { min, max };
    }
    out.push({ plate, normal, offset: -dot(normal, center), edges, footprint });
  }
  return out;
}

/** A crossing this far (m) outside an outline's edge is off that plate (zoneAlongShot). */
const ALONG_EDGE_SLACK_M = 1e-3;

function overFootprint(box: NonNullable<ZonePlate['footprint']>, x: number, y: number, z: number): boolean {
  return x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1] && z >= box.min[2] && z <= box.max[2];
}

/**
 * (267) The zone a shot along the unit direction (dx, dy, dz) reads at a frame-local point of the armour whose zone is
 * `own`: `own` where it faces the shot (n·-d at least PLANE_FACING_MIN) and, a mantlet or gun notch, the point lies over
 * its footprint; otherwise the zone facing the shot whose outline the shot's line through the point crosses, nearest the
 * point (a mantlet or gun notch only over its footprint), or `own` where the line crosses none.
 *
 * nearestPlate's facing term outweighs its distance, so a sloped front-top bevel facing mostly up takes the roof (and a
 * front corner a side): a level round met a 45 mm roof where the authored cheek or front stands across its path (Main's
 * ruling, 267: 244 of 276 turrets, 142 hulls). A shot the plate does face (top attack on that bevel, a flank shot on
 * that side) keeps it, and so does every hit whose plate faces its shot. Allocates nothing.
 */
export function zoneAlongShot(
  zones: readonly ZonePlate[], own: number, x: number, y: number, z: number, dx: number, dy: number, dz: number,
): number {
  if (own >= 0) {
    const zone = zones[own], n = zone.normal;
    if (-(n[0] * dx + n[1] * dy + n[2] * dz) >= PLANE_FACING_MIN && (!zone.footprint || overFootprint(zone.footprint, x, y, z))) return own;
  }
  let best = own, bestReach = Infinity;
  for (let index = 0; index < zones.length; index++) {
    const zone = zones[index], n = zone.normal;
    const along = n[0] * dx + n[1] * dy + n[2] * dz;
    if (-along < PLANE_FACING_MIN || (zone.footprint && !overFootprint(zone.footprint, x, y, z))) continue;
    const s = -(n[0] * x + n[1] * y + n[2] * z + zone.offset) / along;
    const qx = x + s * dx, qy = y + s * dy, qz = z + s * dz;
    let inside = true;
    for (let e = 0; e < zone.edges.length; e++) {
      const edge = zone.edges[e];
      if (edge.normal[0] * qx + edge.normal[1] * qy + edge.normal[2] * qz + edge.offset > ALONG_EDGE_SLACK_M) { inside = false; break; }
    }
    const reach = s < 0 ? -s : s;
    if (inside && reach < bestReach) { bestReach = reach; best = index; }
  }
  return best;
}
