// src/world/maps/regional/rubblePile.ts — the street rubble pile (props.ts addRubblePile; the collapsed rowhouse slots'
// spill), extracted from ruinGrammar.ts (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so
// its builder was taken extract-then-own) and rebuilt here on the r2 standard.
//
// The r2 sweep measured its pieces all plain boxes (boxShare 1.00 on all 25 maps that lay it: every chunk, course,
// shard, plank and the beam an eight-cornered hexahedron) and its apron's shards floating where the street fell away from
// the pile's seat (5 islands on Saltwind, gaps to 0.24 m). Now the chunks and the bonded courses are broken masonry: each
// face spalled — its middle knocked in a few centimetres, off centre (spallFaces) — the charred beam burnt thin through
// its middle (charWaist), and every shard bedded on the ground under it (`groundAt`, the props pass's height field).
// What the street stream draws, and the collision records and drawn plan the pile hands props.ts, stay as they were: the
// spalls and the char only add points inside each piece's hull, from a stream of the pile's own seat, and a shard's seat
// keeps its top under the records' floor.
import * as THREE from 'three';
import { box, jitterUV } from '../../propGeometry.ts';

const _rubbleOff = new Float32Array(24);
/**
 * A box roughened into an irregular broken-masonry hexahedron: each of its eight corners moved by its own offset (shared
 * corners move together, so the faces stay welded). Draws 24 numbers from `rrng`.
 */
export function roughenChunk<T extends THREE.BufferGeometry>(chunk: T, rrng: () => number, amt: number): T {
  for (let c = 0; c < 8; c++) {
    _rubbleOff[c * 3] = (rrng() - 0.5) * amt;
    _rubbleOff[c * 3 + 1] = (rrng() - 0.5) * amt * 0.7;
    _rubbleOff[c * 3 + 2] = (rrng() - 0.5) * amt;
  }
  const cp = chunk.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const ci = (cp.getX(i) > 0 ? 1 : 0) + (cp.getY(i) > 0 ? 2 : 0) + (cp.getZ(i) > 0 ? 4 : 0);
    cp.setXYZ(i, cp.getX(i) + _rubbleOff[ci * 3], cp.getY(i) + _rubbleOff[ci * 3 + 1],
      cp.getZ(i) + _rubbleOff[ci * 3 + 2]);
  }
  chunk.computeVertexNormals();
  return chunk;
}

/**
 * A street rubble pile's pieces at (x, y, z), `pr` across: heaped masonry chunks of three classes (blocks, wall slabs,
 * brick clumps) over a ring of brick shards feathering it into the ground, and a charred beam jutting out of most.
 * Drawn from `rrng` exactly as props.ts drew them (the pile's draws feed the street's next candidates). `chunks`: how many
 * of the stone pieces (the first) are the heap's chunks, before the shards. `groundAt` (the props pass's height field)
 * beds the shards on the street; `bed`: the shards' apron and the debris heaped under pieces that stand clear (stone,
 * drawn with the pile, outside its records and drawn plan).
 */
