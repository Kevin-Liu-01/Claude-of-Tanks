#!/usr/bin/env node
/**
 * r2-standard.mjs — the bunker r2 standard as one receipt every props family runs (props lane A, E14, 2026-10-14; the
 * owner on 2026-10-13: "great job on the bunkers!! ... update all our buildings from before which had this flat ugly
 * looking format of low detail ... make sure you touch all props and buildings and objects"). The reference is the
 * pillbox r2 (maps/fortKit.ts); the counter-example the owner's flat shed (the old hunting blind: a plank box on four
 * posts with a dark slit stuck on its side).
 *
 * A family's selftest hands it one spec a kind and asserts that nothing is wrong:
 *
 *   import { assertR2 } from '../../../tools/r2-standard.mjs';
 *   assertR2({
 *     kind: 'prop:drum',
 *     maps: ['verdant', 'desert', ...],          // every map that places the kind
 *     resolve: (mapId) => ({ form: 'kraftstoff-200l', build: () => geometry, broken: () => geometry,
 *                            far: () => geometry, phone: () => geometry }),
 *     genericOk: { moon: 'the 1972 lunar stores were the generic NASA canister' },   // optional
 *     route: 'fracture' | 'settle' | 'crush' | 'house' | 'landmark',
 *     caps: { near: 300, far: 60, phone: 300, wreckRatio: 1.5 },
 *   });
 *
 * A build returns a BufferGeometry (one bucket: `bucket`, default 'baked'), an array of them, or a record of bucket ->
 * geometries (a kit's parts). Every form is checked once however many maps share it. The checks (WORKLIST.md, "The
 * standard every family must meet" and its receipt bundle):
 *
 *  1. regional form: every map resolves a form (`resolve(mapId).form`), and none resolves 'generic' unless `genericOk`
 *     names the map with its reason (the place's real object is the generic one);
 *  2. painted openings (paintedOpenings): no dark plate stuck on a face — an island (welded at 1 mm) at most 10 cm
 *     thick and no thicker than half its face, spanning 6 cm or more each way along its own axes in the face (a rail as
 *     deep as it is tall is a member; timber laid flush in a wall is its frame, never an opening — a timber five or
 *     more times as long as it is wide; on render, one three times as long or no wider than a timber (26 cm); posts,
 *     rails and braces welded into one frame that covers under 60 % of its box: Fachwerk), with a host face right
 *     behind it (within 6 cm of its back at three of five sample points: nothing cut
 *     behind), the host running on round it (four of eight points just outside its outline: not a leaf set back in a
 *     cut opening), no reveal closing it in from 10 cm in front (not the back of an embrasure or a niche), and darker
 *     than its host (in the dark, glass or curtain bucket over another bucket, or a vertex colour at most 62 % of the
 *     host's luminance). Vertical faces by default (the primary faces); `tops: true` checks lids and hatches too. A
 *     plate longer than 12 times its width is a strip (a timber laid flat on a wall: reported as overlayStrips, a
 *     problem only under `strictStrips`). `allowPlates(plate)` may excuse a plate with its reason (a stencil decal);
 *  3. box-only share (boxShare): the share of the kind's surface area in plain primitives — islands of at most 8
 *     welded corners and 12 triangles: an unbevelled box, a quad, a wedge — at most 60 % (a chamfered board, a lathe
 *     body, a profile or a cast section is not one; shellShare, the chunky ones' share, is reported beside it);
 *  4. grounded (floatingMembers): every member reaches the ground (its foot within 2 cm of y = 0, or sunk) through
 *     members whose convex hulls come within 2 cm (partContact.ts, GJK). A form's `support()` is ground it stands on
 *     beside y = 0 (a bank, a plinth another pass lays: geometries) and the grade's height in its frame where the props
 *     seat the kind below the terrain (a number: the pillbox sits FORT_GRADE under it); `allowFloating(island)` may
 *     excuse an island with its reason;
 *  5. anti-raft: the destroyed state stands at least 25 % of the intact height (the area-weighted 90th percentile of
 *     the triangles' heights, so a lone splinter does not lift a raft) and covers at least 60 % of the intact plan's
 *     cells (the triangles' plan on a grid of the intact plan's 1/48);
 *  6. cost: the intact form within caps.near triangles, the far form within caps.far, the phone form within caps.phone,
 *     the destroyed state within caps.wreckRatio (1.5) of the intact;
 *  7. fracture: a 'fracture' or 'settle' route's intact build carries userData.fracture and checkKitFracture finds
 *     nothing wrong (48 pieces a light kind, `fortified: true` 64).
 *
 * The thresholds are R2 below; a spec may tighten or loosen one with its reason in `limits` (the clutter's crush route
 * flattens a drum: its wreck height is the crushed can's).
 *
 * CLI (the before/after reports): node tools/r2-standard.mjs --spec=<module exporting `r2Specs` (an array of specs)>
 *   [--json=<out>] [--kinds=a,b]  — a row per kind and form; exit 1 when any spec has a problem.
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { auditPartContact, weldedComponents } from '../src/world/partContact.ts';
import { checkKitFracture, FRACTURE_PIECE_CAP } from '../src/world/fractureAnatomy.ts';

export const R2 = Object.freeze({
  weldM: 0.001,
  plate: Object.freeze({
    maxThickM: 0.10, flat: 0.5, minSpanM: 0.06, minAreaM2: 0.012, maxNy: 0.35, aspect: 12, memberAspect: 5, frameAspect: 3, frameFill: 0.6, memberWidthM: 0.26,
    behindM: 0.06, hits: 3, aroundM: 0.03, around: 4, revealM: 0.10, revealReachM: 0.3, darkRel: 0.62, darkAbs: 0.05,
  }),
  boxShareMax: 0.6,
  chunky: 0.25,
  groundM: 0.02,
  contactM: 0.02,
  wreckHeightMin: 0.25,
  wreckFootprintMin: 0.6,
  wreckRatio: 1.5,
});

const DARK_BUCKETS = new Set(['dark', 'glass', 'curtain']);
/** The timber buckets a flush frame member draws in (structureWood, the plain wood print). */
const TIMBER_BUCKETS = new Set(['structureWood', 'wood']);

