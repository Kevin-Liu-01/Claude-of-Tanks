// The leopardX frontal wedges: one source for the drawn wedge (profiles/leopardX.ts lofts it from these sections) and
// its armour (sourceXFleetSpecs.ts fits the spaced turret_wedge plates on them), so the plates cannot drift off the
// wedge again. Boot-light: numbers and plate arithmetic only, no geometry library.
// (Release 266, Main 2026-10-31: a visual wedge with no wedge plates where it is drawn lets its hits fall through to
// whichever main plate is nearest; the 2A5M had none, and the 2A6M's and 2A7V's donor pairs sat behind their cheeks.)
import type { ArmorPlate, Vec3Tuple } from './specHelpers.ts';

/** [z, left x, right x, bottom y, top y], hull-frame metres. */
export type WedgeStation = readonly [z: number, left: number, right: number, bottom: number, top: number];

export interface LeopardXWedge {
  /** The root as an outline (hull-frame x, y at z) when it is not a plain station: the 2A7V's sits in its cheeks' mouth. */
  readonly root?: { readonly z: number; readonly outline: readonly (readonly [number, number])[] };
  readonly stations: readonly WedgeStation[];
}

export const LEOPARD_X_WEDGES: {
  readonly leo2a7v: Required<LeopardXWedge>;
  readonly leo2a6m: LeopardXWedge;
  readonly leo2a5m: LeopardXWedge;
} = Object.freeze({
  // its root inside the mouth of the forward cheeks: the left cheek, the optic pocket's floor (top 2.34) and the right
  // cheek's ridge, its underside rising and its top falling outboard (a7ForwardCheek's z 2.51 row)
  leo2a7v: {
    root: { z: 2.50, outline: [[-1.18, 1.935], [.10, 1.935], [1.15, 2.165], [1.15, 2.20], [.10, 2.335], [-1.02, 2.335],
      [-1.235, 2.30], [-1.235, 1.96]] },
    stations: [[2.82, -.72, .77, 2.016, 2.286], [3.11, -.22, .29, 2.146, 2.181]],
  },
  // (the owner 2026-10-30: the wedge's root inside the cheeks' mouths, x -1.105 to 0.973 from 1.898; it stood 17 cm past
  // the right cheek)
  leo2a6m: {
    stations: [[2.42, -1.10, .965, 1.902, 2.298], [2.95, -.60, .64, 2.038, 2.219], [3.28, -.20, .29, 2.104, 2.126]],
  },
  // (the owner 2026-10-30: the wedge's root inside the cheeks' mouths, x -1.187 to 1.065 from their raised 1.835, under
  // the optic floor's 2.108; it hung 9 cm under them and past both, the interior fill showing through the gap)
  leo2a5m: {
    stations: [[2.27, -1.18, 1.06, 1.845, 2.10], [2.70, -.76, .63, 1.813, 2.139], [3.02, .10, .16, 1.978, 1.997]],
  },
} as const);

export type LeopardXWedgeId = keyof typeof LEOPARD_X_WEDGES;

/** One section's outer edges [x, y low, y high] per side and its centre line [y low, y high] at x 0. */
interface Course { readonly z: number; readonly L: readonly [number, number, number];
  readonly R: readonly [number, number, number]; readonly centre: readonly [number, number] }

function stationCourse([z, left, right, bottom, top]: WedgeStation): Course {
  return { z, L: [left, bottom, top], R: [right, bottom, top], centre: [bottom, top] };
}

function rootCourse({ z, outline }: NonNullable<LeopardXWedge['root']>): Course {
  const edge = (x: number): [number, number, number] => {
    const ys = outline.filter((p) => p[0] === x).map((p) => p[1]);
    return [x, Math.min(...ys), Math.max(...ys)];
  };
  const xs = outline.map((p) => p[0]);
  // the outline's crossings of the centre line
  const ys: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i], [bx, by] = outline[(i + 1) % outline.length];
    if ((ax - 0) * (bx - 0) <= 0 && ax !== bx) ys.push(ay + (by - ay) * (0 - ax) / (bx - ax));
  }
  return { z, L: edge(Math.min(...xs)), R: edge(Math.max(...xs)), centre: [Math.min(...ys), Math.max(...ys)] };
}

