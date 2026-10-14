// Building integrity (the buildings stream, 2026-10-12; the owner on Steinburg's church tower: "make sure our roofs dont
// have empty spots in them"): the geometric checks of ONE building's surfaces as the GPU draws them (every props bucket
// material is single-sided and opaque), with no renderer.
//
//   floating   connected surface pieces (vertices welded at 2 mm) joined by contact (their surfaces within one 5 cm
//              voxel) into assemblies; an assembly that reaches neither the ground nor the body is floating (a roof
//              standing clear of its walls, a lantern in the air, a sign off its wall).
//   hole       a back face nearest the eye (more than 4 mm in front of every front face): the GPU culls it and the player
//              sees through it: an open underside, a missing face, a wall seen from inside through a gap.
//   inverted   the same with a front face within 8 cm behind it: a thin part built inside out.
//   inside     a surface the eye reaches that lies 1 m inside the building's CLOSED envelope (its solid closed over
//              gaps narrower than ~0.8 m): the player sees into the attic or the body through a gap in a roof or a wall.
//   gap        sky seen through the building: an empty pixel enclosed by the building's silhouette whose ray leaves
//              without meeting the ground (a slot between a wall top and the roof over it).
//   degenerate / sliver   zero-area triangles, and triangles longer than 0.5 m with an altitude under 1/1000 of it.
//
// Views are orthographic, as the sealed-hull check's (tools/tank-sealed-check.mjs): a ring of eight azimuths at eye level,
// two rings looking up from the street (only what stands 1.6 m over the ground under it), rings looking down and the
// view from overhead (aircraft, drones). The ground clips every view (nothing below the terrain is drawn), and other
// buildings near this one occlude it (a party wall its neighbour covers is not open).

export const FLAG_FINE = 1;
export const FLAG_TRANSPARENT = 2;
export const FLAG_DOUBLE = 4;

export const DEFAULT_ELEVATIONS = Object.freeze([-35, -12, 0, 15, 40]);
const EYE_M = 1.6;
const SEAM_EPS = 0.004;
const INVERTED_DEPTH = 0.08;
const INSIDE_OFFSET_M = 1.0;
const CONTACT_VOXEL_M = 0.05;
const GROUND_TOL_M = 0.08;
const MIN_CLUSTER_M2 = 0.01;
const MIN_FLOATING_M2 = 0.004;
const GROUND_OPENING_M = 1.2;
/** A piece narrower than this across both its narrow sides is a stick (a rail's slat, a post, a bar): it closes no
 * envelope, so a wall seen between a balcony's slats is outside, not inside a pocket the slats closed. */
const STICK_M = 0.17;

export function viewDirections(elevations = DEFAULT_ELEVATIONS, azimuths = 8, overhead = true) {
  const views = [];
  for (const el of elevations) {
    for (let k = 0; k < azimuths; k++) {
      const az = (k / azimuths) * Math.PI * 2, e = el * Math.PI / 180;
      // the direction the eye LOOKS along: el > 0 looks down, el < 0 looks up from the street
      views.push({ name: `el${el}_az${Math.round(az * 180 / Math.PI)}`, el, d: [-Math.sin(az) * Math.cos(e), -Math.sin(e), -Math.cos(az) * Math.cos(e)] });
    }
  }
  if (overhead) views.push({ name: 'overhead', el: 90, d: [0, -1, 0] });
  return views;
}

/** A sampled ground: `fn(x, z)` on a regular grid over [x0, x1] x [z0, z1], read back bilinearly. */
export function groundGrid(fn, x0, x1, z0, z1, step = 0.5) {
  const nx = Math.max(2, Math.ceil((x1 - x0) / step) + 1), nz = Math.max(2, Math.ceil((z1 - z0) / step) + 1);
  const h = new Float32Array(nx * nz);
  let max = -Infinity, min = Infinity;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const v = fn(x0 + i * step, z0 + j * step); h[j * nx + i] = v; if (v > max) max = v; if (v < min) min = v;
  }
  const at = (x, z) => {
    let fx = (x - x0) / step, fz = (z - z0) / step;
    if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
    if (fz < 0) fz = 0; else if (fz > nz - 1.001) fz = nz - 1.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * nx + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + nx] * (1 - u) + h[k + nx + 1] * u) * v;
  };
  return { at, max, min };
}

function boundsOf(pos) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (z < b[2]) b[2] = z;
    if (x > b[3]) b[3] = x; if (y > b[4]) b[4] = y; if (z > b[5]) b[5] = z;
  }
  return b;
}

function triArea(p, o) {
  const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2];
  const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

/** Visit points over triangle `o` of `p` no further apart than `step`. */
function sampleTriangle(p, o, step, visit) {
  const ax = p[o], ay = p[o + 1], az = p[o + 2];
  const ux = p[o + 3] - ax, uy = p[o + 4] - ay, uz = p[o + 5] - az;
  const vx = p[o + 6] - ax, vy = p[o + 7] - ay, vz = p[o + 8] - az;
  const len = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(vx - ux, vy - uy, vz - uz));
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) {
    const s = i / n, t = j / n;
    visit(ax + ux * s + vx * t, ay + uy * s + vy * t, az + uz * s + vz * t);
  }
}

function makeUnionFind(n) {
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a < b ? b : a] = a < b ? a : b; };
  return { find, union };
}

