// The facets of a convex collision cell exactly as traceTank tests it (sim/armor.ts intersectConvexCell): the cell's
// bounds, grown a hair, cut by each distinct face plane (n·x + c <= 0), one convex polygon per plane. Coplanar faces are
// one plane (rounded to a millimetre, as the armour skin has keyed them since 243), led by the first listed, which is
// the face a round entering there is given (intersectConvexCell keeps the first of equal entries). What still lies on
// the bounds has no face, so traceTank never reports it: it is left out. Built from the planes, not the hull
// triangles, so the facet is the tested surface even where the two disagree (a stock cell's plane can run well past
// its triangles). Shared by the armour skin (game/armorSkin.ts) and the gun-face split (vehicles/combatAnatomy.ts).
// Pure numbers, Node-runnable. Copyright © 2026 Kevin B. Liu.

type FacetPoint = [number, number, number];

export interface FacetPlane { n: FacetPoint; c: number }

interface FacetFace {
  readonly normal: readonly number[];
  readonly constant: number;
}

interface FacetCell<F extends FacetFace> {
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly faces: readonly F[];
}

interface CellFacet<F> {
  readonly plane: FacetPlane;
  /** the faces on the plane, first listed first */
  readonly faces: F[];
  readonly points: FacetPoint[];
}

interface CellFacets<F> {
  /** the half-planes traceTank tests (one per distinct face plane), then the cell's grown bounds */
  readonly planes: FacetPlane[];
  readonly facets: CellFacet<F>[];
}

/** How far past its bounds a cell's face planes still count as struck (m). */
const BOUNDS_MARGIN_M = 1e-3;
/** Distances under this (m) are on the plane: shared slice faces stay exact under rounding. */
const SNAP_M = 1e-7;

const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const facetPlaneKey = (n: readonly number[], c: number): string =>
  `${Math.round(n[0] * 1000)},${Math.round(n[1] * 1000)},${Math.round(n[2] * 1000)}|${Math.round(c * 1000)}`;

const facetPlaneDistance = (plane: FacetPlane, point: readonly number[]): number => {
  const distance = dot(plane.n, point) + plane.c;
  return Math.abs(distance) < SNAP_M ? 0 : distance;
};

/** Sutherland–Hodgman: the part of a convex polygon with side·(n·x + c) <= 0. */
export function clipFacetPolygon(points: readonly FacetPoint[], plane: FacetPlane, side: 1 | -1): FacetPoint[] {
  const out: FacetPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = side * facetPlaneDistance(plane, a), db = side * facetPlaneDistance(plane, b);
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** Unsigned area of a planar polygon, whatever its plane. */
function facetArea(points: readonly FacetPoint[]): number {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    x += a[1] * b[2] - a[2] * b[1];
    y += a[2] * b[0] - a[0] * b[2];
    z += a[0] * b[1] - a[1] * b[0];
  }
  return Math.hypot(x, y, z) / 2;
}

/** The cell's facets and half-planes (see the file header). */
export function convexCellFacets<F extends FacetFace>(cell: FacetCell<F>): CellFacets<F> {
  // traceTank's bounds only reject a ray (intersectAABB): the entry is the face planes', so a face plane a hair past
  // the bounds is still struck there (Chieftain Mk10's cast stock: a roof plane 7 µm over its bounds' top).
  const [x0, y0, z0] = cell.min.map((value) => value - BOUNDS_MARGIN_M);
  const [x1, y1, z1] = cell.max.map((value) => value + BOUNDS_MARGIN_M);
  const corner = (x: number, y: number, z: number): FacetPoint => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
  let polygons: Array<{ facet: CellFacet<F> | null; points: FacetPoint[] }> = [
    [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)],
    [corner(0, 0, 0), corner(0, 0, 1), corner(0, 1, 1), corner(0, 1, 0)],
    [corner(0, 1, 0), corner(0, 1, 1), corner(1, 1, 1), corner(1, 1, 0)],
    [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)],
    [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)],
    [corner(0, 0, 0), corner(0, 1, 0), corner(1, 1, 0), corner(1, 0, 0)],
  ].map((points) => ({ facet: null, points }));
  const planes: FacetPlane[] = [];
  const byKey = new Map<string, CellFacet<F>>();
  for (const face of cell.faces) {
    const n = face.normal;
    if (!n || !Number.isFinite(face.constant) || Math.hypot(n[0], n[1], n[2]) < 1e-9) continue;
    const key = facetPlaneKey(n, face.constant);
    const known = byKey.get(key);
    if (known) { known.faces.push(face); continue; }
    const plane: FacetPlane = { n: [n[0], n[1], n[2]], c: face.constant };
    const facet: CellFacet<F> = { plane, faces: [face], points: [] };
    byKey.set(key, facet);
    planes.push(plane);
    const cap: FacetPoint[] = [];
    const next: typeof polygons = [];
    for (const polygon of polygons) {
      const clipped = clipFacetPolygon(polygon.points, plane, 1);
      for (const point of clipped) if (Math.abs(facetPlaneDistance(plane, point)) <= 1e-9) cap.push(point);
      if (clipped.length >= 3 && facetArea(clipped) > 1e-12) next.push({ ...polygon, points: clipped });
    }
    polygons = next;
    const unique: FacetPoint[] = [];
    for (const point of cap) if (!unique.some((other) => Math.hypot(point[0] - other[0], point[1] - other[1], point[2] - other[2]) < 1e-9)) unique.push(point);
    if (unique.length < 3) continue;
    const center = [0, 0, 0];
    for (const point of unique) for (let axis = 0; axis < 3; axis++) center[axis] += point[axis] / unique.length;
    const u = (() => {
      const seed = Math.abs(plane.n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const v = [seed[1] * plane.n[2] - seed[2] * plane.n[1], seed[2] * plane.n[0] - seed[0] * plane.n[2], seed[0] * plane.n[1] - seed[1] * plane.n[0]];
      const size = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / size, v[1] / size, v[2] / size];
    })();
    const w = [plane.n[1] * u[2] - plane.n[2] * u[1], plane.n[2] * u[0] - plane.n[0] * u[2], plane.n[0] * u[1] - plane.n[1] * u[0]];
    const angle = (point: FacetPoint) => Math.atan2(
      (point[0] - center[0]) * w[0] + (point[1] - center[1]) * w[1] + (point[2] - center[2]) * w[2],
      (point[0] - center[0]) * u[0] + (point[1] - center[1]) * u[1] + (point[2] - center[2]) * u[2]);
    unique.sort((a, b) => angle(a) - angle(b));
    if (facetArea(unique) > 1e-12) polygons.push({ facet, points: unique });
  }
  // the (grown) bounds are half-planes too: intersectAABB rejects a ray that misses them
  planes.push({ n: [1, 0, 0], c: -x1 }, { n: [-1, 0, 0], c: x0 }, { n: [0, 1, 0], c: -y1 }, { n: [0, -1, 0], c: y0 },
    { n: [0, 0, 1], c: -z1 }, { n: [0, 0, -1], c: z0 });
  const facets: CellFacet<F>[] = [];
  for (const polygon of polygons) {
    if (!polygon.facet) continue;
    facets.push({ plane: polygon.facet.plane, faces: polygon.facet.faces, points: polygon.points });
  }
  return { planes, facets };
}
