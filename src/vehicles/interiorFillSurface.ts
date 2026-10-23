// Interior-fill surface (tank-opt HIDDEN, 2026-10-16; owner 2026-10-15: "inside the tanks where we cant see, we dont
// have unneeded geometry"). interiorFills.ts draws each component's generated boxes (hull, turret, gun: each one rigid
// solid) as one mesh. Drawn as closed boxes, about a fifth of the faces lie inside the component's own solid. This
// module meshes the solid's boundary instead, exactly, on the integer voxel lattice:
//   - on every lattice plane the boundary is the cells with solid on one side and air on the other (the faces of the
//     boxes that end on the plane minus those that start there, and the reverse): planar regions, buried faces gone;
//   - the surface is CONFORMING: a vertex is a lattice point where the surface is not flat (a region's corner), every
//     region is triangulated through every such vertex on its outline and through no other point, and every vertex is
//     computed once. No vertex sits on another triangle's edge (no T-junction): the triangles on the two sides of an
//     edge share its endpoints bit for bit.
// Why conforming (the adversarial verify of the first cut, which only dropped wholly buried box faces): box faces meet
// at T-junctions, and anything that moves vertices one by one opens hairline cracks there — the GPU's own sub-pixel
// vertex snapping, the wreck's dents. Closed boxes hide those cracks behind their buried faces; dropping the faces
// turned the cracks into pinholes into the solid. A conforming surface has no crack to hide: a shared vertex lands
// where it lands for every triangle that uses it, so the surface stays closed under any per-vertex motion, a battle
// wreck's dents included. (A map hulk's bake keeps the closed boxes, interiorFills.ts: its triangles count against
// the map's wreck budget.)
//
// A region with no hole is a simple polygon, ear-clipped on exact integer arithmetic (its collinear outline vertices
// kept, so n vertices give n − 2 triangles). A region with a hole (rare) is cut into rectangles, and their corners join
// the vertex set first, so its neighbours split their edges there too. Pure data, no three, no DOM; build-time only.

/** One component's boundary surface on the voxel lattice. */
export interface InteriorFillSurface {
  /** Triangle corners as lattice coordinates (a box spanning voxels x0..x1 runs from x0 to x1 + 1), 9 per triangle,
   *  counter-clockwise seen from outside the solid. */
  readonly corners: Int32Array;
  /** Outward face per triangle (0..5: +x, -x, +y, -y, +z, -z). */
  readonly faces: Uint8Array;
  /** Planar regions triangulated as polygons, and those (with holes) cut into rectangles. */
  readonly polygons: number;
  readonly rectangleRegions: number;
}

/** Ascending sort, then drop repeats; returns the new length (short runs by insertion, the rest by the typed sort). */
function sortDistinct(values: Float64Array | Int32Array, length: number): number {
  if (length <= 24) {
    for (let i = 1; i < length; i++) {
      const value = values[i];
      let j = i - 1;
      while (j >= 0 && values[j] > value) { values[j + 1] = values[j]; j--; }
      values[j + 1] = value;
    }
  } else values.subarray(0, length).sort();
  let w = 0;
  for (let i = 0; i < length; i++) if (w === 0 || values[i] !== values[w - 1]) values[w++] = values[i];
  return w;
}

/** First index in sorted[0, length) whose value exceeds `value`. */
function upperBound(sorted: Float64Array | Int32Array, length: number, value: number): number {
  let a = 0, b = length;
  while (a < b) { const m = (a + b) >> 1; if (sorted[m] <= value) a = m + 1; else b = m; }
  return a;
}

/** An integer-keyed array: Int32 (the fast sort) when every key fits, Float64 (exact below 2^53) otherwise. */
const keyArray = (length: number, maxKey: number): Float64Array | Int32Array =>
  maxKey < 2 ** 31 ? new Int32Array(length) : new Float64Array(length);

