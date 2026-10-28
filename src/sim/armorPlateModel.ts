/**
 * armorPlateModel.ts — the plate model (262): every collision cell of a frame rebuilt from a few planar plates.
 *
 * Owner, 2026-10-27: "all these geometries can be so much smoother and make more sense". The cells are convex slices
 * hulled from the vehicle mesh: a glacis comes out as a fan of hull triangles a few degrees apart, with diagonal wedges
 * where the slice's profile changes across its width, and each triangle takes the authored plate nearest it. Here each
 * cell keeps its own convex volume but is cut by far fewer planes:
 *   - per cell, adjacent faces of one zone (plate) merge while one plane through the cell's outermost point along their
 *     mean normal stays within PLATE_TOLERANCE_M of every vertex they had, and within PLATE_SPREAD of each face's own
 *     normal (a sliver or fan of another zone joins the larger face it lies in: SLIVER_M2, SLIVER_SHARE);
 *   - across the frame's cells, one plate's planes that agree (UNIFY_COS, within the tolerance) become exactly one
 *     plane, so a glacis spanning several slices is one plate, not a step per slice;
 *   - each cell is then the intersection of its planes (and its slice caps, kept exact): every plane supports the old
 *     cell, so the new cell contains it — never a gap where the hull had armour — and is at most the tolerance larger.
 * Zone borders are then where two planes cross: straight lines, never facet edges.
 *
 * Pure numbers, deterministic (fixed iteration order, Math.sqrt only, no transcendental functions on the path), no
 * three.js and no DOM: the flashlight draws it (262 phase 1) and the authority may trace it (phase 2, behind a flag).
 * Cached per cell list.
 */

type Vec3 = [number, number, number];
type ReadVec3 = readonly number[];

export interface PlateModelFace<P = unknown> {
  indices: number[];
  normal: Vec3;
  constant: number;
  center: Vec3;
  plate: P;
  internal?: boolean;
}

export interface PlateModelCell<P = unknown> {
  min: Vec3;
  max: Vec3;
  vertices: Vec3[];
  faces: PlateModelFace<P>[];
  [key: string]: unknown;
}

interface SourceFace {
  readonly indices: readonly number[];
  readonly normal: ReadVec3;
  readonly constant: number;
  readonly plate?: unknown;
  readonly internal?: boolean;
}

interface SourceCell {
  readonly min: ReadVec3;
  readonly max: ReadVec3;
  readonly vertices: readonly ReadVec3[];
  readonly faces: readonly SourceFace[];
}

/** How far (m) a plate's plane may stand off any part of the hull it replaces. */
export const PLATE_TOLERANCE_M = 0.04;
/** cos 25°: a face more than this off its plate's normal is a crease, not part of the plate. */
const PLATE_SPREAD_COS = 0.9063077870366499;
/** A face group this small (m²), or this small a share of its neighbour, joins it whatever its zone. */
const SLIVER_M2 = 0.03;
const SLIVER_SHARE = 0.15;
/** cos 4°: one zone's planes in neighbouring cells this close in direction (and within the tolerance) are one plane. */
const UNIFY_COS = 0.9975640502598242;
/** Slice caps (|n·z| above this, flagged internal) are the shared cuts between slices: kept exact. */
const EPS = 1e-9;
const SNAP_M = 1e-7;
/** Polygons under this area (m²) are clipping slivers. */
const MIN_POLYGON_M2 = 1e-7;
const QUANTUM_M = 1e-6;

const dot = (a: ReadVec3, b: ReadVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: ReadVec3, b: ReadVec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: ReadVec3, b: ReadVec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: ReadVec3): number => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
function unit(a: ReadVec3): Vec3 {
  const size = norm(a);
  return size > EPS ? [a[0] / size, a[1] / size, a[2] / size] : [0, 1, 0];
}

