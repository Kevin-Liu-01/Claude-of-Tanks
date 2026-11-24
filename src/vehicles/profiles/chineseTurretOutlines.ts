// Release 276 (Kevin 2026-11-24: "clean up and redesign the vt 4a1 ztz 99a2 and ztz99a turrets which are a little messy
// esp with cheeks"): one turret plan outline per id. The ZTZ-99A2, the ZTZ-99A and the VT-4A1 each loft their whole
// turret shell (body and cheek modules) from these rings as ONE closed solid (chineseTurretSolid.ts), their face tiles
// are seated on its planar faces, and their combat plates (type99Armor.ts) are read from the same key points, so the
// drawn cheeks and the traced armour cannot drift apart. Pure data: the spec registry reads it without loading three.
//
// Why the old cheeks were messy: each cheek was a stack of separately typed pieces with no shared outline (a loft
// shell that stopped at one plan line, a "closed chevron" lofted from six hand-typed stations that ignored it, thin
// cassettes sampled along the chevron, and on the ZTZ-99A loose beak prisms and boxes), so they crossed, overhung and
// left slivers at every join.
//
// Photographs (reference only, never shipped): Wikimedia Commons "ZTZ-99A tank front 20170902.jpg", "ZTZ-99A tank front
// right 20170902.jpg", "ZTZ-99A MBT 20170902.jpg" (the Military Museum, Beijing); "NORINCO VT-4 at IDEX 2017.jpg".
// Gap tables: docs/references/tanks/ztz99a2.md and vt4a1.md.
// First-party: Kevin B. Liu (NOTICE.md).

/** A turret-frame point (x right, y up from the turret's seat, z forward). */
export type OutlinePoint = readonly [x: number, y: number, z: number];
/** A plan point (x, z). */
export type PlanPoint = readonly [x: number, z: number];

/** One closed ring of the turret's plan, stacked upward: the full ring, counter-clockwise seen from below (+x to +z). */
export type OutlineRing = readonly OutlinePoint[];

export interface TurretOutline {
  readonly id: 'ztz99a2' | 'ztz99a' | 'vt4a1';
  /** Bottom to roof; every ring has the same vertex count and correspondence. */
  readonly rings: readonly OutlineRing[];
  /** The right cheek's key points in plan: the inner tip 1 cm outside the gun channel's wall (a vertex on the wall would
   * put the channel cut through an edge of the solid; the level 1 cm stub inboard of it is what the cut crosses), the front corner (the arrowhead's
   * break or the box's chamfer start) and the side join where the cheek meets the turret's side wall. */
  readonly cheek: { readonly tip: PlanPoint; readonly corner: PlanPoint; readonly side: PlanPoint };
  /** The cheek's section: its floor, the top of its vertical front band, the roof, and how far back (z) the front
   * line stands at the roof (the sloped upper face's run); `underRun` pulls the floor's front line back (an undercut
   * chamfer, the VT-4's). A short run over a tall band is a top bevel (the VT-4's) rather than a sloped face. */
  readonly section: {
    readonly floorY: number; readonly bandTopY: number; readonly roofY: number;
    readonly slopeRun: number; readonly underRun: number;
  };
  /** Half width of the gun channel the throat cut opens (chineseGunOpening.ts). */
  readonly channelHalfX: number;
}

interface HalfPlanVertex {
  readonly x: number;
  readonly z: number;
  /** floor y at this vertex */
  readonly floor: number;
  /** the side-wall course (belt) y; the face is vertical from the floor to here */
  readonly belt: number;
  /** true: a cheek-front vertex (moves back with the sloped face); false: a body vertex (insets at the roof) */
  readonly front: boolean;
}

/** Builds full rings from the right half (centre front to centre rear, x >= 0), mirroring the left half. */
function ringsFromHalf(half: readonly HalfPlanVertex[], s: TurretOutline['section'], roofInset: number,
  roofY: (v: HalfPlanVertex) => number): OutlineRing[] {
  const level = (fn: (v: HalfPlanVertex) => OutlinePoint): OutlineRing => {
    const right = half.map(fn);
    const left = right.slice(1, -1).reverse().map(([x, y, z]) => [-x, y, z] as const);
    return Object.freeze([...right, ...left].map((p) => Object.freeze(p) as OutlinePoint));
  };
  const rings: OutlineRing[] = [];
  // the floor: the front line pulled back by underRun (an undercut chamfer) when one is set
  rings.push(level((v) => [v.x, v.floor, v.front ? v.z - s.underRun : v.z]));
  if (s.underRun > 0) rings.push(level((v) => [v.x, Math.max(v.floor + 0.04, s.floorY + 0.10), v.z]));
  // the vertical front band and side belt
  rings.push(level((v) => [v.x, v.front ? s.bandTopY : Math.max(v.belt, v.floor + 0.05), v.z]));
  rings.push(level((v) => {
    const y = roofY(v);
    if (v.front) return [v.x, y, v.z - s.slopeRun];
    // body vertices: inset toward the turret's centre line and long axis at the roof
    const r = Math.hypot(v.x, 0) > 1e-6 ? roofInset : 0;
    return [v.x - Math.sign(v.x) * r, y, v.z + (v.z < -1.0 ? roofInset : 0)];
  }));
  return rings;
}

