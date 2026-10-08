// src/world/rockCollision.ts — a stone's colliders from the stone itself (the hitbox lane, 2026-10-07; owner: "rock
// hitboxes are way too big and inaccurate").
//
// The boulders' colliders were the legacy icosphere's whole projected outline times the stone's scale, extruded to
// 1.1 x scale: the stone drawn is a smaller form fitted inside that outline (rockDressing.ts buildBoulderForm), sunk 22
// to 60 % of its scale into the ground so that only its narrowing top shows, half of them drawn in to three quarters
// across one axis, its height its own. The world collider audit (tools/world-collider-audit.mjs) measured 57.6 % of the
// boulder collider area on the 33 maps standing in empty air in the tank-contact band (2.24 x the stone), 66 % of the
// shell rays that met one passing no stone, the tops 0.6 m too high, and 2,419 stones over 0.45 m tall with no collider.
//
// A stone's colliders now come from its own mesh, placed (its placement matrix) over its own ground:
//   movement  the convex hull of the stone where it stands between ROCK_CONTACT_FLOOR_M and ROCK_CONTACT_TOP_M over the
//             ground under it (the skirt below the floor lies under a hull's tracks), to its real top;
//   shells    the exposed stone in horizontal slabs from its lowest exposed point to its top (the ranged convex parts the
//             shards already carry, 'w'): a slab grows to ROCK_SHELL_BAND_M while the stone's section keeps
//             ROCK_SHELL_KEEP of the widest section inside it, so the slabs thin over the stone's dome, and each takes the
//             hull of the stone's section ROCK_SHELL_SECTION_AT of the way up it — a rounded boulder narrows toward its
//             top, and a shell over its shoulder flies on (the audit's rays: 2-3 % of the rays that meet a stone or its
//             collider stopped 10+ cm clear of the stone, 1-2 % passing 10+ cm of it unstopped; the legacy prism 70 %);
//   none      for a stone that rises less than ROCK_DRIVE_OVER_M above its ground: a hull rolls over it.
// Pure and deterministic: no randomness, the same arithmetic on every tier (the collision form is the desktop form), and
// every outline to the centimetre.
import type { BufferGeometry } from 'three';
import { convexOutlineInPlace, setCompoundShape, setConvexShape, type CollisionRecord, type SimpleCollisionShape } from './collision.ts';

/** A stone rising less than this above the ground under it is driven over: no collider (a hull's belly line). */
export const ROCK_DRIVE_OVER_M = 0.45;
/** The movement footprint is the stone between this height over its ground (the tank-contact band's floor)... */
export const ROCK_CONTACT_FLOOR_M = 0.2;
/** ...and this one (the tallest hull's roof: a hoodoo's cap above it is a shell's business, not a hull's). */
export const ROCK_CONTACT_TOP_M = 3;
/**
 * A formation's movement footprint starts higher (the hitbox lane, 2026-10-08): its pieces flare at their feet (a
 * ledge's toe, a slab's buried edge, a hoodoo's skirt) and the hull of the band from the stone's floor spans the ground
 * between the toes. From here, still under the drive-over line, the outlines follow the stone: the formations' empty
 * ground plus uncovered stone fell on every formation map (tools/world-collider-audit.mjs --families=formations).
 */
const FORMATION_CONTACT_FLOOR_M = 0.35;
/** The tallest a shell slab grows (m). (The audit's sweep on Titan's and Saltwind's stones: 0.6 m slabs of six corners
 * stop the same share of shells on the stone as 0.4 m slabs of eight, 2.3 % of the rays 10+ cm clear, in 30 % fewer
 * shard bytes.) */
export const ROCK_SHELL_BAND_M = 0.6;
/** A slab ends where the stone's section falls under this share of the widest section inside it. */
export const ROCK_SHELL_KEEP = 0.5;
/** Each slab takes the hull of the stone's section this share of the way up it (a slab's section shrinks upward: the
 * lower third balances the shell that clips its widest foot against the one that passes over its narrow head). */
export const ROCK_SHELL_SECTION_AT = 0.35;
/** Sections under this area (m2) end no slab: the stone's crown is one cap, not a stack of slivers. */
export const ROCK_SHELL_CROWN_M2 = 0.8;
/** Section sampling step through the stone's height (m). */
const SHELL_STEP_M = 0.05;
/** At most this many corners a movement footprint, and a shell slab's outline (the least-area corners go first). */
export const ROCK_HULL_POINTS = 12;
/** An outline holding under 10 cm2 (a few centimetres across) is no part (m2; just under 0.001, since an outline on the
 * centimetre grid holds a multiple of 0.5 cm2, so one of exactly 10 cm2 is kept whatever the sum's rounding). */
const ROCK_MIN_PART_M2 = 0.00099;
export const ROCK_SHELL_POINTS = 6;
/** The crushable small rocks (crushableClutter.ts isLooseSurfaceRock's class): every stone up to this scale that keeps a
 * collider and is not an authored tactical outcrop — the small and the deep-set stones that newly take one too. */
export const ROCK_CRUSHABLE_MAX_SCALE = 1.8;