interface Group {
  faces: number[];
  vertices: Set<number>;
  area: number;
  sum: Vec3;
  plates: Map<unknown, number>;
  internal: boolean;
  normal: Vec3;
  /** Support along `normal`: the plane is normal·x - support = 0. */
  support: number;
  alive: boolean;
}

function dominantPlate(plates: Map<unknown, number>): unknown {
  let best: unknown, most = -1;
  for (const [plate, area] of plates) if (area > most) { most = area; best = plate; }
  return best;
}

function supportOf(vertices: readonly ReadVec3[], normal: ReadVec3): number {
  let support = -Infinity;
  for (const vertex of vertices) support = Math.max(support, dot(normal, vertex));
  return support;
}

/** The largest distance (m) any of the group's vertices lies inside the plane normal·x = support. */
function deviation(vertices: readonly ReadVec3[], members: Iterable<number>, normal: ReadVec3, support: number): number {
  let worst = 0;
  for (const index of members) worst = Math.max(worst, support - dot(normal, vertices[index]));
  return worst;
}

/** One cell's faces grouped into plates (see the module comment). */
function groupCellFaces(cell: SourceCell): Group[] {
  const vertices = cell.vertices;
  const groups: Group[] = cell.faces.map((face) => {
    const [a, b, c] = face.indices.map((index) => vertices[index]);
    const area = a && b && c ? norm(cross(sub(b, a), sub(c, a))) / 2 : 0;
    const normal: Vec3 = [face.normal[0], face.normal[1], face.normal[2]];
    return {
      faces: [], vertices: new Set(face.indices), area,
      sum: [normal[0] * area, normal[1] * area, normal[2] * area],
      plates: new Map([[face.plate, area]]), internal: !!face.internal,
      normal, support: supportOf(vertices, normal), alive: true,
    };
  });
  groups.forEach((group, index) => group.faces.push(index));
  // faces sharing a hull edge
  const edgeFaces = new Map<string, number[]>();
  cell.faces.forEach((face, index) => {
    for (let k = 0; k < face.indices.length; k++) {
      const a = face.indices[k], b = face.indices[(k + 1) % face.indices.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const list = edgeFaces.get(key);
      if (list) list.push(index); else edgeFaces.set(key, [index]);
    }
  });
  const owner = groups.map((_, index) => index);
  const neighbours = groups.map(() => new Set<number>());
  for (const list of edgeFaces.values()) {
    for (const a of list) for (const b of list) if (a !== b) neighbours[a].add(b);
  }
  const groupNeighbours = (id: number): number[] => {
    const out = new Set<number>();
    for (const face of groups[id].faces) for (const next of neighbours[face]) if (owner[next] !== id) out.add(owner[next]);
    return [...out].sort((a, b) => a - b);
  };
  const faceNormals = cell.faces.map((face) => face.normal);
  // the triangles of one slice cap are one plane
  for (let a = 0; a < groups.length; a++) {
    const A = groups[a];
    if (!A.alive || !A.internal) continue;
    for (let b = a + 1; b < groups.length; b++) {
      const B = groups[b];
      if (!B.alive || !B.internal) continue;
      const fa = cell.faces[A.faces[0]], fb = cell.faces[B.faces[0]];
      if (dot(fa.normal, fb.normal) < 0.9999995 || Math.abs(fa.constant - fb.constant) > 1e-6) continue;
      for (const face of B.faces) { A.faces.push(face); owner[face] = a; }
      for (const vertex of B.vertices) A.vertices.add(vertex);
      A.area += B.area;
      B.alive = false;
    }
  }
  for (;;) {
    let bestA = -1, bestB = -1, bestDeviation = Infinity, bestNormal: Vec3 = [0, 1, 0], bestSupport = 0;
    for (let a = 0; a < groups.length; a++) {
      const A = groups[a];
      if (!A.alive || A.internal) continue;
      for (const b of groupNeighbours(a)) {
        if (b <= a) continue;
        const B = groups[b];
        if (!B.alive || B.internal) continue;
        const plateA = dominantPlate(A.plates), plateB = dominantPlate(B.plates);
        if (plateA !== plateB) {
          const small = Math.min(A.area, B.area), large = Math.max(A.area, B.area);
          if (small > SLIVER_M2 && small > large * SLIVER_SHARE) continue;
        }
        const normal = unit([A.sum[0] + B.sum[0], A.sum[1] + B.sum[1], A.sum[2] + B.sum[2]]);
        let spread = true;
        for (const face of A.faces) if (dot(normal, faceNormals[face]) < PLATE_SPREAD_COS) { spread = false; break; }
        if (spread) for (const face of B.faces) if (dot(normal, faceNormals[face]) < PLATE_SPREAD_COS) { spread = false; break; }
        if (!spread) continue;
        const support = supportOf(vertices, normal);
        const worst = Math.max(deviation(vertices, A.vertices, normal, support), deviation(vertices, B.vertices, normal, support));
        if (worst > PLATE_TOLERANCE_M || worst >= bestDeviation) continue;
        bestA = a; bestB = b; bestDeviation = worst; bestNormal = normal; bestSupport = support;
      }
    }
    if (bestA < 0) break;
    const A = groups[bestA], B = groups[bestB];
    for (const face of B.faces) { A.faces.push(face); owner[face] = bestA; }
    for (const vertex of B.vertices) A.vertices.add(vertex);
    A.area += B.area;
    for (let axis = 0; axis < 3; axis++) A.sum[axis] += B.sum[axis];
    for (const [plate, area] of B.plates) A.plates.set(plate, (A.plates.get(plate) || 0) + area);
    A.normal = bestNormal;
    A.support = bestSupport;
    B.alive = false;
  }
  return groups.filter((group) => group.alive);
}

interface PlanePolygon { group: number; points: Vec3[] }

function clipPolygon(points: readonly Vec3[], normal: ReadVec3, support: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    let da = dot(normal, a) - support, db = dot(normal, b) - support;
    if (Math.abs(da) < SNAP_M) da = 0;
    if (Math.abs(db) < SNAP_M) db = 0;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function polygonArea(points: readonly ReadVec3[]): number {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    x += a[1] * b[2] - a[2] * b[1];
    y += a[2] * b[0] - a[0] * b[2];
    z += a[0] * b[1] - a[1] * b[0];
  }
  return norm([x, y, z]) / 2;
}

/**
 * The convex polytope of `planes` inside `box` (min/max), as one polygon per plane (counter-clockwise about its
 * outward normal) and the box faces that still bound it (group -1 - axisFace).
 */
function polytope(planes: ReadonlyArray<{ normal: ReadVec3; support: number }>, min: ReadVec3, max: ReadVec3): PlanePolygon[] {
  const corner = (x: number, y: number, z: number): Vec3 => [x ? max[0] : min[0], y ? max[1] : min[1], z ? max[2] : min[2]];
  let polygons: PlanePolygon[] = [
    [corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)],
    [corner(0, 0, 0), corner(0, 0, 1), corner(0, 1, 1), corner(0, 1, 0)],
    [corner(0, 1, 0), corner(0, 1, 1), corner(1, 1, 1), corner(1, 1, 0)],
    [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)],
    [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)],
    [corner(0, 0, 0), corner(0, 1, 0), corner(1, 1, 0), corner(1, 0, 0)],
  ].map((points, face) => ({ group: -1 - face, points }));
  planes.forEach((plane, index) => {
    const cap: Vec3[] = [];
    const next: PlanePolygon[] = [];
    for (const polygon of polygons) {
      const clipped = clipPolygon(polygon.points, plane.normal, plane.support);
      for (const point of clipped) if (Math.abs(dot(plane.normal, point) - plane.support) <= 1e-9) cap.push(point);
      if (clipped.length >= 3 && polygonArea(clipped) > MIN_POLYGON_M2) next.push({ group: polygon.group, points: clipped });
    }
    polygons = next;
    const unique: Vec3[] = [];
    for (const point of cap) {
      if (!unique.some((other) => Math.abs(point[0] - other[0]) + Math.abs(point[1] - other[1]) + Math.abs(point[2] - other[2]) < 1e-9)) unique.push(point);
    }
    if (unique.length < 3) return;
    const center: Vec3 = [0, 0, 0];
    for (const point of unique) for (let axis = 0; axis < 3; axis++) center[axis] += point[axis] / unique.length;
    const seed: Vec3 = Math.abs(plane.normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = unit(cross(seed, plane.normal));
    const w = cross(plane.normal, u);
    // a monotone key (no atan2): the quadrant, then the slope within it
    const angleKey = (point: Vec3): number => {
      const d = sub(point, center);
      const x = dot(d, u), y = dot(d, w);
      const r = Math.abs(x) + Math.abs(y) || 1;
      const t = y / r;
      return x >= 0 ? (y >= 0 ? t : 4 + t) : 2 - t;
    };
    unique.sort((a, b) => angleKey(a) - angleKey(b));
    if (polygonArea(unique) > MIN_POLYGON_M2) polygons.push({ group: index, points: unique });
  });
  return polygons;
}