/** How far the upper plate runs back from the root to the roof line, as the 2A5's chevron upper plates do. */
const UPPER_RUN_M = 0.6;

/**
 * The spaced turret_wedge_L/R plates on a drawn wedge, in the turret frame: per side and per course, the outer face and
 * the top and bottom faces to the centre line; and the chevron's upper plate from the root's top edge back and up to the
 * roof line across the cheek width (the 2A5's chevrons cover the upper front the same way). A frontal ray that meets
 * the drawn wedge meets one of these first.
 */
export function leopardXWedgePlates(
  id: LeopardXWedgeId,
  turretPivot: Vec3Tuple,
  ratings: Pick<ArmorPlate, 'physicalMm' | 'keMm' | 'ceMm'>,
  frame: { readonly roofY: number; readonly cheekHalfWidth: number },
): ArmorPlate[] {
  const wedge: LeopardXWedge = LEOPARD_X_WEDGES[id];
  const courses = [...(wedge.root ? [rootCourse(wedge.root)] : []), ...wedge.stations.map(stationCourse)];
  const local = ([x, y, z]: Vec3Tuple): [number, number, number] => [x - turretPivot[0], y - turretPivot[1], z - turretPivot[2]];
  const plates: ArmorPlate[] = [];
  const plate = (side: 'L' | 'R', verts: Vec3Tuple[]): void => {
    plates.push({ name: `turret_wedge_${side}`, verts: verts.map(local), physicalMm: ratings.physicalMm,
      keMm: ratings.keMm, ceMm: ratings.ceMm, kind: 'spaced', era: null, moduleLink: null, gunFollow: false });
  };
  for (const side of ['L', 'R'] as const) {
    for (let i = 0; i < courses.length - 1; i++) {
      const a = courses[i], b = courses[i + 1], [ax, ay0, ay1] = a[side], [bx, by0, by1] = b[side];
      plate(side, [[ax, ay0, a.z], [bx, by0, b.z], [bx, by1, b.z], [ax, ay1, a.z]]);
      plate(side, [[ax, ay1, a.z], [bx, by1, b.z], [0, b.centre[1], b.z], [0, a.centre[1], a.z]]);
      plate(side, [[ax, ay0, a.z], [0, a.centre[0], a.z], [0, b.centre[0], b.z], [bx, by0, b.z]]);
    }
    const root = courses[0], [, , top] = root[side];
    const outer = (side === 'L' ? -1 : 1) * frame.cheekHalfWidth + turretPivot[0];
    const roofY = frame.roofY + turretPivot[1], back = root.z - UPPER_RUN_M;
    plate(side, [[outer, top, root.z], [0, root.centre[1], root.z], [0, roofY, back], [outer, roofY, back]]);
  }
  return plates;
}

// ------------------------------------------------------------------------------------------------- the source 2A6 --
// The source-measured 2A6's leading cheeks (profiles/leopardA6X.ts lofts them from these): each falls outward as well as
// forward and sweeps in from its shoulder at z 2.413 to a tip short of the gun throat, so its wedge is the cheek's
// forward part, not a separate solid. leo2a6 and leo2a6_ua draw it; their plates fit on it here.

export interface LeopardA6Cheek {
  readonly side: 1 | -1;
  /** |x| of its inner edge: neither half crosses the real gun throat */
  readonly inner: number;
  readonly broad: number;
  readonly shoulder: number;
  /** the station where the broad face starts turning in */
  readonly turn: number;
}

export const LEOPARD_A6_CHEEKS: readonly LeopardA6Cheek[] = Object.freeze([
  { side: 1, inner: .259, broad: 1.393745, shoulder: 1.176925, turn: 1.904985 },
  { side: -1, inner: .196995, broad: 1.491045, shoulder: 1.274225, turn: 1.833575 },
]);

/** THREE.MathUtils.lerp, bit for bit (the cheeks are drawn with it). */
const lerp = (x: number, y: number, t: number): number => (1 - t) * x + t * y;

/** The cheek's lofted stations, hull-frame z. */
export function leopardA6CheekStations(c: LeopardA6Cheek): number[] {
  return [1.095, 1.5634, c.turn, 2.24, 2.413, 2.616, 3.1427];
}

