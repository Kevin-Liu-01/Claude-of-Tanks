/**
 * destruction-hanging.mjs — what a building's damage leaves hanging (destruction-slabs 227 round 3; the engineering
 * critic of round 2: roof trim and furniture stood in the sky after a roof fell — a cottage's verge boards as an A-frame
 * over its roofless walls, a farmhouse's roof ladder and chimney beside its gable, a dormer's cap at antenna height — and
 * the slab check passed every one: it judges slabs only, and it counted the standing building's own collision record, a
 * box round the whole building, as what holds them up).
 *
 * Any drawn piece, slab or not — of the building's own spans (the world's buckets as the CPU holds them: a hide collapses
 * a triangle to a point) and of the presentation's standing meshes (a fracture's redrawn faces, rims, remnants, a
 * collapse's remnant and baked rests, a ruin's stubs) — judged two ways against what is drawn round it, never against a
 * collision record:
 *
 *  - HELD, THEN NOT: a piece's lower envelope (its lowest point over each 0.4 m plan cell) is held where the ground or
 *    another drawn piece's surface lies within 0.8 m under it (a wall beside it at that height holds it too: a sign, a
 *    gutter). A piece held over half its envelope in the intact building and over a quarter or less now hangs (a ladder
 *    on a roof that went, verge boards over a gable that went with the roof). A world piece is judged against the intact
 *    building without itself; a presentation's piece against the intact building without what lies within 0.2 m of its
 *    own surface (its own twin, as drawn before the damage).
 *  - CUT LOOSE: pieces touching (a surface sample of each within 0.25 m of the other's) gather in clusters; a cluster touching
 *    the ground (within 0.3 m) stands. A world piece whose cluster stood in the intact building and stands no longer hangs
 *    with its cluster (a chimney on a roof that went); a presentation's standing piece hangs when its cluster does.
 *
 * Pieces under 1 m across or 0.2 m² of surface are left out (splinters, wire, a sill's end); what stands under 1 m over the ground
 * is on it. Numbers only, deterministic. The slab check (destruction-slab-check.mjs) calls it at each judged snapshot.
 */

export const HANG = Object.freeze({
  cellM: 0.4, voxelM: 0.25, spacingM: 0.3, bandM: 0.8, liftM: 1.0, sizeM: 1.0, areaM2: 0.2,
  bearShare: 0.5, dropShare: 0.25, groundTouchM: 0.3, twinM: 0.1,
});

const CELL_BITS = 2 ** 21;
const cellKey = (i, k) => (i + 1048576) * CELL_BITS + (k + 1048576);
const VOX_X = 2 ** 34, VOX_Y = 2 ** 17;
const voxKey = (i, j, k) => (i + 65536) * VOX_X + (j + 65536) * VOX_Y + (k + 65536);

/** Samples of the listed triangles `spacing` apart: rows across each from its longest edge to the opposite corner, each
 *  row `spacing`-stepped along (a sliver gets a line of them); its corners and edges among them (two members meeting at a
 *  point touch there: a bent stump's knee) — as the runtime's sweep samples them (src/fx/structureHanging.ts sampleA3):
 *  xyz, and the triangle each came from. */