export function rockStaysCrushable(scale: number, tactical: boolean): boolean {
  return !tactical && scale <= ROCK_CRUSHABLE_MAX_SCALE;
}

/**
 * The ground a stone's rise is read over (the hitbox lane, 2026-10-08): the rendered triangles a hull's tracks meet
 * (terrainContactSurface.ts, the movement's own surface), else the baked 1 m grid, else the analytic height. The grid
 * parts from the rendered surface by metres at a cliff's foot (5.4 m under one of Titan's stones), where it made a
 * stone the eye sees 0.65 m tall a drive-over one, or one the eye sees buried a wall.
 */
export function rockGroundAt(field: {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getContactHeightAt?(x: number, z: number): number;
}): (x: number, z: number) => number {
  if (field.getContactHeightAt) return (x, z) => field.getContactHeightAt!(x, z);
  if (field.getHeightAtFast) return (x, z) => field.getHeightAtFast!(x, z);
  return (x, z) => field.getHeightAt(x, z);
}

/** A stone's form for collision: its local vertices, its unique edges and the areas of its sections' hulls at local
 * heights y0 + i dy (the adaptive slabs read them scaled to the placed stone instead of cutting it fifty times). */
export interface RockForm {
  positions: Float64Array;
  edges: Uint32Array;
  sections: { y0: number; dy: number; areas: Float64Array };
}

/** Local section levels a form keeps (its height in this many steps). */
const FORM_SECTION_LEVELS = 256;

/** A banded shell part: a convex outline (world [x, z, ...]) between two world heights. */
export interface RockBand {
  points: number[];
  y0: number;
  y1: number;
}

export interface RockCollisionProfile {
  /** The movement footprint (world [x, z, ...]). */
  contact: number[];
  /** The stone's highest point (world y, to the centimetre). */
  top: number;
  /** Its tallest rise above the ground under it (m). */
  exposed: number;
  /** The shell slabs, bottom up. */
  bands: RockBand[];
}

/** How a stone's shell slabs are cut (the defaults are the shipped law; the audit's experiments vary them). */
export interface RockBandOptions {
  /** 'adaptive' (the law above) or 'uniform': equal slabs of `band`. */
  mode?: 'adaptive' | 'uniform';
  band?: number;
  keep?: number;
  /** Each slab the hull of its section `at` of the way up ('section') or of all the stone within it ('max'). */
  hull?: 'max' | 'section';
  at?: number;
  crownM2?: number;
  /** Corners a slab's outline at most. */
  points?: number;
}

/** The local vertices and unique edges of a stone's (indexed) form geometry. */
export function rockFormOf(geometry: BufferGeometry): RockForm {
  const { positions, edges } = surfaceOf(geometry);
  return rockFormFrom(positions, edges);
}

/** A geometry's vertices and unique edges (a formation's pieces need no section table). */
function surfaceOf(geometry: BufferGeometry): { positions: Float64Array; edges: Uint32Array } {
  const p = geometry.getAttribute('position');
  const positions = new Float64Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    positions[i * 3] = p.getX(i); positions[i * 3 + 1] = p.getY(i); positions[i * 3 + 2] = p.getZ(i);
  }
  const index = geometry.index;
  const corners = index ? index.count : p.count;
  const seen = new Set<number>();
  const edges: number[] = [];
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const lo = Math.min(u, v), hi = Math.max(u, v), key = lo * 1048576 + hi;
      if (lo === hi || seen.has(key)) continue;
      seen.add(key);
      edges.push(lo, hi);
    }
  }
  return { positions, edges: Uint32Array.from(edges) };
}

/** A form from its local vertices and unique edges, with its section table. */
export function rockFormFrom(positions: Float64Array, edgeList: Uint32Array): RockForm {
  // the sections' hull areas through the form's height (no ground: a placed stone's levels clip only its last slab)
  let y0 = Infinity, y1 = -Infinity;
  for (let v = 0; v < positions.length / 3; v++) { y0 = Math.min(y0, positions[v * 3 + 1]); y1 = Math.max(y1, positions[v * 3 + 1]); }
  const dy = (y1 - y0) / (FORM_SECTION_LEVELS - 1), areas = new Float64Array(FORM_SECTION_LEVELS);
  for (let i = 0; i < FORM_SECTION_LEVELS; i++) {
    const y = y0 + dy * i;
    for (let k = 0; k < edgeList.length; k += 2) {
      const a = edgeList[k], b = edgeList[k + 1], ya = positions[a * 3 + 1], yb = positions[b * 3 + 1];
      if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
      const t = (y - ya) / (yb - ya);
      pushPoint(positions[a * 3] + (positions[b * 3] - positions[a * 3]) * t, positions[a * 3 + 2] + (positions[b * 3 + 2] - positions[a * 3 + 2]) * t);
    }
    const hull = scratchHullOf(64, false);
    areas[i] = hull ? polygonArea(hull) : 0;
  }
  return { positions, edges: edgeList, sections: { y0, dy, areas } };
}

