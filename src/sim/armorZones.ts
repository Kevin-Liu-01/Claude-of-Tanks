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
import type { ZonePlate } from './armorPlanes.ts';

// (267) the plates as planes and outlines, and the plate along a shot, live in sim/armorPlanes.ts: the trace reads them in
// every boot, and this module (with the paint's weights) stays out of its chunk
export { zoneAlongShot, zonePlates, type ZonePlate } from './armorPlanes.ts';

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