// Regions, as collected: kind (POLYGON: n, then n (u, v) corners counter-clockwise; RECTS: n, then n (u0, u1, v0, v1)),
// face, plane.
const POLYGON = 0, RECTS = 1;

// Reused build-time scratch, grown on demand and never shrunk (a cluster is resolved at a time).
let cutsScratch: Int32Array = new Int32Array(64), sumScratch: Int32Array = new Int32Array(256);
let labelScratch: Int32Array = new Int32Array(256), seenScratch: Int32Array = new Int32Array(256);
let firstOutScratch: Int32Array = new Int32Array(256), secondOutScratch: Int32Array = new Int32Array(256);
let usedScratch = new Uint8Array(256);
const grownI32 = (array: Int32Array, size: number): Int32Array => (array.length >= size ? array : new Int32Array(Math.max(size, 2 * array.length)));

/**
 * The boundary regions of one cluster of a plane's faces (`faces`: sign, u0, u1, v0, v1 each, +1 for a box ending on
 * the plane, −1 for one starting there; `members` the cluster's face numbers). With disjoint boxes a cell's coverage
 * sum is +1 where only a box below touches the plane (air above: the +axis boundary), −1 where only a box above does,
 * 0 elsewhere. Each 4-connected region of one sign is traced as its outline (a polygon) or, with a hole, cut into
 * greedy rectangles.
 */
