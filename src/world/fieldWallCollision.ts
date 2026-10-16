// src/world/fieldWallCollision.ts — the dry-stone field walls stand in the game as what they are (physics stream PH.15,
// 2026-10-15; DST-03 "collision matches what is drawn", DO-DST-12 "walls are decor with no collision"): Saltwind's 19 km
// of land-use walls (fieldWorks.ts) carried no record, so shells and sight passed through drawn stone. Each wall line is
// cut into crushable spans of at most FIELD_WALL_SPAN_M along it, each record a compound of parts of at most
// FIELD_WALL_PART_M, every part the wall's footprint over its slots from its sunk foot to its crown: shells and sight
// stop on the stone, a hull is never stopped (the fieldWorks.ts rule: "should they ever matter in play they become
// crushable like the fences, never blocking") and crushes the span it drives through. A breach carries no record; a
// fallen stretch stands at its own lower height.
//
// Each tier stands the records of the walls it draws: its own lines and its own slot plan (fieldWorks.ts planWallSlots).
// A phone lays its lines on a coarser scan, and laying the desktop's too cost it half its field-works build again (+4.4 s
// on Saltwind in Node), so a phone's spans are its own; the dedicated server's shard is the desktop's, and a peer whose
// spans differ finds a crushed one by its box centre, as it does every lighter mobile placement
// (sim/authoritativeMatch.ts world_prop_destroyed). A crushed span's stone is pressed
// into a low strip of rubble where it stood, in every form the walls draw (the far and mid batches, and a cell's stone
// form when the camera is near), and stands again at a rematch.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import { setCompoundShape, type CollisionRecord, type SimpleCollisionShape } from './collision.ts';
import { planWallSlots } from './fieldWorks.ts';

/** A span's longest run along its line (m): what a hull driving through a wall crushes of it, at most. */
export const FIELD_WALL_SPAN_M = 5;
/** A part's longest run (m): the record follows the wall's crown and its ground part by part. */
export const FIELD_WALL_PART_M = 2.5;
/** The record's half width (m): the wall's battered faces, 0.43-0.51 m at the foot to 0.2 m at the crown, about the
 *  middle of its height. */
const FIELD_WALL_HALF_M = 0.4;
/** How far the drawn foot sinks into the ground (fieldWorks.ts: 0.15 m and more on a slope). */
const FIELD_WALL_SINK_M = 0.15;
/** A wall stands no taller than this over its own ground (fieldWorks.ts FIELD_WORKS_MAX_M less its centimetre). */
const FIELD_WALL_TOP_M = 0.99;
/** What a crushed span keeps of its height over the ground (a strip of tumbled stone), and its reach across the line,
 *  the fallen stones and the turf at the foot included (fieldWorks.ts: every stone within 0.87 m of the line). */
const CRUSH_KEEP = 0.2;
const CRUSH_REACH_M = 0.95;

/** One crushable span of a wall line: its frame (centre, unit axis along, half extents) and its two records. */
export interface FieldWallSpan {
  cx: number; cz: number; ux: number; uz: number;
  halfAlong: number; halfAcross: number;
  /** Its lowest foot (m) and its height over it to its highest crown. */
  y: number; h: number;
  minX: number; maxX: number; minZ: number; maxZ: number;
  obstacle: CollisionRecord;
  collider: CollisionRecord;
}

/**
 * The crushable spans of the field walls (props build, fieldBoundaryWorks.ts): one record pair each, kind 'field-wall',
 * from each line's slot plan on the tier that laid it (`mobile`). `heightAt` is the ground the walls are laid on.
 */
