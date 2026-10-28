// Merkava family turrets (release 262). The cast-and-welded shell lofted through the measured stations of the mark's
// source (merkavaFamilySource.ts: the Mk 1 and Mk 2's turret with its rounded base "ears" and narrowing nose; the Mk 3's
// flat-sided core; the Mk 4's broad stepped turret), its ring collar, the bustle basket and its ball-and-chain curtain,
// the working roof machine guns at their measured mounts and the whip antennas. The hatches, sights, add-on armour,
// smoke launchers and stowage are the measured detail parts (merkavaFamilyDetails.ts). Turret frame: the ring centre at
// deck height, +Z forward.
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** A measured turret station: the shell's half-width up its side from the base course, and the roof's crown (hull frame). */
export interface TurretRing {
  readonly z: number;
  readonly side: readonly (readonly [halfWidth: number, y: number])[];
  readonly crown: number;
}

/** The cast shell lofted through the measured stations, in the turret frame (pivot subtracted): up the right side, over
 *  the crown, down the left; and its ring collar over the race. */
export function buildMerkavaRingShell(P: TankBuilderPort, rings: readonly TurretRing[], pivot: readonly [number, number]): void {
  const [py, pz] = pivot;
  const sections: SolidSection[] = rings.map((r) => {
    const side = r.side.map(([x, y]): SectionPoint => [Math.max(0.03, x), y - py]);
    const top = side[side.length - 1]!;
    const crown: SectionPoint = [0, Math.max(r.crown - py, top[1] + 0.004)];
    const left = side.map(([x, y]): SectionPoint => [-x, y]).reverse();
    return { z: r.z - pz, ring: [...side, crown, ...left] };
  });
  P.add('turret', sectionSolid(sections, { sideQuadDiagonal: 'convex' }));
  // the ring collar: from the deck up into the shell's base course, round the race
  const base = Math.min(...rings.map((r) => r.side[0]![1])) - py;
  const collarR = Math.min(1.05, ...rings.filter((r) => Math.abs(r.z - pz) < 0.4).map((r) => r.side[0]![0] - 0.04));
  const h = Math.max(0.06, base + 0.06);
  P.add('turret', KIT.cylY(collarR, collarR + 0.02, h, P.q ? 40 : 24), 0, h / 2 - 0.02, 0);
}

/** The roof's height under (x, z) in the hull frame: the measured station's side, interpolated up to its crown. */
export function turretRoofAt(rings: readonly TurretRing[], x: number, z: number): number {
  let best = rings[0]!;
  for (const r of rings) if (Math.abs(r.z - z) < Math.abs(best.z - z)) best = r;
  const top = best.side[best.side.length - 1]!;
  const u = Math.min(1, Math.abs(x) / Math.max(1e-6, top[0]));
  return best.crown + (top[1] - best.crown) * u;
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
  const cz = z1 - 0.01, span = hw * 2 - 0.08, n = Math.max(12, Math.round(span / 0.05)) + 1, pitch = span / (n - 1), drop = 0.42;
  P.add(slot, box(hw * 2, 0.035, 0.035), 0, floor, cz);
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1 && jit(i, 1) > 0.40) continue;
    const x = -hw + 0.04 + i * pitch + jit(i, 2) * pitch * 0.3;
    const d = drop * (1 + jit(i, 3) * 0.3), lean = jit(i, 4) * 0.06, z = cz + jit(i, 5) * 0.01;
    P.add('turretOpenLatticeDark', box(0.008, d, 0.008), x + Math.sin(lean) * d / 2, floor - 0.015 - Math.cos(lean) * d / 2, z, 0, 0, lean);
    const r = 0.02 * (1 + jit(i, 6) * 0.3);
    P.add('turretOpenLatticeDark', KIT.sph(r, 7), x + Math.sin(lean) * d, floor - 0.015 - Math.cos(lean) * d - r * 0.8, z);
  }
}

/** The working roof machine guns at their measured mounts, and the whip antennas (hull frame numbers). */
export function buildMerkavaRoofWeapons(P: TankBuilderPort, rings: readonly TurretRing[],
  guns: readonly (readonly [number, number, number])[], antennas: readonly (readonly [number, number, number])[],
  pivot: readonly [number, number]): void {
  const [py, pz] = pivot;
  guns.forEach(([x, foot, z], i) => {
    // working crew stations (the coordinator's VH.14 ruling: every drawn roof gun works), on the fleet's riding cradle
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: 0.72, seed: 904, tone: 'two-tone', ammo: true,
      shield: false, ring: false, working: true, ridingCradle: true });
    mg.name = `merkavaRoofMag${i + 1}`;
    mg.position.set(x, Math.min(foot, turretRoofAt(rings, x, z) + 0.12) - py, z - pz);
    P.turretG.add(mg);
  });
  antennas.forEach(([x, z, h], i) => {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, seed: 262 + i });
    whip.position.set(x, turretRoofAt(rings, x, z) - py, z - pz);
    P.turretG.add(whip);
  });
}