function clusterRegions(face: number, plane: number, faces: readonly number[], members: readonly number[], out: number[]): boolean {
  const m = members.length;
  cutsScratch = grownI32(cutsScratch, 4 * m);
  const us = cutsScratch.subarray(0, 2 * m), vs = cutsScratch.subarray(2 * m, 4 * m);
  for (let k = 0; k < m; k++) {
    const f = 5 * members[k];
    us[2 * k] = faces[f + 1]; us[2 * k + 1] = faces[f + 2]; vs[2 * k] = faces[f + 3]; vs[2 * k + 1] = faces[f + 4];
  }
  const nus = sortDistinct(us, 2 * m), nvs = sortDistinct(vs, 2 * m);
  const nu = nus - 1, nv = nvs - 1, stride = nu + 1;
  // a 2D difference grid over the cluster's cuts, then prefix sums: the coverage sum per cell
  const points = stride * (nv + 1);
  sumScratch = grownI32(sumScratch, points);
  const sum = sumScratch;
  sum.fill(0, 0, points);
  for (let k = 0; k < m; k++) {
    const f = 5 * members[k], s = faces[f];
    const i0 = upperBound(us, nus, faces[f + 1]) - 1, i1 = upperBound(us, nus, faces[f + 2]) - 1;
    const j0 = upperBound(vs, nvs, faces[f + 3]) - 1, j1 = upperBound(vs, nvs, faces[f + 4]) - 1;
    sum[j0 * stride + i0] += s; sum[j0 * stride + i1] -= s;
    sum[j1 * stride + i0] -= s; sum[j1 * stride + i1] += s;
  }
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * stride + i;
    if (i > 0) sum[k] += sum[k - 1];
    if (j > 0) sum[k] += sum[k - stride];
    if (i > 0 && j > 0) sum[k] -= sum[k - stride - 1];
  }
  labelScratch = grownI32(labelScratch, nu * nv);
  firstOutScratch = grownI32(firstOutScratch, points);
  secondOutScratch = grownI32(secondOutScratch, points);
  const label = labelScratch, firstOut = firstOutScratch, secondOut = secondOutScratch;
  const stack: number[] = [], from: number[] = [], to: number[] = [], region: number[] = [], corners: number[] = [];
  const loopCorners: number[] = [];
  seenScratch = grownI32(seenScratch, points);
  const seen = seenScratch;
  seen.fill(0, 0, points);
  let stamp = 0;
  const cellsU = (point: number) => point % stride, cellsV = (point: number) => (point - (point % stride)) / stride;
  for (let sign = 1; sign >= -1; sign -= 2) {
    const outward = sign > 0 ? face : face + 1;
    const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nu && j < nv && sum[j * stride + i] === sign;
    // 4-connected regions of this sign
    label.fill(-1, 0, nu * nv);
    let regions = 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      if (!inside(i, j) || label[j * nu + i] >= 0) continue;
      label[j * nu + i] = regions;
      stack.push(j * nu + i);
      while (stack.length) {
        const cell = stack.pop()!, ci = cell % nu, cj = (cell - ci) / nu;
        if (inside(ci + 1, cj) && label[cell + 1] < 0) { label[cell + 1] = regions; stack.push(cell + 1); }
        if (inside(ci - 1, cj) && label[cell - 1] < 0) { label[cell - 1] = regions; stack.push(cell - 1); }
        if (inside(ci, cj + 1) && label[cell + nu] < 0) { label[cell + nu] = regions; stack.push(cell + nu); }
        if (inside(ci, cj - 1) && label[cell - nu] < 0) { label[cell - nu] = regions; stack.push(cell - nu); }
      }
      regions++;
    }
    if (!regions) continue;
    // Outline edges with the region on their left, filed by start point (a point starts two edges of one region only
    // where the region touches itself diagonally, which only an enclosed hole allows).
    from.length = 0; to.length = 0; region.length = 0;
    firstOut.fill(-1, 0, points); secondOut.fill(-1, 0, points);
    const edge = (a: number, b: number, r: number) => {
      const e = from.length;
      from.push(a); to.push(b); region.push(r);
      if (firstOut[a] < 0) firstOut[a] = e; else secondOut[a] = e;
    };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const r = label[j * nu + i];
      if (r < 0) continue;
      const p00 = j * stride + i, p10 = p00 + 1, p01 = p00 + stride, p11 = p01 + 1;
      if (!inside(i, j - 1)) edge(p00, p10, r);
      if (!inside(i + 1, j)) edge(p10, p11, r);
      if (!inside(i, j + 1)) edge(p11, p01, r);
      if (!inside(i - 1, j)) edge(p01, p00, r);
    }
    if (usedScratch.length < from.length) usedScratch = new Uint8Array(Math.max(from.length, 2 * usedScratch.length));
    const used = usedScratch;
    used.fill(0, 0, from.length);
    const loopCount = new Int32Array(regions), loopStart = new Int32Array(regions), loopEnd = new Int32Array(regions);
    loopCorners.length = 0;
    for (let e0 = 0; e0 < from.length; e0++) {
      if (used[e0]) continue;
      const r = region[e0];
      loopCount[r]++;
      // trace the loop from e0; at a point with two edges of this region, the left turn keeps each loop simple
      corners.length = 0;
      let e = e0;
      for (;;) {
        used[e] = 1;
        const at = to[e];
        const dx = cellsU(at) - cellsU(from[e]), dy = cellsV(at) - cellsV(from[e]);
        let next = -1;
        for (let s = 0; s < 2; s++) {
          const candidate = s === 0 ? firstOut[at] : secondOut[at];
          if (candidate < 0 || region[candidate] !== r || (used[candidate] && candidate !== e0)) continue;
          if (next >= 0) {
            const cx = cellsU(to[candidate]) - cellsU(at), cy = cellsV(to[candidate]) - cellsV(at);
            if (Math.sign(dx) * Math.sign(cy) - Math.sign(dy) * Math.sign(cx) <= 0) continue;
          }
          next = candidate;
        }
        if (next < 0) return false; // an outline that does not close: not a lattice boundary
        // a turn at `at` is a corner of the outline
        const ox = cellsU(to[next]) - cellsU(at);
        if ((dx === 0) !== (ox === 0)) corners.push(at);
        if (next === e0) break;
        e = next;
      }
      if (loopCount[r] > 1) continue; // a region with a hole is cut into rectangles below
      // An outline that meets itself at a corner bounds a hole pinched to the outside at that point (the left turn
      // keeps the region's own corners apart, not the air's): not a simple polygon, so it is cut into rectangles too.
      stamp++;
      let pinched = false;
      for (const point of corners) { if (seen[point] === stamp) { pinched = true; break; } seen[point] = stamp; }
      if (pinched) { loopCount[r]++; continue; }
      loopStart[r] = loopCorners.length;
      for (const point of corners) loopCorners.push(us[cellsU(point)], vs[cellsV(point)]);
      loopEnd[r] = loopCorners.length;
    }
    for (let r = 0; r < regions; r++) {
      if (loopCount[r] === 1) {
        out.push(POLYGON, outward, plane, (loopEnd[r] - loopStart[r]) / 2);
        for (let k = loopStart[r]; k < loopEnd[r]; k++) out.push(loopCorners[k]);
        continue;
      }
      // with a hole: greedy rectangles over this region's cells (the widest run along u, then the rows below it)
      const open = new Uint8Array(nu * nv);
      for (let k = 0; k < nu * nv; k++) open[k] = label[k] === r ? 1 : 0;
      const head = out.length;
      out.push(RECTS, outward, plane, 0);
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        if (!open[j * nu + i]) continue;
        let i1 = i + 1;
        while (i1 < nu && open[j * nu + i1]) i1++;
        let j1 = j + 1;
        grow: while (j1 < nv) {
          for (let k = i; k < i1; k++) if (!open[j1 * nu + k]) break grow;
          j1++;
        }
        for (let jj = j; jj < j1; jj++) open.fill(0, jj * nu + i, jj * nu + i1);
        out.push(us[i], us[i1], vs[j], vs[j1]);
        out[head + 3]++;
      }
    }
  }
  return true;
}

