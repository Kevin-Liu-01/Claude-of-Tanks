// Interior-fill face cull (tank-opt HIDDEN, 2026-10-16; owner 2026-10-15: "inside the tanks where we cant see, we
// dont have unneeded geometry"). interiorFills.ts draws each component's generated boxes (hull, turret, gun: each one
// rigid solid that moves as a unit) as one mesh. A box face pressed flat against neighbouring boxes of the same
// component lies inside that component's own solid: every ray that reaches it has already entered the solid through
// a face that is drawn, in every pose, at every quality, alive or blown off, so the face can never be seen. Its two
// triangles are pure cost (19 % of the fleet's fill triangles on 2026-10-16). This module finds those faces exactly,
// on the integer voxel spans, so the mesher can leave them out; every other face is drawn bit for bit as before, and
// the solid's outer surface (positions, normals, winding) is unchanged. Pure data in, pure data out: no three, no DOM.

/** The mesher's face order (interiorFills.ts): +x, -x, +y, -y, +z, -z. Bit f of a box's mask is face f. */
const FACE_BITS = 6;

// Reused clip rectangles of the faces' covering neighbours (build-time only; grown on demand, never shrunk).
let clipScratch = new Int32Array(64);

function clipBuffer(rects: number): Int32Array {
  if (clipScratch.length < rects * 4) clipScratch = new Int32Array(Math.max(rects * 4, clipScratch.length * 2));
  return clipScratch;
}

/**
 * True when the face rectangle [u0,u1) x [v0,v1) is covered, cell for cell, by the candidates' (u, v) rectangles.
 * Coverage counts only when the clipped rectangles are pairwise disjoint and their areas sum to the face's: then their
 * union is the face exactly. Overlapping candidates (never produced by the generator's greedy remesh) keep the face.
 */
function faceCovered(
  candidates: readonly number[] | undefined, self: number, lo: Int32Array, hi: Int32Array, u: number, v: number,
  u0: number, u1: number, v0: number, v1: number,
): boolean {
  if (!candidates) return false;
  const clip = clipBuffer(candidates.length);
  let rects = 0, area = 0;
  for (const other of candidates) {
    if (other === self) continue;
    const a0 = Math.max(u0, lo[3 * other + u]), a1 = Math.min(u1, hi[3 * other + u]);
    if (a1 <= a0) continue;
    const b0 = Math.max(v0, lo[3 * other + v]), b1 = Math.min(v1, hi[3 * other + v]);
    if (b1 <= b0) continue;
    for (let k = 0; k < rects; k++) {
      if (a0 < clip[4 * k + 1] && clip[4 * k] < a1 && b0 < clip[4 * k + 3] && clip[4 * k + 2] < b1) return false;
    }
    clip[4 * rects] = a0; clip[4 * rects + 1] = a1; clip[4 * rects + 2] = b0; clip[4 * rects + 3] = b1;
    rects++;
    area += (a1 - a0) * (b1 - b0);
  }
  return area === (u1 - u0) * (v1 - v0);
}

function pushPlane(planes: Map<number, number[]>, plane: number, box: number): void {
  const list = planes.get(plane);
  if (list) list.push(box); else planes.set(plane, [box]);
}

/**
 * One mask per box of `spans` (Uint16 sextets [x0, y0, z0, x1, y1, z1], inclusive voxel spans of one component):
 * bit f is set when face f lies entirely inside the component's union, i.e. the voxel layer just beyond the face is
 * covered by boxes that begin (for a max face) or end (for a min face) on the face's plane. Exact on integers and
 * sound for any box set: a face is only reported when its whole outer layer is solid, so a boundary face is never cut.
 */
export function internalFillFaces(spans: ArrayLike<number>): Uint8Array {
  const count = Math.floor(spans.length / 6);
  const mask = new Uint8Array(count);
  if (count < 2) return mask;
  // half-open bounds per box and axis: [lo, hi) with hi = x1 + 1
  const lo = new Int32Array(count * 3), hi = new Int32Array(count * 3);
  for (let b = 0; b < count; b++) {
    for (let a = 0; a < 3; a++) { lo[3 * b + a] = spans[6 * b + a]; hi[3 * b + a] = spans[6 * b + 3 + a] + 1; }
  }
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const starts = new Map<number, number[]>(), ends = new Map<number, number[]>();
    for (let b = 0; b < count; b++) { pushPlane(starts, lo[3 * b + a], b); pushPlane(ends, hi[3 * b + a], b); }
    for (let b = 0; b < count; b++) {
      const u0 = lo[3 * b + u], u1 = hi[3 * b + u], v0 = lo[3 * b + v], v1 = hi[3 * b + v];
      // max face (+axis): the layer beyond it belongs to the boxes that start on its plane
      if (faceCovered(starts.get(hi[3 * b + a]), b, lo, hi, u, v, u0, u1, v0, v1)) mask[b] |= 1 << (2 * a);
      // min face (-axis): the layer before it belongs to the boxes that end on its plane
      if (faceCovered(ends.get(lo[3 * b + a]), b, lo, hi, u, v, u0, u1, v0, v1)) mask[b] |= 1 << (2 * a + 1);
    }
  }
  return mask;
}

/** Faces a mask leaves drawn, over all boxes. */
export function drawnFillFaces(mask: Uint8Array): number {
  let drawn = 0;
  for (let b = 0; b < mask.length; b++) {
    let bits = mask[b];
    let culled = 0;
    while (bits) { culled += bits & 1; bits >>= 1; }
    drawn += FACE_BITS - culled;
  }
  return drawn;
}
