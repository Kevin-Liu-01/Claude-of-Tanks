// The armour zones (262): the authored plates of a frame — glacis, lower plate, cheek, mantlet, side, roof, rear — as the
// scoped armour paint scores them (vehicles/materials.ts ARMOR_PAINT, per fragment) and, with zone plates on
// (sim/armorZonePlates.ts, behind a flag), the authority at a shell's entry: each plate's plane and the outward edge
// planes of its outline, and the score.
//
// The cells' faces each take the authored plate nearest them (combatAnatomy nearestPlate), one whole hull triangle at a
// time, so a zone border along the cells runs along triangle edges: a zigzag across a glacis, diagonals through a cheek.
// The paint instead gives each point of the vehicle's surface the plate whose score is best,
//   score(plate, x) = -|d(x)| - ZONE_OUTSIDE_WEIGHT * gap(x) - ZONE_FACING_WEIGHT * (1 - n·m)
// (nearestPlate's own weights, per point) where d is the distance off the plate's plane, gap how far x lies outside the
// plate's outline, summed over its edges, and the last term prefers the plate facing the surface's way (n the plate's
// normal, m the surface's). The score is linear between a few planes, so every border is a straight line where two
// scores meet. A plate turned more than ~83° away (n·m < ZONE_FACING_MIN) never takes a point. The nearest plane, not the
// outermost: a hull is not convex, and a lower side plate between the tracks lies inboard of a glacis that spans them.
//
// The mantlet's footprint comes first (Main's ruling, 262; combatAnatomy's face-to-plate assignment keeps the same
// rule): a forward surface (outward normal z > MANTLET_FORWARD_NZ) over a mantlet or gun-notch plate's footprint —
// inside its x range, within 0.1 m of its height and 0.35 m of its z range — is that plate's, whatever the score. The
// score alone hands the face in front of the gun to a wrap-around cheek or a low turret's roof.
//
// Pure numbers (no three.js), deterministic (Math.sqrt, Math.min and Math.max only).

import { MANTLET_FORWARD_NZ, ZONE_FACING_MIN, ZONE_FACING_WEIGHT, ZONE_OUTSIDE_WEIGHT } from './armorZoneWeights.ts';

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

/**
 * The zone at a frame-local point of the armour whose outward normal is (nx, ny, nz): on a forward surface over a
 * mantlet's footprint, that plate (the footprint it lies deepest in, as the paint judges it); otherwise the index of the
 * plate with the best score, or -1 when no plate faces that way. Allocates nothing.
 */
export function zoneAt(zones: readonly ZonePlate[], x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  let foot = -1, footIn = 0;
  for (let index = 0; index < zones.length; index++) {
    const box = zones[index].footprint;
    if (!box) continue;
    const inside = Math.min(x - box.min[0], box.max[0] - x, y - box.min[1], box.max[1] - y, z - box.min[2], box.max[2] - z,
      nz - MANTLET_FORWARD_NZ);
    if (inside > footIn) { footIn = inside; foot = index; }
  }
  if (foot >= 0) return foot;
  let best = -1, bestScore = -Infinity;
  for (let index = 0; index < zones.length; index++) {
    const zone = zones[index], n = zone.normal;
    const facing = n[0] * nx + n[1] * ny + n[2] * nz;
    if (facing < ZONE_FACING_MIN) continue;
    let gap = 0;
    for (const edge of zone.edges) {
      const e = edge.normal[0] * x + edge.normal[1] * y + edge.normal[2] * z + edge.offset;
      if (e > 0) gap += e;
    }
    const d = n[0] * x + n[1] * y + n[2] * z + zone.offset;
    const score = -(d < 0 ? -d : d) - ZONE_OUTSIDE_WEIGHT * gap - ZONE_FACING_WEIGHT * (1 - facing);
    if (score > bestScore) { bestScore = score; best = index; }
  }
  return best;
}