export function rubblePileParts(x: number, y: number, z: number, pr: number, rrng: () => number,
  groundAt?: (x: number, z: number) => number): { stone: THREE.BufferGeometry[]; wood: THREE.BufferGeometry[]; chunks: number; bed: THREE.BufferGeometry[] } {
  const stone: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], bed: THREE.BufferGeometry[] = [];
  // (looks r2) the spalls' and the char's own stream, from the pile's seat (never the street's; the fill and the courses
  // keep theirs)
  const sp = seatStream(x + SPALL_SALT, z - SPALL_SALT);
  let charred: { len: number; rx: number; ry: number } | null = null;
  const n = 6 + ((rrng() * 5) | 0);
  for (let k = 0; k < n; k++) {
    const a = rrng() * Math.PI * 2, rr = Math.sqrt(rrng()) * pr;
    const cs = 0.35 + rrng() * 0.8;
    // mix chunk classes: blocky masonry / flat slab / brick-proportioned
    const cls = rrng();
    const chunk = cls < 0.55
      ? box(cs, cs * (0.5 + rrng() * 0.5), cs * (0.6 + rrng() * 0.6), 0.9)
      : cls < 0.8
        ? box(cs * 1.3, cs * 0.22, cs * (0.8 + rrng() * 0.5), 0.9)   // wall slab
        : box(cs * 0.7, cs * 0.3, cs * 0.35, 0.9);                    // brick clump
    roughenChunk(chunk, rrng, cs * 0.34);
    jitterUV(chunk, rrng);
    chunk.rotateY(rrng() * Math.PI);
    chunk.rotateX((rrng() - 0.5) * 0.5);
    chunk.translate(x + Math.cos(a) * rr, y + 0.12 + (1 - rr / pr) * pr * 0.35, z + Math.sin(a) * rr);
    stone.push(chunk);
  }
  // brick-shard apron: small debris feathering the pile into the ground
  for (let k = 0; k < 7; k++) {
    const a = rrng() * Math.PI * 2, rr = pr * (0.8 + rrng() * 0.6);
    const bs = 0.10 + rrng() * 0.16;
    const shard = roughenChunk(box(bs * 1.7, bs * 0.7, bs, 1.2), rrng, bs * 0.4);
    shard.rotateY(rrng() * Math.PI);
    const sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
    if (groundAt) {
      // (looks r2) bedded 1.5 cm into the street under it, where it falls away from (or rises over) the pile's seat
      shard.computeBoundingBox();
      shard.translate(sx, groundAt(sx, sz) - 0.015 - shard.boundingBox!.min.y, sz);
    } else shard.translate(sx, y + 0.05, sz);
    // (looks r2) the apron is drawn with the pile but kept out of its records, as it always was (rubbleCollision.ts: a
    // shard lies under the floor and carries none) — now whatever the street does under it
    bed.push(shard);
  }
  if (rrng() < 0.6) { // charred beam jutting out
    const len = 2.2 + rrng() * 1.4, rx = -0.5 - rrng() * 0.4, ry = rrng() * Math.PI * 2;
    const beam = box(0.14, 0.14, len, 1.0);
    beam.rotateX(rx);
    beam.rotateY(ry);
    beam.translate(x, y + pr * 0.4, z);
    wood.push(beam);
    charred = { len, rx, ry };
  }
  // (props census #7, lane B 2026-10-14; the judges: "loose boxes on the road, no body to the heap") the heap's fill
  // body under its chunks — sunk at its edge, its crown under the chunks' — and the other chunk classes bedded in it:
  // brick courses still bonded, planks, all from the pile's own seat (a hash of it: the street stream is never drawn)
  const h = seatStream(x, z);
  stone.push(fillBody(x, y, z, pr, h));
  for (let k = 0; k < 3; k++) {
    const a = h() * Math.PI * 2, rr = (0.25 + h() * 0.6) * pr, bl = 0.6 + h() * 0.5;
    const course = spallFaces(roughenChunk(box(bl, 0.16, 0.24, 0.9), h, 0.05), sp, 0.05, 0.14);
    course.rotateZ((h() - 0.5) * 0.6);
    course.rotateY(h() * Math.PI);
    course.translate(x + Math.cos(a) * rr, y + fillAt(rr / pr, pr) - 0.05, z + Math.sin(a) * rr);
    stone.push(course);
  }
  for (let k = 0; k < 2; k++) {
    const a = h() * Math.PI * 2, rr = (0.2 + h() * 0.5) * pr, len = 1.0 + h() * 0.8;
    const plank = box(len, 0.05, 0.2, 1.0);
    plank.rotateZ(-0.35 - h() * 0.4);
    plank.rotateY(h() * Math.PI * 2);
    plank.translate(x + Math.cos(a) * rr, y + fillAt(rr / pr, pr) + 0.1, z + Math.sin(a) * rr);
    wood.push(plank);
  }
  // (looks r2) the chunks spalled and the beam charred where no new point reaches past the plan props.ts draws round
  // the heap (drawnPlanRecord: the chunks' and the wood's points over the seat + PLAN_OVER_M, their hull); the courses
  // are not in it (their collision is their hull's)
  const guard = planGuard([...stone.slice(0, n), ...wood], y + PLAN_OVER_M);
  for (let k = 0; k < n; k++) spallFaces(stone[k], sp, 0.06, 0.18, guard);
  if (charred) {
    const waisted = charWaist(box(0.14, 0.14, charred.len, 1.0), sp);
    waisted.rotateX(charred.rx);
    waisted.rotateY(charred.ry);
    waisted.translate(x, y + pr * 0.4, z);
    const pos = waisted.getAttribute('position');
    let fits = true;
    for (let i = 0; i < pos.count && fits; i++) fits = guard(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (fits) { wood[0].dispose(); wood[0] = waisted; } else waisted.dispose();
  }
  // (looks r2) a piece that stands clear of the fill (or of the street past it) where its foot is lowest sits on a bed of
  // smaller debris and dust heaped up to it: `bed`, drawn in the stone with the pile and crushed with it, but no part of
  // its records or its drawn plan (the pieces' own)
  // (the widest gaps first, within the pile's near cap)
  const fill = stone[n], under = (px: number, pz: number) => Math.max(fillHeightAt(fill, px, pz), groundAt ? groundAt(px, pz) : y);
  const feet: Array<{ x: number; y: number; z: number; gap: number }> = [];
  for (const piece of [...stone.slice(0, n), ...stone.slice(n + 1), ...wood.slice(charred ? 1 : 0)]) {
    const a = piece.getAttribute('position');
    let lo = 0;
    for (let i = 1; i < a.count; i++) if (a.getY(i) < a.getY(lo)) lo = i;
    const lx = a.getX(lo), ly = a.getY(lo), lz = a.getZ(lo), gap = ly - under(lx, lz);
    if (gap > BED_GAP_M) feet.push({ x: lx, y: ly, z: lz, gap });
  }
  let tris = 0;
  for (const g of [...stone, ...wood, ...bed]) tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  feet.sort((p, q) => q.gap - p.gap);
  for (const f of feet) {
    if (tris + BED_TRIS > PILE_TRIS) break;
    const g = new THREE.BufferGeometry();
    bed.push(debrisBed(g, f.x, f.z, f.y - f.gap - 0.04, f.y + 0.012, Math.min(0.32, 0.1 + f.gap * 0.8), sp));
    tris += BED_TRIS;
  }
  return { stone, wood, chunks: n, bed };
}