const quantize = (value: number): number => Math.round(value / QUANTUM_M) * QUANTUM_M;

function cellFromPolygons<P>(
  source: SourceCell,
  polygons: readonly PlanePolygon[],
  planes: ReadonlyArray<{ normal: Vec3; support: number; plate: P; internal: boolean }>,
): PlateModelCell<P> | null {
  const vertices: Vec3[] = [];
  const index = new Map<string, number>();
  const vertexOf = (point: Vec3): number => {
    const q: Vec3 = [quantize(point[0]), quantize(point[1]), quantize(point[2])];
    const key = `${q[0]},${q[1]},${q[2]}`;
    let found = index.get(key);
    if (found === undefined) { found = vertices.length; vertices.push(q); index.set(key, found); }
    return found;
  };
  const faces: PlateModelFace<P>[] = [];
  for (const polygon of polygons) {
    let normal: Vec3, constant: number, plate: P, internal: boolean;
    if (polygon.group >= 0) {
      const plane = planes[polygon.group];
      normal = plane.normal; constant = -plane.support; plate = plane.plate; internal = plane.internal;
    } else {
      // a box face still bounding the cell: the zone whose plane faces most nearly its way
      const axis = [0, 0, 1, 1, 2, 2][-1 - polygon.group];
      const sign = (-1 - polygon.group) % 2 === 0 ? 1 : -1;
      normal = [0, 0, 0]; normal[axis] = sign;
      constant = -dot(normal, polygon.points[0]);
      let best = planes[0], bestDot = -Infinity;
      for (const plane of planes) if (!plane.internal && dot(plane.normal, normal) > bestDot) { bestDot = dot(plane.normal, normal); best = plane; }
      plate = best.plate; internal = false;
    }
    const ids = polygon.points.map(vertexOf);
    for (let k = 1; k + 1 < ids.length; k++) {
      const a = vertices[ids[0]], b = vertices[ids[k]], c = vertices[ids[k + 1]];
      if (ids[0] === ids[k] || ids[k] === ids[k + 1] || ids[0] === ids[k + 1]) continue;
      if (norm(cross(sub(b, a), sub(c, a))) < 1e-10) continue;
      faces.push({
        indices: [ids[0], ids[k], ids[k + 1]], normal, constant,
        center: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
        plate, ...(internal ? { internal: true } : {}),
      });
    }
  }
  if (faces.length < 4) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], vertex[axis]); max[axis] = Math.max(max[axis], vertex[axis]);
  }
  const { min: _min, max: _max, vertices: _vertices, faces: _faces, ...rest } = source as SourceCell & Record<string, unknown>;
  return { ...rest, min, max, vertices, faces };
}