function sampleTriangles(tris, list, spacing, xyz, owner) {
  for (const t of list) {
    const o = t * 9;
    const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx0 = tris[o + 6] - tris[o], by0 = tris[o + 7] - tris[o + 1], bz0 = tris[o + 8] - tris[o + 2];
    if (!(0.5 * Math.hypot(ay * bz0 - az * by0, az * bx0 - ax * bz0, ax * by0 - ay * bx0) > 1e-8)) continue;
    const l01 = (tris[o + 3] - tris[o]) ** 2 + (tris[o + 4] - tris[o + 1]) ** 2 + (tris[o + 5] - tris[o + 2]) ** 2;
    const l12 = (tris[o + 6] - tris[o + 3]) ** 2 + (tris[o + 7] - tris[o + 4]) ** 2 + (tris[o + 8] - tris[o + 5]) ** 2;
    const l20 = (tris[o] - tris[o + 6]) ** 2 + (tris[o + 1] - tris[o + 7]) ** 2 + (tris[o + 2] - tris[o + 8]) ** 2;
    const p = l01 >= l12 && l01 >= l20 ? 0 : l12 >= l20 ? 3 : 6, q = (p + 3) % 9, r = (p + 6) % 9;
    const L = Math.sqrt(Math.max(l01, l12, l20));
    const px = tris[o + p], py = tris[o + p + 1], pz = tris[o + p + 2];
    const ex = tris[o + q] - px, ey = tris[o + q + 1] - py, ez = tris[o + q + 2] - pz;
    const rx = tris[o + r], ry = tris[o + r + 1], rz = tris[o + r + 2];
    const cx = ey * (rz - pz) - ez * (ry - py), cy = ez * (rx - px) - ex * (rz - pz), cz = ex * (ry - py) - ey * (rx - px);
    const h = L > 1e-9 ? Math.hypot(cx, cy, cz) / L : 0;
    const kl = Math.max(1, Math.min(200, Math.ceil(L / spacing))), kt = Math.max(1, Math.min(200, Math.ceil(h / spacing)));
    for (let j = 0; j < kt; j++) {
      const tt = j / kt, ks = Math.max(1, Math.ceil(kl * (1 - tt)));
      for (let i = 0; i <= ks; i++) {
        const sv = i / ks, bx = px + ex * sv, by = py + ey * sv, bz = pz + ez * sv;
        xyz.push(bx + (rx - bx) * tt, by + (ry - by) * tt, bz + (rz - bz) * tt);
        owner.push(t);
      }
    }
    xyz.push(rx, ry, rz);
    owner.push(t);
  }
}

/** Connected pieces of the listed triangles (corners welded at 1 mm): one triangle list a piece. */
function weldPieces(tris, list) {
  const n = list.length;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  for (let q = 0; q < n; q++) {
    const o = list[q] * 9;
    for (let c = 0; c < 3; c++) {
      const key = `${Math.round(tris[o + c * 3] * 1000)},${Math.round(tris[o + c * 3 + 1] * 1000)},${Math.round(tris[o + c * 3 + 2] * 1000)}`;
      const prev = owner.get(key);
      if (prev === undefined) owner.set(key, q);
      else { const ra = find(prev), rb = find(q); if (ra !== rb) parent[ra] = rb; }
    }
  }
  const groups = new Map();
  for (let q = 0; q < n; q++) {
    const r = find(q);
    let g = groups.get(r);
    if (!g) groups.set(r, g = []);
    g.push(list[q]);
  }
  return [...groups.values()];
}

/** Whether a triangle (9 floats at o) draws (not collapsed to a point or a line). */
function drawsAt(tris, o) {
  const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
  const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) >= 1e-8;
}

/** A piece of a triangle list: its samples, box, surface and lower envelope. */
function pieceOf(tris, list) {
  const xyz = [], own = [];
  sampleTriangles(tris, list, HANG.spacingM, xyz, own);
  if (!own.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let area = 0;
  for (const t of list) {
    const o = t * 9;
    for (let c = 0; c < 9; c++) { const d = c % 3; if (tris[o + c] < lo[d]) lo[d] = tris[o + c]; if (tris[o + c] > hi[d]) hi[d] = tris[o + c]; }
    const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
    area += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }
  const env = new Map();
  for (let i = 0; i < own.length; i++) {
    const ck = cellKey(Math.floor(xyz[i * 3] / HANG.cellM), Math.floor(xyz[i * 3 + 2] / HANG.cellM));
    const y = env.get(ck);
    if (y === undefined || xyz[i * 3 + 1] < y) env.set(ck, xyz[i * 3 + 1]);
  }
  return { tris, list, xyz, own, lo, hi, area, env };
}
const sizable = (p) => Math.max(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]) >= HANG.sizeM && p.area >= HANG.areaM2;
const trisOf = (src, list) => {
  const out = new Float32Array(list.length * 9);
  list.forEach((t, i) => out.set(src.subarray(t * 9, t * 9 + 9), i * 9));
  return out;
};