// ---------------------------------------------------------------------------------------------------------------------
// ZTZ-99A2 (the production 99A as photographed, 2015 on): arrowhead cheek modules. The front face runs from the mantlet
// notch outward and back about 24 degrees, the outer face steeply back (about 61 degrees) to the side wall; a vertical
// lower band (the bottom tile row) under a long sloped top (two tile rows) that climbs to the roof. The cheeks' floor
// stands on the turret seat's plane over this hull (turretSeatRace.ts: 0.154 under the cheeks), so the seat lifts none
// of it and the band keeps its drawn height.
// Turret frame: the 99A2 ring, pivot (0, 1.56, 0.12) in the hull; gun trunnion (0, 0.38, 0.78).
// ---------------------------------------------------------------------------------------------------------------------
const ZTZ99A2_SECTION = Object.freeze({ floorY: 0.155, bandTopY: 0.40, roofY: 0.815, slopeRun: 0.58, underRun: 0 });
const ZTZ99A2_HALF: readonly HalfPlanVertex[] = Object.freeze([
  { x: 0, z: 1.68, floor: 0.155, belt: 0.4, front: true },
  { x: 0.41, z: 1.68, floor: 0.155, belt: 0.4, front: true }, // tip: 1 cm outside the gun channel's wall
  { x: 1.06, z: 1.38, floor: 0.155, belt: 0.4, front: true }, // the arrowhead's front corner
  { x: 1.56, z: 0.34, floor: 0.155, belt: 0.4, front: true }, // the side join
  { x: 1.56, z: -0.30, floor: 0.05, belt: 0.40, front: false },
  { x: 1.50, z: -1.50, floor: 0.18, belt: 0.43, front: false },
  { x: 1.18, z: -2.22, floor: 0.44, belt: 0.49, front: false },
  { x: 0.82, z: -2.22, floor: 0.44, belt: 0.49, front: false },
  { x: 0, z: -2.22, floor: 0.44, belt: 0.49, front: false },
]);
export const ZTZ99A2_TURRET_OUTLINE: TurretOutline = Object.freeze({
  id: 'ztz99a2',
  rings: Object.freeze(ringsFromHalf(ZTZ99A2_HALF, ZTZ99A2_SECTION, 0.07, () => ZTZ99A2_SECTION.roofY)),
  cheek: Object.freeze({ tip: [0.41, 1.68] as const, corner: [1.06, 1.38] as const, side: [1.56, 0.34] as const }),
  section: ZTZ99A2_SECTION,
  channelHalfX: 0.40,
});

// ---------------------------------------------------------------------------------------------------------------------
// ZTZ-99A (the early, pre-production 99A; Kevin 2026-11-24 via Main): the same arrowhead method on its own blunter
// outline and taller band, a bare welded slope, and one row of large tiles on the band. Turret frame: pivot (0, 1.56,
// -0.15) in the hull; gun trunnion (0, 0.39, 0.75); roof 0.89.
// ---------------------------------------------------------------------------------------------------------------------
const ZTZ99A_SECTION = Object.freeze({ floorY: 0.16, bandTopY: 0.45, roofY: 0.89, slopeRun: 0.50, underRun: 0 });
const ZTZ99A_HALF: readonly HalfPlanVertex[] = Object.freeze([
  { x: 0, z: 1.60, floor: 0.16, belt: 0.45, front: true },
  { x: 0.41, z: 1.60, floor: 0.16, belt: 0.45, front: true },
  { x: 1.00, z: 1.20, floor: 0.16, belt: 0.45, front: true },
  { x: 1.50, z: 0.20, floor: 0.16, belt: 0.45, front: true },
  { x: 1.54, z: -0.60, floor: 0.03, belt: 0.42, front: false },
  // the bustle's underside rises aft, as the production A2's does, to clear the engine deck's louvres (release 240)
  { x: 1.38, z: -1.55, floor: 0.24, belt: 0.46, front: false },
  { x: 0.62, z: -1.72, floor: 0.24, belt: 0.46, front: false },
  { x: 0, z: -1.72, floor: 0.24, belt: 0.46, front: false },
]);
export const ZTZ99A_TURRET_OUTLINE: TurretOutline = Object.freeze({
  id: 'ztz99a',
  rings: Object.freeze(ringsFromHalf(ZTZ99A_HALF, ZTZ99A_SECTION, 0.08, () => ZTZ99A_SECTION.roofY)),
  cheek: Object.freeze({ tip: [0.41, 1.60] as const, corner: [1.00, 1.20] as const, side: [1.50, 0.20] as const }),
  section: ZTZ99A_SECTION,
  channelHalfX: 0.40,
});