/** The hull area of the form's section at local height y (interpolated). */
function formSectionArea(form: RockForm, y: number): number {
  const { y0, dy, areas } = form.sections;
  const f = (y - y0) / dy;
  if (f <= 0) return areas[0];
  if (f >= areas.length - 1) return areas[areas.length - 1];
  const i = Math.floor(f), t = f - i;
  return areas[i] + (areas[i + 1] - areas[i]) * t;
}

// ---------------------------------------------------------------------------------------------- outlines

// the point scratch the outlines are gathered in (grown as needed; one stone at a time)
let scratchX = new Float64Array(1024), scratchZ = new Float64Array(1024), scratchOrder = new Int32Array(1024);
let scratchHull = new Int32Array(2048);
let scratchCount = 0;

function pushPoint(x: number, z: number): void {
  if (scratchCount >= scratchX.length) {
    const size = scratchX.length * 2;
    const nx = new Float64Array(size), nz = new Float64Array(size);
    nx.set(scratchX); nz.set(scratchZ);
    scratchX = nx; scratchZ = nz;
    scratchOrder = new Int32Array(size);
    scratchHull = new Int32Array(size * 2);
  }
  scratchX[scratchCount] = x; scratchZ[scratchCount] = z; scratchCount++;
}

/** Remove the corners whose triangles hold the least area until at most `limit` remain (a convex outline stays convex);
 * every corner to the centimetre. */
export function simplifyConvex(points: readonly number[], limit = ROCK_HULL_POINTS): number[] {
  const xs: number[] = [], zs: number[] = [];
  for (let i = 0; i < points.length; i += 2) { xs.push(points[i]); zs.push(points[i + 1]); }
  while (xs.length > limit && xs.length > 3) {
    const n = xs.length;
    let best = -1, bestArea = Infinity;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, b = (i + 1) % n;
      const area = Math.abs((xs[i] - xs[a]) * (zs[b] - zs[a]) - (zs[i] - zs[a]) * (xs[b] - xs[a]));
      if (area < bestArea) { bestArea = area; best = i; }
    }
    xs.splice(best, 1); zs.splice(best, 1);
  }
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++) out.push(Math.round(xs[i] * 100) / 100, Math.round(zs[i] * 100) / 100);
  return convexRounded(out);
}

/**
 * A rounded outline made convex again (the hitbox lane, 2026-10-08): rounding a hull's corners to the centimetre can
 * turn a short edge against the outline's winding (a level hedgehog beam's top and bottom corners lie millimetres apart),
 * and one reflex corner held nothing (that beam's collider held 0 m2 and every shell through it passed; 82 formation and
 * 30 small-rock shell slabs of the first rock shards lost more than a tenth of their outline). collision.ts's law, on a
 * copy: repeated corners and those that turn against the winding, or not at all, are dropped.
 */
export function convexRounded(points: readonly number[]): number[] {
  return convexOutlineInPlace(points.slice());
}

const cross = (o: number, a: number, b: number): number =>
  (scratchX[a] - scratchX[o]) * (scratchZ[b] - scratchZ[o]) - (scratchZ[a] - scratchZ[o]) * (scratchX[b] - scratchX[o]);

const _octagon = new Int32Array(8);
/** Fill scratchOrder with the scratch points that may be hull corners: all but those strictly inside the octagon of the
 * points extreme in x, z, x + z and x - z (counter-clockwise); returns their count. */
function hullCandidates(n: number): number {
  const order = scratchOrder;
  let maxX = 0, maxS = 0, maxZ = 0, minD = 0, minX = 0, minS = 0, minZ = 0, maxD = 0;
  for (let i = 1; i < n; i++) {
    const x = scratchX[i], z = scratchZ[i];
    if (x > scratchX[maxX]) maxX = i;
    if (x < scratchX[minX]) minX = i;
    if (z > scratchZ[maxZ]) maxZ = i;
    if (z < scratchZ[minZ]) minZ = i;
    if (x + z > scratchX[maxS] + scratchZ[maxS]) maxS = i;
    if (x + z < scratchX[minS] + scratchZ[minS]) minS = i;
    if (x - z > scratchX[maxD] - scratchZ[maxD]) maxD = i;
    if (x - z < scratchX[minD] - scratchZ[minD]) minD = i;
  }
  // counter-clockwise by direction: +x, +x+z, +z, -x+z, -x, -x-z, -z, +x-z
  const ring = _octagon;
  ring[0] = maxX; ring[1] = maxS; ring[2] = maxZ; ring[3] = minD; ring[4] = minX; ring[5] = minS; ring[6] = minZ; ring[7] = maxD;
  let corners = 0;
  for (let c = 0; c < 8; c++) {
    const p = ring[c];
    if (corners && scratchX[ring[corners - 1]] === scratchX[p] && scratchZ[ring[corners - 1]] === scratchZ[p]) continue;
    ring[corners++] = p;
  }
  while (corners > 1 && scratchX[ring[0]] === scratchX[ring[corners - 1]] && scratchZ[ring[0]] === scratchZ[ring[corners - 1]]) corners--;
  if (corners < 3) {
    for (let i = 0; i < n; i++) order[i] = i;
    return n;
  }
  let m = 0;
  for (let i = 0; i < n; i++) {
    let inside = true;
    for (let c = 0; c < corners && inside; c++) {
      const a = ring[c], b = ring[(c + 1) % corners];
      if ((scratchX[b] - scratchX[a]) * (scratchZ[i] - scratchZ[a]) - (scratchZ[b] - scratchZ[a]) * (scratchX[i] - scratchX[a]) <= 1e-9) inside = false;
    }
    if (!inside) order[m++] = i;
  }
  return m;
}