/** Whether (x, z) lies inside the convex hull of the cell points `pts` ([i, k, ...]; within half a cell). */
function insideHull(pts, x, z) {
  const P = [];
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i], pts[i + 1]]);
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    if ((ex * (z - a[1]) - ez * (x - a[0])) / l < -0.5) return false;
  }
  return true;
}

/**
 * The judge of one building: `spans` its spans' triangles as built (one list a span, world space, every triangle; `names`
 * each span's label), `groundAt(x, z)` the intact ground. Returns judge(now, extra, groundNow): `now` the spans' triangles
 * as drawn at the snapshot (aligned with `spans`; null when the world's spans are not drawn — a fallen building's), `extra`
 * the presentation's drawn meshes ([{ name, tris, standing }]: the standing ones are judged; a body or a heap lies where
 * it fell and holds what it holds), `groundNow` the ground with its rubble mounds. Findings: { mesh, reason, centre,
 * extentsM, liftM, tris }.
 *
 * Support propagates up from the ground: a piece is held only by the ground or by pieces that are held themselves (two
 * verge boards side by side, each beside the other, hold nothing up), a piece counting as held once over half of its
 * envelope is or its envelope's middle lies inside what holds it (bears: a roof's side held along its eave and up its
 * gables). A piece that bore in the intact building and bears no more, its held share down by a quarter or more, hangs.
 */
