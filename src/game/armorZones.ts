// The armour zones on the skin (262): which authored plate — glacis, lower plate, cheek, mantlet, side, roof, rear —
// each part of the armour skin (armorSkin.ts) belongs to, with straight borders.
//
// The cells' faces each take the authored plate nearest them (combatAnatomy nearestPlate), one whole hull triangle at
// a time, so a zone border runs along triangle edges: a zigzag across a glacis, diagonals through a cheek. Here a
// point's zone is decided by a function of position that is linear between a few planes:
//   score(plate, x) = d(x) - OUTSIDE_WEIGHT * gap(x) - FACING_WEIGHT * (1 - n·m)
// where d is the signed distance off the plate's plane (positive outward: the outermost plate is the surface there,
// as on a polytope of the plates), gap is how far x lies outside the plate's outline, summed over its edges (the edge
// planes through the outline along the normal), and the last term prefers the plate facing the piece's way (n the
// plate's normal, m the piece's; constant on a piece). A skin piece is cut by the edge planes that cross it, then by
// the planes where two plates' scores are equal, so every border is the line where two of those planes meet the skin.
// A plate facing away from a piece never takes it.
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
/** A plate this far (score, m) behind the best at every corner of a piece cannot win any of it. */
const CANDIDATE_MARGIN = 0.6;
const SPLIT_EPS = 1e-6;
const MIN_AREA_M2 = 1e-6;

export interface ZonePlate {
  readonly plate: unknown;
  readonly normal: SkinPoint;
  /** d(x) = normal·x + offset */
  readonly offset: number;
  /** Outward edge planes of the outline: e(x) = normal·x + offset, positive outside that edge. */
  readonly edges: ReadonlyArray<{ readonly normal: SkinPoint; readonly offset: number }>;
}

export interface ZonePiece {
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
  return dot(zone.normal, point) + zone.offset - OUTSIDE_WEIGHT * gap - FACING_WEIGHT * (1 - dot(zone.normal, normal));
}

/** The zone at a point of the skin with outward normal `normal` (-1: none faces that way). */
export function zoneAt(zones: readonly ZonePlate[], point: readonly number[], normal: readonly number[]): number {
  let best = -1, bestScore = -Infinity;
  zones.forEach((zone, index) => {
    if (dot(zone.normal, normal) < FACING_DOT) return;
    const value = score(zone, point, normal);
    if (value > bestScore) { bestScore = value; best = index; }
  });
  return best;
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
 * One convex skin piece (outward `normal`) cut into its zones. Exact for the score above: the piece is cut by every
 * competing plate's edge planes that cross it, after which each score is linear on each part, and each part is split
 * among the plates by the planes where their scores are equal.
 */
export function splitByZones(zones: readonly ZonePlate[], points: readonly SkinPoint[], normal: readonly number[]): ZonePiece[] {
  const facing: number[] = [];
  zones.forEach((zone, index) => { if (dot(zone.normal, normal) >= FACING_DOT) facing.push(index); });
  if (!facing.length) return [{ zone: -1, points: [...points] }];
  // plates that can win somewhere on the piece: within the margin of the best at some corner (scores are piecewise
  // linear, so a plate far behind at every corner of a small piece does not overtake inside it)
  const bestAt = points.map((point) => Math.max(...facing.map((index) => score(zones[index], point, normal))));
  const candidates = facing.filter((index) => points.some((point, k) => score(zones[index], point, normal) >= bestAt[k] - CANDIDATE_MARGIN));
  if (candidates.length === 1) return [{ zone: candidates[0], points: [...points] }];
  let parts: SkinPoint[][] = [[...points]];
  for (const index of candidates) {
    for (const edge of zones[index].edges) {
      const next: SkinPoint[][] = [];
      for (const part of parts) {
        let below = false, above = false;
        for (const point of part) {
          const value = dot(edge.normal, point) + edge.offset;
          if (value < -SPLIT_EPS) below = true; else if (value > SPLIT_EPS) above = true;
        }
        if (!(below && above)) { next.push(part); continue; }
        const inside = clip(part, edge.normal, edge.offset);
        const outside = clip(part, [-edge.normal[0], -edge.normal[1], -edge.normal[2]], -edge.offset);
        if (inside.length >= 3 && area(inside, normal) > MIN_AREA_M2) next.push(inside);
        if (outside.length >= 3 && area(outside, normal) > MIN_AREA_M2) next.push(outside);
      }
      parts = next;
    }
  }
  const out: ZonePiece[] = [];
  for (const part of parts) {
    const centre = [0, 0, 0];
    for (const point of part) for (let axis = 0; axis < 3; axis++) centre[axis] += point[axis] / part.length;
    // each score as a linear form on this part: a·x + b
    const forms = candidates.map((index) => {
      const zone = zones[index];
      const a: SkinPoint = [zone.normal[0], zone.normal[1], zone.normal[2]];
      let b = zone.offset - FACING_WEIGHT * (1 - dot(zone.normal, normal));
      for (const edge of zone.edges) {
        if (dot(edge.normal, centre) + edge.offset <= 0) continue;
        for (let axis = 0; axis < 3; axis++) a[axis] -= OUTSIDE_WEIGHT * edge.normal[axis];
        b -= OUTSIDE_WEIGHT * edge.offset;
      }
      return { a, b };
    });
    forms.forEach((form, i) => {
      let region: SkinPoint[] = part;
      for (let j = 0; j < forms.length && region.length >= 3; j++) {
        if (j === i) continue;
        const other = forms[j];
        const n: SkinPoint = [other.a[0] - form.a[0], other.a[1] - form.a[1], other.a[2] - form.a[2]];
        const c = other.b - form.b;
        // identical scores: the lower index takes the tie
        if (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) < 1e-12 && Math.abs(c) < 1e-12) {
          if (j < i) region = [];
          continue;
        }
        region = clip(region, n, c);
      }
      if (region.length >= 3 && area(region, normal) > MIN_AREA_M2) out.push({ zone: candidates[i], points: region });
    });
  }
  return out;
}