// --------------------------------------------------------------------------------------------- parts and the soup
/** A build's result as parts: [{ geometry, bucket }]. */
export function toParts(input, bucket = 'baked') {
  if (!input) return [];
  if (input.isBufferGeometry) return [{ geometry: input, bucket }];
  if (Array.isArray(input)) return input.flatMap((g) => (g?.isBufferGeometry ? [{ geometry: g, bucket }] : g?.geometry ? [g] : []));
  return Object.entries(input).flatMap(([name, list]) => (Array.isArray(list) ? list : [list]).filter((g) => g?.isBufferGeometry)
    .map((geometry) => ({ geometry, bucket: name })));
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Every triangle of the parts in one soup: positions (9 a triangle), its colour's luminance (NaN without a colour), its
 * part, its island (welded components within a part, at `weld` metres) and the islands' triangle lists.
 */
function soupOf(parts, weld = R2.weldM) {
  let total = 0;
  const flat = parts.map((part) => {
    const g = part.geometry, pos = g.getAttribute('position');
    const index = g.getIndex();
    const count = index ? index.count : pos.count;
    total += Math.floor(count / 3);
    return { g, pos, index, count, col: g.getAttribute('color') ?? null };
  });
  const P = new Float64Array(total * 9), L = new Float64Array(total).fill(NaN), part = new Int32Array(total), island = new Int32Array(total);
  const islands = [];
  let t = 0;
  const inv = 1 / weld;
  flat.forEach((f, pi) => {
    const ids = new Map(), parent = [];
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const t0 = t, vid = [];
    for (let k = 0; k + 2 < f.count; k += 3, t++) {
      let lsum = 0;
      for (let j = 0; j < 3; j++) {
        const v = f.index ? f.index.getX(k + j) : k + j;
        const x = f.pos.getX(v), y = f.pos.getY(v), z = f.pos.getZ(v);
        P[t * 9 + j * 3] = x; P[t * 9 + j * 3 + 1] = y; P[t * 9 + j * 3 + 2] = z;
        const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
        let id = ids.get(key);
        if (id === undefined) { id = parent.length; ids.set(key, id); parent.push(id); }
        vid.push(id);
        if (f.col) lsum += lum(f.col.getX(v), f.col.getY(v), f.col.getZ(v));
      }
      if (f.col) L[t] = lsum / 3;
      part[t] = pi;
      const a = find(vid[vid.length - 3]), b = find(vid[vid.length - 2]), c = find(vid[vid.length - 1]);
      if (a !== b) parent[a] = b;
      const b2 = find(b);
      if (c !== b2) parent[c] = b2;
    }
    const byRoot = new Map();
    for (let tt = t0; tt < t; tt++) {
      const r = find(vid[(tt - t0) * 3]);
      let isl = byRoot.get(r);
      if (isl === undefined) {
        isl = islands.length; byRoot.set(r, isl);
        islands.push({ part: pi, tris: [] });
      }
      island[tt] = isl;
      islands[isl].tris.push(tt);
    }
  });
  return { P, L, part, island, islands, count: total, parts };
}

function triNormalArea(P, t, out) {
  const o = t * 9;
  const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
  const vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  out[0] = l ? nx / l : 0; out[1] = l ? ny / l : 0; out[2] = l ? nz / l : 0;
  return l / 2;
}

/** The symmetric 3x3's eigenvectors (Jacobi), columns of the returned row-major matrix. */
function eigenAxes(m) {
  const a = [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const tt = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return [0, 1, 2].map((c) => [v[0][c], v[1][c], v[2][c]]);
}

/** An island's unique corners (positions) and its extents along its principal axes (sorted, least first). */
function islandShape(soup, isl) {
  const { P } = soup;
  const seen = new Set(), pts = [];
  for (const t of isl.tris) for (let j = 0; j < 3; j++) {
    const x = P[t * 9 + j * 3], y = P[t * 9 + j * 3 + 1], z = P[t * 9 + j * 3 + 2];
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key); pts.push(x, y, z);
  }
  const n = pts.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += pts[i * 3]; cy += pts[i * 3 + 1]; cz += pts[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  const m = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3] - cx, y = pts[i * 3 + 1] - cy, z = pts[i * 3 + 2] - cz;
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  const axes = eigenAxes(m);
  const ext = axes.map((a) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const d = pts[i * 3] * a[0] + pts[i * 3 + 1] * a[1] + pts[i * 3 + 2] * a[2]; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    return hi - lo;
  }).sort((a, b) => a - b);
  return { corners: n, ext };
}