interface CellPlates { cell: SourceCell; groups: Group[] }

/** One zone's planes that agree across the frame's cells become exactly one plane (see the module comment). */
function unifyPlanes(cells: CellPlates[]): void {
  const items: Array<{ cell: number; group: Group }> = [];
  cells.forEach((entry, cell) => { for (const group of entry.groups) if (!group.internal) items.push({ cell, group }); });
  items.sort((a, b) => b.group.area - a.group.area || a.cell - b.cell);
  const done = new Set<Group>();
  for (const seed of items) {
    if (done.has(seed.group)) continue;
    done.add(seed.group);
    const plate = dominantPlate(seed.group.plates);
    const members = [seed];
    const sum: Vec3 = [...seed.group.sum];
    for (const item of items) {
      if (done.has(item.group) || members.some((member) => member.cell === item.cell)) continue;
      if (dominantPlate(item.group.plates) !== plate || dot(item.group.normal, seed.group.normal) < UNIFY_COS) continue;
      const trial = unit([sum[0] + item.group.sum[0], sum[1] + item.group.sum[1], sum[2] + item.group.sum[2]]);
      const all = [...members, item];
      let support = -Infinity;
      for (const member of all) support = Math.max(support, supportOf(cells[member.cell].cell.vertices, trial));
      let fits = true;
      for (const member of all) {
        if (deviation(cells[member.cell].cell.vertices, member.group.vertices, trial, support) > PLATE_TOLERANCE_M) { fits = false; break; }
      }
      if (!fits) continue;
      members.push(item);
      done.add(item.group);
      for (let axis = 0; axis < 3; axis++) sum[axis] += item.group.sum[axis];
    }
    if (members.length < 2) continue;
    const normal = unit(sum);
    let support = -Infinity;
    for (const member of members) support = Math.max(support, supportOf(cells[member.cell].cell.vertices, normal));
    for (const member of members) { member.group.normal = normal; member.group.support = support; }
  }
}