export function fieldWallSpans(
  lines: readonly number[][], noise: SimplexNoise, heightAt: (x: number, z: number) => number, mobile = false,
): FieldWallSpan[] {
  const spans: FieldWallSpan[] = [];
  for (const pts of lines) {
    const n = pts.length / 2;
    if (n < 2) continue;
    const S = [0];
    for (let k = 1; k < n; k++) S.push(S[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]));
    const L = S[n - 1];
    if (L < 1.0) continue; // (layWall lays none)
    const at = (s: number, out: number[]): number[] => {
      let k = 0;
      while (k < n - 2 && S[k + 1] < s) k++;
      const t = Math.min(1, Math.max(0, (s - S[k]) / Math.max(1e-6, S[k + 1] - S[k])));
      out[0] = pts[k * 2] + (pts[k * 2 + 2] - pts[k * 2]) * t;
      out[1] = pts[k * 2 + 1] + (pts[k * 2 + 3] - pts[k * 2 + 1]) * t;
      return out;
    };
    const { slots } = planWallSlots(pts, L, noise, mobile);
    // the spans: runs of standing slots (whole or fallen) at most FIELD_WALL_SPAN_M long; a breach ends one
    let first = -1;
    const close = (end: number) => {
      if (first >= 0) spans.push(spanOf(slots, first, end, at, heightAt));
      first = -1;
    };
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].kind === 2) { close(i); continue; }
      if (first >= 0 && slots[i].s1 - slots[first].s0 > FIELD_WALL_SPAN_M) close(i);
      if (first < 0) first = i;
    }
    close(slots.length);
  }
  return spans;
}

const _a = [0, 0], _b = [0, 0], _m = [0, 0];

/** The span of slots [first, end): its parts, its frame and its record pair. */
function spanOf(
  slots: ReturnType<typeof planWallSlots>['slots'], first: number, end: number,
  at: (s: number, out: number[]) => number[], heightAt: (x: number, z: number) => number,
): FieldWallSpan {
  const parts: SimpleCollisionShape[] = [];
  let low = Infinity, high = -Infinity;
  let p0 = first;
  while (p0 < end) {
    let p1 = p0 + 1;
    while (p1 < end && slots[p1].s1 - slots[p0].s0 <= FIELD_WALL_PART_M) p1++;
    const s0 = slots[p0].s0, s1 = slots[p1 - 1].s1;
    const [ax, az] = at(s0, _a), [bx, bz] = at(s1, _b);
    let ux = bx - ax, uz = bz - az;
    const len = Math.hypot(ux, uz) || 1;
    ux /= len; uz /= len;
    const nx = -uz * FIELD_WALL_HALF_M, nz = ux * FIELD_WALL_HALF_M;
    const points = [ax + nx, az + nz, bx + nx, bz + nz, bx - nx, bz - nz, ax - nx, az - nz];
    // its foot: the lowest ground under its corners, less the sink; its crown: each slot's over the ground at its middle
    let y0 = Infinity, y1 = -Infinity;
    for (let c = 0; c < 8; c += 2) y0 = Math.min(y0, heightAt(points[c], points[c + 1]));
    y0 -= FIELD_WALL_SINK_M;
    for (let i = p0; i < p1; i++) {
      const sl = slots[i];
      const [mx, mz] = at((sl.s0 + sl.s1) / 2, _m);
      y1 = Math.max(y1, heightAt(mx, mz) + Math.min(FIELD_WALL_TOP_M, Math.max(sl.h0, sl.h1) + sl.crest));
    }
    parts.push({ kind: 'convex', cx: 0, cz: 0, points, y0, y1 });
    low = Math.min(low, y0); high = Math.max(high, y1);
    p0 = p1;
  }
  const obstacle: CollisionRecord = { min: [0, low, 0], max: [0, high, 0], kind: 'field-wall' };
  setCompoundShape(obstacle, parts);
  obstacle.min[1] = low; obstacle.max[1] = high;
  const collider: CollisionRecord = { min: [obstacle.min[0], low, obstacle.min[2]], max: [obstacle.max[0], high, obstacle.max[2]], kind: 'field-wall' };
  setCompoundShape(collider, parts.map((part) => ({ ...part, points: (part as { points: number[] }).points.slice() }) as SimpleCollisionShape));
  collider.min[1] = low; collider.max[1] = high;
  const s0 = slots[first].s0, s1 = slots[end - 1].s1;
  const [ax, az] = at(s0, _a), [bx, bz] = at(s1, _b);
  const len = Math.hypot(bx - ax, bz - az) || 1;
  return {
    cx: (ax + bx) / 2, cz: (az + bz) / 2, ux: (bx - ax) / len, uz: (bz - az) / len,
    halfAlong: Math.max(len, s1 - s0) / 2, halfAcross: FIELD_WALL_HALF_M,
    y: low, h: high - low,
    minX: obstacle.min[0], maxX: obstacle.max[0], minZ: obstacle.min[2], maxZ: obstacle.max[2],
    obstacle, collider,
  };
}