/** Squared distance from point (px, py, pz) to triangle `o` of `p` (Ericson's closest point on a triangle). */
function pointTriangleDist2(p, o, px, py, pz) {
  const ax = p[o], ay = p[o + 1], az = p[o + 2], bx = p[o + 3], by = p[o + 4], bz = p[o + 5], cx = p[o + 6], cy = p[o + 7], cz = p[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const sq = (x, y, z) => x * x + y * y + z * z;
  if (d1 <= 0 && d2 <= 0) return sq(apx, apy, apz);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return sq(bpx, bpy, bpz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return sq(apx - abx * v, apy - aby * v, apz - abz * v); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return sq(cpx, cpy, cpz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return sq(apx - acx * w, apy - acy * w, apz - acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return sq(px - (bx + (cx - bx) * w), py - (by + (cy - by) * w), pz - (bz + (cz - bz) * w));
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return sq(apx - abx * v - acx * w, apy - aby * v - acy * w, apz - abz * v - acz * w);
}

/**
 * Floating assemblies: surface pieces (vertices welded at 2 mm) joined through contact into assemblies — two pieces
 * touch when a point of one lies within CONTACT_VOXEL_M of the other's surface (sampled over the smaller piece inside
 * the boxes' overlap, measured exactly to the larger's triangles) — and an assembly with no vertex within GROUND_TOL_M
 * of the ground is floating. Returns every floating assembly over MIN_FLOATING_M2, and each triangle's assembly
 * (-1 grounded) for the views to count what of it shows.
 */
export function floatingParts(pos, flags, bucketOf, buckets, ground) {
  const triCount = pos.length / 9;
  const keyOf = new Map(); const vid = new Int32Array(triCount * 3);
  for (let v = 0; v < triCount * 3; v++) {
    const k = `${Math.round(pos[v * 3] * 500)},${Math.round(pos[v * 3 + 1] * 500)},${Math.round(pos[v * 3 + 2] * 500)}`;
    let id = keyOf.get(k); if (id === undefined) { id = keyOf.size; keyOf.set(k, id); } vid[v] = id;
  }
  const weld = makeUnionFind(keyOf.size);
  for (let t = 0; t < triCount; t++) { weld.union(vid[t * 3], vid[t * 3 + 1]); weld.union(vid[t * 3], vid[t * 3 + 2]); }
  const pieceOfTri = new Int32Array(triCount); const pieceIndex = new Map();
  for (let t = 0; t < triCount; t++) {
    const r = weld.find(vid[t * 3]); let k = pieceIndex.get(r); if (k === undefined) { k = pieceIndex.size; pieceIndex.set(r, k); } pieceOfTri[t] = k;
  }
  const pieces = pieceIndex.size;
  const tol = CONTACT_VOXEL_M, tol2 = tol * tol;
  // each piece: its triangles, box and area; grounded when a vertex reaches the ground
  const triStart = new Int32Array(pieces + 1); for (let t = 0; t < triCount; t++) triStart[pieceOfTri[t] + 1]++;
  for (let c = 0; c < pieces; c++) triStart[c + 1] += triStart[c];
  const triList = new Int32Array(triCount); const fill = triStart.slice(0, pieces);
  for (let t = 0; t < triCount; t++) triList[fill[pieceOfTri[t]]++] = t;
  const box = new Float64Array(pieces * 6); const area = new Float64Array(pieces); const grounded = new Uint8Array(pieces);
  for (let c = 0; c < pieces; c++) { box[c * 6] = box[c * 6 + 1] = box[c * 6 + 2] = Infinity; box[c * 6 + 3] = box[c * 6 + 4] = box[c * 6 + 5] = -Infinity; }
  const groundTop = ground.max + GROUND_TOL_M;
  for (let t = 0; t < triCount; t++) {
    const c = pieceOfTri[t], o = t * 9; area[c] += triArea(pos, o);
    for (let k = 0; k < 9; k += 3) {
      const x = pos[o + k], y = pos[o + k + 1], z = pos[o + k + 2];
      if (x < box[c * 6]) box[c * 6] = x; if (y < box[c * 6 + 1]) box[c * 6 + 1] = y; if (z < box[c * 6 + 2]) box[c * 6 + 2] = z;
      if (x > box[c * 6 + 3]) box[c * 6 + 3] = x; if (y > box[c * 6 + 4]) box[c * 6 + 4] = y; if (z > box[c * 6 + 5]) box[c * 6 + 5] = z;
      if (!grounded[c] && y <= groundTop && y <= ground.at(x, z) + GROUND_TOL_M) grounded[c] = 1;
    }
  }
  // a piece's triangles in 0.5 m cells, built when a contact test first needs it
  const CELL = 0.5; const grids = new Map();
  const gridOf = (c) => {
    let g = grids.get(c); if (g) return g;
    g = new Map();
    for (let i = triStart[c]; i < triStart[c + 1]; i++) {
      const t = triList[i], o = t * 9;
      const x0 = Math.floor(Math.min(pos[o], pos[o + 3], pos[o + 6]) / CELL), x1 = Math.floor(Math.max(pos[o], pos[o + 3], pos[o + 6]) / CELL);
      const y0 = Math.floor(Math.min(pos[o + 1], pos[o + 4], pos[o + 7]) / CELL), y1 = Math.floor(Math.max(pos[o + 1], pos[o + 4], pos[o + 7]) / CELL);
      const z0 = Math.floor(Math.min(pos[o + 2], pos[o + 5], pos[o + 8]) / CELL), z1 = Math.floor(Math.max(pos[o + 2], pos[o + 5], pos[o + 8]) / CELL);
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const key = (x + 4096) * 67108864 + (y + 4096) * 8192 + (z + 4096);
        let l = g.get(key); if (!l) { l = []; g.set(key, l); } l.push(o);
      }
    }
    grids.set(c, g); return g;
  };
  const touch = (a, b) => {
    // sample the piece with less surface, against the other's triangles
    if (area[a] > area[b]) { const s = a; a = b; b = s; }
    const lo0 = Math.max(box[a * 6], box[b * 6]) - tol, lo1 = Math.max(box[a * 6 + 1], box[b * 6 + 1]) - tol, lo2 = Math.max(box[a * 6 + 2], box[b * 6 + 2]) - tol;
    const hi0 = Math.min(box[a * 6 + 3], box[b * 6 + 3]) + tol, hi1 = Math.min(box[a * 6 + 4], box[b * 6 + 4]) + tol, hi2 = Math.min(box[a * 6 + 5], box[b * 6 + 5]) + tol;
    if (lo0 > hi0 || lo1 > hi1 || lo2 > hi2) return false;
    const g = gridOf(b);
    let hit = false;
    for (let i = triStart[a]; i < triStart[a + 1] && !hit; i++) {
      const o = triList[i] * 9;
      if (Math.max(pos[o], pos[o + 3], pos[o + 6]) < lo0 || Math.min(pos[o], pos[o + 3], pos[o + 6]) > hi0) continue;
      if (Math.max(pos[o + 1], pos[o + 4], pos[o + 7]) < lo1 || Math.min(pos[o + 1], pos[o + 4], pos[o + 7]) > hi1) continue;
      if (Math.max(pos[o + 2], pos[o + 5], pos[o + 8]) < lo2 || Math.min(pos[o + 2], pos[o + 5], pos[o + 8]) > hi2) continue;
      sampleTriangle(pos, o, tol * 0.8, (x, y, z) => {
        if (hit || x < lo0 || x > hi0 || y < lo1 || y > hi1 || z < lo2 || z > hi2) return;
        const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
        const fx = x / CELL - cx, fy = y / CELL - cy, fz = z / CELL - cz, e = tol / CELL;
        for (let dz = fz < e ? -1 : 0; dz <= (fz > 1 - e ? 1 : 0) && !hit; dz++) for (let dy = fy < e ? -1 : 0; dy <= (fy > 1 - e ? 1 : 0) && !hit; dy++) for (let dx = fx < e ? -1 : 0; dx <= (fx > 1 - e ? 1 : 0) && !hit; dx++) {
          const l = g.get((cx + dx + 4096) * 67108864 + (cy + dy + 4096) * 8192 + (cz + dz + 4096));
          if (!l) continue;
          for (const to of l) if (pointTriangleDist2(pos, to, x, y, z) < tol2) { hit = true; break; }
        }
      });
    }
    return hit;
  };
  const contact = makeUnionFind(pieces);
  // candidate pairs: boxes within the tolerance (sweep along x)
  const order = Array.from({ length: pieces }, (_, i) => i).sort((u, v) => box[u * 6] - box[v * 6]);
  for (let i = 0; i < pieces; i++) {
    const a = order[i];
    for (let j = i + 1; j < pieces; j++) {
      const b = order[j];
      if (box[b * 6] > box[a * 6 + 3] + tol) break;
      if (box[b * 6 + 1] > box[a * 6 + 4] + tol || box[a * 6 + 1] > box[b * 6 + 4] + tol) continue;
      if (box[b * 6 + 2] > box[a * 6 + 5] + tol || box[a * 6 + 2] > box[b * 6 + 5] + tol) continue;
      if (contact.find(a) === contact.find(b)) continue;
      if (touch(a, b)) contact.union(a, b);
    }
  }
  const setGrounded = new Uint8Array(pieces);
  for (let c = 0; c < pieces; c++) if (grounded[c]) setGrounded[contact.find(c)] = 1;
  const sets = new Map(); const setOfTri = new Int32Array(triCount).fill(-1);
  for (let t = 0; t < triCount; t++) {
    const root = contact.find(pieceOfTri[t]);
    if (setGrounded[root]) continue;
    let s = sets.get(root);
    if (!s) { s = { id: sets.size, tris: 0, areaM2: 0, fine: 0, b: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], buckets: new Map() }; sets.set(root, s); }
    setOfTri[t] = s.id;
    const a = triArea(pos, t * 9); s.tris++; s.areaM2 += a; if (flags[t] & FLAG_FINE) s.fine++;
    const name = buckets[bucketOf[t]] ?? '?'; s.buckets.set(name, (s.buckets.get(name) || 0) + a);
    for (let k = 0; k < 9; k += 3) {
      const o = t * 9 + k;
      for (let ax = 0; ax < 3; ax++) { const v = pos[o + ax]; if (v < s.b[ax]) s.b[ax] = v; if (v > s.b[ax + 3]) s.b[ax + 3] = v; }
    }
  }
  // each floating assembly's clearance: the nearest grounded triangle to its vertices (up to 96 of them; to 3 m)
  const setVerts = new Map();
  for (let t = 0; t < triCount; t++) {
    const id = setOfTri[t]; if (id < 0) continue;
    let l = setVerts.get(id); if (!l) { l = []; setVerts.set(id, l); }
    if (l.length < 96 * 3) for (let k = 0; k < 9; k += 3) l.push(pos[t * 9 + k], pos[t * 9 + k + 1], pos[t * 9 + k + 2]);
  }
  const clearance = (s) => {
    let best = Infinity;
    const v = setVerts.get(s.id) ?? [];
    const probes = [];
    const step = Math.max(1, Math.floor(v.length / 3 / 96));
    for (let i = 0; i < v.length; i += 3 * step) probes.push([v[i], v[i + 1], v[i + 2]]);
    for (let t = 0; t < triCount; t++) {
      if (setOfTri[t] >= 0) continue;
      const o = t * 9;
      const tx0 = Math.min(pos[o], pos[o + 3], pos[o + 6]) - 3, tx1 = Math.max(pos[o], pos[o + 3], pos[o + 6]) + 3;
      if (tx1 < s.b[0] || tx0 > s.b[3]) continue;
      const ty0 = Math.min(pos[o + 1], pos[o + 4], pos[o + 7]) - 3, ty1 = Math.max(pos[o + 1], pos[o + 4], pos[o + 7]) + 3;
      if (ty1 < s.b[1] || ty0 > s.b[4]) continue;
      for (const [x, y, z] of probes) { const d = pointTriangleDist2(pos, o, x, y, z); if (d < best) best = d; }
    }
    return Math.sqrt(best);
  };
  const out = [];
  for (const s of sets.values()) {
    if (s.areaM2 < MIN_FLOATING_M2) continue;
    const size = [s.b[3] - s.b[0], s.b[4] - s.b[1], s.b[5] - s.b[2]];
    const cl = clearance(s);
    out.push({ id: s.id, tris: s.tris, areaM2: +s.areaM2.toFixed(3), fineShare: +(s.fine / s.tris).toFixed(2),
      size: size.map((v) => +v.toFixed(2)), at: [(s.b[0] + s.b[3]) / 2, s.b[1], (s.b[2] + s.b[5]) / 2].map((v) => +v.toFixed(2)),
      clearanceM: cl <= 3 ? +cl.toFixed(2) : null,
      buckets: [...s.buckets.entries()].sort((u, v) => v[1] - u[1]).slice(0, 3).map(([n]) => n) });
  }
  out.sort((u, v) => v.areaM2 - u.areaM2);
  // the sticks: pieces whose box is under STICK_M across both its narrow sides (rail slats, posts, bars, rafters)
  const stickTri = new Uint8Array(triCount);
  for (let c = 0; c < pieces; c++) {
    const d = [box[c * 6 + 3] - box[c * 6], box[c * 6 + 4] - box[c * 6 + 1], box[c * 6 + 5] - box[c * 6 + 2]].sort((u, v) => u - v);
    if (d[1] >= STICK_M) continue;
    for (let i = triStart[c]; i < triStart[c + 1]; i++) stickTri[triList[i]] = 1;
  }
  return { pieces, floating: out, setOfTri, stickTri };
}

/**
 * The building's closed envelope: its surfaces voxelised (cell `V`), dilated by `k` cells, the outside flood-filled from
 * the grid's border (the ground is solid), then the outside dilated back by `k`: what remains is the solid closed over
 * every gap narrower than about 2k cells. `inside(x, y, z)` reads it.
 */
export function closedEnvelope(pos, ground, { V = 0.2, k = 2, maxCells = 6e6 } = {}) {
  const b = boundsOf(pos);
  const span = Math.max(b[3] - b[0], 1) * Math.max(b[4] - b[1], 1) * Math.max(b[5] - b[2], 1);
  V = Math.max(V, Math.cbrt(span / maxCells));
  const m = (k + 2) * V, x0 = b[0] - m, y0 = Math.min(b[1], ground.min) - m, z0 = b[2] - m;
  const NX = Math.ceil((b[3] + m - x0) / V), NY = Math.ceil((b[4] + m - y0) / V), NZ = Math.ceil((b[5] + m - z0) / V);
  const N = NX * NY * NZ, plane = NX * NY;
  const solid = new Uint8Array(N);
  for (let o = 0; o < pos.length; o += 9) {
    sampleTriangle(pos, o, V * 0.5, (x, y, z) => {
      const i = Math.floor((x - x0) / V), j = Math.floor((y - y0) / V), kk = Math.floor((z - z0) / V);
      if (i >= 0 && j >= 0 && kk >= 0 && i < NX && j < NY && kk < NZ) solid[i + NX * j + plane * kk] = 1;
    });
  }
  const dilate = (src, r) => {
    let a = src, tmp = new Uint8Array(N);
    const pass = (from, to, stride, count, outerStrideA, countA, outerStrideB, countB) => {
      for (let q = 0; q < countB; q++) for (let p = 0; p < countA; p++) {
        const base = p * outerStrideA + q * outerStrideB;
        for (let s = 0; s < count; s++) {
          let v = 0;
          for (let d = -r; d <= r && !v; d++) { const t = s + d; if (t >= 0 && t < count && from[base + t * stride]) v = 1; }
          to[base + s * stride] = v;
        }
      }
    };
    pass(a, tmp, 1, NX, NX, NY, plane, NZ);
    const tmp2 = new Uint8Array(N);
    pass(tmp, tmp2, NX, NY, 1, NX, plane, NZ);
    pass(tmp2, tmp, plane, NZ, 1, NX, NX, NY);
    return tmp;
  };
  const shell = dilate(solid, k);
  // the ground is solid: every cell whose centre lies under the terrain
  const groundBlock = new Uint8Array(N);
  for (let kk = 0; kk < NZ; kk++) for (let i = 0; i < NX; i++) {
    const g = ground.at(x0 + (i + 0.5) * V, z0 + (kk + 0.5) * V);
    const top = Math.min(NY, Math.floor((g - y0) / V));
    for (let j = 0; j < top; j++) groundBlock[i + NX * j + plane * kk] = 1;
  }
  const outside = new Uint8Array(N); const queue = new Int32Array(N); let head = 0, tail = 0;
  const seed = (idx) => { if (!outside[idx] && !shell[idx] && !groundBlock[idx]) { outside[idx] = 1; queue[tail++] = idx; } };
  for (let kk = 0; kk < NZ; kk++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    if (i === 0 || j === NY - 1 || kk === 0 || i === NX - 1 || kk === NZ - 1) seed(i + NX * j + plane * kk);
  }
  while (head < tail) {
    const idx = queue[head++]; const i = idx % NX, j = ((idx - i) / NX) % NY, kk = Math.floor(idx / plane);
    if (i > 0) seed(idx - 1); if (i < NX - 1) seed(idx + 1); if (j > 0) seed(idx - NX); if (j < NY - 1) seed(idx + NX);
    if (kk > 0) seed(idx - plane); if (kk < NZ - 1) seed(idx + plane);
  }
  // (one cell further than the shell: the outside reaches the cells the outer surfaces stand in, so only what lies
  // behind a closed gap stays enclosed, not the skin of a wall seen at a grazing angle)
  const open = dilate(outside, k + 1);
  let enclosed = 0;
  for (let n = 0; n < N; n++) if (!open[n] && !groundBlock[n]) enclosed++;
  const inside = (x, y, z) => {
    const i = Math.floor((x - x0) / V), j = Math.floor((y - y0) / V), kk = Math.floor((z - z0) / V);
    if (i < 0 || j < 0 || kk < 0 || i >= NX || j >= NY || kk >= NZ) return false;
    const n = i + NX * j + plane * kk;
    return !open[n] && !groundBlock[n];
  };
  // the envelope with its skin: an eye standing in a wall or within a cell of it is not outside the building
  const skin = dilate(outside, k);
  const withinSkin = (x, y, z) => {
    const i = Math.floor((x - x0) / V), j = Math.floor((y - y0) / V), kk = Math.floor((z - z0) / V);
    if (i < 0 || j < 0 || kk < 0 || i >= NX || j >= NY || kk >= NZ) return false;
    return !skin[i + NX * j + plane * kk];
  };
  return { inside, withinSkin, V, enclosedM3: +(enclosed * V * V * V).toFixed(1), box: [x0, y0, z0, x0 + NX * V, y0 + NY * V, z0 + NZ * V] };
}

const KIND_NAMES = ['', 'hole', 'inverted', 'inside', 'gap'];

/**
 * Rasterise one view of the building (`pos`, its flags) among its occluders, clipped by the ground, and classify its
 * pixels. Returns the clusters over MIN_CLUSTER_M2 with their world places and the buckets they show.
 */
export function rasterView(view, own, occ, ground, envelope, sphere, res, setOfTri = null) {
  const d = view.d;
  const up0 = Math.abs(d[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  // right = up0 x d, up = d x right
  let rx = up0[1] * d[2] - up0[2] * d[1], ry = up0[2] * d[0] - up0[0] * d[2], rz = up0[0] * d[1] - up0[1] * d[0];
  const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
  const ux = d[1] * rz - d[2] * ry, uy = d[2] * rx - d[0] * rz, uz = d[0] * ry - d[1] * rx;
  const RES = res, N = RES * RES, scale = RES / (2 * sphere.r);
  const [cx, cy, cz] = sphere.c;
  const pxM2 = 1 / (scale * scale);
  const zF = new Float32Array(N).fill(Infinity), zB = new Float32Array(N).fill(Infinity), zO = new Float32Array(N).fill(Infinity);
  const tF = new Int32Array(N).fill(-1), tB = new Int32Array(N).fill(-1);
  const clipH = view.el < 0 ? EYE_M : -0.02;
  const groundTop = ground.max + clipH;
  const draw = (pos, flags, isOwn) => {
    const count = pos.length / 9;
    for (let t = 0; t < count; t++) {
      const o = t * 9; const f = flags ? flags[t] : 0;
      if (f & FLAG_TRANSPARENT) continue;
      const ax = pos[o] - cx, ay = pos[o + 1] - cy, az = pos[o + 2] - cz;
      const bx = pos[o + 3] - cx, by = pos[o + 4] - cy, bz = pos[o + 5] - cz;
      const qx = pos[o + 6] - cx, qy = pos[o + 7] - cy, qz = pos[o + 8] - cz;
      const x0 = (ax * rx + ay * ry + az * rz) * scale + RES / 2, y0 = (ax * ux + ay * uy + az * uz) * scale + RES / 2, z0 = ax * d[0] + ay * d[1] + az * d[2];
      const x1 = (bx * rx + by * ry + bz * rz) * scale + RES / 2, y1 = (bx * ux + by * uy + bz * uz) * scale + RES / 2, z1 = bx * d[0] + by * d[1] + bz * d[2];
      const x2 = (qx * rx + qy * ry + qz * rz) * scale + RES / 2, y2 = (qx * ux + qy * uy + qz * uz) * scale + RES / 2, z2 = qx * d[0] + qy * d[1] + qz * d[2];
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(RES - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(RES - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) continue;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;
      // geometric normal against the view: front when it faces the eye
      const nx = (by - ay) * (qz - az) - (bz - az) * (qy - ay), ny = (bz - az) * (qx - ax) - (bx - ax) * (qz - az), nz = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
      const facing = nx * d[0] + ny * d[1] + nz * d[2];
      if (facing === 0) continue;
      const front = (f & FLAG_DOUBLE) ? true : facing < 0;
      const minWorldY = Math.min(pos[o + 1], pos[o + 4], pos[o + 7]);
      const clip = minWorldY < groundTop;
      const inv = 1 / area;
      for (let py = minY; py <= maxY; py++) {
        const sy = py + 0.5;
        for (let px = minX; px <= maxX; px++) {
          const sx = px + 0.5;
          const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) * inv; if (w0 < 0) continue;
          const w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) * inv; if (w1 < 0) continue;
          const w2 = 1 - w0 - w1; if (w2 < 0) continue;
          if (clip) {
            const wy = w0 * pos[o + 1] + w1 * pos[o + 4] + w2 * pos[o + 7];
            const wx = w0 * pos[o] + w1 * pos[o + 3] + w2 * pos[o + 6], wz = w0 * pos[o + 2] + w1 * pos[o + 5] + w2 * pos[o + 8];
            if (wy < ground.at(wx, wz) + clipH) continue;
          }
          const depth = w0 * z0 + w1 * z1 + w2 * z2; const p = py * RES + px;
          if (!isOwn) { if (depth < zO[p]) zO[p] = depth; }
          else if (front) { if (depth < zF[p]) { zF[p] = depth; tF[p] = t; } }
          else if (depth < zB[p]) { zB[p] = depth; tB[p] = t; }
        }
      }
    }
  };
  draw(own.pos, own.flags, true);
  if (occ && occ.length) draw(occ, null, false);
  const kind = new Uint8Array(N); const empty = new Uint8Array(N);
  const world = (px, py, depth) => {
    const ox = (px + 0.5 - RES / 2) / scale, oy = (py + 0.5 - RES / 2) / scale;
    return [cx + rx * ox + ux * oy + d[0] * depth, cy + ry * ox + uy * oy + d[1] * depth, cz + rz * ox + uz * oy + d[2] * depth];
  };
  // A pixel counts only when an eye can stand on its ray outside the building: march from the surface back toward the
  // eye; the terrain may not cross the ray, and a view looking up has its eye where the ray comes down to eye height
  // over the ground, which must not be inside the building (the ground clip cuts the walls there, and the inside of
  // the far wall shows through the cut to no real eye).
  const stepV = envelope ? Math.max(0.1, envelope.V * 0.5) : 0.1;
  // a surface met at a grazing angle (within 20 degrees of edge-on) runs along a corner of the closed envelope, where the
  // closing fills the angle between two surfaces: the inside test reads only surfaces that face the eye
  const grazing = (pos, o) => {
    const ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
    const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz) || 1;
    return Math.abs(nx * d[0] + ny * d[1] + nz * d[2]) / l < 0.35;
  };
  const eyeOutside = (px, py, depth) => {
    for (let s = depth - stepV; s >= -sphere.r * 1.3; s -= stepV) {
      const [wx, wy, wz] = world(px, py, s);
      const g = ground.at(wx, wz);
      if (wy < g - 0.02) return false;
      if (view.el < 0 && wy <= g + EYE_M) return !(envelope && envelope.withinSkin(wx, wy, wz));
    }
    return true;
  };
  // what of each floating assembly shows (its triangles nearest an eye outside the building)
  const floatingPx = new Map(); const floatMask = setOfTri ? new Uint8Array(N) : null;
  if (setOfTri) for (let p = 0; p < N; p++) {
    const t = tF[p]; if (t < 0 || zF[p] > zO[p] + SEAM_EPS || zF[p] > zB[p] + SEAM_EPS) continue;
    const id = setOfTri[t]; if (id < 0) continue;
    const px = p % RES, py = (p - px) / RES;
    if (eyeOutside(px, py, zF[p])) { floatingPx.set(id, (floatingPx.get(id) || 0) + 1); floatMask[p] = 1; }
  }
  for (let p = 0; p < N; p++) {
    const hasF = zF[p] !== Infinity, hasB = zB[p] !== Infinity, hasO = zO[p] !== Infinity;
    if (!hasF && !hasB) { if (!hasO) empty[p] = 1; continue; }
    const near = Math.min(zF[p], zO[p]);
    const px = p % RES, py = (p - px) / RES;
    if (hasB && zB[p] < near - SEAM_EPS) {
      if (eyeOutside(px, py, zB[p])) kind[p] = hasF && zF[p] - zB[p] < INVERTED_DEPTH ? 2 : 1;
      continue;
    }
    if (hasF && zF[p] <= zO[p] + SEAM_EPS && envelope && !grazing(own.pos, tF[p] * 9)) {
      const [wx, wy, wz] = world(px, py, zF[p] - INSIDE_OFFSET_M);
      if (wy > ground.at(wx, wz) + 0.3 && envelope.inside(wx, wy, wz)) {
        const [hx, hy, hz] = world(px, py, zF[p] - INSIDE_OFFSET_M / 2);
        if (envelope.inside(hx, hy, hz) && eyeOutside(px, py, zF[p])) kind[p] = 3;
      }
    }
  }
  // empty pixels the image border cannot reach through anything but this building are enclosed by it (a neighbour's
  // pixels let the border through: a slot between two houses is no gap in either): march each ray; sky (no ground
  // met) is a gap, the ground met inside the closed envelope is the inside seen through the building
  const reached = new Uint8Array(N); const stack = [];
  const free = (q) => zF[q] === Infinity && zB[q] === Infinity;
  for (let p = 0; p < N; p++) {
    const px = p % RES, py = (p - px) / RES;
    if ((px === 0 || py === 0 || px === RES - 1 || py === RES - 1) && free(p)) { reached[p] = 1; stack.push(p); }
  }
  while (stack.length) {
    const q = stack.pop(); const qx = q % RES;
    if (qx > 0 && !reached[q - 1] && free(q - 1)) { reached[q - 1] = 1; stack.push(q - 1); }
    if (qx < RES - 1 && !reached[q + 1] && free(q + 1)) { reached[q + 1] = 1; stack.push(q + 1); }
    if (q >= RES && !reached[q - RES] && free(q - RES)) { reached[q - RES] = 1; stack.push(q - RES); }
    if (q < N - RES && !reached[q + RES] && free(q + RES)) { reached[q + RES] = 1; stack.push(q + RES); }
  }
  const stepM = envelope ? envelope.V * 0.5 : 0.1;
  for (let p = 0; p < N; p++) {
    if (!empty[p] || reached[p]) continue;
    const px = p % RES, py = (p - px) / RES;
    let met = false, inside = false, at = sphere.r * 1.2;
    for (let s = -sphere.r * 1.2; s <= sphere.r * 1.2; s += stepM) {
      const [wx, wy, wz] = world(px, py, s);
      const g = ground.at(wx, wz);
      if (wy < g) { met = true; at = s; inside = envelope ? envelope.inside(wx, g + 0.3, wz) : false; break; }
    }
    if ((!met || inside) && eyeOutside(px, py, met ? at : 0)) kind[p] = met ? 3 : 4;
  }
  // clusters
  const clusters = []; const seen = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (!kind[p] || seen[p]) continue;
    const k = kind[p]; let n = 0, sx = 0, sy = 0, sd = 0, nd = 0; const owners = new Map();
    let bx0 = RES, bx1 = 0, by0 = RES, by1 = 0, low = Infinity;
    stack.push(p); seen[p] = 1;
    while (stack.length) {
      const q = stack.pop(); n++; const qx = q % RES, qy = (q - qx) / RES; sx += qx; sy += qy;
      if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
      if (k === 4) { const [wx, wy, wz] = world(qx, qy, 0); const above = wy - ground.at(wx, wz); if (above < low) low = above; }
      const t = k <= 2 ? tB[q] : tF[q];
      if (t >= 0) owners.set(own.bucketOf[t], (owners.get(own.bucketOf[t]) || 0) + 1);
      const z = k <= 2 ? zB[q] : zF[q]; if (z !== Infinity) { sd += z; nd++; }
      if (qx > 0 && kind[q - 1] === k && !seen[q - 1]) { seen[q - 1] = 1; stack.push(q - 1); }
      if (qx < RES - 1 && kind[q + 1] === k && !seen[q + 1]) { seen[q + 1] = 1; stack.push(q + 1); }
      if (q >= RES && kind[q - RES] === k && !seen[q - RES]) { seen[q - RES] = 1; stack.push(q - RES); }
      if (q < N - RES && kind[q + RES] === k && !seen[q + RES]) { seen[q + RES] = 1; stack.push(q + RES); }
    }
    const areaM2 = n * pxM2;
    if (n < 2 || areaM2 < MIN_CLUSTER_M2) continue;
    // a line one pixel wide is the edge of a cut or a seam's aliasing, not an opening
    if (n / Math.max(bx1 - bx0 + 1, by1 - by0 + 1) < 1.6) continue;
    // sky under a roof that reaches down to the ground is an open ground storey (a passage, an arcade, an open shed on
    // its posts), not a gap in the building's skin
    if (k === 4 && low < GROUND_OPENING_M) continue;
    const at = world(sx / n, sy / n, nd ? sd / nd : 0);
    clusters.push({ kind: KIND_NAMES[k], px: n, areaM2: +areaM2.toFixed(3), at: at.map((v) => +v.toFixed(2)),
      buckets: [...owners.entries()].sort((u, v) => v[1] - u[1]).slice(0, 3).map(([b]) => own.buckets[b] ?? '?') });
  }
  clusters.sort((u, v) => v.areaM2 - u.areaM2);
  return { name: view.name, clusters, kind, zF, zB, RES, floatingPx, pxM2, floatMask };
}

/** Degenerate (zero-area) and sliver (longer than 0.5 m, altitude under 1/1000 of it) triangles. */
export function triangleQuality(pos) {
  let degenerate = 0, sliver = 0;
  for (let o = 0; o < pos.length; o += 9) {
    const e0 = Math.hypot(pos[o + 3] - pos[o], pos[o + 4] - pos[o + 1], pos[o + 5] - pos[o + 2]);
    const e1 = Math.hypot(pos[o + 6] - pos[o + 3], pos[o + 7] - pos[o + 4], pos[o + 8] - pos[o + 5]);
    const e2 = Math.hypot(pos[o] - pos[o + 6], pos[o + 1] - pos[o + 7], pos[o + 2] - pos[o + 8]);
    const L = Math.max(e0, e1, e2); if (L < 1e-3) continue;
    const a = triArea(pos, o);
    if (a < 1e-7) degenerate++;
    else if (L > 0.5 && 2 * a / L < L / 1000) sliver++;
  }
  return { degenerate, sliver };
}

/**
 * The whole check of one building. `own` = { pos: Float32Array (9 per triangle), flags: Uint8Array, bucketOf:
 * Uint8Array, buckets: string[] }; `occluders` a Float32Array of nearby triangles; `groundFn(x, z)` the terrain.
 */
export function analyseBuilding(own, { occluders = null, groundFn = () => 0, elevations = DEFAULT_ELEVATIONS, pxM = 0.07, maxRes = 288, views: viewList = null, skipViews = false, keepRasters = false } = {}) {
  const b = boundsOf(own.pos);
  const ground = groundGrid(groundFn, b[0] - 2, b[3] + 2, b[2] - 2, b[5] + 2, 0.5);
  const quality = triangleQuality(own.pos);
  const t0 = performance.now();
  const { pieces, floating, setOfTri, stickTri } = floatingParts(own.pos, own.flags, own.bucketOf, own.buckets, ground);
  const t1 = performance.now();
  const result = { tris: own.pos.length / 9, pieces, floating, ...quality, views: 0, kinds: {}, ms: { floating: Math.round(t1 - t0) } };
  if (skipViews) return result;
  // the envelope closes over the building's surfaces less its sticks
  let sticks = 0; for (let t = 0; t < stickTri.length; t++) sticks += stickTri[t];
  let skin = own.pos;
  if (sticks && sticks < stickTri.length) {
    skin = new Float32Array((stickTri.length - sticks) * 9);
    for (let t = 0, o = 0; t < stickTri.length; t++) if (!stickTri[t]) { skin.set(own.pos.subarray(t * 9, t * 9 + 9), o); o += 9; }
  }
  const envelope = closedEnvelope(skin, ground);
  const t2 = performance.now(); result.ms.envelope = Math.round(t2 - t1);
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const r = Math.max(0.5, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2) * 1.05;
  const res = Math.max(64, Math.min(maxRes, Math.round(2 * r / pxM)));
  const kinds = { hole: [], inverted: [], inside: [], gap: [] };
  const list = viewList ?? viewDirections(elevations);
  const rasters = [];
  for (const view of list) {
    const v = rasterView(view, own, occluders, ground, envelope, { c, r }, res, floating.length ? setOfTri : null);
    for (const cl of v.clusters) kinds[cl.kind].push({ view: view.name, ...cl });
    for (const f of floating) { const px = v.floatingPx.get(f.id) || 0; if (px * v.pxM2 > (f.shownM2 ?? 0)) f.shownM2 = +(px * v.pxM2).toFixed(3); }
    if (keepRasters && (v.clusters.length || v.floatingPx.size)) rasters.push(v);
  }
  if (keepRasters) Object.defineProperty(result, 'rasters', { value: rasters, enumerable: false });
  result.ms.views = Math.round(performance.now() - t2);
  // a floating assembly no view shows (inside a solid) is no defect: kept, marked hidden
  for (const f of floating) { f.shownM2 = f.shownM2 ?? 0; f.hidden = f.shownM2 < MIN_CLUSTER_M2; }
  result.floating = floating.filter((f) => !f.hidden);
  result.hiddenFloating = floating.length - result.floating.length;
  result.views = list.length; result.res = res; result.pxM = +(2 * r / res).toFixed(3); result.enclosedM3 = envelope.enclosedM3;
  for (const [name, list2] of Object.entries(kinds)) {
    const byView = new Map();
    for (const cl of list2) byView.set(cl.view, (byView.get(cl.view) || 0) + cl.areaM2);
    const worst = list2.slice().sort((u, v) => v.areaM2 - u.areaM2)[0] ?? null;
    result.kinds[name] = { views: byView.size, maxViewM2: +Math.max(0, ...byView.values()).toFixed(3),
      worst: worst ? { view: worst.view, areaM2: worst.areaM2, at: worst.at, buckets: worst.buckets } : null };
  }
  return result;
}

/** One number per building for ranking: floating area weighs most (a roof in the air), then the open kinds. */
export function severity(r) {
  const fl = r.floating.reduce((s, f) => s + f.areaM2 * (f.clearanceM === null || f.clearanceM > 0.1 ? 1 : 0.25), 0);
  const k = r.kinds ?? {};
  return +(fl * 4 + (k.hole?.maxViewM2 ?? 0) + (k.inside?.maxViewM2 ?? 0) * 0.5 + (k.gap?.maxViewM2 ?? 0) * 2 + (k.inverted?.maxViewM2 ?? 0) * 0.5).toFixed(3);
}