/**
 * One plane's boundary regions. Faces fall into clusters that overlap or share an edge (a region never spans two), and
 * each cluster is resolved on its own compressed grid.
 */
function planeRegions(face: number, plane: number, faces: readonly number[], out: number[]): boolean {
  const n = faces.length / 5;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const root = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  // sweep along u: a face can only meet the faces whose u range starts before its own ends
  let maxU = 0;
  for (let i = 0; i < n; i++) maxU = Math.max(maxU, faces[5 * i + 1]);
  const order = keyArray(n, (maxU + 1) * n);
  for (let i = 0; i < n; i++) order[i] = faces[5 * i + 1] * n + i;
  order.sort();
  for (let x = 0; x < n; x++) {
    const p = order[x] % n;
    for (let y = x + 1; y < n; y++) {
      const q = order[y] % n;
      if (faces[5 * q + 1] > faces[5 * p + 2]) break;
      const du = Math.min(faces[5 * p + 2], faces[5 * q + 2]) - Math.max(faces[5 * p + 1], faces[5 * q + 1]);
      const dv = Math.min(faces[5 * p + 4], faces[5 * q + 4]) - Math.max(faces[5 * p + 3], faces[5 * q + 3]);
      // overlapping, or touching along an edge (a corner alone joins nothing)
      if (du >= 0 && dv >= 0 && (du > 0 || dv > 0)) parent[root(p)] = root(q);
    }
  }
  const byRoot = keyArray(n, n * n);
  for (let i = 0; i < n; i++) byRoot[i] = root(i) * n + i;
  byRoot.sort();
  const members: number[] = [];
  for (let k = 0; k < n; k++) {
    members.push(byRoot[k] % n);
    if (k + 1 === n || Math.floor(byRoot[k + 1] / n) !== Math.floor(byRoot[k] / n)) {
      if (members.length === 1) {
        // a face nothing else touches is its own region: the rectangle, counter-clockwise
        const f = 5 * members[0], u0 = faces[f + 1], u1 = faces[f + 2], v0 = faces[f + 3], v1 = faces[f + 4];
        out.push(POLYGON, faces[f] > 0 ? face : face + 1, plane, 4, u0, v0, u1, v0, u1, v1, u0, v1);
      } else if (!clusterRegions(face, plane, faces, members, out)) return false;
      members.length = 0;
    }
  }
  return true;
}