/** The convex hull (monotone chain, counter-clockwise, collision.ts convexHull2's law) of the scratch points, simplified
 * to `limit` corners; null when they span no area. Empties the scratch. */
function scratchHullOf(limit: number, round = true): number[] | null {
  const n = scratchCount;
  scratchCount = 0;
  if (n < 3) return null;
  // (the hitbox lane, 2026-10-08: the points strictly inside the octagon of the eight extreme points are no hull's corner;
  // dropped before the sort, which was a quarter of a stone's settle — the hull is the same)
  const m = hullCandidates(n);
  const order = scratchOrder.subarray(0, m);
  order.sort((a, b) => scratchX[a] - scratchX[b] || scratchZ[a] - scratchZ[b]);
  const h = scratchHull;
  let k = 0;
  for (let i = 0; i < m; i++) {
    const p = order[i];
    while (k >= 2 && cross(h[k - 2], h[k - 1], p) <= 0) k--;
    h[k++] = p;
  }
  const lower = k + 1;
  for (let i = m - 2; i >= 0; i--) {
    const p = order[i];
    while (k >= lower && cross(h[k - 2], h[k - 1], p) <= 0) k--;
    h[k++] = p;
  }
  k--; // the last point repeats the first
  if (k < 3) return null;
  const flat: number[] = [];
  for (let i = 0; i < k; i++) flat.push(scratchX[h[i]], scratchZ[h[i]]);
  if (polygonArea(flat) < 1e-6) return null;
  if (!round) return flat;
  // (the hitbox lane, 2026-10-08: a hull a few centimetres across — a stone's tip at a slab's edge — rounds to a sliver
  // or a point, which holds nothing, can still meet a hull or a shell as a segment, and wound clockwise fails the census's
  // winding law: no part)
  const outline = simplifyConvex(flat, limit);
  return outline.length >= 6 && polygonArea(outline) >= ROCK_MIN_PART_M2 ? outline : null;
}

function polygonArea(points: readonly number[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    a += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return Math.abs(a) * 0.5;
}

// ---------------------------------------------------------------------------------------------- a placed surface

/** A surface placed in the world over its ground: its vertices, their rise over the ground under them, its edges and
 * their height ranges, and its edges bucketed by the SHELL_STEP_M height intervals they cross. */
interface PlacedSurface {
  wx: Float64Array;
  wy: Float64Array;
  wz: Float64Array;
  rise: Float64Array;
  edges: Uint32Array;
  top: number;
  exposed: number;
  /** The lowest point of the surface over its ground (where the stone leaves it). */
  low: number;
}

/** Place a form (local vertices and a column-major matrix; or world vertices, `matrix` null) over the ground. */
function placeSurface(
  positions: ArrayLike<number>, edges: Uint32Array, matrix: ArrayLike<number> | null, groundAt: (x: number, z: number) => number,
): PlacedSurface {
  const count = positions.length / 3;
  const wx = new Float64Array(count), wy = new Float64Array(count), wz = new Float64Array(count), rise = new Float64Array(count);
  let top = -Infinity, exposed = -Infinity;
  const e = matrix;
  for (let v = 0; v < count; v++) {
    const lx = positions[v * 3], ly = positions[v * 3 + 1], lz = positions[v * 3 + 2];
    const x = e ? e[0] * lx + e[4] * ly + e[8] * lz + e[12] : lx;
    const y = e ? e[1] * lx + e[5] * ly + e[9] * lz + e[13] : ly;
    const z = e ? e[2] * lx + e[6] * ly + e[10] * lz + e[14] : lz;
    wx[v] = x; wy[v] = y; wz[v] = z;
    rise[v] = y - groundAt(x, z);
    if (y > top) top = y;
    if (rise[v] > exposed) exposed = rise[v];
  }
  // the lowest exposed point: every edge's stretch over the ground, its lowest end
  let low = Infinity;
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k], b = edges[k + 1], ra = rise[a], rb = rise[b];
    if (ra < 0 && rb < 0) continue;
    if (ra >= 0) low = Math.min(low, wy[a]);
    if (rb >= 0) low = Math.min(low, wy[b]);
    if ((ra < 0) !== (rb < 0)) {
      const t = ra / (ra - rb);
      low = Math.min(low, wy[a] + (wy[b] - wy[a]) * t);
    }
  }
  return { wx, wy, wz, rise, edges, top, exposed, low };
}

/** Gather into the scratch the surface where its rise lies in [riseMin, riseMax]: the vertices there and the points where
 * an edge crosses either bound (the hull of these is the hull of every edge's stretch in the band). */