// --------------------------------------------------------------------------------------------- 2. painted openings
function rayHit(P, t, ox, oy, oz, dx, dy, dz) {
  // Möller–Trumbore, both faces
  const o = t * 9;
  const e1x = P[o + 3] - P[o], e1y = P[o + 4] - P[o + 1], e1z = P[o + 5] - P[o + 2];
  const e2x = P[o + 6] - P[o], e2y = P[o + 7] - P[o + 1], e2z = P[o + 8] - P[o + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const sx = ox - P[o], sy = oy - P[o + 1], sz = oz - P[o + 2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return Infinity;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return Infinity;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

/**
 * The dark plates stuck on faces: [{ part, bucket, centre, normal (outward), span: [w, h], thick, hostBucket, lum,
 * hostLum }]. `opts`: R2.plate overrides, `tops` (lids and hatches too).
 */
export function paintedOpenings(input, opts = {}) {
  const parts = toParts(input, opts.bucket);
  const S = { ...R2.plate, ...opts };
  const soup = soupOf(parts);
  const { P, L, part, island, islands } = soup;
  // triangle bounds for the rays' broad phase
  const T = soup.count, box = new Float64Array(T * 6), nrm = new Float64Array(T * 3), area = new Float64Array(T);
  const n3 = [0, 0, 0];
  for (let t = 0; t < T; t++) {
    area[t] = triNormalArea(P, t, n3); nrm[t * 3] = n3[0]; nrm[t * 3 + 1] = n3[1]; nrm[t * 3 + 2] = n3[2];
    for (let a = 0; a < 3; a++) {
      box[t * 6 + a] = Math.min(P[t * 9 + a], P[t * 9 + 3 + a], P[t * 9 + 6 + a]);
      box[t * 6 + 3 + a] = Math.max(P[t * 9 + a], P[t * 9 + 3 + a], P[t * 9 + 6 + a]);
    }
  }
  /** The nearest face parallel to (nx, ny, nz) along the ray within `reach`, outside island `skip`: its triangle or -1. */
  const cast = (ox, oy, oz, dx, dy, dz, reach, skip, nx, ny, nz) => {
    const ex = ox + dx * reach, ey = oy + dy * reach, ez = oz + dz * reach;
    const lx = Math.min(ox, ex) - 1e-6, ly = Math.min(oy, ey) - 1e-6, lz = Math.min(oz, ez) - 1e-6;
    const hx = Math.max(ox, ex) + 1e-6, hy = Math.max(oy, ey) + 1e-6, hz = Math.max(oz, ez) + 1e-6;
    let nearest = Infinity, at = -1;
    for (let t = 0; t < T; t++) {
      if (island[t] === skip) continue;
      if (box[t * 6] > hx || box[t * 6 + 3] < lx || box[t * 6 + 1] > hy || box[t * 6 + 4] < ly || box[t * 6 + 2] > hz || box[t * 6 + 5] < lz) continue;
      if (Math.abs(nrm[t * 3] * nx + nrm[t * 3 + 1] * ny + nrm[t * 3 + 2] * nz) < 0.7) continue;
      const d = rayHit(P, t, ox, oy, oz, dx, dy, dz);
      if (d >= -1e-6 && d <= reach && d < nearest) { nearest = d; at = t; }
    }
    return at;
  };
  /** The nearest face standing across (nx, ny, nz) — a reveal's side — along the ray within `reach`: its triangle or -1. */
  const castAcross = (ox, oy, oz, dx, dy, dz, reach, nx, ny, nz) => {
    const ex = ox + dx * reach, ey = oy + dy * reach, ez = oz + dz * reach;
    const lx = Math.min(ox, ex) - 1e-6, ly = Math.min(oy, ey) - 1e-6, lz = Math.min(oz, ez) - 1e-6;
    const hx = Math.max(ox, ex) + 1e-6, hy = Math.max(oy, ey) + 1e-6, hz = Math.max(oz, ez) + 1e-6;
    for (let t = 0; t < T; t++) {
      if (box[t * 6] > hx || box[t * 6 + 3] < lx || box[t * 6 + 1] > hy || box[t * 6 + 4] < ly || box[t * 6 + 2] > hz || box[t * 6 + 5] < lz) continue;
      if (Math.abs(nrm[t * 3] * nx + nrm[t * 3 + 1] * ny + nrm[t * 3 + 2] * nz) > 0.5) continue;
      const d = rayHit(P, t, ox, oy, oz, dx, dy, dz);
      if (d >= -1e-6 && d <= reach) return t;
    }
    return -1;
  };
  const found = [];
  islands.forEach((isl, ii) => {
    if (isl.tris.length > 64) return;
    // the dominant face direction: area by quantised axis (sign folded)
    const dirs = new Map();
    let total = 0;
    for (const t of isl.tris) {
      let x = nrm[t * 3], y = nrm[t * 3 + 1], z = nrm[t * 3 + 2];
      if (x < -1e-9 || (Math.abs(x) <= 1e-9 && (y < -1e-9 || (Math.abs(y) <= 1e-9 && z < 0)))) { x = -x; y = -y; z = -z; }
      const key = `${Math.round(x * 20)},${Math.round(y * 20)},${Math.round(z * 20)}`;
      const d = dirs.get(key) ?? { a: 0, x: 0, y: 0, z: 0 };
      d.a += area[t]; d.x += x * area[t]; d.y += y * area[t]; d.z += z * area[t];
      dirs.set(key, d); total += area[t];
    }
    let best = null;
    for (const d of dirs.values()) if (!best || d.a > best.a) best = d;
    if (!best || best.a < 0.4 * total) return;
    const l = Math.hypot(best.x, best.y, best.z);
    const nx = best.x / l, ny = best.y / l, nz = best.z / l;
    if (!opts.tops && Math.abs(ny) > S.maxNy) return;
    // the plate's frame: n, u (level, across), v
    let ux, uy, uz;
    if (Math.abs(ny) < 0.9) { ux = nz; uy = 0; uz = -nx; } else { ux = 1; uy = 0; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    let n0 = Infinity, n1 = -Infinity, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const t of isl.tris) for (let j = 0; j < 3; j++) {
      const x = P[t * 9 + j * 3], y = P[t * 9 + j * 3 + 1], z = P[t * 9 + j * 3 + 2];
      const dn = x * nx + y * ny + z * nz, du = x * ux + y * uy + z * uz, dv = x * vx + y * vy + z * vz;
      n0 = Math.min(n0, dn); n1 = Math.max(n1, dn); u0 = Math.min(u0, du); u1 = Math.max(u1, du); v0 = Math.min(v0, dv); v1 = Math.max(v1, dv);
    }
    const thick = n1 - n0;
    const bucket = parts[isl.part].bucket;
    // its own axes in the face plane (a Fachwerk brace runs diagonal): the principal axis of its corners in the plane
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    let suu = 0, svv = 0, suv = 0;
    for (const t of isl.tris) for (let j = 0; j < 3; j++) {
      const x = P[t * 9 + j * 3], y = P[t * 9 + j * 3 + 1], z = P[t * 9 + j * 3 + 2];
      const du = x * ux + y * uy + z * uz - uc, dv = x * vx + y * vy + z * vz - vc;
      suu += du * du; svv += dv * dv; suv += du * dv;
    }
    const theta = 0.5 * Math.atan2(2 * suv, suu - svv);
    let A = [Math.cos(theta), Math.sin(theta)], B = [-Math.sin(theta), Math.cos(theta)];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const t of isl.tris) for (let j = 0; j < 3; j++) {
      const x = P[t * 9 + j * 3], y = P[t * 9 + j * 3 + 1], z = P[t * 9 + j * 3 + 2];
      const du = x * ux + y * uy + z * uz - uc, dv = x * vx + y * vy + z * vz - vc;
      const da = du * A[0] + dv * A[1], db = du * B[0] + dv * B[1];
      a0 = Math.min(a0, da); a1 = Math.max(a1, da); b0 = Math.min(b0, db); b1 = Math.max(b1, db);
    }
    let la = a1 - a0, lb = b1 - b0, am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
    if (lb > la) { [la, lb] = [lb, la]; [am, bm] = [bm, am]; [A, B] = [B, A]; }
    // a plate: thin, and thin against its face (a rail or a girt as deep as it is tall is a member, not a plate)
    if (thick > S.maxThickM || thick > S.flat * lb || lb < S.minSpanM || la * lb < S.minAreaM2) return;
    // a long slender timber laid flush in a wall is its frame (Fachwerk posts, rails and braces: structural), never a
    // painted opening
    const timber = TIMBER_BUCKETS.has(bucket);
    if (timber && la >= S.memberAspect * lb) return;
    const nm = (n0 + n1) / 2;
    /** A point of the plate's plane: `dn` along its normal, (sa, sb) along its own long and short axes from its centre. */
    const at = (dn, sa, sb) => {
      const du = uc + A[0] * (am + sa) + B[0] * (bm + sb), dv = vc + A[1] * (am + sa) + B[1] * (bm + sb);
      return [nx * dn + ux * du + vx * dv, ny * dn + uy * du + vy * dv, nz * dn + uz * du + vz * dv];
    };
    const samples = [[0, 0], [-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
    const around = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    for (const sign of [1, -1]) {
      const dx = -sign * nx, dy = -sign * ny, dz = -sign * nz; // into the host: the plate's outward normal is sign * n
      let hits = 0, hostLum = 0, hostLumN = 0, hostBucket = null;
      for (const [a, b] of samples) {
        const [ox, oy, oz] = at(nm, a * la, b * lb);
        const hit = cast(ox, oy, oz, dx, dy, dz, thick / 2 + S.behindM, ii, nx, ny, nz);
        if (hit < 0) continue;
        hits++;
        if (!Number.isNaN(L[hit])) { hostLum += L[hit]; hostLumN++; }
        hostBucket = parts[part[hit]].bucket;
      }
      if (hits < S.hits) continue;
      if (timber) {
        // a frame of timbers welded at their joints (a Fachwerk panel's posts, rails and braces in one island) covers a
        // fraction of its box; a short rail between posts on render is a member too (a plate of timber on render, three
        // times as long as it is wide or no wider than a timber, is the frame's, never a door)
        let front = 0;
        for (const t of isl.tris) if (nrm[t * 3] * nx * sign + nrm[t * 3 + 1] * ny * sign + nrm[t * 3 + 2] * nz * sign > 0.7) front += area[t];
        if (front < S.frameFill * la * lb) break;
        if (!TIMBER_BUCKETS.has(hostBucket) && (la >= S.frameAspect * lb || lb <= S.memberWidthM)) break;
      }
      // the host face runs on round the plate (a plate in a recess — a set-back leaf, an embrasure's throat — has none)
      const front = sign > 0 ? n1 + 0.01 : n0 - 0.01;
      let round = 0;
      for (const [a, b] of around) {
        const [ox, oy, oz] = at(front, a * (la / 2 + S.aroundM), b * (lb / 2 + S.aroundM));
        if (cast(ox, oy, oz, dx, dy, dz, thick + S.behindM + 0.01, ii, nx, ny, nz) >= 0) round++;
      }
      if (round < S.around) continue;
      // nor at the back of a reveal: from `revealM` in front of it, faces across the plate's normal close it in on three
      // of four sides (an embrasure's stepped throat, a niche's back) — a trim proud of the face is no reveal
      const [cx, cy, cz] = at(front + sign * S.revealM, 0, 0);
      let sides = 0;
      for (const [da, db, half] of [[1, 0, la / 2], [-1, 0, la / 2], [0, 1, lb / 2], [0, -1, lb / 2]]) {
        const du = A[0] * da + B[0] * db, dv = A[1] * da + B[1] * db;
        const rx = ux * du + vx * dv, ry = uy * du + vy * dv, rz = uz * du + vz * dv;
        if (castAcross(cx, cy, cz, rx, ry, rz, half + S.revealReachM, nx, ny, nz) >= 0) sides++;
      }
      if (sides >= 3) continue;
      // the plate's outward face's colour
      let pl = 0, pn = 0;
      for (const t of isl.tris) {
        if (nrm[t * 3] * nx * sign + nrm[t * 3 + 1] * ny * sign + nrm[t * 3 + 2] * nz * sign < 0.7) continue;
        if (!Number.isNaN(L[t])) { pl += L[t]; pn++; }
      }
      const plateLum = pn ? pl / pn : NaN, hLum = hostLumN ? hostLum / hostLumN : NaN;
      let dark = false;
      if (DARK_BUCKETS.has(bucket)) dark = !DARK_BUCKETS.has(hostBucket);
      else if (!Number.isNaN(plateLum) && !Number.isNaN(hLum)) dark = plateLum <= S.darkRel * hLum;
      else if (!Number.isNaN(plateLum)) dark = plateLum <= S.darkAbs;
      if (!dark) continue;
      // its size across (along the face's level) and up, as an opening is read
      const across = Math.abs(A[0]) >= Math.abs(A[1]);
      const plate = {
        // an opening is no longer than `aspect` times its width; a longer one is a strip (a band laid flat on the wall:
        // rule 2's overlay, reported apart)
        kind: la > S.aspect * lb ? 'strip' : 'opening',
        part: isl.part, bucket, hostBucket, thick: +thick.toFixed(3), span: (across ? [la, lb] : [lb, la]).map((x) => +x.toFixed(3)),
        centre: at(nm, 0, 0).map((x) => +x.toFixed(3)),
        normal: [sign * nx, sign * ny, sign * nz].map((x) => +x.toFixed(3)),
        lum: Number.isNaN(plateLum) ? null : +plateLum.toFixed(4), hostLum: Number.isNaN(hLum) ? null : +hLum.toFixed(4),
      };
      const excuse = opts.allowPlates?.(plate);
      if (excuse) plate.allowed = String(excuse);
      found.push(plate);
      break;
    }
  });
  return found;
}

// --------------------------------------------------------------------------------------------- 3. box-only share
/**
 * The share of the surface area in plain primitives — islands of at most 8 welded corners and 12 triangles: an
 * unbevelled box, a quad, a wedge — with the share of those that are chunky (least extent at least `chunky` of the
 * greatest: a box shell rather than a board) for the reports.
 */
export function boxShare(input, opts = {}) {
  const soup = soupOf(toParts(input, opts.bucket));
  const n3 = [0, 0, 0];
  let all = 0, plain = 0, shell = 0, primitives = 0, chunky = 0;
  for (const isl of soup.islands) {
    let a = 0;
    for (const t of isl.tris) a += triNormalArea(soup.P, t, n3);
    all += a;
    if (isl.tris.length > 12) continue;
    const s = islandShape(soup, isl);
    if (s.corners > 8) continue;
    primitives++; plain += a;
    if (s.ext[0] < (opts.chunky ?? R2.chunky) * s.ext[2]) continue;
    chunky++; shell += a;
  }
  return { share: all ? plain / all : 0, shellShare: all ? shell / all : 0, islands: soup.islands.length, primitives, chunky, areaM2: all };
}

// --------------------------------------------------------------------------------------------- 4. grounded
/**
 * Members that reach no ground (partContact's flood from the ground band through hulls within 2 cm): its islands of
 * floating members. `support` (geometries) is ground the kind stands on beside y = 0 — a bank, a plinth laid by
 * another pass — counted as grounded and never reported; `allowFloating(island)` may excuse an island with a reason.
 */
export function floatingMembers(input, opts = {}) {
  const geoms = toParts(input, opts.bucket).map((p) => p.geometry);
  const support = (opts.support ?? []).flatMap((s) => toParts(s).map((p) => p.geometry));
  const components = weldedComponents([...support, ...geoms]);
  const report = auditPartContact(components, { tolerance: opts.contactM ?? R2.contactM, groundY: opts.groundM ?? R2.groundM });
  let islands;
  if (!support.length) islands = report.islands;
  else {
    // the support's own loose parts are not the kind's: gather the kind's floating members into islands by their bounds
    const own = report.floating.filter((f) => f.source >= support.length);
    islands = [];
    for (const f of own) {
      const near = islands.find((i) => i.min.every((v, k) => v <= f.max[k] + 0.02) && i.max.every((v, k) => v >= f.min[k] - 0.02));
      if (near) {
        near.members++; near.gap = Math.min(near.gap, f.nearestGap);
        for (let k = 0; k < 3; k++) { near.min[k] = Math.min(near.min[k], f.min[k]); near.max[k] = Math.max(near.max[k], f.max[k]); }
      } else islands.push({ members: 1, min: [...f.min], max: [...f.max], gap: f.nearestGap });
    }
  }
  return islands.map((f) => {
    const island = { members: f.members, min: f.min.map((v) => +v.toFixed(3)), max: f.max.map((v) => +v.toFixed(3)), gap: Number.isFinite(f.gap) ? +f.gap.toFixed(3) : null };
    const excuse = opts.allowFloating?.(island);
    if (excuse) island.allowed = String(excuse);
    return island;
  });
}

// --------------------------------------------------------------------------------------------- 5. anti-raft
/** The plan cells (on `cell` metres, about the origin) the triangles cover, and the area-weighted 90th percentile height. */
export function planAndHeight(input, cell, opts = {}) {
  const soup = soupOf(toParts(input, opts.bucket));
  const { P } = soup;
  const cells = new Set();
  const mark = (x, z) => cells.add(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
  const heights = [];
  const n3 = [0, 0, 0];
  let maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let t = 0; t < soup.count; t++) {
    const o = t * 9;
    const ax = P[o], az = P[o + 2], bx = P[o + 3], bz = P[o + 5], cx = P[o + 6], cz = P[o + 8];
    maxY = Math.max(maxY, P[o + 1], P[o + 4], P[o + 7]);
    minX = Math.min(minX, ax, bx, cx); maxX = Math.max(maxX, ax, bx, cx); minZ = Math.min(minZ, az, bz, cz); maxZ = Math.max(maxZ, az, bz, cz);
    heights.push([(P[o + 1] + P[o + 4] + P[o + 7]) / 3, triNormalArea(P, t, n3)]);
    // edges (a vertical face's plan is its edges), then the interior
    for (const [x0, z0, x1, z1] of [[ax, az, bx, bz], [bx, bz, cx, cz], [cx, cz, ax, az]]) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (cell / 2)));
      for (let s = 0; s <= steps; s++) mark(x0 + (x1 - x0) * s / steps, z0 + (z1 - z0) * s / steps);
    }
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-9) continue;
    const i0 = Math.floor(Math.min(ax, bx, cx) / cell), i1 = Math.floor(Math.max(ax, bx, cx) / cell);
    const k0 = Math.floor(Math.min(az, bz, cz) / cell), k1 = Math.floor(Math.max(az, bz, cz) / cell);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const px = (i + 0.5) * cell, pz = (k + 0.5) * cell;
      const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den, l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) cells.add(`${i},${k}`);
    }
  }
  heights.sort((a, b) => a[0] - b[0]);
  const totalA = heights.reduce((s, h) => s + h[1], 0);
  let acc = 0, p90 = 0;
  for (const [y, a] of heights) { acc += a; p90 = y; if (acc >= 0.9 * totalA) break; }
  return { cells: cells.size, p90, maxY, size: [maxX - minX, maxZ - minZ] };
}