/** One form the walls draw (a batch's geometry or a stone form): the standing heights and normals of the vertices any
 *  crush has reached, and how many crushed spans reach each now. */
interface PressTarget {
  attr: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  homeY: Map<number, number>;
  homeN: Map<number, number>;
  count: Map<number, number>;
}

function pressTarget(geometry: THREE.BufferGeometry): PressTarget {
  return { attr: geometry.getAttribute('position') as THREE.BufferAttribute, normal: geometry.getAttribute('normal') as THREE.BufferAttribute,
    homeY: new Map(), homeN: new Map(), count: new Map() };
}

/**
 * The crushed spans' stone pressed into the ground in the forms the walls draw (fieldBoundaryWorks.ts binds the far and
 * mid batches and presses each stone form as it is built). Presentation only: the span's crush event is the authority on
 * its records (crushableClutter.ts setCrushed). A vertex two crushed spans reach stands again once neither is crushed.
 */
export class FieldWallCrush {
  private readonly crushed = new Set<FieldWallSpan>();
  private readonly batchTargets: Array<{ batch: THREE.BatchedMesh; target: PressTarget; cells: Array<{ box: CellBox; start: number; count: number }> }> = [];
  private readonly stoneTargets = new WeakMap<THREE.BufferGeometry, PressTarget>();
  /** Each span's vertices in each form it reaches (found once). */
  private readonly reach = new Map<FieldWallSpan, Map<PressTarget, Map<number, Uint32Array>>>();
  private stones: () => Iterable<{ box: CellBox; geometry: THREE.BufferGeometry }> = () => [];

  private readonly heightAt: (x: number, z: number) => number;

  constructor(heightAt: (x: number, z: number) => number) { this.heightAt = heightAt; }

  /** A batch of wall cells (one instance each, -1 for none) whose geometry a crush presses. */
  bindBatch(batch: THREE.BatchedMesh, cells: Array<{ box: CellBox; instance: number }>): void {
    const ranges: Array<{ box: CellBox; start: number; count: number }> = [];
    for (const { box, instance } of cells) {
      if (instance < 0) continue;
      const range = batch.getGeometryRangeAt(batch.getGeometryIdAt(instance));
      if (range) ranges.push({ box, start: range.vertexStart, count: range.vertexCount });
    }
    this.batchTargets.push({ batch, target: pressTarget(batch.geometry), cells: ranges });
  }

  /** The cells' stone forms shown now (the camera's near cells). */
  bindStones(list: () => Iterable<{ box: CellBox; geometry: THREE.BufferGeometry }>): void { this.stones = list; }

  /** Is this span crushed now? */
  isCrushed(span: FieldWallSpan): boolean { return this.crushed.has(span); }

  /** A span crushed or standing again (its clutter's crush hook). */
  press(span: FieldWallSpan, crushed: boolean): void {
    if (crushed === this.crushed.has(span)) return;
    if (crushed) this.crushed.add(span); else this.crushed.delete(span);
    for (const { target, cells } of this.batchTargets) {
      for (const cell of cells) {
        if (overlaps(cell.box, span)) this.pressRun(target, span, cell.start, cell.count, crushed);
      }
    }
    for (const { box, geometry } of this.stones()) {
      if (overlaps(box, span)) this.pressRun(this.stoneTarget(geometry), span, 0, -1, crushed);
    }
  }