function gatherRiseBand(s: PlacedSurface, riseMin: number, riseMax: number): void {
  const { wx, wz, rise, edges } = s;
  for (let v = 0; v < rise.length; v++) if (rise[v] >= riseMin && rise[v] <= riseMax) pushPoint(wx[v], wz[v]);
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k], b = edges[k + 1], ra = rise[a], rb = rise[b];
    for (const bound of [riseMin, riseMax]) {
      if ((ra - bound) * (rb - bound) >= 0) continue;
      const t = (bound - ra) / (rb - ra);
      pushPoint(wx[a] + (wx[b] - wx[a]) * t, wz[a] + (wz[b] - wz[a]) * t);
    }
  }
}

/** Gather into the scratch the surface's section at height y over its ground (rise >= 0), from the candidate edges. */
function gatherSection(s: PlacedSurface, y: number, candidates: Int32Array, from: number, to: number): void {
  const { wx, wy, wz, rise, edges } = s;
  for (let c = from; c < to; c++) {
    const k = candidates[c] * 2, a = edges[k], b = edges[k + 1];
    const ya = wy[a], yb = wy[b];
    if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
    const t = (y - ya) / (yb - ya);
    if (rise[a] + (rise[b] - rise[a]) * t < 0) continue;
    pushPoint(wx[a] + (wx[b] - wx[a]) * t, wz[a] + (wz[b] - wz[a]) * t);
  }
}

/** Gather into the scratch the stone over its ground between heights y0 and y1 (every edge's stretch there). */
function gatherSlab(s: PlacedSurface, y0: number, y1: number): void {
  const { wx, wy, wz, rise, edges } = s;
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k], b = edges[k + 1];
    let t0 = 0, t1 = 1;
    for (const [va, vb, lo, hi] of [[wy[a], wy[b], y0, y1], [rise[a], rise[b], 0, Infinity]] as const) {
      if (va === vb) { if (va < lo || va > hi) { t0 = 1; t1 = 0; } continue; }
      const ta = (lo - va) / (vb - va), tb = (hi - va) / (vb - va);
      t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (t0 > t1) continue;
    pushPoint(wx[a] + (wx[b] - wx[a]) * t0, wz[a] + (wz[b] - wz[a]) * t0);
    if (t1 !== t0) pushPoint(wx[a] + (wx[b] - wx[a]) * t1, wz[a] + (wz[b] - wz[a]) * t1);
  }
}

/** The surface's edges bucketed by the height intervals [low + k step, low + (k + 1) step) they reach (CSR). */
interface EdgeBins { low: number; step: number; count: number; offsets: Int32Array; items: Int32Array }

function binEdges(s: PlacedSurface, low: number, top: number): EdgeBins {
  const count = Math.max(1, Math.ceil((top - low) / SHELL_STEP_M - 1e-9));
  const step = (top - low) / count;
  const { wy, edges } = s;
  const edgeCount = edges.length / 2;
  const first = new Int32Array(edgeCount), last = new Int32Array(edgeCount);
  const offsets = new Int32Array(count + 1);
  for (let k = 0; k < edgeCount; k++) {
    const ya = wy[edges[k * 2]], yb = wy[edges[k * 2 + 1]];
    const i0 = Math.max(0, Math.floor((Math.min(ya, yb) - low) / step));
    const i1 = Math.min(count - 1, Math.floor((Math.max(ya, yb) - low) / step));
    first[k] = i0; last[k] = i1;
    for (let i = i0; i <= i1; i++) offsets[i + 1]++;
  }
  for (let i = 0; i < count; i++) offsets[i + 1] += offsets[i];
  const fill = offsets.slice(0, count), items = new Int32Array(offsets[count]);
  for (let k = 0; k < edgeCount; k++) for (let i = first[k]; i <= last[k]; i++) items[fill[i]++] = k;
  return { low, step, count, offsets, items };
}

function sectionOutline(s: PlacedSurface, bins: EdgeBins | null, y: number, limit: number): number[] | null {
  if (!bins) {
    // (a stone whose levels the form's table gives cuts a handful of sections: every edge once each, no bins to build)
    gatherSectionAll(s, y);
    return scratchHullOf(limit);
  }
  const i = Math.min(bins.count - 1, Math.max(0, Math.floor((y - bins.low) / bins.step)));
  gatherSection(s, y, bins.items, bins.offsets[i], bins.offsets[i + 1]);
  // (a section exactly on an interval's floor also crosses the edges that end there, in the interval below)
  if (i > 0 && Math.abs(y - (bins.low + i * bins.step)) < 1e-9) gatherSection(s, y, bins.items, bins.offsets[i - 1], bins.offsets[i]);
  return scratchHullOf(limit);
}

/** gatherSection over every edge of the surface. */
function gatherSectionAll(s: PlacedSurface, y: number): void {
  const { wx, wy, wz, rise, edges } = s;
  for (let k = 0; k < edges.length; k += 2) {
    const a = edges[k], b = edges[k + 1];
    const ya = wy[a], yb = wy[b];
    if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
    const t = (y - ya) / (yb - ya);
    if (rise[a] + (rise[b] - rise[a]) * t < 0) continue;
    pushPoint(wx[a] + (wx[b] - wx[a]) * t, wz[a] + (wz[b] - wz[a]) * t);
  }
}