/** The destroyed state against the intact: { heightRatio, footprintRatio, heightMaxRatio }. */
export function wreckVolume(intact, broken, opts = {}) {
  const pre = planAndHeight(intact, 1, opts);
  const cell = Math.max(0.02, Math.max(pre.size[0], pre.size[1]) / 48);
  const a = planAndHeight(intact, cell, opts), b = planAndHeight(broken, cell, opts);
  return { heightRatio: a.p90 > 0 ? b.p90 / a.p90 : 0, heightMaxRatio: a.maxY > 0 ? b.maxY / a.maxY : 0,
    footprintRatio: a.cells ? b.cells / a.cells : 0, intactP90: a.p90, brokenP90: b.p90 };
}

export function trisOf(input) {
  return toParts(input).reduce((s, p) => {
    const g = p.geometry, i = g.getIndex();
    return s + Math.floor((i ? i.count : g.getAttribute('position').count) / 3);
  }, 0);
}

// --------------------------------------------------------------------------------------------- the whole standard
const fixed = (v, k = 2) => (Number.isFinite(v) ? +v.toFixed(k) : v);
function disposeAll(input) { for (const p of toParts(input)) p.geometry.dispose?.(); }

/**
 * One kind against the standard: { kind, ok, problems, forms: [{ form, maps, metrics }] }. The spec's builds are
 * called once a form (the first map that resolves it).
 */