/**
 * Ear-clip a simple counter-clockwise polygon (integer coordinates, collinear vertices allowed, no repeated point): an
 * ear is a strictly convex vertex whose triangle holds no other vertex, not even on its edges, so no triangle is
 * degenerate and no vertex lands on a diagonal. Every simple polygon has one (the leaves of a triangulation's dual
 * tree), and clipping it leaves a simple polygon, so this fails only on input that is not simple. Writes index triples
 * counter-clockwise; returns false on failure.
 */
function earClip(pu: readonly number[], pv: readonly number[], out: number[]): boolean {
  const n = pu.length;
  if (n < 3) return false;
  const prev = new Int32Array(n), next = new Int32Array(n);
  for (let i = 0; i < n; i++) { prev[i] = (i + n - 1) % n; next[i] = (i + 1) % n; }
  const cross = (a: number, b: number, c: number) => (pu[b] - pu[a]) * (pv[c] - pv[a]) - (pv[b] - pv[a]) * (pu[c] - pu[a]);
  const ear = (a: number, b: number, c: number) => {
    if (cross(a, b, c) <= 0) return false;
    for (let q = next[c]; q !== a; q = next[q]) {
      if (cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0) return false;
    }
    return true;
  };
  let remaining = n, b = 0, misses = 0;
  while (remaining > 3) {
    const a = prev[b], c = next[b];
    if (ear(a, b, c)) {
      out.push(a, b, c);
      next[a] = c; prev[c] = a; remaining--; misses = 0;
      b = a; // the clipped corner's neighbour may have just become an ear
    } else {
      b = c;
      if (++misses > remaining) return false;
    }
  }
  const a = prev[b], c = next[b];
  if (cross(a, b, c) <= 0) return false;
  out.push(a, b, c);
  return true;
}

/**
 * The boundary surface of one component's boxes (Uint16 sextets [x0, y0, z0, x1, y1, z1], inclusive voxel spans; the
 * generator's greedy boxes, which are disjoint). Every boundary cell of the union is covered exactly once and with
 * outward winding, no buried cell at all, and the triangles are conforming (see the header). Null when the boxes do
 * not bound a lattice solid this way (overlapping boxes, say): the caller then draws them closed.
 */
