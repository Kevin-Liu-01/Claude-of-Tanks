// Merkava family turrets (release 262). The shell as measured from the mark's source (merkavaFamilySource.ts): flat
// welded faces between straight crease lines, each solid lofted through the stations where its faces turn (the Mk 1 and
// Mk 2's wedge over its flared base "ears"; the Mk 3's flat-sided core; the Mk 4's broad core under its modules); ahead of
// the gun's slot the Mk 1 to Mk 3's two cheeks and the base under the slot's floor are their own solids. Then its ring
// collar, the bustle basket and its ball-and-chain curtain, the working roof machine guns at their measured mounts and
// the whip antennas. The hatches, sights, add-on armour, smoke launchers and stowage are the measured detail parts
// (merkavaFamilyDetails.ts). Turret frame: the ring centre at deck height, +Z forward.
import { KIT, FITTINGS } from './kit.ts';
import type * as THREE from 'three';
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
 *  caps are earcut's own. */
export function loftMeasuredSolid(sections: readonly SolidSection[]): THREE.BufferGeometry {
  try {
    return sectionSolid(sections, { sideQuadDiagonal: 'convex', preserveCapBoundary: true });
  } catch {
    return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
  }
}

/** The shell's solids lofted in the turret frame (pivot subtracted), each face flat; and its ring collar over the race. */
export function buildMerkavaTurretShell(P: TankBuilderPort, shell: readonly ShellSolid[], pivot: readonly [number, number],
  slot: TurretSlot | null): void {
  const [py, pz] = pivot;
  for (const solid of shell) {
    const sections = solid.z.map((z, s) => ({ z: z - pz, ring: solid.rings[s]!.map(([x, y]): SectionPoint => [x, y - py]) }));
    P.add('turret', loftMeasuredSolid(sections));
  }
  if (slot) {
    // the slot's floor between the cheeks at their base (at least 7 cm over the ring's plane, which the fleet's turret
    // seat keeps clear), from its back wall to the nose, under the gun's mask
    const ahead = shell.filter((solid) => solid.z[solid.z.length - 1]! > slot.z0 + 0.05);
    const nose = Math.max(...ahead.map((solid) => solid.z[solid.z.length - 1]!));
    const base = Math.max(Math.min(...ahead.flatMap((solid) => solid.rings[0]!.map(([, y]) => y))) + 0.01, py + 0.07);
    const len = nose - slot.z0 - 0.02;
    P.add('turret', KIT.box(slot.halfWidth * 2 + 0.04, 0.02, len), 0, base - py, slot.z0 + 0.01 + len / 2 - pz);
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

export interface MerkavaBasket {
  readonly z0: number; readonly z1: number; readonly halfWidth: number; readonly floor: number; readonly rail: number;
}

/** The bustle basket (hull frame numbers, drawn in the turret frame): an open welded frame round the bustle's rear with
 *  a floor, posts and two rails, stowage riding in it, and the ball-and-chain curtain hung from its rear rail. */
export function buildMerkavaBasket(P: TankBuilderPort, b: MerkavaBasket, pivot: readonly [number, number]): void {
  const { box } = KIT, slot = 'turretOpenLattice', [py, pz] = pivot;
  const z0 = b.z0 - pz, z1 = b.z1 - pz, floor = b.floor - py, rail = b.rail - py, hw = b.halfWidth, depth = z0 - z1;
  P.add('turretPaintedDetail', box(hw * 2, 0.025, depth), 0, floor, (z0 + z1) / 2);
  for (const y of [floor + (rail - floor) * 0.5, rail]) {
    P.add(slot, box(hw * 2, 0.03, 0.03), 0, y, z1 + 0.015);
    for (const side of [-1, 1]) P.add(slot, box(0.03, 0.03, depth), side * hw, y, (z0 + z1) / 2);
  }
  for (let i = 0; i < 5; i++) P.add(slot, box(0.03, rail - floor, 0.03), -hw + (i / 4) * hw * 2, (rail + floor) / 2, z1 + 0.015);
  for (const side of [-1, 1]) for (const z of [z0 - 0.02, (z0 + z1) / 2]) P.add(slot, box(0.03, rail - floor, 0.03), side * hw, (rail + floor) / 2, z);
  // the ball-and-chain curtain under the rear rail
  const jit = (i: number, k: number): number => {
    let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296 - 0.5;
  };
  const drop = 0.42;
  const chain = (i: number, x: number, z: number): void => {
    const d = drop * (1 + jit(i, 3) * 0.3), lean = jit(i, 4) * 0.06;
    P.add('turretOpenLatticeDark', box(0.008, d, 0.008), x + Math.sin(lean) * d / 2, floor - 0.015 - Math.cos(lean) * d / 2, z, 0, 0, lean);
    const r = 0.02 * (1 + jit(i, 6) * 0.3);
    P.add('turretOpenLatticeDark', KIT.sph(r, 7), x + Math.sin(lean) * d, floor - 0.015 - Math.cos(lean) * d - r * 0.8, z);
  };
  // across the rear
  const cz = z1 - 0.01, span = hw * 2 - 0.08, n = Math.max(12, Math.round(span / 0.05)) + 1, pitch = span / (n - 1);
  P.add(slot, box(hw * 2, 0.035, 0.035), 0, floor, cz);
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1 && jit(i, 1) > 0.40) continue;
    chain(i, -hw + 0.04 + i * pitch + jit(i, 2) * pitch * 0.3, cz + jit(i, 5) * 0.01);
  }
  // and down both sides, from the rear corner to the bustle
  const sn = Math.max(6, Math.round((depth - 0.06) / 0.05)), sp = (depth - 0.06) / sn;
  for (const side of [-1, 1]) {
    P.add(slot, box(0.035, 0.035, depth), side * (hw - 0.01), floor, (z0 + z1) / 2);
    for (let k = 1; k <= sn; k++) {
      const i = 100 + k * 2 + (side > 0 ? 1 : 0);
      if (jit(i, 1) > 0.45) continue;
      chain(i, side * (hw - 0.01) + jit(i, 2) * 0.01, z1 + 0.02 + k * sp + jit(i, 5) * sp * 0.3);
    }
  }
}

// The fleet MAG at scale 1 (FITTINGS.pintleMG cls 'mag', measured): from 0.308 behind its pintle to 0.951 ahead of it.
const FLEET_MAG = Object.freeze({ rearZ: -0.308, length: 1.260 });

/** The working roof machine guns at their measured mounts, scaled to the source gun's span, and the whip antennas at
 *  their measured feet and heights (the Mk 4's two short width rods stand on the hull's front corners). */
export function buildMerkavaRoofWeapons(P: TankBuilderPort, shell: readonly ShellSolid[],
  guns: readonly (readonly [number, number, number, number, number])[],
  antennas: readonly (readonly [number, number, number, number])[], pivot: readonly [number, number]): void {
  const [py, pz] = pivot;
  guns.forEach(([x, foot, z, z0, z1], i) => {
    // working crew stations (the coordinator's VH.14 ruling: every drawn roof gun works), on the fleet's riding cradle at
    // the measured mount, on its pintle post down to the shell (the Mk 1's left gun stands 0.35 m over its sloped
    // shoulder); the gun spans the source gun's z0..z1
    const scale = (z1 - z0) / FLEET_MAG.length;
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale, seed: 904, tone: 'two-tone', ammo: true,
      shield: false, ring: false, working: true, ridingCradle: true });
    mg.name = `merkavaRoofMag${i + 1}`;
    const surface = turretSurfaceAt(shell, x, z), seat = Math.max(foot, surface);
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