/** The slabs' heights from `low` to `top`: adaptive (thinning where the section shrinks fast) or uniform. */
/** The SHELL_STEP_M levels from `low` to `top` the slabs are cut at. */
interface LevelGrid { low: number; step: number; count: number }

function levelGrid(low: number, top: number): LevelGrid {
  const count = Math.max(1, Math.ceil((top - low) / SHELL_STEP_M - 1e-9));
  return { low, step: (top - low) / count, count };
}

function slabHeights(
  s: PlacedSurface, bins: EdgeBins | null, grid: LevelGrid, options: RockBandOptions, limit: number,
  areaAt: ((y: number) => number) | null,
): Array<[number, number]> {
  const band = options.band ?? ROCK_SHELL_BAND_M;
  const out: Array<[number, number]> = [];
  if (options.mode === 'uniform') {
    const count = Math.max(1, Math.ceil((s.top - s.low) / band - 1e-6)), step = (s.top - s.low) / count;
    for (let i = 0; i < count; i++) out.push([s.low + step * i, i === count - 1 ? s.top : s.low + step * (i + 1)]);
    return out;
  }
  const keep = options.keep ?? ROCK_SHELL_KEEP, crown = options.crownM2 ?? ROCK_SHELL_CROWN_M2;
  const levels = grid.count + 1, level = (i: number): number => (i === grid.count ? s.top : grid.low + i * grid.step);
  const areas = new Float64Array(levels);
  for (let i = 0; i < levels; i++) {
    if (areaAt) { areas[i] = areaAt(level(i)); continue; }
    const outline = sectionOutline(s, bins, level(i), limit);
    areas[i] = outline ? polygonArea(outline) : 0;
  }
  for (let i0 = 0; i0 < levels - 1;) {
    let j = i0 + 1, lo = Math.min(areas[i0], areas[j]), hi = Math.max(areas[i0], areas[j]);
    while (j + 1 < levels && level(j + 1) - level(i0) <= band + 1e-9) {
      const a = areas[j + 1], nlo = Math.min(lo, a), nhi = Math.max(hi, a);
      if (nlo < keep * nhi && nhi > crown) break;
      lo = nlo; hi = nhi; j++;
    }
    out.push([level(i0), level(j)]);
    i0 = j;
  }
  return out;
}

function shellBands(s: PlacedSurface, options: RockBandOptions, areaAt: ((y: number) => number) | null): RockBand[] {
  const limit = options.points ?? ROCK_SHELL_POINTS, at = options.at ?? ROCK_SHELL_SECTION_AT;
  // (bins only when every level is cut: a stone the form's table reads cuts one section a slab)
  const bins = areaAt ? null : binEdges(s, s.low, s.top);
  const bands: RockBand[] = [];
  for (const [y0, y1] of slabHeights(s, bins, levelGrid(s.low, s.top), options, limit, areaAt)) {
    let points = options.hull === 'max' ? null : sectionOutline(s, bins, y0 + (y1 - y0) * at, limit);
    // (a slab whose section there is empty — a stone's last centimetres — takes all the stone inside it)
    if (!points) { gatherSlab(s, y0, y1); points = scratchHullOf(limit); }
    if (points) bands.push({ points, y0: Math.round(y0 * 100) / 100, y1: Math.round(y1 * 100) / 100 });
  }
  return bands;
}

/**
 * The colliders of one stone: its form placed by `matrix` (a column-major 4 x 4, three's Matrix4.elements) over the
 * ground `groundAt`. Null when it rises less than ROCK_DRIVE_OVER_M above the ground under it.
 */
export function rockCollisionProfile(
  form: RockForm, matrix: ArrayLike<number>, groundAt: (x: number, z: number) => number, options: RockBandOptions = {},
): RockCollisionProfile | null {
  const s = placeSurface(form.positions, form.edges, matrix, groundAt);
  if (!(s.exposed >= ROCK_DRIVE_OVER_M) || !Number.isFinite(s.low) || !(s.top > s.low)) return null;
  gatherRiseBand(s, ROCK_CONTACT_FLOOR_M, ROCK_CONTACT_TOP_M);
  const contact = scratchHullOf(ROCK_HULL_POINTS);
  if (!contact) return null;
  // a stone turned about the vertical and scaled (the placements' law): its sections are the form's, scaled — read from
  // the form's table; any other placement cuts the stone itself
  const e = matrix;
  const upright = Math.abs(e[1]) < 1e-9 && Math.abs(e[9]) < 1e-9 && Math.abs(e[4]) < 1e-9 && Math.abs(e[6]) < 1e-9 && e[5] > 0;
  const areaScale = Math.hypot(e[0], e[2]) * Math.hypot(e[8], e[10]);
  const bands = shellBands(s, options, upright ? (y: number) => formSectionArea(form, (y - e[13]) / e[5]) * areaScale : null);
  if (!bands.length) return null;
  return { contact, top: bands[bands.length - 1].y1, exposed: s.exposed, bands };
}