/** The spalls' stream's seat offset (m): a stream of its own beside the fill's. */
const SPALL_SALT = 0.37;
/** The pile's near triangles at most (props census #7's cap): the beds take what the pieces leave. */
const PILE_TRIS = 600;

/**
 * Broken masonry's faces: every face of a (roughened) box knocked in at its middle — a point off its centre (its corners'
 * weights drawn from `sp`) moved `lo`..`hi` of the way to the piece's centroid, the face fanned to it — so the chunk reads
 * as spalled stone, not a box. Every new point lies inside the piece's hull (its collision and drawn plan unchanged).
 * Takes an indexed BoxGeometry (four corners and two triangles a face); returns it rebuilt, indexed. `guard` refuses a
 * point (the face then keeps its two triangles).
 */
function spallFaces<T extends THREE.BufferGeometry>(chunk: T, sp: () => number, lo: number, hi: number,
  guard: (x: number, y: number, z: number) => boolean = () => true): T {
  const pos = chunk.getAttribute('position'), uv = chunk.getAttribute('uv'), index = chunk.getIndex();
  if (!index || index.count % 6) return chunk;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pos.count; i++) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
  cx /= pos.count; cy /= pos.count; cz /= pos.count;
  const P: number[] = [], U: number[] = [], I: number[] = [];
  for (let f = 0; f < index.count; f += 6) {
    // the face's quad from its two triangles (a, b, d) (b, c, d): a b c d round it
    const a = index.getX(f), b = index.getX(f + 1), d = index.getX(f + 2), c = index.getX(f + 4);
    const quad = [a, b, c, d], base = P.length / 3;
    const w = quad.map(() => 0.6 + sp() * 0.8), ws = w[0] + w[1] + w[2] + w[3], t = lo + sp() * (hi - lo);
    let mx = 0, my = 0, mz = 0, mu = 0, mv = 0;
    quad.forEach((v, k) => {
      P.push(pos.getX(v), pos.getY(v), pos.getZ(v)); U.push(uv.getX(v), uv.getY(v));
      mx += pos.getX(v) * w[k] / ws; my += pos.getY(v) * w[k] / ws; mz += pos.getZ(v) * w[k] / ws;
      mu += uv.getX(v) * w[k] / ws; mv += uv.getY(v) * w[k] / ws;
    });
    // (no deeper than a third of the face's shortest edge: a narrow face is nicked, not grooved)
    let edge = Infinity;
    for (let k = 0; k < 4; k++) {
      const p = quad[k], q = quad[(k + 1) % 4];
      edge = Math.min(edge, Math.hypot(pos.getX(q) - pos.getX(p), pos.getY(q) - pos.getY(p), pos.getZ(q) - pos.getZ(p)));
    }
    const reach = Math.hypot(cx - mx, cy - my, cz - mz) * t, k0 = reach > edge / 3 ? (edge / 3) / reach * t : t;
    let placed = false;
    for (const k1 of [k0, k0 / 2, k0 / 4]) {
      const px = mx + (cx - mx) * k1, py = my + (cy - my) * k1, pz = mz + (cz - mz) * k1;
      if (!guard(px, py, pz)) continue;
      P.push(px, py, pz); U.push(mu, mv);
      for (let k = 0; k < 4; k++) I.push(base + k, base + ((k + 1) % 4), base + 4);
      placed = true;
      break;
    }
    // (a face the guard refuses keeps its two triangles: a b d, b c d)
    if (!placed) I.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  chunk.copy(g as unknown as T);
  chunk.clearGroups();
  g.dispose();
  return chunk;
}

