// The armour zones on the skin (262): which authored plate — glacis, lower plate, cheek, mantlet, side, roof, rear —
// each part of the armour skin (armorSkin.ts) belongs to, with straight borders.
//
// The cells' faces each take the authored plate nearest them (combatAnatomy nearestPlate), one whole hull triangle at
// a time, so a zone border runs along triangle edges: a zigzag across a glacis, diagonals through a cheek. Here a
// point's zone is decided by a function of position that is linear between a few planes:
//   score(plate, x) = -|d(x)| - OUTSIDE_WEIGHT * gap(x) - FACING_WEIGHT * (1 - n·m)
// where d is the distance off the plate's plane (the plate the skin lies nearest, as nearestPlate judges a whole
// face), gap is how far x lies outside the plate's outline, summed over its edges (the edge planes through the outline
// along the normal), and the last term prefers the plate facing the piece's way (n the plate's normal, m the piece's;
// constant on a piece). The nearest plane, not the outermost: a hull is not convex, and a lower side plate between the
// tracks lies inboard of a glacis that spans them. A skin piece is cut only where its zone changes, by the planes
// where two plates' scores are equal (or where one changes form), so every border is the line where such a plane
// meets the skin. A plate facing away from a piece never takes it.
//
// Pure numbers (no three.js).
import type { SkinPoint } from './armorSkin.ts';

interface ZonePlateSource {
  readonly verts: readonly (readonly number[])[];
  readonly kind?: string;
}

/** Metres of plane distance one metre outside a plate's outline costs. */
const OUTSIDE_WEIGHT = 3;
/** Metres of score a plate turned fully away from a piece's normal costs (per unit of 1 - n·m). */
const FACING_WEIGHT = 0.3;
/** A plate facing away from a piece (n·m below this) never takes it. */
const FACING_DOT = 0;
/** A plate this far (score, m) behind the best at every corner of a piece takes none of it. */
const CANDIDATE_MARGIN = 0.5;
const SPLIT_EPS = 1e-6;
const MIN_AREA_M2 = 1e-6;

interface ZonePlate {
  readonly plate: unknown;
  readonly normal: SkinPoint;
  /** d(x) = normal·x + offset */
  readonly offset: number;
  /** Outward edge planes of the outline: e(x) = normal·x + offset, positive outside that edge. */
  readonly edges: ReadonlyArray<{ readonly normal: SkinPoint; readonly offset: number }>;
}

interface ZonePiece {
  /** Index into the classifier's plates, or -1 when no plate faces the piece's way. */
  readonly zone: number;
  readonly points: SkinPoint[];
}

const sub = (a: readonly number[], b: readonly number[]): SkinPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): SkinPoint =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unit(a: readonly number[]): SkinPoint | null {
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
    const edges: Array<{ normal: SkinPoint; offset: number }> = [];
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i], b = ordered[(i + 1) % ordered.length];
      const side = unit(cross(sub(b, a), normal));
      if (side) edges.push({ normal: side, offset: -dot(side, a) });
    }
    out.push({ plate, normal, offset: -dot(normal, center), edges });
  }
  return out;
}

function score(zone: ZonePlate, point: readonly number[], normal: readonly number[]): number {
  let gap = 0;
  for (const edge of zone.edges) gap += Math.max(0, dot(edge.normal, point) + edge.offset);
  return -Math.abs(dot(zone.normal, point) + zone.offset) - OUTSIDE_WEIGHT * gap - FACING_WEIGHT * (1 - dot(zone.normal, normal));
}