export function r2Check(spec) {
  const problems = [];
  const say = (text) => { if (problems.length < 64) problems.push(`${spec.kind}: ${text}`); };
  const lim = { ...R2, ...(spec.limits ?? {}) };
  if (spec.limits && !spec.limits.reason) say('limits loosened without a reason');
  const caps = { wreckRatio: lim.wreckRatio, ...(spec.caps ?? {}) };
  const forms = new Map();
  for (const mapId of spec.maps ?? []) {
    let r = null;
    try { r = spec.resolve(mapId); } catch (e) { say(`${mapId}: resolve threw ${String(e?.message ?? e).slice(0, 160)}`); continue; }
    if (!r || !r.form) { say(`${mapId}: no form resolved`); continue; }
    if (r.form === 'generic' && !spec.genericOk?.[mapId]) say(`${mapId}: the generic form (no regional form for the place)`);
    const entry = forms.get(r.form);
    if (entry) entry.maps.push(mapId); else forms.set(r.form, { form: r.form, maps: [mapId], r });
  }
  if (!(spec.maps ?? []).length) say('no maps listed');
  const out = [];
  for (const { form, maps, r } of forms.values()) {
    const tag = `${form} (${maps.slice(0, 3).join(', ')}${maps.length > 3 ? ` +${maps.length - 3}` : ''})`;
    const metrics = {};
    const intact = r.build();
    const bucket = r.bucket ?? spec.bucket ?? 'baked';
    const parts = toParts(intact, bucket);
    metrics.tris = trisOf(parts);
    if (caps.near && metrics.tris > caps.near) say(`${tag}: ${metrics.tris} triangles, over the near cap of ${caps.near}`);
    // painted openings
    const plates = paintedOpenings(parts, { tops: spec.tops, allowPlates: spec.allowPlates });
    const strips = plates.filter((p) => p.kind === 'strip' && !p.allowed);
    const bad = plates.filter((p) => !p.allowed && (p.kind === 'opening' || spec.strictStrips));
    metrics.paintedPlates = bad.length;
    if (strips.length) metrics.overlayStrips = strips.length;
    if (plates.filter((p) => p.allowed).length) metrics.allowedPlates = plates.filter((p) => p.allowed).length;
    for (const p of bad.slice(0, 4)) say(`${tag}: a painted opening, a ${p.bucket} plate ${p.span.join(' x ')} m (${p.thick} m thick) at [${p.centre.join(', ')}] stuck on the ${p.hostBucket} face behind it`);
    // box share
    const bs = boxShare(parts, { chunky: lim.chunky });
    metrics.boxShare = fixed(bs.share); metrics.shellShare = fixed(bs.shellShare);
    if (bs.share > lim.boxShareMax) say(`${tag}: box-only share ${(bs.share * 100).toFixed(0)} % of its surface (cap ${(lim.boxShareMax * 100).toFixed(0)} %)`);
    // grounded
    if (!spec.skipGround) {
      const support = [r.support?.() ?? []].flat();
      const grade = Math.max(0, ...support.filter((s) => typeof s === 'number'));
      const floating = floatingMembers(parts, { groundM: grade + lim.groundM, contactM: lim.contactM,
        support: support.filter((s) => typeof s !== 'number'), allowFloating: spec.allowFloating });
      const loose = floating.filter((f) => !f.allowed);
      metrics.floating = loose.length;
      if (floating.length - loose.length) metrics.allowedFloating = floating.length - loose.length;
      for (const f of loose.slice(0, 3)) say(`${tag}: ${f.members} member(s) float (min [${f.min.join(', ')}], ${f.gap} m from the grounded set)`);
    }
    // fracture
    if (spec.route === 'fracture' || spec.route === 'settle') {
      const anatomy = toParts(intact, bucket).map((p) => p.geometry.userData?.fracture).find(Boolean);
      if (!anatomy) say(`${tag}: route ${spec.route} without userData.fracture on the intact build`);
      else {
        const g = toParts(intact, bucket).find((p) => p.geometry.userData?.fracture === anatomy).geometry;
        const pos = (g.index ? g.toNonIndexed() : g).getAttribute('position').array;
        const issues = checkKitFracture(anatomy, pos, spec.fortified ? FRACTURE_PIECE_CAP.fortified : FRACTURE_PIECE_CAP.light);
        metrics.pieces = anatomy.pieces.length;
        for (const issue of issues.slice(0, 4)) say(`${tag}: fracture: ${issue}`);
      }
    }
    // destroyed state
    if (r.broken) {
      const broken = r.broken();
      const bparts = toParts(broken, r.brokenBucket ?? bucket);
      metrics.brokenTris = trisOf(bparts);
      if (caps.wreckRatio && metrics.brokenTris > caps.wreckRatio * metrics.tris) say(`${tag}: the wreck's ${metrics.brokenTris} triangles over ${caps.wreckRatio} x the intact ${metrics.tris}`);
      const wv = wreckVolume(parts, bparts);
      metrics.wreckHeight = fixed(wv.heightRatio); metrics.wreckFootprint = fixed(wv.footprintRatio);
      if (wv.heightRatio < lim.wreckHeightMin) say(`${tag}: a raft — the wreck stands ${(wv.heightRatio * 100).toFixed(0)} % of the intact height (min ${(lim.wreckHeightMin * 100).toFixed(0)} %)`);
      if (wv.footprintRatio < lim.wreckFootprintMin) say(`${tag}: the wreck covers ${(wv.footprintRatio * 100).toFixed(0)} % of the intact plan (min ${(lim.wreckFootprintMin * 100).toFixed(0)} %)`);
      if (!spec.keep) disposeAll(bparts);
    } else if (spec.route !== 'crush' && spec.route !== 'house' && spec.route !== 'landmark' && !spec.noBroken) {
      say(`${tag}: no destroyed state (route ${spec.route ?? 'unset'})`);
    }
    // far and phone forms
    for (const [key, cap] of [['far', caps.far], ['phone', caps.phone]]) {
      if (!r[key]) { if (cap && spec.requireTiers?.includes(key)) say(`${tag}: no ${key} form`); continue; }
      const g = r[key]();
      metrics[`${key}Tris`] = trisOf(g);
      if (cap && metrics[`${key}Tris`] > cap) say(`${tag}: the ${key} form's ${metrics[`${key}Tris`]} triangles over its cap of ${cap}`);
      if (!spec.keep) disposeAll(g);
    }
    if (!spec.keep) disposeAll(parts);
    out.push({ form, maps, metrics });
  }
  return { kind: spec.kind, ok: problems.length === 0, problems, forms: out };
}