  /** A stone form just built for a cell: every crushed span over it pressed into it. */
  pressBuilt(geometry: THREE.BufferGeometry, box: CellBox): void {
    for (const span of this.crushed) if (overlaps(box, span)) this.pressRun(this.stoneTarget(geometry), span, 0, -1, true);
  }

  private stoneTarget(geometry: THREE.BufferGeometry): PressTarget {
    let target = this.stoneTargets.get(geometry);
    if (!target) { target = pressTarget(geometry); this.stoneTargets.set(geometry, target); }
    return target;
  }

  /** Press (or stand again) the span's vertices in one run of one form. */
  private pressRun(target: PressTarget, span: FieldWallSpan, start: number, count: number, crushed: boolean): void {
    const { attr, normal, homeY, homeN } = target;
    // (a stone form is pressed whole, a batch cell's run by run; each run's vertices found once)
    let forms = this.reach.get(span);
    if (!forms) { forms = new Map(); this.reach.set(span, forms); }
    let runs = forms.get(target);
    if (!runs) { runs = new Map(); forms.set(target, runs); }
    let found = runs.get(start);
    if (!found) { found = gather(attr, start, count < 0 ? attr.count : count, span); runs.set(start, found); }
    let lo = Infinity, hi = -Infinity;
    for (const i of found) {
      if (!homeY.has(i)) {
        homeY.set(i, attr.getY(i));
        homeN.set(i * 3, normal.getX(i)); homeN.set(i * 3 + 1, normal.getY(i)); homeN.set(i * 3 + 2, normal.getZ(i));
      }
      const before = target.count.get(i) ?? 0, after = before + (crushed ? 1 : -1);
      target.count.set(i, Math.max(0, after));
      if ((before > 0) === (after > 0)) continue;
      const y = homeY.get(i)!, nx = homeN.get(i * 3)!, ny = homeN.get(i * 3 + 1)!, nz = homeN.get(i * 3 + 2)!;
      if (after > 0) {
        const g = this.heightAt(attr.getX(i), attr.getZ(i));
        attr.setY(i, Math.min(y, g + (y - g) * CRUSH_KEEP));
        const py = ny / CRUSH_KEEP, l = Math.hypot(nx, py, nz) || 1;
        normal.setXYZ(i, nx / l, py / l, nz / l);
      } else {
        attr.setY(i, y);
        normal.setXYZ(i, nx, ny, nz);
      }
      if (i < lo) lo = i;
      if (i > hi) hi = i;
    }
    if (hi < lo) return;
    attr.addUpdateRange(lo * 3, (hi - lo + 1) * 3); attr.needsUpdate = true;
    normal.addUpdateRange(lo * 3, (hi - lo + 1) * 3); normal.needsUpdate = true;
  }
}

type CellBox = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Does a cell's box meet a span's reach? */
function overlaps(box: CellBox, span: FieldWallSpan): boolean {
  const r = CRUSH_REACH_M;
  return box.minX <= span.maxX + r && box.maxX >= span.minX - r && box.minZ <= span.maxZ + r && box.maxZ >= span.minZ - r;
}

/** The vertices of [start, start + count) a span reaches (within its run along the line and CRUSH_REACH_M across). */
function gather(attr: THREE.BufferAttribute, start: number, count: number, span: FieldWallSpan): Uint32Array {
  const found: number[] = [];
  for (let i = start; i < start + count; i++) {
    const dx = attr.getX(i) - span.cx, dz = attr.getZ(i) - span.cz;
    const along = dx * span.ux + dz * span.uz, across = -dx * span.uz + dz * span.ux;
    if (Math.abs(along) <= span.halfAlong && Math.abs(across) <= CRUSH_REACH_M) found.push(i);
  }
  return Uint32Array.from(found);
}