function centroid(points: readonly number[]): [number, number] {
  let x = 0, z = 0;
  for (let i = 0; i < points.length; i += 2) { x += points[i]; z += points[i + 1]; }
  const n = Math.max(1, points.length / 2);
  return [x / n, z / n];
}

function rangedPart(points: number[], y0: number, y1: number): SimpleCollisionShape {
  const [cx, cz] = centroid(points);
  return { kind: 'convex', cx, cz, points: points.slice(), y0, y1 };
}

/**
 * Shape a stone's records from its profile: the movement record the contact footprint from `seatY` (the seat under the
 * stone, as the legacy record kept it, so the standing rule reads the stone's whole height) to its top; the shell record
 * its slabs. Records keep their identity, kind and crush policy.
 */
export function applyRockCollisionProfile(
  obstacle: CollisionRecord, collider: CollisionRecord, profile: RockCollisionProfile, seatY: number,
): void {
  setConvexShape(obstacle, profile.contact.slice());
  obstacle.min[1] = Math.min(seatY, profile.bands[0].y0);
  obstacle.max[1] = profile.top;
  setCompoundShape(collider, profile.bands.map((band) => rangedPart(band.points, band.y0, band.y1)));
  collider.min[1] = profile.bands[0].y0;
  collider.max[1] = profile.top;
}

// ---------------------------------------------------------------------------------------------- rock formations

/** A formation's records may hold at most this many parts (the shards' compound limit). */
export const FORMATION_MAX_PARTS = 64;
/** Two neighbouring blocks' outlines merge only when their joint hull adds no area to the two (one inside the other,
 * or overlapping so far that the hull is no larger than both): each block keeps its own outline. (The hitbox lane,
 * 2026-10-08: merging while the hull wasted up to 0.3 m2 or 12 % joined a bed's touching blocks into fewer parts, but on
 * Saltwind's 27 formations it stood 17.5 % of their movement collider on empty ground against 13.4 % for the blocks'
 * own outlines, with the stone left uncovered the same 8.4 %: 144 m2 of error against 117. The records' 64-part limit
 * still forces the least wasteful merges.) */
const MERGE_WASTE_M2 = 0;
const MERGE_WASTE_SHARE = 0;
/** Outlines farther apart than this are never merged (m). */
const MERGE_REACH_M = 0.6;

interface Outline { points: number[]; area: number; box: [number, number, number, number] }

function outlineOf(points: number[]): Outline {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    x0 = Math.min(x0, points[i]); x1 = Math.max(x1, points[i]); z0 = Math.min(z0, points[i + 1]); z1 = Math.max(z1, points[i + 1]);
  }
  return { points, area: polygonArea(points), box: [x0, z0, x1, z1] };
}

/** Merge neighbouring outlines (greedy, the least waste first) while a merge wastes little; then down to `limit`. */
function mergeOutlines(items: Outline[], limit: number, corners: number): Outline[] {
  const list = items.slice();
  const near = (a: Outline, b: Outline) => a.box[0] - MERGE_REACH_M <= b.box[2] && b.box[0] - MERGE_REACH_M <= a.box[2]
    && a.box[1] - MERGE_REACH_M <= b.box[3] && b.box[1] - MERGE_REACH_M <= a.box[3];
  const joined = (a: Outline, b: Outline): Outline | null => {
    for (let i = 0; i < a.points.length; i += 2) pushPoint(a.points[i], a.points[i + 1]);
    for (let i = 0; i < b.points.length; i += 2) pushPoint(b.points[i], b.points[i + 1]);
    const points = scratchHullOf(corners);
    return points ? outlineOf(points) : null;
  };
  for (;;) {
    let bestI = -1, bestJ = -1, bestWaste = Infinity, best: Outline | null = null;
    const forced = list.length > limit;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!forced && !near(list[i], list[j])) continue;
        const outline = joined(list[i], list[j]);
        if (!outline) continue;
        const waste = outline.area - list[i].area - list[j].area;
        if (!forced && waste > Math.max(MERGE_WASTE_M2, MERGE_WASTE_SHARE * (list[i].area + list[j].area))) continue;
        if (waste < bestWaste) { bestWaste = waste; bestI = i; bestJ = j; best = outline; }
      }
    }
    if (!best) break;
    list[bestI] = best;
    list.splice(bestJ, 1);
  }
  return list;
}

/** A rock formation's colliders: the movement footprint's outlines and the shell slabs' ranged outlines. */
export interface FormationCollisionProfile {
  /** Convex outlines (world [x, z, ...]) of the standing stone between the contact floor and the contact top. */
  contact: number[][];
  bands: RockBand[];
  top: number;
  low: number;
}

/**
 * The colliders of a formation's standing pieces (world-space geometries): the contact band and equal shell slabs, in
 * each every piece's own outline (in a slab a piece that spans it takes its section ROCK_SHELL_SECTION_AT of the way up,
 * the stone's law; a piece that starts or ends inside it, all of it there), each block keeping its own outline (one
 * inside another adds none; MERGE_WASTE_M2). Null when nothing rises past the drive-over line.
 */
