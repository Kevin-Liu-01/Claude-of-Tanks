// Merkava family turrets (release 262). The shell as measured from the mark's source (merkavaFamilySource.ts): flat
// welded faces between straight crease lines, each solid lofted through the stations where its faces turn (the Mk 1 and
// Mk 2's wedge over its flared base "ears"; the Mk 3's flat-sided core; the Mk 4's broad core under its modules); ahead of
// the gun's slot the Mk 1 to Mk 3's two cheeks and the base under the slot's floor are their own solids. Then its ring
// collar, the working roof machine guns at their measured mounts and the whip antennas (the bustle basket is measured:
// merkavaFamilyDetails.ts). The hatches, sights, add-on armour, smoke launchers and stowage are the measured detail parts
// (merkavaFamilyDetails.ts). Turret frame: the ring centre at deck height, +Z forward.
import { KIT, FITTINGS } from './kit.ts';
import * as THREE from 'three';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** One solid of the shell (hull frame): its stations along z and its section at each, every section with the same count
 *  (the crease lines between its flat faces), counter-clockwise. */
export interface ShellSolid {
  readonly z: readonly number[];
  readonly rings: readonly (readonly SectionPoint[])[];
}

/** The gun's slot through the shell's nose (the Mk 1 to Mk 3): from z0 (hull frame) to the nose, its half-width. */
export interface TurretSlot {
  readonly z0: number;
  readonly halfWidth: number;
}

/** A measured solid lofted through its sections: its end caps keep every crease station (a crease that slid onto its
 *  neighbours' edge stays in the cap's boundary); where a near-collinear spur leaves that triangulation short, the
 *  caps are earcut's own; where an end section folds on itself, the solid ends at its neighbour; else null. */
export function loftMeasuredSolid(sections: readonly SolidSection[]): THREE.BufferGeometry | null {
  const trims = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
  for (const [a, b] of trims) {
    const kept = sections.slice(a, sections.length - b);
    if (kept.length < 2) break;
    try {
      return sectionSolid(kept, { sideQuadDiagonal: 'convex', preserveCapBoundary: true });
    } catch {
      try { return sectionSolid(kept, { sideQuadDiagonal: 'convex' }); } catch { /* the next trim */ }
    }
  }
  return null;
}

/** The gun's channel through the turret's front (hull frame z, from its back wall to its front, and its half-width). */
export interface GunChannel {
  readonly z0: number;
  readonly z1: number;
  readonly halfWidth: number;
}

/** The shell's solids lofted in the turret frame (pivot subtracted), each face flat; the gun channel's floor; and its ring
 *  collar over the race. */
export function buildMerkavaTurretShell(P: TankBuilderPort, shell: readonly ShellSolid[], pivot: readonly [number, number],
  channel: GunChannel | null): void {
  const [py, pz] = pivot;
  // the armour shell is the turret bucket; the stowage bins welded on the bustle are not armour: rearward of the ring,
  // where the shell's section falls under 55 % of its largest (the bins' open U), its solids are painted kit
  const area = (ring: readonly SectionPoint[]): number =>
    Math.abs(ring.reduce((a, [x0, y0], i) => { const [x1, y1] = ring[(i + 1) % ring.length]!; return a + x0 * y1 - x1 * y0; }, 0)) / 2;
  const stations = shell.flatMap((solid) => solid.z.map((z, s) => [z, area(solid.rings[s]!)] as const)).sort((a, b) => b[0] - a[0]);
  const largest = Math.max(...stations.map(([, a]) => a));
  const bins = stations.find(([z, a]) => z < pz - 0.5 && a < largest * 0.55)?.[0] ?? -Infinity;
  for (const solid of shell) {
    const sections = solid.z.map((z, s) => ({ z: z - pz, ring: solid.rings[s]!.map(([x, y]): SectionPoint => [x, y - py]) }));
    const g = loftMeasuredSolid(sections);
    if (g) P.add(solid.z[solid.z.length - 1]! <= bins + 0.03 ? 'turretPaintedDetail' : 'turret', g);
  }
  if (channel) {
    // the gun channel's floor (the Mk 1 to Mk 3's slot between the cheeks, the Mk 4's channel between its front modules;
    // not armour) at its base, at least 7 cm over the ring's plane (which the fleet's turret seat keeps clear), under the gun's mask
    const { z0, z1, halfWidth } = channel;
    const ahead = shell.filter((solid) => solid.z[solid.z.length - 1]! > z0 + 0.05);
    const base = Math.max(ahead.length ? Math.min(...ahead.flatMap((solid) => solid.rings[0]!.map(([, y]) => y))) + 0.01 : -Infinity, py + 0.07);
    const len = z1 - z0 - 0.02;
    P.add('turretDetail', KIT.box(halfWidth * 2 + 0.04, 0.02, len), 0, base - py, z0 + 0.01 + len / 2 - pz);
  }
  // the ring collar: from the deck up into the shell's base course, round the race (inside the base course's corners
  // over the stations within 0.4 m of the ring centre)
  let base = Infinity, collarR = 1.05;
  for (const solid of shell) {
    solid.z.forEach((z, s) => {
      const ring = solid.rings[s]!, low = Math.min(...ring.map(([, y]) => y));
      base = Math.min(base, low);
      if (Math.abs(z - pz) < 0.4) {
        const half = Math.max(...ring.filter(([, y]) => y < low + 0.02).map(([x]) => Math.abs(x)));
        collarR = Math.min(collarR, half - 0.04);
      }
    });
  }
  const h = Math.max(0.06, base - py + 0.06);
  P.add('turret', KIT.cylY(collarR, collarR + 0.02, h, P.q ? 40 : 24), 0, h / 2 - 0.02, 0);
}