export function interiorFillSurface(spans: ArrayLike<number>): InteriorFillSurface | null {
  const count = Math.floor(spans.length / 6);
  const regions: number[] = [];
  let maxPlane = 0;
  for (let i = 0; i < 6 * count; i++) maxPlane = Math.max(maxPlane, spans[i] + 1);
  const planeKeys = keyArray(2 * count, (maxPlane + 1) * 2 * count);
  const faces: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const au = (axis + 1) % 3, av = (axis + 2) % 3;
    // every box face on this axis, ordered by plane: key = plane * 2·count + face number (face 2b: max, 2b + 1: min)
    for (let b = 0; b < count; b++) {
      planeKeys[2 * b] = (spans[6 * b + 3 + axis] + 1) * 2 * count + 2 * b;
      planeKeys[2 * b + 1] = spans[6 * b + axis] * 2 * count + 2 * b + 1;
    }
    planeKeys.sort();
    for (let start = 0; start < 2 * count;) {
      const plane = Math.floor(planeKeys[start] / (2 * count));
      faces.length = 0;
      let end = start;
      for (; end < 2 * count && Math.floor(planeKeys[end] / (2 * count)) === plane; end++) {
        const f = planeKeys[end] - plane * 2 * count, b = f >> 1;
        faces.push(f & 1 ? -1 : 1, spans[6 * b + au], spans[6 * b + 3 + au] + 1, spans[6 * b + av], spans[6 * b + 3 + av] + 1);
      }
      if (!planeRegions(2 * axis, plane, faces, regions)) return null;
      start = end;
    }
  }
  // The vertex set: every polygon corner and rectangle corner, filed under the three lattice lines through it (one
  // sorted index per line axis, keyed (c1, c2, position) on the axis's two others, so a line's points are one run).
  const side = maxPlane + 1;
  let points = 0;
  for (let k = 0; k < regions.length; k += 4 + (regions[k] === POLYGON ? 2 : 4) * regions[k + 3]) {
    points += regions[k] === POLYGON ? regions[k + 3] : 4 * regions[k + 3];
  }
  const index = [0, 1, 2].map(() => keyArray(points, side * side * side));
  const indexed = [0, 0, 0];
  const c = [0, 0, 0];
  const lineBase = (axis: number) => (c[(axis + 1) % 3] * side + c[(axis + 2) % 3]) * side;
  // the region being read or written (at() and the emitters use these)
  let a = 0, u = 1, v = 2, p = 0, face = 0, negative = 0;
  const at = (pu: number, pv: number) => { c[a] = p; c[u] = pu; c[v] = pv; };
  const file = () => { for (let w = 0; w < 3; w++) index[w][indexed[w]++] = lineBase(w) + c[w]; };
  const enter = (k: number) => { face = regions[k + 1]; a = face >> 1; negative = face & 1; u = (a + 1) % 3; v = (a + 2) % 3; p = regions[k + 2]; };
  let polygons = 0, rectangleRegions = 0;
  for (let k = 0; k < regions.length;) {
    const n = regions[k + 3];
    enter(k);
    if (regions[k] === POLYGON) {
      polygons++;
      for (let i = 0; i < n; i++) { at(regions[k + 4 + 2 * i], regions[k + 5 + 2 * i]); file(); }
      k += 4 + 2 * n;
    } else {
      rectangleRegions++;
      for (let i = 0; i < n; i++) {
        const q = k + 4 + 4 * i;
        for (let cu = 0; cu < 2; cu++) for (let cv = 0; cv < 2; cv++) { at(regions[q + cu], regions[q + 2 + cv]); file(); }
      }
      k += 4 + 4 * n;
    }
  }
  for (let w = 0; w < 3; w++) indexed[w] = sortDistinct(index[w], indexed[w]);
  /** The vertices strictly inside the axis-aligned lattice segment (u0, v0)–(u1, v1), in travel order, appended. */
  const between = (u0: number, v0: number, u1: number, v1: number, outU: number[], outV: number[]) => {
    const alongU = v0 === v1, axis = alongU ? u : v, lo = alongU ? Math.min(u0, u1) : Math.min(v0, v1);
    const hi = alongU ? Math.max(u0, u1) : Math.max(v0, v1);
    at(u0, v0);
    const base = lineBase(axis), list = index[axis], length = indexed[axis];
    const first = upperBound(list, length, base + lo);
    let last = first;
    while (last < length && list[last] < base + hi) last++;
    const forward = alongU ? u1 > u0 : v1 > v0;
    for (let s = 0; s < last - first; s++) {
      const t = list[forward ? first + s : last - 1 - s] - base;
      outU.push(alongU ? t : u0); outV.push(alongU ? v0 : t);
    }
  };
  let corners = new Int32Array(9 * (2 * points + 16)), triFaces = new Uint8Array(2 * points + 16);
  let written = 0, tris = 0;
  const vertex = (pu: number, pv: number) => {
    at(pu, pv);
    corners[written++] = c[0]; corners[written++] = c[1]; corners[written++] = c[2];
  };
  const reserve = (more: number) => {
    if (tris + more <= triFaces.length) return;
    const grown = new Int32Array(9 * Math.max(2 * triFaces.length, tris + more));
    grown.set(corners.subarray(0, written)); corners = grown;
    const grownFaces = new Uint8Array(grown.length / 9);
    grownFaces.set(triFaces.subarray(0, tris)); triFaces = grownFaces;
  };
  const emit = (pu0: number, pv0: number, pu1: number, pv1: number, pu2: number, pv2: number) => {
    // counter-clockwise in (u, v) faces +axis; a min face winds the other way
    vertex(pu0, pv0);
    if (negative) { vertex(pu2, pv2); vertex(pu1, pv1); } else { vertex(pu1, pv1); vertex(pu2, pv2); }
    triFaces[tris++] = face;
  };
  const ringU: number[] = [], ringV: number[] = [], ears: number[] = [];
  const bottom: number[] = [], top: number[] = [], left: number[] = [], right: number[] = [], skip: number[] = [];
  const B: number[] = [], T: number[] = [], chain: number[] = [];
  for (let k = 0; k < regions.length;) {
    const n = regions[k + 3];
    enter(k);
    if (regions[k] === POLYGON) {
      // the outline through every vertex on it, then its ears
      ringU.length = 0; ringV.length = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const u0 = regions[k + 4 + 2 * i], v0 = regions[k + 5 + 2 * i], u1 = regions[k + 4 + 2 * j], v1 = regions[k + 5 + 2 * j];
        ringU.push(u0); ringV.push(v0);
        between(u0, v0, u1, v1, ringU, ringV);
      }
      ears.length = 0;
      if (!earClip(ringU, ringV, ears)) return null; // an outline that is not a simple polygon
      reserve(ears.length / 3);
      for (let i = 0; i < ears.length; i += 3) {
        emit(ringU[ears[i]], ringV[ears[i]], ringU[ears[i + 1]], ringV[ears[i + 1]], ringU[ears[i + 2]], ringV[ears[i + 2]]);
      }
      k += 4 + 2 * n;
      continue;
    }
    for (let r = 0; r < n; r++) {
      const q = k + 4 + 4 * r;
      const u0 = regions[q], u1 = regions[q + 1], v0 = regions[q + 2], v1 = regions[q + 3];
      // the vertices on the rectangle's four edges, its own corners excluded
      bottom.length = 0; skip.length = 0; between(u0, v0, u1, v0, bottom, skip);
      top.length = 0; skip.length = 0; between(u0, v1, u1, v1, top, skip);
      left.length = 0; skip.length = 0; between(u0, v0, u0, v1, skip, left);
      right.length = 0; skip.length = 0; between(u1, v0, u1, v1, skip, right);
      reserve(2 + bottom.length + top.length + left.length + right.length);
      // Through every vertex on its edges and no other: the left edge's vertices fan to the first bottom vertex past
      // the corner, the right edge's to the last top vertex before its corner, and a strip between the bottom and
      // top chains closes the rest. Every triangle has corners on two different edges, so none is degenerate.
      B.length = 0; B.push(u0, ...bottom, u1);
      T.length = 0; T.push(u0, ...top, u1);
      let i = 0, tEnd = T.length - 1;
      if (left.length) {
        chain.length = 0; chain.push(v0, ...left, v1);
        for (let s = 0; s + 1 < chain.length; s++) emit(u0, chain[s], B[1], v0, u0, chain[s + 1]);
        i = 1;
      }
      if (right.length) {
        chain.length = 0; chain.push(v0, ...right, v1);
        const apex = T[T.length - 2];
        for (let s = 0; s + 1 < chain.length; s++) emit(u1, chain[s], u1, chain[s + 1], apex, v1);
        tEnd = T.length - 2;
      }
      const bEnd = B.length - 1;
      let j = 0;
      while (i < bEnd || j < tEnd) {
        if (i < bEnd && (j >= tEnd || B[i + 1] <= T[j + 1])) { emit(B[i], v0, B[i + 1], v0, T[j], v1); i++; }
        else { emit(B[i], v0, T[j + 1], v1, T[j], v1); j++; }
      }
    }
    k += 4 + 4 * n;
  }
  return { corners: corners.slice(0, written), faces: triFaces.slice(0, tris), polygons, rectangleRegions };
}
