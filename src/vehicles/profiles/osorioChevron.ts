// The EE-T3 and EE-T4 Osório's chevron wedges (brazil-kit-274; owner 2026-11-20: "for the eet3 osorio, osorio t4, make
// the front turret attachment things in front of cheeks chevrons like the leopard 2a4 instead of those weird add ons
// because they look kind of goofy"). Our plain Leopard 2A4 keeps the square block; the arrowhead lives on the 2A4M
// (LEOPARD2A4_FAMILY_FRONT 'wedge': the 2A6 X's measured wedge on the 2A4 core, leopard2A4Wedge.ts), and this is its
// construction on the Osório's Vickers turret: one wedge a side, from just ahead of the gunner's sight to a blunt tip
// beside the mantlet. In plan it carries the side armour's outer face forward, turns a little in, then runs its swept
// face to the tip at the gun slot; its top is the lowest of three planes (the 2A6 X's cheekRoof): the flat roof, the
// front slope falling about 32 degrees toward the face and the outer bevel falling about 58 degrees to the side face;
// its floor rises toward the tip (a6Floor). Strips are cut along the planes' meeting lines and stations set at every
// kink and crossing, so every face is exactly planar. Turret metres; first-party geometry: Kevin B. Liu (NOTICE.md).
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Where the wedges' roots stand (turret z): 2 cm ahead of the gunner's sight head and its visor. */
export const CHEVRON_ROOT_Z = 0.88;

export interface OsorioChevron {
  /** The gun slot's half width (the inner face), the roof the wedge's top meets, the floor at its root. */
  readonly innerX: number; readonly roofY: number; readonly floorY: number;
  /** The plan: the turn where the side run steps in, the shoulder where the face begins, the tip (x, z). */
  readonly turnZ: number; readonly shoulder: readonly [number, number]; readonly tip: readonly [number, number];
  /** The face's top edge, the front slope and outer bevel (dy per metre), the bevel's run in from the outer face. */
  readonly faceTopY: number; readonly frontSlope: number; readonly bevelSlope: number; readonly bevelRun: number;
  /** The floor's rise per metre past the turn. */
  readonly floorRise: number;
}

/** A plane y = a + bx * |x| + bz * z. */
interface Plane { readonly a: number; readonly bx: number; readonly bz: number }
const at = (p: Plane, x: number, z: number): number => p.a + p.bx * x + p.bz * z;

/** One wedge on side s (+1 the left, +X), its outer face at the side armour's outer face `outerX` at the root. */
export function addOsorioChevron(P: TankBuilderPort, s: 1 | -1, c: OsorioChevron, outerX: number): void {
  const z0 = CHEVRON_ROOT_Z, [xs, zs] = c.shoulder, [xt, zt] = c.tip, xi = c.innerX;
  const outer = (z: number): number => {
    if (z <= c.turnZ) return outerX + (z - z0) / (c.turnZ - z0) * -0.02;
    if (z <= zs) return outerX - 0.02 + (z - c.turnZ) / (zs - c.turnZ) * (xs - outerX + 0.02);
    return xs + (z - zs) / (zt - zs) * (xt - xs);
  };
  const floor = (z: number): number => c.floorY + Math.max(0, z - c.turnZ) * c.floorRise;
  // the face's plan normal (forward and out) and the front slope rising behind it from the face's top edge
  const ul = Math.hypot(xs - xt, zs - zt), nx = -(zs - zt) / ul, nz = (xs - xt) / ul;
  const roof: Plane = { a: c.roofY + 0.02 * z0, bx: 0, bz: -0.02 };
  const front: Plane = { a: c.faceTopY + c.frontSlope * (xt * nx + zt * nz), bx: -c.frontSlope * nx, bz: -c.frontSlope * nz };
  const bevelX = outerX - c.bevelRun;
  const bevel: Plane = { a: c.roofY + c.bevelSlope * bevelX, bx: -c.bevelSlope, bz: 0 };
  const planes = [roof, front, bevel];
  const top = (x: number, z: number): number => Math.max(floor(z) + 0.02, Math.min(...planes.map((p) => at(p, x, z))));
  // where two planes meet at z (|x|), clamped to the wedge's width
  const meet = (p: Plane, q: Plane, z: number): number => (q.a - p.a + (q.bz - p.bz) * z) / (p.bx - q.bx);
  const pairs: Array<readonly [Plane, Plane]> = [[roof, front], [roof, bevel], [front, bevel]];
  const lines = (z: number): number[] => [xi, ...pairs.map(([p, q]) => meet(p, q, z)), outer(z)];
  // stations: the plan's kinks and every z where two of the lines cross (each line is straight between kinks)
  const kinks = [z0, c.turnZ, zs, zt];
  const zsAll = new Set<number>(kinks);
  for (let k = 0; k + 1 < kinks.length; k++) {
    const za = kinks[k], zb = kinks[k + 1], la = lines(za), lb = lines(zb);
    for (let i = 0; i < la.length; i++) for (let j = i + 1; j < la.length; j++) {
      const da = la[i] - la[j], db = lb[i] - lb[j];
      if (da * db < 0) zsAll.add(za + (zb - za) * da / (da - db));
    }
  }
  const stations = [...zsAll].sort((p, q) => p - q).filter((z, k, all) => k === 0 || z - all[k - 1] > 1e-4);
  const cuts = stations.map((z) => {
    const o = outer(z), mid = lines(z).slice(1, 4).map((x) => Math.min(o, Math.max(xi, x))).sort((p, q) => p - q);
    return { z, xs: [xi, ...mid, o] };
  });
  for (let strip = 0; strip < 4; strip++) {
    if (cuts.every(({ xs: x }) => x[strip + 1] - x[strip] < 1e-3)) continue;
    P.add('turret', sectionSolid(cuts.map(({ z, xs: x }) => {
      let a = x[strip], b = x[strip + 1];
      if (b - a < 1e-3) { if (b >= x[4] - 1e-6) a = b - 1e-3; else b = a + 1e-3; }
      const left = s > 0 ? a : -b, right = s > 0 ? b : -a, f = floor(z);
      const ring: SectionPoint[] = [[left, f], [right, f], [right, top(Math.abs(right), z)], [left, top(Math.abs(left), z)]];
      return { z, ring };
    })));
  }
  // a dark trim along the face's top edge and the side run's, so the arrowhead reads in plan; a lifting eye on the flat
  const edge = (x: number, z: number): [number, number, number] => [s * x, top(x, z) + 0.002, z];
  P.add('turretDark', beamBetween(edge(xs - 0.01, zs), edge(xt + 0.004, zt - 0.006), 0.010, 8));
  P.add('turretDark', beamBetween(edge(outerX - 0.012, z0 + 0.01), edge(outer(c.turnZ) - 0.012, c.turnZ), 0.010, 8));
  P.add('turretDark', beamBetween(edge(outer(c.turnZ) - 0.012, c.turnZ), edge(xs - 0.01, zs), 0.010, 8));
  KIT.liftEye(P, 'turretDetail', s * (xi + 0.30), top(xi + 0.30, z0 + 0.14) + 0.005, z0 + 0.14, s * 0.4);
}