/** Sutherland–Hodgman: the part of a convex polygon where n·x + c <= 0. */
function clip(points: readonly SkinPoint[], normal: readonly number[], offset: number): SkinPoint[] {
  const out: SkinPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = dot(normal, a) + offset, db = dot(normal, b) + offset;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function area(points: readonly SkinPoint[], normal: readonly number[]): number {
  let total = 0;
  for (let i = 1; i + 1 < points.length; i++) total += dot(cross(sub(points[i], points[0]), sub(points[i + 1], points[0])), normal) / 2;
  return Math.abs(total);
}

/**
 * The score of one plate as a linear form a·x + b, exact on the side of its plane and of each outline edge plane
 * that `point` lies on.
 */
function linearScore(zone: ZonePlate, point: readonly number[], normal: readonly number[]): { a: SkinPoint; b: number } {
  const sign = dot(zone.normal, point) + zone.offset >= 0 ? -1 : 1;
  const a: SkinPoint = [zone.normal[0] * sign, zone.normal[1] * sign, zone.normal[2] * sign];
  let b = zone.offset * sign - FACING_WEIGHT * (1 - dot(zone.normal, normal));
  for (const edge of zone.edges) {
    if (dot(edge.normal, point) + edge.offset <= 0) continue;
    for (let axis = 0; axis < 3; axis++) a[axis] -= OUTSIDE_WEIGHT * edge.normal[axis];
    b -= OUTSIDE_WEIGHT * edge.offset;
  }
  return { a, b };
}

function crosses(points: readonly SkinPoint[], normal: readonly number[], offset: number): boolean {
  let below = false, above = false;
  for (const point of points) {
    const value = dot(normal, point) + offset;
    if (value < -SPLIT_EPS) below = true; else if (value > SPLIT_EPS) above = true;
    if (below && above) return true;
  }
  return false;
}

/** The deepest a piece is cut while its corners disagree (a border needs one or two cuts; a corner of three, a few). */
const MAX_DEPTH = 6;
/** A part this small (m²) takes its centre's zone whole: a zigzag under ~10 cm does not read. */
const MIN_CUT_M2 = 0.01;

/**
 * One convex skin piece (outward `normal`) cut into its zones, only where its zone changes: while its corners (and
 * centre) disagree, it is cut by the plane where the two leading plates' scores are equal, or else by either plate's
 * own plane or an outline edge plane of one of them that crosses it (their scores change form there). Every border is that plane's line on
 * the piece: straight, and the same line on the pieces either side of a fold.
 */
export function splitByZones(
  zones: readonly ZonePlate[],
  points: readonly SkinPoint[],
  normal: readonly number[],
  /** The zones the piece may take (default: all). */
  allowed?: ReadonlySet<number>,
): ZonePiece[] {
  const all: number[] = [];
  zones.forEach((zone, index) => { if ((!allowed || allowed.has(index)) && dot(zone.normal, normal) >= FACING_DOT) all.push(index); });
  if (!all.length) return [{ zone: -1, points: [...points] }];
  // the plates that can win anywhere on the piece: within the margin of the best at some corner (a score is concave
  // and piecewise linear, so a plate this far behind at every corner of a piece does not overtake inside it)
  const best = points.map(() => -Infinity);
  const scores = all.map((index) => points.map((point, k) => {
    const value = score(zones[index], point, normal);
    if (value > best[k]) best[k] = value;
    return value;
  }));
  const facing = all.filter((_, i) => scores[i].some((value, k) => value >= best[k] - CANDIDATE_MARGIN));
  if (facing.length === 1) return [{ zone: facing[0], points: [...points] }];
  const label = (point: readonly number[]): number => {
    let best = facing[0], bestScore = -Infinity;
    for (const index of facing) {
      const value = score(zones[index], point, normal);
      if (value > bestScore) { bestScore = value; best = index; }
    }
    return best;
  };
  const out: ZonePiece[] = [];
  const refine = (part: SkinPoint[], depth: number): void => {
    const centre = [0, 0, 0];
    for (const point of part) for (let axis = 0; axis < 3; axis++) centre[axis] += point[axis] / part.length;
    const counts = new Map<number, number>();
    for (const point of [...part, centre]) { const zone = label(point); counts.set(zone, (counts.get(zone) || 0) + 1); }
    const ranked = [...counts].sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([zone]) => zone);
    if (ranked.length === 1 || depth >= MAX_DEPTH || area(part, normal) < MIN_CUT_M2) {
      out.push({ zone: label(centre), points: part });
      return;
    }
    const cut = (planeNormal: readonly number[], offset: number): void => {
      const inside = clip(part, planeNormal, offset);
      const outside = clip(part, [-planeNormal[0], -planeNormal[1], -planeNormal[2]], -offset);
      if (inside.length >= 3 && area(inside, normal) > MIN_AREA_M2) refine(inside, depth + 1);
      if (outside.length >= 3 && area(outside, normal) > MIN_AREA_M2) refine(outside, depth + 1);
    };
    // the plane where the two leading scores are equal (their forms at the centre); then, where that does not cross
    // the piece, either plate's own plane or an outline edge plane of either (their forms change there)
    for (let i = 0; i < ranked.length; i++) {
      for (let j = i + 1; j < ranked.length; j++) {
        const first = zones[ranked[i]], second = zones[ranked[j]];
        const a = linearScore(first, centre, normal), b = linearScore(second, centre, normal);
        const planeNormal: SkinPoint = [b.a[0] - a.a[0], b.a[1] - a.a[1], b.a[2] - a.a[2]];
        if (crosses(part, planeNormal, b.b - a.b)) { cut(planeNormal, b.b - a.b); return; }
        if (crosses(part, first.normal, first.offset)) { cut(first.normal, first.offset); return; }
        if (crosses(part, second.normal, second.offset)) { cut(second.normal, second.offset); return; }
        for (const edge of first.edges) if (crosses(part, edge.normal, edge.offset)) { cut(edge.normal, edge.offset); return; }
        for (const edge of second.edges) if (crosses(part, edge.normal, edge.offset)) { cut(edge.normal, edge.offset); return; }
      }
    }
    out.push({ zone: label(centre), points: part });
  };
  refine([...points], 0);
  return out;
}