/**
 * A charred beam: a box (along its z) burnt thinner through its middle — a ring of four points at a draw of its length,
 * each taken in 8-18 % toward its axis, the long faces broken over it. The ends keep their corners (its hull and drawn
 * plan unchanged).
 */
function charWaist<T extends THREE.BufferGeometry>(beam: T, sp: () => number): T {
  beam.computeBoundingBox();
  const bb = beam.boundingBox!, hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2, z0 = bb.min.z, z1 = bb.max.z;
  const zm = z0 + (z1 - z0) * (0.35 + sp() * 0.3);
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const mid = corners.map(([sx, sy]) => { const k = 1 - (0.08 + sp() * 0.1); return [sx * hx * k, sy * hy * k] as const; });
  const P: number[] = [], U: number[] = [], I: number[] = [];
  const ring = (zz: number, pts: ReadonlyArray<readonly [number, number]>) => pts.map(([px, py]) => [px, py, zz] as const);
  const rings = [ring(z0, corners.map(([sx, sy]) => [sx * hx, sy * hy] as const)), ring(zm, mid), ring(z1, corners.map(([sx, sy]) => [sx * hx, sy * hy] as const))];
  const vz = [0, (zm - z0), z1 - z0];
  // the four long faces, in two runs over the char ring (each face its own corners: flat-shaded timber faces)
  for (let side = 0; side < 4; side++) {
    const n = (side + 1) % 4;
    for (let r = 0; r < 2; r++) {
      const base = P.length / 3;
      for (const [ri, ci] of [[r, side], [r, n], [r + 1, n], [r + 1, side]] as const) {
        P.push(...rings[ri][ci]); U.push(ci === side ? 0 : 0.14, vz[ri]);
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  // the two end grains
  for (const [ri, flip] of [[0, true], [2, false]] as const) {
    const base = P.length / 3;
    for (const p of rings[ri]) { P.push(...p); U.push(p[0] + 0.07, p[1] + 0.07); }
    if (flip) I.push(base, base + 2, base + 1, base, base + 3, base + 2); else I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  beam.copy(g as unknown as T);
  beam.clearGroups();
  g.dispose();
  return beam;
}

/** props.ts addRubblePile's drawn plan: the points over the seat by this much (drawnPlanRecord's `over`). */
const PLAN_OVER_M = 0.05;

/**
 * A point the drawn plan would not change for: under the plan's floor, or strictly inside (by 2 mm) the hull of the
 * points over it as drawn (the pieces' own corners).
 */
function planGuard(pieces: readonly THREE.BufferGeometry[], floor: number): (x: number, y: number, z: number) => boolean {
  const pts: Array<[number, number]> = [];
  for (const g of pieces) {
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) if (a.getY(i) > floor) pts.push([a.getX(i), a.getZ(i)]);
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: [number, number], p: [number, number], q: [number, number]) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const lower: Array<[number, number]> = [], upper: Array<[number, number]> = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return (x, y, z) => {
    if (y <= floor - 1e-4) return true;
    if (hull.length < 3) return false;
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i], q = hull[(i + 1) % hull.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      // counter-clockwise hull: inside is the left of each edge
      if (((q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0])) / len < 0.002) return false;
    }
    return true;
  };
}

/** A piece's foot this far over what is under it gets a bed (the r2 grounding reads 2 cm). */
const BED_GAP_M = 0.012;

/** The fill body's height at (x, z) (its triangles cast down on), or -Infinity off it. */
function fillHeightAt(fill: THREE.BufferGeometry, x: number, z: number): number {
  const p = fill.getAttribute('position'), ix = fill.getIndex();
  let best = -Infinity;
  if (!ix) return best;
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
    const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c);
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-12) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    best = Math.max(best, u * p.getY(a) + v * p.getY(b) + w * p.getY(c));
  }
  return best;
}