export function formationCollisionProfile(
  pieces: readonly BufferGeometry[], groundAt: (x: number, z: number) => number,
): FormationCollisionProfile | null {
  const surfaces = pieces.map((geometry) => {
    const form = surfaceOf(geometry);
    return placeSurface(form.positions, form.edges, null, groundAt);
  }).filter((s) => s.exposed > 0 && Number.isFinite(s.low) && s.top > s.low);
  if (!surfaces.length || !(Math.max(...surfaces.map((s) => s.exposed)) >= ROCK_DRIVE_OVER_M)) return null;
  const top = Math.max(...surfaces.map((s) => s.top));
  const low = Math.min(...surfaces.map((s) => s.low));
  if (!(top > low)) return null;
  const contactOutlines: Outline[] = [];
  for (const s of surfaces) {
    gatherRiseBand(s, FORMATION_CONTACT_FLOOR_M, ROCK_CONTACT_TOP_M);
    const points = scratchHullOf(ROCK_HULL_POINTS);
    if (points) contactOutlines.push(outlineOf(points));
  }
  const contact = mergeOutlines(contactOutlines, FORMATION_MAX_PARTS, ROCK_HULL_POINTS).map((o) => o.points);
  if (!contact.length) return null;
  const bins = surfaces.map((s) => binEdges(s, s.low, s.top));
  const slabOutlines = (y0: number, y1: number): Outline[] => {
    const out: Outline[] = [];
    surfaces.forEach((s, i) => {
      if (s.top < y0 || s.low > y1) return;
      let points = s.low <= y0 && s.top >= y1
        ? sectionOutline(s, bins[i], y0 + (y1 - y0) * ROCK_SHELL_SECTION_AT, ROCK_SHELL_POINTS) : null;
      if (!points) { gatherSlab(s, y0, y1); points = scratchHullOf(ROCK_SHELL_POINTS); }
      if (points) out.push(outlineOf(points));
    });
    return out;
  };
  // equal slabs, taller ones when the parts would overflow a record
  for (let band = ROCK_SHELL_BAND_M; ; band *= 1.5) {
    const count = Math.max(1, Math.ceil((top - low) / band - 1e-6)), step = (top - low) / count;
    const bands: RockBand[] = [];
    for (let i = 0; i < count; i++) {
      const y0 = low + step * i, y1 = i === count - 1 ? top : low + step * (i + 1);
      for (const o of mergeOutlines(slabOutlines(y0, y1), FORMATION_MAX_PARTS, ROCK_SHELL_POINTS)) {
        bands.push({ points: o.points, y0: Math.round(y0 * 100) / 100, y1: Math.round(y1 * 100) / 100 });
      }
    }
    if (bands.length <= FORMATION_MAX_PARTS || count === 1) {
      return { contact, bands: bands.slice(0, FORMATION_MAX_PARTS), top: Math.round(top * 100) / 100, low: Math.round(low * 100) / 100 };
    }
  }
}

/**
 * Shape a formation's records from its profile: the movement record its contact outlines from `floorY` (the ground
 * under it less half a metre, as the legacy mass kept it) to its top; the shell record its ranged slab outlines.
 */
export function applyFormationCollision(
  obstacle: CollisionRecord, collider: CollisionRecord, profile: FormationCollisionProfile, floorY: number,
): void {
  setCompoundShape(obstacle, profile.contact.map((points) => {
    const [cx, cz] = centroid(points);
    return { kind: 'convex', cx, cz, points: points.slice() };
  }));
  obstacle.min[1] = Math.min(floorY, profile.low);
  obstacle.max[1] = profile.top;
  setCompoundShape(collider, profile.bands.map((band) => rangedPart(band.points, band.y0, band.y1)));
  collider.min[1] = profile.low;
  collider.max[1] = profile.top;
}

// ---------------------------------------------------------------------------------------------- pooled props

/** A pooled prop's shell slabs in its own frame (its geometry with the ground at y = 0): outlines and heights local. */
export function localShellSlabs(geometry: BufferGeometry): RockBand[] | null {
  return formationCollisionProfile([geometry], () => 0)?.bands ?? null;
}

/** Shape a pooled instance's shell record from its kind's local slabs: turned by yaw, scaled, set on its seat. */
export function placeLocalShellSlabs(
  collider: CollisionRecord, slabs: readonly RockBand[], x: number, y: number, z: number, yaw: number, scale: number,
): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const parts = slabs.map((band) => {
    const points: number[] = [];
    for (let i = 0; i < band.points.length; i += 2) {
      const lx = band.points[i] * scale, lz = band.points[i + 1] * scale;
      points.push(Math.round((x + lx * c + lz * s) * 100) / 100, Math.round((z - lx * s + lz * c) * 100) / 100);
    }
    return rangedPart(convexRounded(points), Math.round((y + band.y0 * scale) * 100) / 100, Math.round((y + band.y1 * scale) * 100) / 100);
  });
  setCompoundShape(collider, parts);
  collider.min[1] = parts[0].y0!;
  collider.max[1] = parts[parts.length - 1].y1!;
}