// ---------------------------------------------------------------------------------------------------------------------
// VT-4A1 (NORINCO VT-4 photographs): flat-faced welded box modules. The front face stands nearly square to the bore
// (about 5 degrees), a 45-degree chamfer turns the outer corner to the vertical side wall, a narrow bevel runs along the
// top front edge and an undercut chamfer along the bottom one. Turret frame: pivot (0, 1.56, 0.40); gun trunnion
// (0, 0.3198, 0.75); roof 0.76 (the r5 roof bridge's top, which the sights, hatch and warning heads stand on).
// ---------------------------------------------------------------------------------------------------------------------
const VT4A1_SECTION = Object.freeze({ floorY: 0.155, bandTopY: 0.60, roofY: 0.76, slopeRun: 0.13, underRun: 0.09 });
const VT4A1_HALF: readonly HalfPlanVertex[] = Object.freeze([
  { x: 0, z: 1.70, floor: 0.155, belt: 0.6, front: true },
  { x: 0.41, z: 1.70, floor: 0.155, belt: 0.6, front: true },
  { x: 1.22, z: 1.62, floor: 0.155, belt: 0.6, front: true },
  { x: 1.58, z: 1.26, floor: 0.155, belt: 0.6, front: true },
  { x: 1.60, z: -0.58, floor: 0.03, belt: 0.60, front: false },
  // the bustle (the r5 shell's plan; its underside rises 0.30 m aft over the engine deck, release 240)
  { x: 1.54, z: -1.58, floor: 0.03, belt: 0.60, front: false },
  { x: 1.38, z: -2.22, floor: 0.03 + 0.30 * (2.22 - 1.58) / 1.10, belt: 0.60, front: false },
  { x: 0.82, z: -2.48, floor: 0.03 + 0.30 * (2.48 - 1.58) / 1.10, belt: 0.60, front: false },
  { x: 0, z: -2.52, floor: 0.03 + 0.30 * (2.52 - 1.58) / 1.10, belt: 0.60, front: false },
]);
export const VT4A1_TURRET_OUTLINE: TurretOutline = Object.freeze({
  id: 'vt4a1',
  rings: Object.freeze(ringsFromHalf(VT4A1_HALF, VT4A1_SECTION, 0.05, () => VT4A1_SECTION.roofY)),
  cheek: Object.freeze({ tip: [0.41, 1.70] as const, corner: [1.22, 1.62] as const, side: [1.58, 1.26] as const }),
  section: VT4A1_SECTION,
  channelHalfX: 0.40,
});

export const CHINESE_TURRET_OUTLINES = Object.freeze({
  ztz99a2: ZTZ99A2_TURRET_OUTLINE, ztz99a: ZTZ99A_TURRET_OUTLINE, vt4a1: VT4A1_TURRET_OUTLINE,
});

export type CheekFace = 'front' | 'outer';
/** The undercut chamfer under the band (only with an underRun), the vertical band, or the sloped top to the roof. */
export type CheekCourse = 'under' | 'band' | 'slope';

/** A cheek face's four corners in the turret frame, [bottom-inner, bottom-outer, top-outer, top-inner], read straight
 * from the outline's rings: the front face runs tip to corner, the outer face corner to side join. Planar by
 * construction (each course's front vertices move by one common vector between its two rings). */
export function cheekFaceQuad(o: TurretOutline, side: 1 | -1, face: CheekFace, course: CheekCourse): OutlinePoint[] {
  const bottom = o.section.underRun > 0 ? 1 : 0, roof = o.rings.length - 1;
  if (course === 'under' && bottom === 0) throw new Error(`${o.id}: no undercut course`);
  const [lo, hi] = course === 'under' ? [0, 1] : course === 'band' ? [bottom, bottom + 1] : [bottom + 1, roof];
  const halfLength = (o.rings[0].length + 2) / 2;
  const at = (k: number): number => (side > 0 ? k : 2 * halfLength - 2 - k);
  const [inner, outer] = face === 'front' ? [at(1), at(2)] : [at(2), at(3)];
  return [o.rings[lo][inner], o.rings[lo][outer], o.rings[hi][outer], o.rings[hi][inner]];
}