/** A solid's section at z (its stations' crease lines interpolated), or null outside its stations. */
function sectionAt(solid: ShellSolid, z: number): readonly SectionPoint[] | null {
  const zs = solid.z;
  if (z < zs[0]! || z > zs[zs.length - 1]!) return null;
  let s = 0;
  while (s + 2 < zs.length && zs[s + 1]! < z) s++;
  const f = (z - zs[s]!) / Math.max(1e-9, zs[s + 1]! - zs[s]!), a = solid.rings[s]!, b = solid.rings[s + 1]!;
  return a.map(([x, y], i): SectionPoint => [x + (b[i]![0] - x) * f, y + (b[i]![1] - y) * f]);
}

/** The shell's outer surface over (x, z) in the hull frame: the highest crossing of the sections at z with the vertical
 *  through x, else the nearest station's highest point. */
function turretSurfaceAt(shell: readonly ShellSolid[], x: number, z: number): number {
  let top = -Infinity;
  for (const solid of shell) {
    const ring = sectionAt(solid, z);
    if (!ring) continue;
    ring.forEach(([x0, y0], i) => {
      const [x1, y1] = ring[(i + 1) % ring.length]!;
      if ((x - x0) * (x - x1) <= 0 && Math.abs(x1 - x0) > 1e-9) top = Math.max(top, y0 + (y1 - y0) * ((x - x0) / (x1 - x0)));
    });
  }
  if (top > -Infinity) return top;
  let best = shell[0]!, bz = Infinity;
  for (const solid of shell) for (const sz of solid.z) if (Math.abs(sz - z) < bz) { bz = Math.abs(sz - z); best = solid; }
  const s = best.z.reduce((k, sz, i) => (Math.abs(sz - z) < Math.abs(best.z[k]! - z) ? i : k), 0);
  return Math.max(...best.rings[s]!.map(([, y]) => y));
}

/** A point on the shell's right flank at z (hull frame): the middle of the longest face there that looks outboard. */
export function turretFlankAt(shell: readonly ShellSolid[], z: number): readonly [x: number, y: number] {
  let best: readonly [number, number] = [0, 0], len = -1;
  for (const solid of shell) {
    const ring = sectionAt(solid, z);
    if (!ring) continue;
    ring.forEach(([x0, y0], i) => {
      const [x1, y1] = ring[(i + 1) % ring.length]!, l = Math.hypot(x1 - x0, y1 - y0);
      if (x0 > 0 && x1 > 0 && l > len && (y1 - y0) / Math.max(1e-9, l) > 0.8) { len = l; best = [(x0 + x1) / 2, (y0 + y1) / 2]; }
    });
  }
  return best;
}

/** The shell's highest point (hull frame). */
export function turretShellTop(shell: readonly ShellSolid[]): number {
  return Math.max(...shell.flatMap((solid) => solid.rings.flatMap((ring) => ring.map(([, y]) => y))));
}

// The fleet MAG at scale 1 (FITTINGS.pintleMG cls 'mag', measured): from 0.308 behind its pintle to 0.951 ahead of it.
const FLEET_MAG = Object.freeze({ rearZ: -0.308, length: 1.260 });

/** The working roof machine guns at their measured mounts, scaled to the source gun's span, and the whip antennas at
 *  their measured feet and heights (the Mk 4's two short width rods stand on the hull's front corners). */
export function buildMerkavaRoofWeapons(P: TankBuilderPort, shell: readonly ShellSolid[],
  guns: readonly (readonly [number, number, number, number, number, number | null])[],
  antennas: readonly (readonly [number, number, number, number])[], pivot: readonly [number, number]): void {
  const [py, pz] = pivot;
  guns.forEach(([x, foot, z, z0, z1, top], i) => {
    // working crew stations (the coordinator's VH.14 ruling: every drawn roof gun works), on the fleet's riding cradle at
    // the measured mount, on its pintle post down to the shell (the Mk 1's left gun stands 0.35 m over its sloped
    // shoulder); the gun spans the source gun's z0..z1, its top at the source gun's where that is measured apart (the
    // Mk 1-3's right gun hangs beside its mount, the Mk 4B's rides a tall post)
    const scale = (z1 - z0) / FLEET_MAG.length;
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale, seed: 904, tone: 'two-tone', ammo: true,
      shield: false, ring: false, working: true, ridingCradle: true });
    mg.name = `merkavaRoofMag${i + 1}`;
    const surface = turretSurfaceAt(shell, x, z);
    const seat = top === null ? Math.max(foot, surface) : top - new THREE.Box3().setFromObject(mg).max.y;
    mg.position.set(x, seat - py, z0 - FLEET_MAG.rearZ * scale - pz);
    P.turretG.add(mg);
    if (seat - surface > 0.03) {
      P.add('turretDetail', KIT.cylY(0.026, 0.034, seat - surface + 0.03, 10), x, (seat + surface) / 2 - 0.015 - py, z - pz);
    }
  });
  antennas.forEach(([x, foot, z, h], i) => {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, seed: 262 + i });
    if (foot < py) {
      whip.position.set(x, foot, z);
      P.hullG.add(whip);
    } else {
      whip.position.set(x, foot - py, z - pz);
      P.turretG.add(whip);
    }
  });
}