export function createHangingJudge(spans, names, groundAt, floorUnder = null) {
  const C = HANG.cellM, V = HANG.voxelM, HOLDS = HANG.bearShare;
  // ---- the world's pieces as built (each its span and triangles: what a hide or a storey's fall does to them later is
  // read from the spans as drawn, the pieces' membership kept)
  const pieces = [];
  for (let s = 0; s < spans.length; s++) {
    const tris = spans[s];
    const list = [];
    for (let t = 0; t * 9 < tris.length; t++) if (drawsAt(tris, t * 9)) list.push(t);
    if (!list.length) continue;
    for (const members of weldPieces(tris, list)) pieces.push({ id: pieces.length, span: s, list: members, held0: 0, sup0: false, stood0: false });
  }
  const W = pieces.length;
  /**
   * The world's pieces sampled from triangle lists (`src`, aligned with the spans) — those drawn there (`drawn`: a hidden
   * triangle draws nothing): their samples by plan cell (support) and by voxel (touch), each piece's box, surface and
   * lower envelope (null for a piece drawing nothing).
   */
  // (destruction-slab-kinds-perf 265) each piece as sampled in the intact building: a piece drawn now exactly as built (each
  // of its triangles' coordinates the same) is the same piece, its samples, box and envelope reused
  const intactPieces = new Array(W).fill(null);
  const unmoved = (p, tris) => {
    const was = spans[p.span];
    if (tris === was) return true;
    for (const t of p.list) {
      const o = t * 9;
      if (o + 8 >= tris.length) return false;
      for (let c = 0; c < 9; c++) if (tris[o + c] !== was[o + c]) return false;
    }
    return true;
  };
  function indexOf(src) {
    const sx = [], sy = [], sz = [], sp = [];
    const shape = new Array(W).fill(null);
    for (const p of pieces) {
      const tris = src[p.span];
      const same = src !== spans && intactPieces[p.id] && unmoved(p, tris);
      const live = same ? p.list : p.list.filter((t) => t * 9 + 8 < tris.length && drawsAt(tris, t * 9));
      if (!live.length) continue;
      const q = same ? intactPieces[p.id] : pieceOf(tris, live);
      if (!q) continue;
      if (src === spans) intactPieces[p.id] = q;
      for (let i = 0; i < q.own.length; i++) { sx.push(q.xyz[i * 3]); sy.push(q.xyz[i * 3 + 1]); sz.push(q.xyz[i * 3 + 2]); sp.push(p.id); }
      shape[p.id] = { lo: q.lo, hi: q.hi, area: q.area, env: q.env, tris, list: live, whole: live.length === p.list.length };
    }
    const N = sx.length, column = new Map(), voxels = new Map();
    for (let i = 0; i < N; i++) {
      const ck = cellKey(Math.floor(sx[i] / C), Math.floor(sz[i] / C));
      let list = column.get(ck); if (!list) column.set(ck, list = []); list.push(i);
      const vk = voxKey(Math.floor(sx[i] / V), Math.floor(sy[i] / V), Math.floor(sz[i] / V));
      let vl = voxels.get(vk); if (!vl) voxels.set(vk, vl = []);
      let mine = 0;
      for (let j = vl.length - 1; j >= 0 && mine < 6; j -= 4) if (vl[j] === sp[i]) mine++;
      if (mine < 6) vl.push(sx[i], sy[i], sz[i], sp[i]);
    }
    // (destruction-slab-kinds-perf 265: a tall building's plan cell holds every storey's samples, and a held share scanned
    // them all for the few in its band — ~80 % of the receipt's CPU on Ruinspires) each cell's samples by height
    for (const [ck, list] of column) {
      list.sort((a, b) => sy[a] - sy[b] || a - b);
      column.set(ck, { y: Float64Array.from(list, (i) => sy[i]), i: Int32Array.from(list) });
    }
    return { sx, sy, sz, sp, N, column, voxels, shape };
  }
  const intact = indexOf(spans);

  /**
   * A piece's held share over its lower envelope (`env`) in index `ix`: held where the ground or a held piece's surface lies
   * within the band under it — a world sample (its piece held in `sup`, never the piece's own `self`, nor one `near` its
   * own surface) or a presentation sample (`xcol`: [y, owner]..., its owner held in `sup` at W + owner, never `xself`).
   * `holders` (a Set) gathers the world pieces that held it; the held cells are left in heldPts.
   */
  const heldPts = [];
  function heldOf(ix, env, { self = -1, xself = -1, near = null, sup, xcol = null, ground = groundAt, holders = null }) {
    let held = 0, cells = 0;
    heldPts.length = 0;
    const { sx, sy, sz, sp, column } = ix;
    for (const [ck, y] of env) {
      cells++;
      const i0 = Math.floor(ck / CELL_BITS) - 1048576, k0 = (ck % CELL_BITS) - 1048576;
      const lo = y - HANG.bandM, hi = y + 0.1;
      const gx = (i0 + 0.5) * C, gz = (k0 + 0.5) * C;
      if (ground(gx, gz) >= lo || (floorUnder && floorUnder(gx, gz, hi) >= lo)) { held++; heldPts.push(i0, k0); continue; }
      let ok = false;
      for (let di = -1; di <= 1 && (!ok || holders); di++) for (let dk = -1; dk <= 1 && (!ok || holders); dk++) {
        const key = cellKey(i0 + di, k0 + dk);
        const col = column.get(key);
        if (col) {
          // (the cell's samples in the band lo..hi: the first at lo or over, by halves)
          const ys = col.y;
          let t = 0;
          for (let b = ys.length; t < b;) { const m = (t + b) >> 1; if (ys[m] < lo) t = m + 1; else b = m; }
          for (; t < ys.length && ys[t] <= hi; t++) {
            const i = col.i[t], q = sp[i];
            if (q === self || !sup[q]) continue;
            if (near && near.has(voxKey(Math.floor(sx[i] / HANG.twinM), Math.floor(sy[i] / HANG.twinM), Math.floor(sz[i] / HANG.twinM)))) continue;
            ok = true;
            if (!holders) break;
            holders.add(q);
          }
        }
        if (!ok && xcol) {
          const e = xcol.get(key);
          if (e) for (let j = 0; j < e.length; j += 2) if (e[j + 1] !== xself && sup[W + e[j + 1]] && e[j] >= lo && e[j] <= hi) { ok = true; break; }
        }
      }
      if (ok) { held++; heldPts.push(i0, k0); }
    }
    return cells ? held / cells : 1;
  }
  /**
   * Whether a piece bears on what held it (after heldOf): over HOLDS of its envelope held, or its envelope's middle inside
   * the held cells' hull — a roof's side held along its eave and up its gables, a beam on its two posts — never a board
   * held at one end.
   */
  function bears(env, share) {
    if (share > HOLDS) return true;
    if (heldPts.length < 6) return false;
    let mx = 0, mz = 0;
    for (const ck of env.keys()) { mx += Math.floor(ck / CELL_BITS) - 1048576; mz += (ck % CELL_BITS) - 1048576; }
    mx /= env.size; mz /= env.size;
    return insideHull(heldPts, mx, mz);
  }
  /**
   * Which pieces are held (W world pieces drawn in `ix`, then the presentation's `xp`): up from the ground, round after
   * round, each piece once it bears on the ground or on pieces held already (a presentation's body or heap is held where it
   * lies). The held flags, W + xp.length of them.
   */
  function propagate(ix, xp, xcol, ground) {
    const sup = new Uint8Array(W + xp.length);
    const open = [];
    for (const p of pieces) if (ix.shape[p.id]) open.push(p.id);
    xp.forEach((e, k) => { if (e.standing) open.push(W + k); else sup[W + k] = 1; });
    for (let round = 0; round < 64 && open.length; round++) {
      let changed = false;
      for (let j = open.length - 1; j >= 0; j--) {
        const id = open[j];
        const env = id < W ? ix.shape[id].env : xp[id - W].env;
        const share = id < W ? heldOf(ix, env, { self: id, sup, xcol, ground }) : heldOf(ix, env, { xself: id - W, sup, xcol, ground });
        if (bears(env, share)) { sup[id] = 1; open[j] = open[open.length - 1]; open.pop(); changed = true; }
      }
      if (!changed) break;
    }
    return sup;
  }
  /** The voxels (HANG.twinM) within one of a presentation piece's samples: its twin in the intact building is left out. */
  function nearSet(xyz) {
    const out = new Set(), T = HANG.twinM;
    for (let i = 0; i < xyz.length; i += 3) {
      const vi = Math.floor(xyz[i] / T), vj = Math.floor(xyz[i + 1] / T), vk = Math.floor(xyz[i + 2] / T);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) out.add(voxKey(vi + a, vj + b, vk + c));
    }
    return out;
  }
  /** Clusters of the world's pieces drawn in `ix` and the presentation's pieces (touching), and which stand on the ground. */
  function clusters(ix, xp, ground) {
    const M = W + xp.length;
    const parent = new Int32Array(M);
    for (let i = 0; i < M; i++) parent[i] = i;
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const join = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    const grounded = new Uint8Array(M);
    const { sx, sy, sz, sp, N, voxels } = ix;
    const onFloor = (x, y, z) => y - ground(x, z) <= HANG.groundTouchM || (floorUnder && y - floorUnder(x, z, y + 0.05) <= HANG.groundTouchM);
    // (perf 265: an owner on the ground once is on it; the floor's reading is the same every time)
    for (let i = 0; i < N; i++) if (!grounded[sp[i]] && onFloor(sx[i], sy[i], sz[i])) grounded[sp[i]] = 1;
    // the presentation's samples into their own voxels beside the world's ([x, y, z, owner] each): a world voxel they join is
    // copied first (the index's own lists are the judge's to keep)
    const extra = new Map();
    xp.forEach((e, k) => {
      const id = W + k;
      for (let i = 0; i < e.xyz.length; i += 3) {
        const x = e.xyz[i], y = e.xyz[i + 1], z = e.xyz[i + 2];
        if (!grounded[id] && onFloor(x, y, z)) grounded[id] = 1;
        const vk = voxKey(Math.floor(x / V), Math.floor(y / V), Math.floor(z / V));
        let vl = extra.get(vk); if (!vl) extra.set(vk, vl = (voxels.get(vk) ?? []).slice());
        let mine = 0;
        for (let j = vl.length - 1; j >= 0 && mine < 6; j -= 4) if (vl[j] === id) mine++;
        if (mine < 6) vl.push(x, y, z, id);
      }
    });
    const listAt = (vk) => extra.get(vk) ?? voxels.get(vk);
    // (perf 265) a voxel's one owner, or -1 when it holds two or more: samples of one owner touch nothing of another
    const soleMemo = new Map();
    const soleOf = (list) => {
      let o = soleMemo.get(list);
      if (o === undefined) {
        o = list[3];
        for (let a = 7; a < list.length; a += 4) if (list[a] !== o) { o = -1; break; }
        soleMemo.set(list, o);
      }
      return o;
    };
    // touching: two owners' samples within a voxel's size of each other
    const D2 = V * V;
    const touchIn = (vk, list) => {
      const vi = Math.floor(vk / VOX_X) - 65536, vj = Math.floor((vk % VOX_X) / VOX_Y) - 65536, vz = (vk % VOX_Y) - 65536;
      const sole = soleOf(list);
      if (sole < 0) for (let a = 0; a < list.length; a += 4) for (let b = a + 4; b < list.length; b += 4) {
        if (list[a + 3] === list[b + 3]) continue;
        const dx = list[a] - list[b], dy = list[a + 1] - list[b + 1], dz = list[a + 2] - list[b + 2];
        if (dx * dx + dy * dy + dz * dz <= D2) join(list[a + 3], list[b + 3]);
      }
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
        if (da < 0 || (da === 0 && (db < 0 || (db === 0 && dc <= 0)))) continue;
        const other = listAt(voxKey(vi + da, vj + db, vz + dc));
        if (!other || (sole >= 0 && soleOf(other) === sole)) continue;
        for (let a = 0; a < list.length; a += 4) for (let b = 0; b < other.length; b += 4) {
          if (list[a + 3] === other[b + 3]) continue;
          const dx = list[a] - other[b], dy = list[a + 1] - other[b + 1], dz = list[a + 2] - other[b + 2];
          if (dx * dx + dy * dy + dz * dz <= D2) join(list[a + 3], other[b + 3]);
        }
      }
    };
    for (const [vk, list] of voxels) touchIn(vk, extra.get(vk) ?? list);
    for (const [vk, list] of extra) if (!voxels.has(vk)) touchIn(vk, list);
    const stands = new Uint8Array(M);
    for (let i = 0; i < M; i++) if (grounded[i]) stands[find(i)] = 1;
    return { find, stands };
  }
  // ---- the intact building's own reading
  const sup0 = propagate(intact, [], null, groundAt);
  for (const p of pieces) {
    const sh = intact.shape[p.id];
    if (!sh) continue;
    p.held0 = heldOf(intact, sh.env, { self: p.id, sup: sup0 });
    p.sup0 = sup0[p.id] === 1;
  }
  {
    const { find, stands } = clusters(intact, [], groundAt);
    for (const p of pieces) p.stood0 = !!stands[find(p.id)];
  }

  const finding = (mesh, reason, lo, hi, ground, tris) => ({
    mesh, reason, centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2].map((v) => +v.toFixed(2)),
    extentsM: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map((v) => +v.toFixed(2)),
    liftM: +(lo[1] - ground((lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2)).toFixed(2), tris,
  });
  const liftOf = (p, ground) => p.lo[1] - ground((p.lo[0] + p.hi[0]) / 2, (p.lo[2] + p.hi[2]) / 2);

  return function judge(now, extra = [], ground = groundAt) {
    const findings = [];
    // the world as drawn now (a hide collapses a triangle to a point; a storey's fall moves what stood over it): sampled
    // again; none when the spans are gone
    let ix, lost = 0;
    if (now) {
      ix = indexOf(now);
      for (const p of pieces) if (!ix.shape[p.id]?.whole) lost++;
    } else ix = { sx: [], sy: [], sz: [], sp: [], N: 0, column: new Map(), voxels: new Map(), shape: new Array(W).fill(null) };
    // the presentation's pieces
    const xp = [];
    for (const m of extra) {
      const list = [];
      for (let t = 0; t * 9 < m.tris.length; t++) list.push(t);
      for (const members of weldPieces(m.tris, list)) {
        const p = pieceOf(m.tris, members);
        if (p) { p.name = m.name; p.standing = !!m.standing; xp.push(p); }
      }
    }
    const judgedX = xp.map((e) => e.standing && sizable(e) && liftOf(e, ground) >= HANG.liftM);
    if (!lost && now && !judgedX.some(Boolean)) return findings;
    const xcol = new Map();
    xp.forEach((e, k) => {
      for (let i = 0; i < e.xyz.length; i += 3) {
        const key = cellKey(Math.floor(e.xyz[i] / C), Math.floor(e.xyz[i + 2] / C));
        let l = xcol.get(key); if (!l) xcol.set(key, l = []); l.push(e.xyz[i + 1], k);
      }
    });
    const sup = propagate(ix, xp, xcol, ground);
    const { find, stands } = clusters(ix, xp, ground);
    const loose = new Map();
    const gather = (root, p, tris) => {
      const c = loose.get(root) ?? { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], parts: [], mesh: p.name ?? `world-${names[p.span] ?? p.span}` };
      for (let d = 0; d < 3; d++) { c.lo[d] = Math.min(c.lo[d], p.lo[d]); c.hi[d] = Math.max(c.hi[d], p.hi[d]); }
      c.parts.push(tris);
      loose.set(root, c);
    };
    // the world's pieces still drawn
    if (now && lost) for (const p of pieces) {
      const sh = ix.shape[p.id];
      if (!sh || !sizable(sh)) continue;
      const lift = liftOf(sh, ground);
      if (lift < HANG.liftM) continue;
      if (p.stood0 && !stands[find(p.id)]) { gather(find(p.id), { ...sh, span: p.span }, trisOf(sh.tris, sh.list)); continue; }
      // held, then not
      if (!p.sup0 || sup[p.id]) continue;
      const held = heldOf(ix, sh.env, { self: p.id, sup, xcol, ground });
      if (held > p.held0 - HANG.dropShare) continue;
      findings.push(finding(`world-${names[p.span] ?? p.span}`,
        `hanging: ${Math.round(held * 100)} % of it held, ${Math.round(p.held0 * 100)} % in the intact building, ${lift.toFixed(1)} m up`,
        sh.lo, sh.hi, ground, trisOf(sh.tris, sh.list)));
    }
    // the presentation's standing pieces
    xp.forEach((e, k) => {
      if (!judgedX[k]) return;
      const id = W + k;
      if (!stands[find(id)]) { gather(find(id), e, trisOf(e.tris, e.list)); return; }
      if (sup[id]) return;
      const held0 = heldOf(intact, e.env, { near: nearSet(e.xyz), sup: sup0 });
      if (!bears(e.env, held0)) return;
      const held = heldOf(ix, e.env, { xself: k, sup, xcol, ground });
      if (held > held0 - HANG.dropShare) return;
      findings.push(finding(e.name,
        `hanging: ${Math.round(held * 100)} % of it held, ${Math.round(held0 * 100)} % where it stood in the intact building, ${liftOf(e, ground).toFixed(1)} m up`,
        e.lo, e.hi, ground, trisOf(e.tris, e.list)));
    });
    for (const c of loose.values()) {
      const tris = new Float32Array(c.parts.reduce((n, t) => n + t.length, 0));
      let o = 0;
      for (const t of c.parts) { tris.set(t, o); o += t.length; }
      findings.push(finding(c.mesh,
        `cut loose: ${c.parts.length} piece(s) touching nothing that stands, ${(c.lo[1] - ground((c.lo[0] + c.hi[0]) / 2, (c.lo[2] + c.hi[2]) / 2)).toFixed(1)} m up`,
        c.lo, c.hi, ground, tris));
    }
    return findings;
  };
}