/** A bed's triangles (debrisBed: five sides and its crown). */
const BED_TRIS = 13;

/**
 * A bed of smaller debris under a piece's foot (into `g`): a five-sided heap from `y0` (sunk into what it lies on) at
 * radius r up to a crown at `y1` that meets the piece; its corners jittered from `sp`.
 */
function debrisBed(g: THREE.BufferGeometry, x: number, z: number, y0: number, y1: number, r: number, sp: () => number): THREE.BufferGeometry {
  const seg = 5, rings: Array<[number, number]> = [[1, y0], [0.38, y1]];
  const P: number[] = [], U: number[] = [], I: number[] = [];
  const jit = Array.from({ length: seg }, () => 0.8 + sp() * 0.4), turn = sp() * Math.PI;
  for (const [s, yy] of rings) {
    for (let j = 0; j < seg; j++) {
      const t = turn + (j / seg) * Math.PI * 2, rr = r * s * jit[j];
      P.push(x + Math.cos(t) * rr, yy, z + Math.sin(t) * rr); U.push(P[P.length - 3] * 0.9, P[P.length - 1] * 0.9 + yy);
    }
  }
  for (let j = 0; j < seg; j++) {
    const j1 = (j + 1) % seg;
    I.push(j, seg + j1, j1, j, seg + j, seg + j1);
  }
  // the crown
  for (let j = 1; j + 1 < seg; j++) I.push(seg, seg + j + 1, seg + j);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

/** A deterministic stream from a seat (its position to the centimetre): no draw from the street's stream. */
function seatStream(x: number, z: number): () => number {
  let a = (Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(z * 100), 19349663)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fill's height over the seat at a fraction `s` of the pile's radius out from its middle. */
function fillAt(s: number, pr: number): number {
  return Math.max(0, pr * 0.42 * (1 - s * s));
}

/** The heap's fill body: a low mound of rings out from its crown, its edge sunk 0.6 m (a slope's fall stays covered). */
function fillBody(x: number, y: number, z: number, pr: number, h: () => number): THREE.BufferGeometry {
  const seg = 10, rings: Array<[number, number]> = [[0.3, fillAt(0.3, pr)], [0.6, fillAt(0.6, pr)], [0.9, fillAt(0.9, pr) + 0.04], [1.18, -0.6]];
  const pos: number[] = [], idx: number[] = [];
  pos.push(x, y + fillAt(0, pr) + 0.02, z);
  const jit = Array.from({ length: seg }, () => 0.85 + h() * 0.3);
  for (const [s, hy] of rings) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, r = s * pr * jit[j];
      pos.push(x + Math.cos(a) * r, y + hy * (s < 1.1 ? jit[j] : 1), z + Math.sin(a) * r);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let r = 0; r + 1 < rings.length; r++) {
    const a0 = 1 + r * seg, b0 = 1 + (r + 1) * seg;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      idx.push(a0 + j, a0 + j1, b0 + j1, a0 + j, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.5, pos[i + 2] * 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