/** |x| of the cheek's outer face at z: broad, easing in to the shoulder by 2.413, then swept in to the tip. */
export function leopardA6CheekOuter(c: LeopardA6Cheek, z: number): number {
  let outer = c.broad;
  if (z > 1.5634 && z <= c.turn) outer = lerp(c.broad, c.broad - .018, (z - 1.5634) / (c.turn - 1.5634));
  if (z > c.turn && z <= 2.413) outer = lerp(c.broad - .018, c.shoulder, (z - c.turn) / (2.413 - c.turn));
  if (z > 2.413) outer = lerp(c.shoulder, c.inner + .002, (z - 2.413) / (3.1452 - 2.413));
  return outer;
}

/** The cheek's floor at z, rising forward of the ring. */
export function leopardA6CheekFloor(z: number): number {
  return 1.69774 + Math.max(0, z - 1.905) * .229;
}

/** The cheek's roof at hull-frame (x, z): the lowest of its three measured planes. */
export function leopardA6CheekRoof(side: number, x: number, z: number): number {
  if (side > 0) return Math.min(
    (2.41496517 - .02096949 * x - .02873983 * z) / .99936695,
    (3.11507045 - .26781475 * x - .40417141 * z) / .87459747,
    (2.23276603 - .86978401 * x - .03448941 * z) / .49222582);
  return Math.min(
    (2.43833975 + .02484870 * x - .03993549 * z) / .99889324,
    (3.12201470 + .27490637 * x - .41942070 * z) / .86516632,
    (2.31739595 + .86978401 * x - .03448941 * z) / .49222582);
}

/**
 * The spaced turret_wedge_L/R plates on the 2A6's swept cheeks, in the turret frame: per side and per course from the
 * shoulder to the tip, the outer face, the top and the floor to its inner edge; and an upper plate on the cheek's top
 * from the shoulder back over the cheek's width, as the leopardX wedges and the 2A5's chevrons have.
 */
export function leopardA6WedgePlates(turretPivot: Vec3Tuple, ratings: Pick<ArmorPlate, 'physicalMm' | 'keMm' | 'ceMm'>): ArmorPlate[] {
  const local = ([x, y, z]: Vec3Tuple): [number, number, number] => [x - turretPivot[0], y - turretPivot[1], z - turretPivot[2]];
  const plates: ArmorPlate[] = [];
  for (const c of LEOPARD_A6_CHEEKS) {
    const name = `turret_wedge_${c.side < 0 ? 'L' : 'R'}`;
    const plate = (verts: Vec3Tuple[]): void => {
      plates.push({ name, verts: verts.map(local), physicalMm: ratings.physicalMm, keMm: ratings.keMm, ceMm: ratings.ceMm,
        kind: 'spaced', era: null, moduleLink: null, gunFollow: false });
    };
    const edge = (x: number, z: number): { lo: Vec3Tuple; hi: Vec3Tuple } => {
      const floor = leopardA6CheekFloor(z), sx = c.side * x;
      return { lo: [sx, floor, z], hi: [sx, Math.max(floor + .001, leopardA6CheekRoof(c.side, sx, z)), z] };
    };
    const courses = [2.413, 2.616, 3.1427];
    for (let i = 0; i < courses.length - 1; i++) {
      const za = courses[i], zb = courses[i + 1];
      const oa = edge(leopardA6CheekOuter(c, za), za), ob = edge(leopardA6CheekOuter(c, zb), zb);
      const ia = edge(c.inner, za), ib = edge(c.inner, zb);
      plate([oa.lo, ob.lo, ob.hi, oa.hi]);
      plate([oa.hi, ob.hi, ib.hi, ia.hi]);
      plate([oa.lo, ia.lo, ib.lo, ob.lo]);
    }
    const front = 2.413, back = front - UPPER_RUN_M;
    const of = edge(leopardA6CheekOuter(c, front), front), inf = edge(c.inner, front);
    const ob = edge(leopardA6CheekOuter(c, back), back), ib = edge(c.inner, back);
    plate([of.hi, inf.hi, ib.hi, ob.hi]);
  }
  return plates;
}