function buildPlateModel<P>(source: readonly SourceCell[]): PlateModelCell<P>[] {
  const cells: CellPlates[] = source.map((cell) => ({ cell, groups: groupCellFaces(cell) }));
  unifyPlanes(cells);
  const out: PlateModelCell<P>[] = [];
  for (const { cell, groups } of cells) {
    const planes = groups.map((group) => {
      // an internal cap keeps its exact plane (its neighbour slice shares it)
      const face = cell.faces[group.faces[0]];
      if (group.internal) {
        const normal: Vec3 = [face.normal[0], face.normal[1], face.normal[2]];
        return { normal, support: -face.constant, plate: face.plate as P, internal: true };
      }
      return { normal: group.normal, support: group.support, plate: dominantPlate(group.plates) as P, internal: false };
    });
    // the old bounds grown by the tolerance: never active for a plane set that closes the cell
    const grow = PLATE_TOLERANCE_M + 1e-3;
    const min: Vec3 = [cell.min[0] - grow, cell.min[1] - grow, cell.min[2] - grow];
    const max: Vec3 = [cell.max[0] + grow, cell.max[1] + grow, cell.max[2] + grow];
    const built = cellFromPolygons(cell, polytope(planes, min, max), planes);
    if (built) out.push(built);
  }
  return out;
}

const models = new WeakMap<object, PlateModelCell[]>();

/**
 * The plate model of one frame's collision cells: the same cells, each cut by a few planar plates (module comment).
 * Read-only, cached per cell list (every vehicle of one spec shares it).
 */
export function armorPlateModel<P = unknown>(cells: readonly SourceCell[] | undefined): PlateModelCell<P>[] {
  if (!cells?.length) return [];
  let model = models.get(cells);
  if (!model) { model = buildPlateModel(cells); models.set(cells, model); }
  return model as PlateModelCell<P>[];
}