/** r2Check, thrown as one assertion listing every problem. */
export function assertR2(spec) {
  const result = r2Check(spec);
  if (!result.ok) throw new Error(`r2Standard: ${result.problems.length} problem(s)\n  ${result.problems.join('\n  ')}`);
  return result;
}

// --------------------------------------------------------------------------------------------- CLI
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;
if (isMain) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const specPath = arg('spec');
  if (!specPath) { console.error('usage: node tools/r2-standard.mjs --spec=<module exporting r2Specs> [--json=<out>] [--kinds=a,b]'); process.exit(2); }
  const mod = await import(pathToFileURL(resolvePath(specPath)).href);
  let specs = mod.r2Specs ?? mod.default;
  if (typeof specs === 'function') specs = await specs();
  const only = arg('kinds')?.split(',');
  if (only) specs = specs.filter((s) => only.includes(s.kind));
  const rows = [];
  let bad = 0;
  for (const spec of specs) {
    const r = r2Check(spec);
    rows.push(r);
    if (!r.ok) bad++;
    for (const f of r.forms) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.kind.padEnd(28)} ${f.form.padEnd(22)} ${String(f.maps.length).padStart(2)} maps  ${JSON.stringify(f.metrics)}`);
    for (const p of r.problems) console.log(`     ${p}`);
  }
  const json = arg('json');
  if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
  console.log(`r2Standard: ${specs.length - bad}/${specs.length} kinds pass`);
  process.exit(bad ? 1 : 0);
}

