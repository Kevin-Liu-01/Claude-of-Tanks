#!/usr/bin/env node
/**
 * destruction-slab-check.mjs — stray slabs in a damaged building (destruction-slabs lane, 2026-10-17; the owner, after
 * a production screenshot of Verdant's church in battle: "for building destruction, these weird ugly boxes/surfaces
 * still randomly come up. fix" — large flat dark plates standing out of the church at its eaves, past its walls).
 *
 * Node-only and deterministic, on the battle's own path: the map's real props build (the world's buckets, kits and
 * seams), the real presentation (fx/structureStages + structureMask + structureDebris + rubbleBodies, and the fracture
 * — fx/fractureStages over collapseBodies/collapsePieces/structureFracture — as effects.ts wires it on desktop), driven
 * by the Studio's destruction match under the battle's rules (`standard`, sections ON as a battle plays them;
 * `--sections=0` for P1). For each building picked: high-explosive rounds at its widest face; after every stage or
 * breach event the sim raises (and at the end of the settle), every mesh the presentation draws for that building is
 * walked — each mesh split into its connected pieces in world space, a piece's principal axes (the surface's
 * area-weighted moments), extents and flat area measured — and a piece is flagged as a STRAY SLAB when it is a slab
 * (thin: its least extent ≤ 0.6 m and ≤ 12 % of its middle one; flat: its two larger extents ≥ 2 m and their product
 * ≥ 8 m²) and one of:
 *   - outside:     ≥ 3 m² and ≥ 10 % of its surface stands outside the building's intact drawn footprint (every intact
 *                  triangle's plan rasterised at 0.25 m, courts closed, grown 0.3 m) while it stands ≥ 1 m over the
 *                  ground or upright (a plate overhanging the walls in the air, a panel standing in the open past them;
 *                  one lying flat on the ground is debris);
 *   - floating:    it stands ≥ 1 m over the ground and ≥ 40 % of it has nothing under it within 0.8 m — no live
 *                  collision record, no other drawn piece, no ground;
 *   - untextured:  its material has no map, or is the presentation's untextured fallback (fx-structure-fallback-*);
 *   - degenerate:  its mesh's (or batch instance's) world matrix is singular, flattened or not finite.
 * And every standing run (a hole's rim, a section's stub with its course of units, a remnant, a redrawn face) with ≥ 2 m²
 * and a quarter of its surface past the intact plan is flagged `off the walls` (a strip standing in the open).
 * The bodies that fall (a collapse's pieces, a wall's cells, rubble bodies) are judged at the settled snapshot, where
 * they came to rest; what stands (rooms, rims, remnants, redrawn faces, heaps, baked rests) at every snapshot.
 * A flagged slab also lists `dark` (its drawn tint — material colour × mean vertex colour — under luminance 0.16): a room
 * behind a hole is dark by design, so darkness alone flags nothing.
 * The building's intact spans are checked too: every bucket mesh and batch stands at identity (DESTRUCTION.md §16.4),
 * and a batch's instance matrix drawing a span is finite and unflattened (the BatchedMesh flatten bug's tell).
 *
 *   node tools/destruction-slab-check.mjs [--map=verdant] [--ids=9] [--builders=church] [--per-builder=1] [--rounds=40]
 *        [--gap=0.45] [--settle=10] [--sections=1] [--fracture=1|0|phone] [--storeys=0,1] [--render=<dir>] [--json=<out>]
 *        [--max-snapshots=40] [--faces=wide,wide-back,narrow,narrow-back] [--seed=<n>]
 *        [--stop-after=roof] [--upper=0]
 * (--fracture=0: the kit's path alone; --fracture=phone: the phone as the battle wires it — the kit's holes, falls and
 *  heaps, and the fracture stages' hanging sweep alone, a third of the desktop's work a frame)
 * (--stop-after=roof: stop firing once the roof section falls and judge the building standing roofless at the end of the
 *  settle — a fallen roof's slabs lying flat across the wall heads at the eaves, the owner's 2026-10-17 frame; --upper=0:
 *  judge plates 2 m or more up against the whole intact plan instead of the walls' plan at height)
 * (--storeys: the anatomy storeys whose widest face the rounds cycle through; the ground storey by default)
 * (--faces: the sides of the drawn plan struck, each a run of its own — wide (the default), wide-back, narrow, narrow-back;
 *  each face's rounds at its own seeded offsets (wide 0, wide-back 3, narrow 5, narrow-back 7), or all at --seed)
 *
 * (census9b, 2026-10-17) Every snapshot carries its phase: hit (holes only), damaged, heavily damaged (a breached stage or
 * a section down), collapse, settled ruin (or `standing end`); each standing phase is also judged just before the event
 * that ends it (a fragile building runs through hit and damaged inside the +0.8 s snapshot). With rejoin on (the default;
 * `--rejoin=0` off) a late joiner is replayed too: the live presentation stood back up (reset() and the spans as built),
 * a fresh one lays the match's events so far down `settled` as destructionMirror.ts does — at each standing phase's last
 * snapshot (mid-match) and for the whole destroyed set at the end — and is judged the same way (phases `rejoin
 * mid-match (...)`, `rejoin destroyed set (...)`). Picked without --ids, a kind is a builder under its damage kit; the
 * kinds that cannot be struck so (no shell record, no storeys) are listed in `skipped`. A piece drawn in one of the
 * intact building's own materials is not flagged untextured (listed `unmapped like the intact building`). Each row
 * carries `phases` (snapshots and flags a phase) and `staging` (placement, the rounds' points and times, both cameras)
 * for a Studio film of the same strikes.
 *
 * --render writes software renders (a z-buffered rasteriser of exactly the triangles the check walked; flagged pieces
 * magenta) of the building before the first round and at every snapshot that flags, plus the last. Exit 1 when any
 * snapshot flags a stray slab.
 */
import * as THREE from 'three';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorldBuildFixture } from './headlessWorldCollision.mjs';
import { createHangingJudge } from './destruction-hanging.mjs';

const STEP = 1 / 60;
const _still = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ the slab judgement

/** How long after a building's last event what it left hanging may take to come down (the presentation's sweep runs once
 *  its faces are drawn and its storeys have landed: a creak, then the fall) before the hanging check reads it. */
const HANG_SETTLE_S = 2;

/** The thresholds of a stray slab (exported for the receipt). */
export const SLAB = {
  thickMaxM: 0.6, thickShare: 0.12, sideMinM: 2.0, areaMinM2: 8,
  elevatedM: 1.0, upperLiftM: 2.0, restedS: 1.5, stillS: 0.75, hoverM: 0.5, tallerM: 1.0, debrisLiftM: 2.5, roomSupportM: 3.6, outsideShare: 0.1, outsideAreaM2: 3, floatingShare: 0.4, supportBandM: 0.8, darkLuma: 0.16, footprintGrowM: 0.3,
  onEndM: 2.2,
};

/** Eigen-decomposition of a symmetric 3×3 (Jacobi): the eigenvectors as columns, by eigenvalue descending. */
function eigenSym3(c) {
  const a = [[c[0], c[1], c[2]], [c[1], c[3], c[4]], [c[2], c[4], c[5]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-20) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const cs = 1 / Math.sqrt(t * t + 1), sn = t * cs;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = cs * akp - sn * akq; a[k][q] = sn * akp + cs * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = cs * apk - sn * aqk; a[q][k] = sn * apk + cs * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = cs * vkp - sn * vkq; v[k][q] = sn * vkp + cs * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return order.map((i) => [v[0][i], v[1][i], v[2][i]]);
}

/** A matrix's trouble, or null: not finite, singular, or flattened (one axis under 1/50 of another). */
export function matrixTrouble(e) {
  for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) return 'not finite';
  const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
  const lo = Math.min(sx, sy, sz), hi = Math.max(sx, sy, sz);
  if (!(hi > 1e-6)) return 'zero';
  if (lo < hi / 50) return `flattened (axes ${sx.toFixed(3)}, ${sy.toFixed(3)}, ${sz.toFixed(3)})`;
  const det = e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]);
  if (Math.abs(det) < 1e-9) return 'singular';
  return null;
}

/**
 * Each corner's welded vertex id (positions rounded to the millimetre; equal ids, equal rounded positions). Numbers, not
 * strings, where the rounded box fits 52 bits (every building's does): the judge's hot loop (round 2: a third of the
 * receipt's time went to string keys).
 */
function weldIds(tris) {
  const m = tris.length / 3;
  const ids = new Int32Array(m);
  const q = new Float64Array(tris.length);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i++) {
    const v = Math.round(tris[i] * 1000), d = i % 3;
    q[i] = v;
    if (v < lo[d]) lo[d] = v;
    if (v > hi[d]) hi[d] = v;
  }
  const bits = (d) => Math.ceil(Math.log2(Math.max(1, hi[d] - lo[d] + 1)));
  const bx = bits(0), by = bits(1), bz = bits(2);
  const owner = new Map();
  let next = 0;
  if (bx + by + bz <= 52) {
    const sy = 2 ** bz, sx = 2 ** (by + bz);
    for (let i = 0; i < m; i++) {
      const key = (q[i * 3] - lo[0]) * sx + (q[i * 3 + 1] - lo[1]) * sy + (q[i * 3 + 2] - lo[2]);
      let id = owner.get(key);
      if (id === undefined) { id = next++; owner.set(key, id); }
      ids[i] = id;
    }
  } else {
    for (let i = 0; i < m; i++) {
      const key = `${q[i * 3]},${q[i * 3 + 1]},${q[i * 3 + 2]}`;
      let id = owner.get(key);
      if (id === undefined) { id = next++; owner.set(key, id); }
      ids[i] = id;
    }
  }
  return ids;
}
/** An undirected edge's key from its two vertex ids (ids < 2^26). */
const edgeKey = (a, b) => (a < b ? a * 67108864 + b : b * 67108864 + a);

/**
 * A mesh's drawn triangles in world space, split into connected pieces (vertices welded at 1 mm): for each piece its
 * triangle list (flat xyz × 3 per triangle) — degenerate triangles (a span flattened out of its bucket) left out.
 */
function piecesOfTriangles(tris) {
  const n = tris.length / 9;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const ids = weldIds(tris);
  const owner = new Int32Array(n * 3).fill(-1);
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const v = ids[t * 3 + k];
    const prev = owner[v];
    if (prev < 0) owner[v] = t;
    else { const a = find(prev), b = find(t); if (a !== b) parent[a] = b; }
  }
  const groups = new Map();
  for (let t = 0; t < n; t++) {
    const r = find(t);
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(t);
  }
  return [...groups.values()].map((list) => {
    const out = new Float32Array(list.length * 9);
    list.forEach((t, i) => out.set(tris.subarray(t * 9, t * 9 + 9), i * 9));
    return out;
  });
}

/** Whether a piece has a boundary (an edge only one of its triangles uses). */
function isOpen(tris) {
  const ids = weldIds(tris);
  const uses = new Map();
  for (let t = 0; t * 3 < ids.length; t++) {
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(ids[t * 3 + e], ids[t * 3 + (e + 1) % 3]);
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  for (const n of uses.values()) if (n === 1) return true;
  return false;
}

/** A piece's planar facets: triangles joined across a shared edge when they lie in one plane (2°, 1 cm). */
function planarFacets(tris) {
  const n = tris.length / 9;
  const nrm = new Float64Array(n * 4);
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
    let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
    const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    nrm[t * 4] = x; nrm[t * 4 + 1] = y; nrm[t * 4 + 2] = z; nrm[t * 4 + 3] = x * tris[o] + y * tris[o + 1] + z * tris[o + 2];
  }
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const ids = weldIds(tris);
  const edgeOwner = new Map();
  for (let t = 0; t < n; t++) {
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(ids[t * 3 + e], ids[t * 3 + (e + 1) % 3]);
      const u = edgeOwner.get(key);
      if (u === undefined) { edgeOwner.set(key, t); continue; }
      const dot = nrm[u * 4] * nrm[t * 4] + nrm[u * 4 + 1] * nrm[t * 4 + 1] + nrm[u * 4 + 2] * nrm[t * 4 + 2];
      if (dot > 0.9994 && Math.abs(nrm[u * 4 + 3] - nrm[t * 4 + 3]) < 0.01) { const ra = find(u), rb = find(t); if (ra !== rb) parent[ra] = rb; }
    }
  }
  const groups = new Map();
  for (let t = 0; t < n; t++) { const r = find(t); let g = groups.get(r); if (!g) { g = []; groups.set(r, g); } g.push(t); }
  return [...groups.values()].map((list) => {
    const out = new Float32Array(list.length * 9);
    list.forEach((t, i) => out.set(tris.subarray(t * 9, t * 9 + 9), i * 9));
    return out;
  });
}

/** A piece's shape: principal axes, extents (descending), centre, plan box, lowest point, area. */
export function shapeOf(tris) {
  const n = tris.length / 9;
  let area = 0, mx = 0, my = 0, mz = 0;
  const cov = [0, 0, 0, 0, 0, 0];
  const minB = [Infinity, Infinity, Infinity], maxB = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
    const ar = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    area += ar;
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) {
      const val = tris[o + k * 3 + d];
      if (val < minB[d]) minB[d] = val;
      if (val > maxB[d]) maxB[d] = val;
    }
  }
  // area-weighted second moments of the surface (each triangle's exact moment: a rectangle's or a box's axes along its
  // sides, however its vertices are spread)
  const m = n * 3;
  const S = [0, 0, 0, 0, 0, 0];
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
    const ar = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    if (!(ar > 0)) continue;
    const sx = tris[o] + tris[o + 3] + tris[o + 6], sy = tris[o + 1] + tris[o + 4] + tris[o + 7], sz = tris[o + 2] + tris[o + 5] + tris[o + 8];
    let xx = sx * sx, xy = sx * sy, xz = sx * sz, yy = sy * sy, yz = sy * sz, zz = sz * sz;
    for (let k = 0; k < 3; k++) {
      const x = tris[o + k * 3], y = tris[o + k * 3 + 1], z = tris[o + k * 3 + 2];
      xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
    }
    S[0] += ar * xx / 12; S[1] += ar * xy / 12; S[2] += ar * xz / 12; S[3] += ar * yy / 12; S[4] += ar * yz / 12; S[5] += ar * zz / 12;
    mx += ar * sx / 3; my += ar * sy / 3; mz += ar * sz / 3;
  }
  if (area > 0) { mx /= area; my /= area; mz /= area; }
  cov[0] = S[0] / (area || 1) - mx * mx; cov[1] = S[1] / (area || 1) - mx * my; cov[2] = S[2] / (area || 1) - mx * mz;
  cov[3] = S[3] / (area || 1) - my * my; cov[4] = S[4] / (area || 1) - my * mz; cov[5] = S[5] / (area || 1) - mz * mz;
  const axes = eigenSym3(cov);
  const ext = axes.map((a) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < m; i++) {
      const d = tris[i * 3] * a[0] + tris[i * 3 + 1] * a[1] + tris[i * 3 + 2] * a[2];
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    return hi - lo;
  });
  return { axes, ext, centre: [(minB[0] + maxB[0]) / 2, (minB[1] + maxB[1]) / 2, (minB[2] + maxB[2]) / 2], min: minB, max: maxB, area, tris: n };
}

/** Whether a shape is a slab: thin against its sides, both sides long, a large flat area. */
export function isSlab(s) {
  const [e1, e2, e3] = s.ext;
  return e3 <= SLAB.thickMaxM && e3 <= SLAB.thickShare * e2 && e2 >= SLAB.sideMinM && e1 * e2 >= SLAB.areaMinM2;
}

/** Area-weighted samples of a piece's surface (about one per 0.25 m²; at least one a triangle): x, z, y, weight (m²). */
function surfaceSamples(tris, out, cap = 6000) {
  out.length = 0;
  const n = tris.length / 9;
  for (let t = 0; t < n && out.length < cap * 4; t++) {
    const o = t * 9;
    const ax = tris[o + 3] - tris[o], ay = tris[o + 4] - tris[o + 1], az = tris[o + 5] - tris[o + 2];
    const bx = tris[o + 6] - tris[o], by = tris[o + 7] - tris[o + 1], bz = tris[o + 8] - tris[o + 2];
    const area = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    const k = Math.max(1, Math.min(96, Math.round(area / 0.25)));
    for (let s = 0; s < k; s++) {
      // a low-discrepancy spread over the triangle
      let u = ((s + 0.5) * 0.618034) % 1, v = ((s + 0.5) * 0.754878) % 1;
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      out.push(tris[o] + ax * u + bx * v, tris[o + 2] + az * u + bz * v, tris[o + 1] + ay * u + by * v, area / k);
    }
  }
  return out;
}

/** The intact building's plan as drawn: every triangle's projection rasterised at `cell`, holes closed, grown. */
export function footprintOf(triLists, cell = 0.25, growM = SLAB.footprintGrowM) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const tris of triLists) for (let i = 0; i < tris.length; i += 3) {
    x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); z0 = Math.min(z0, tris[i + 2]); z1 = Math.max(z1, tris[i + 2]);
  }
  const pad = growM + 2 * cell;
  x0 -= pad; z0 -= pad; x1 += pad; z1 += pad;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const grid = new Uint8Array(nx * nz);
  const mark = (x, z) => {
    const i = Math.floor((x - x0) / cell), k = Math.floor((z - z0) / cell);
    if (i >= 0 && k >= 0 && i < nx && k < nz) grid[k * nx + i] = 1;
  };
  for (const tris of triLists) for (let o = 0; o + 8 < tris.length; o += 9) {
    const ax = tris[o], az = tris[o + 2], bx = tris[o + 3], bz = tris[o + 5], cx = tris[o + 6], cz = tris[o + 8];
    const len = Math.max(Math.hypot(bx - ax, bz - az), Math.hypot(cx - ax, cz - az), Math.hypot(cx - bx, cz - bz));
    const k = Math.max(1, Math.ceil(len / (cell * 0.5)));
    for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
      const u = i / k, v = j / k;
      mark(ax + (bx - ax) * u + (cx - ax) * v, az + (bz - az) * u + (cz - az) * v);
    }
  }
  // close: every cell the outside cannot reach is inside (a court, a roofless room); (destruction-slabs 227) the walls'
  // cells grown by one first, so a thin wall rasterised corner to corner leaks no flood through its diagonals
  const barrier = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (!grid[k * nx + i]) continue;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, kk = k + dk;
      if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) barrier[kk * nx + ii] = 1;
    }
  }
  const outside = new Uint8Array(nx * nz);
  const stack = [];
  for (let i = 0; i < nx; i++) { stack.push(i, (nz - 1) * nx + i); }
  for (let k = 0; k < nz; k++) { stack.push(k * nx, k * nx + nx - 1); }
  while (stack.length) {
    const c = stack.pop();
    if (outside[c] || barrier[c]) continue;
    outside[c] = 1;
    const i = c % nx, k = (c - i) / nx;
    if (i > 0) stack.push(c - 1);
    if (i < nx - 1) stack.push(c + 1);
    if (k > 0) stack.push(c - nx);
    if (k < nz - 1) stack.push(c + nx);
  }
  const inside = new Uint8Array(nx * nz);
  const r = Math.ceil(growM / cell);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    if (outside[k * nx + i]) continue;
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      const ii = i + di, kk = k + dk;
      if (ii >= 0 && kk >= 0 && ii < nx && kk < nz && di * di + dk * dk <= r * r) inside[kk * nx + ii] = 1;
    }
  }
  return {
    x0, z0, cell, nx, nz,
    has(x, z) {
      const i = Math.floor((x - x0) / cell), k = Math.floor((z - z0) / cell);
      return i >= 0 && k >= 0 && i < nx && k < nz && inside[k * nx + i] === 1;
    },
  };
}

/** Luminance of a linear RGB. */
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** What a material draws as: its name, whether it has a map, its tint luminance. */
function materialFacts(material) {
  const m = Array.isArray(material) ? material[0] : material;
  return {
    name: m?.name ?? '', map: !!m?.map, fallback: /fx-structure-fallback/.test(m?.name ?? ''),
    color: m?.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1], vertexColors: !!m?.vertexColors, side: m?.side ?? 0,
  };
}

/**
 * Every drawn mesh under `roots` as world triangles (a plain mesh by its matrixWorld; an instanced mesh per instance;
 * a batch per drawn instance), with its material and the matrix trouble found on the way. Skips the debris program's
 * pooled pieces (their poses live in the shader: judged by their own check).
 */
export function drawnMeshes(roots, accept = () => true) {
  const out = [];
  const v = new THREE.Vector3(), M = new THREE.Matrix4(), I = new THREE.Matrix4();
  for (const root of roots) {
    if (!root) continue;
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || obj.visible === false || !obj.geometry || !accept(obj)) return;
      if (/fx-structure-pieces-/.test(obj.name)) return;
      const g = obj.geometry, pos = g.getAttribute('position');
      if (!pos) return;
      const col = g.getAttribute('color');
      const ix = g.index ? g.index.array : null;
      const start = Math.max(0, g.drawRange?.start ?? 0);
      const end = Math.min(ix ? ix.length : pos.count, start + (Number.isFinite(g.drawRange?.count) ? g.drawRange.count : Infinity));
      const troubles = [];
      const t0 = matrixTrouble(obj.matrixWorld.elements);
      if (t0) troubles.push(`matrixWorld ${t0}`);
      const instances = [];
      if (obj.isInstancedMesh) {
        for (let i = 0; i < obj.count; i++) {
          obj.getMatrixAt(i, I);
          const tr = matrixTrouble(I.elements);
          if (tr) troubles.push(`instance ${i} ${tr}`);
          instances.push(M.multiplyMatrices(obj.matrixWorld, I).clone());
        }
      } else instances.push(obj.matrixWorld.clone());
      let cr = 0, cg = 0, cb = 0, cn = 0;
      for (const mat of instances) {
        const tris = [];
        for (let k = start; k + 2 < end; k += 3) {
          const a = ix ? ix[k] : k, b = ix ? ix[k + 1] : k + 1, c = ix ? ix[k + 2] : k + 2;
          const p = [];
          for (const idx of [a, b, c]) { v.fromBufferAttribute(pos, idx).applyMatrix4(mat); p.push(v.x, v.y, v.z); }
          // a triangle flattened to a point or a line draws nothing
          const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], wx = p[6] - p[0], wy = p[7] - p[1], wz = p[8] - p[2];
          if (Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) < 1e-8) continue;
          tris.push(...p);
          if (col) for (const idx of [a, b, c]) { cr += col.getX(idx); cg += col.getY(idx); cb += col.getZ(idx); cn++; }
        }
        if (tris.length) out.push({ mesh: obj, name: obj.name, tris: Float32Array.from(tris), material: materialFacts(obj.material), troubles,
          raw: Array.isArray(obj.material) ? obj.material[0] : obj.material });
      }
      const mean = cn ? [cr / cn, cg / cn, cb / cn] : [1, 1, 1];
      for (const d of out) if (d.mesh === obj) d.vertexTint = mean;
    });
  }
  return out;
}

/**
 * Judge the drawn meshes of one building: its stray slabs (see the header) and the matrix troubles. `footprint` is the
 * intact plan (footprintOf); `groundAt(x, z)` the ground as drawn; `supportAt(x, z, y)` true when a live record holds
 * something at height y there.
 */
export function judgeSlabs(meshes, { footprint, groundAt, supportAt = () => false, settled = true, ownMaterials = null, upperFootprint = null, rested = null,
  bandFootprint = null, drawnTopAt = null, byDesign = null, floorAt = null }) {
  const pieces = [];
  let gid = 0;
  for (const d of meshes) for (const tris of piecesOfTriangles(d.tris)) {
    const shape = shapeOf(tris);
    gid++;
    // an open piece that is no slab as a whole (a room's four walls, an open shell) is judged sheet by sheet: its planar
    // facets; a closed one (a box, a block) keeps its thickness
    // (allstages 32f2ebd02) the fracture port's storey room, fx-fracture-room-*, is one mesh of six quads: a closed box whose
    // least extent is the storey height, so judged whole it was never a slab; its walls, floor and ceiling are the sheets
    if (!isSlab(shape) && (isOpen(tris) || CLOSED_ROOM.test(d.name))) {
      // (destruction-slabs 227) a sheet of a fallen object lying on the ground (a windmill's cap on its side: an open
      // shell) is that object's side, not a plate standing in the open
      const grounded = !ROOM_RUN.test(d.name) && !STANDING_RUN.test(d.name) && shape.min[1] - groundAt(shape.centre[0], shape.centre[2]) < 0.4
        && shape.ext[2] > SLAB.thickMaxM;
      for (const sheet of planarFacets(tris)) { const sh = shapeOf(sheet); if (isSlab(sh)) pieces.push({ d, tris: sheet, shape: sh, sheet: true, gid, grounded, parent: shape }); }
      pieces.push({ d, tris, shape, gid });
    } else pieces.push({ d, tris, shape, gid });
  }
  const boxes = pieces.map((p) => p.shape);
  const findings = [];
  const samples = [];
  pieces.forEach((p, idx) => {
    const s = p.shape, reasons = [];
    for (const t of p.d.troubles) reasons.push(`degenerate: ${t}`);
    // a body in flight (a collapse's piece, a wall's cell, a rubble body, a set piece's part) is judged where it comes to
    // rest: at the settled snapshot (what stands — rooms, rims, remnants, faces, heaps, baked rests — always)
    // (census9b, 2026-10-17 continuation) a fallen roof's slab that has lain still is judged where it lies, settled or not:
    // in battle a building whose roof came down stands for minutes with its slabs flat across its wall heads
    const restedRoof = !settled && IN_FLIGHT.test(p.d.name) && !!rested?.(p.d.name);
    const slab = isSlab(s) && (settled || !IN_FLIGHT.test(p.d.name) || restedRoof);
    if (!slab && !reasons.length) return;
    const groundC = groundAt(s.centre[0], s.centre[2]);
    const lift = s.min[1] - groundC;
    const elevated = lift >= SLAB.elevatedM;
    // a plate 2 m or more up is judged against the walls' plan at height (the intact plan without its plinths, steps and
    // ground slabs): a slab at the eaves over a porch's footing is past the walls all the same
    let plan = upperFootprint && lift >= SLAB.upperLiftM ? upperFootprint : footprint;
    let planNote = plan === footprint ? '' : ' (plan at height)';
    // (destruction-slabs 227) a room's wall or plate is judged against the walls drawn in its own height band: a room
    // standing on a forecourt, a gasholder's yard or a lookout's platform is past the walls all the same
    if (slab && bandFootprint && ROOM_RUN.test(p.d.name)) {
      const flat = Math.abs(s.axes[2][1]) > 0.8;
      const y0 = flat ? s.min[1] - 1.5 : s.min[1] + 0.2, y1 = flat ? s.max[1] + 1.5 : Math.max(s.min[1] + 0.4, s.max[1] - 0.2);
      plan = bandFootprint(y0, y1);
      planNote = ' (walls of its height band)';
    }
    const roomFlat = ROOM_RUN.test(p.d.name) && Math.abs(s.axes[2][1]) > 0.8;
    surfaceSamples(p.tris, samples);
    const ns = samples.length / 4;
    let total = 0, outside = 0, unsupported = 0, weighed = 0;
    for (let i = 0; i < ns; i++) {
      const x = samples[i * 4], z = samples[i * 4 + 1], y = samples[i * 4 + 2], w = samples[i * 4 + 3];
      total += w;
      if (!plan.has(x, z)) outside += w;
      if (!elevated) continue;
      weighed += w;
      // under it: the ground, a live record, another drawn piece's box top within the band (a room's ceiling: within its
      // storey's height — its floor, or the ground floor's — it stands on the room's own walls)
      const below = y - (roomFlat ? SLAB.roomSupportM : SLAB.supportBandM);
      if (groundAt(x, z) >= below) continue;
      if (supportAt(x, z, y)) continue;
      if (floorAt?.(x, z, y, y - below)) continue;
      let held = false;
      for (let k = 0; k < boxes.length && !held; k++) {
        if (k === idx || pieces[k].gid === p.gid) continue;
        const b = boxes[k];
        if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] >= below && b.min[1] <= y - 0.02) held = true;
      }
      if (!held) unsupported += w;
    }
    const outsideShare = total ? outside / total : 0, floatingShare = weighed ? unsupported / weighed : 0;
    const vertical = Math.abs(s.axes[2][1]) < 0.3;
    const m = p.d.material, vt = p.d.vertexTint ?? [1, 1, 1];
    const tint = [m.color[0] * (m.vertexColors ? vt[0] : 1), m.color[1] * (m.vertexColors ? vt[1] : 1), m.color[2] * (m.vertexColors ? vt[2] : 1)];
    const L = luma(...tint);
    const attributes = [];
    if (slab) {
      // a plate past the walls in the air, or a panel standing in the open past them (one lying on the ground is debris)
      // (destruction-slabs 227) fallen debris at rest (a collapse's piece, its baked heap, a wall's cell) lies on the pile
      // past the walls by nature: past them it is judged only well up (2.5 m) or floating; a run stands where it was laid
      const debrisRest = IN_FLIGHT.test(p.d.name) || /^fx-(collapse-baked|fracture-heap)-/.test(p.d.name);
      const highEnough = debrisRest ? lift >= SLAB.debrisLiftM || vertical : elevated || vertical;
      if (p.grounded) attributes.push('a side of a fallen object lying on the ground');
      else if (debrisRest && elevated && !highEnough && outsideShare >= SLAB.outsideShare) attributes.push(`on the pile past the walls, ${lift.toFixed(1)} m up`);
      else if (highEnough && outsideShare >= SLAB.outsideShare && outside >= SLAB.outsideAreaM2) {
        reasons.push(`outside: ${outside.toFixed(1)} m² (${(outsideShare * 100).toFixed(0)} %) past the intact walls${planNote}, ${lift.toFixed(1)} m up`);
      }
      if (restedRoof) attributes.push('a fallen roof slab at rest');
      // (destruction-slabs 227 round 4; caldera #28's warehouse: six plates of its fallen roof stood bolt upright in a row
      // over its heap, inside its walls, where no rule looked) debris at rest standing on its end — a plate upright, its top
      // 2.2 m or more over the ground — inside the walls or past them: a billboard in the ruin, never a heap's piece
      const debrisAtRest = /^fx-(structure-rubble|collapse-baked|fracture-heap)-/.test(p.d.name)
        || (settled && /^fx-(collapse-roof|fracture-body|rubble-body|landmark-piece)/.test(p.d.name));
      const topUp = s.max[1] - groundC;
      // (a face of a larger piece it lies in — a slumped set piece's shopfront on its house, a clump's skin — is that piece's)
      const backed = debrisAtRest && vertical && boxes.some((b, k) => k !== idx && pieces[k].gid !== p.gid
        && b.max[0] - b.min[0] >= 1 && b.max[1] - b.min[1] >= 1 && b.max[2] - b.min[2] >= 1
        && b.min[0] <= s.min[0] + 0.3 && b.min[1] <= s.min[1] + 0.3 && b.min[2] <= s.min[2] + 0.3
        && b.max[0] >= s.max[0] - 0.3 && b.max[1] >= s.max[1] - 0.3 && b.max[2] >= s.max[2] - 0.3);
      if (backed) attributes.push('a face of the larger piece it lies in');
      if (debrisAtRest && vertical && !p.grounded && !backed && topUp >= SLAB.onEndM && !reasons.length) {
        reasons.push(`on end: a debris plate standing upright, its top ${topUp.toFixed(1)} m up (${(s.ext[0] * s.ext[1]).toFixed(1)} m², ${(outsideShare * 100).toFixed(0)} % past the walls)`);
      }
      // (the owner's 2026-10-17 frame) a fallen roof's slab lying flat across the wall heads, 2 m or more up, reads as a
      // flat roof as wide as the old roof's slope, its eave overhang standing out past the walls
      // (inside the walls, on the top floor, it is a fallen roof where it belongs: listed, not flagged)
      const flatHigh = /^fx-collapse-roof-/.test(p.d.name) && (settled || restedRoof) && Math.abs(s.axes[2][1]) > 0.8 && lift >= SLAB.upperLiftM;
      if (flatHigh && !(outside >= 1 && outsideShare >= 0.05)) attributes.push(`lying flat ${lift.toFixed(1)} m up inside the walls`);
      if (flatHigh && outside >= 1 && outsideShare >= 0.05) {
        reasons.push(`on the wall heads: a fallen roof slab lying flat ${lift.toFixed(1)} m up (${(s.ext[0] * s.ext[1]).toFixed(1)} m², ${(outsideShare * 100).toFixed(0)} % past the walls' plan at height)`);
      }
      // (destruction-slabs 227) a redrawn wall is the building's own wall: an upper storey's stands on its floor while the
      // simulation holds it (DESTRUCTION.md §3.4, sections on), as its intact parts do — judged off the walls, not floating
      // (and a fallen roof's slab lying flat inside the walls lies on the storey's floor the simulation holds: §3.4)
      const onFloor = /^fx-collapse-roof-/.test(p.d.name) && (settled || restedRoof) && Math.abs(s.axes[2][1]) > 0.8 && lift >= SLAB.upperLiftM
        && !(outside >= 1 && outsideShare >= 0.05);
      const ownWall = /^fx-fracture-face-/.test(p.d.name) || onFloor;
      if (ownWall && elevated && floatingShare >= SLAB.floatingShare) attributes.push(`over a gap, held by its storey's floor (${(floatingShare * 100).toFixed(0)} % over nothing)`);
      else if (elevated && !p.grounded && floatingShare >= SLAB.floatingShare) reasons.push(`floating: ${(floatingShare * 100).toFixed(0)} % of it unsupported, ${lift.toFixed(1)} m up`);
      // (destruction-slabs 227) a fallen roof slab at rest drawn well off the body it rides in (the body grown round
      // everything partitioned to it: the drawn slab hovers over what the body rests on)
      const bodyBoxes = p.d.mesh?.userData?.bodyBoxes;
      if (/^fx-collapse-roof-/.test(p.d.name) && (settled || restedRoof) && Array.isArray(bodyBoxes) && p.d.mesh.matrixWorld) {
        // along the body box's thin axis, the gap between the box's face that looks down and what is drawn (a slab
        // lying tilted on the heap reads its gap under itself, not over the box's lowest corner)
        const M = p.d.mesh.matrixWorld, inv = new THREE.Matrix4().copy(M).invert(), e = M.elements;
        // what the body draws as a whole (every part and bucket of the piece: the covering with its rafters, eave boards and
        // gable under it): a slab propped on its own drawn rafters rests on them, it does not hover
        const prefix = p.d.name.replace(/\.\d+$/, '.');
        const bodyTris = meshes.filter((d) => d.name === p.d.name || d.name.startsWith(prefix)).map((d) => d.tris);
        let gap = -Infinity;
        for (const b of bodyBoxes) {
          const k = b.h[0] <= b.h[1] && b.h[0] <= b.h[2] ? 0 : b.h[1] <= b.h[2] ? 1 : 2;
          const ay = e[k * 4 + 1] / (Math.hypot(e[k * 4], e[k * 4 + 1], e[k * 4 + 2]) || 1);
          if (Math.abs(ay) < 0.5) continue;
          let lo = Infinity, hi = -Infinity;
          for (const tris of bodyTris) for (let o = 0; o < tris.length; o += 3) {
            _still.set(tris[o], tris[o + 1], tris[o + 2]).applyMatrix4(inv);
            const v = k === 0 ? _still.x : k === 1 ? _still.y : _still.z;
            lo = Math.min(lo, v); hi = Math.max(hi, v);
          }
          gap = Math.max(gap, ay > 0 ? lo - (b.c[k] - b.h[k]) : (b.c[k] + b.h[k]) - hi);
        }
        if (gap >= SLAB.hoverM) reasons.push(`hover: drawn ${gap.toFixed(2)} m off its body's face below it`);
      }
      // (census9b) a piece drawn in one of the intact building's own materials is no stranger to it, mapped or not (a
      // glazed or painted bucket without a texture): listed, not flagged
      if ((m.fallback || !m.map) && !m.fallback && ownMaterials?.has(p.d.raw)) attributes.push(`unmapped like the intact building (${m.name || 'unnamed'})`);
      // (destruction-slabs 227) a redrawn wall in a bucket the world draws without a texture by design (its windows'
      // dark glass, a curtain wall, baked concrete) is that bucket's own look
      else if (!m.map && !m.fallback && /^fx-fracture-face-/.test(p.d.name) && byDesign?.has(p.d.raw)) attributes.push(`unmapped by design (${m.name || 'unnamed'})`);
      else if (m.fallback || !m.map) reasons.push(`untextured: ${m.name || '(unnamed material)'}`);
      if (L < SLAB.darkLuma) attributes.push(`dark (tint luminance ${L.toFixed(3)})`);
    }
    if (!reasons.length) return;
    const horizontal = Math.abs(s.axes[2][1]) > 0.8;
    findings.push({
      mesh: p.d.name, sheet: !!p.sheet, material: m.name, map: m.map, tint: tint.map((c) => +c.toFixed(3)), slab,
      orientation: horizontal ? 'horizontal' : vertical ? 'vertical' : 'tilted',
      extentsM: s.ext.map((e) => +e.toFixed(2)), areaM2: +(s.ext[0] * s.ext[1]).toFixed(1),
      centre: s.centre.map((c) => +c.toFixed(2)), liftM: +lift.toFixed(2), groundM: +groundC.toFixed(2), minY: +s.min[1].toFixed(2), outsideShare: +outsideShare.toFixed(2),
      outsideM2: +outside.toFixed(1), floatingShare: +floatingShare.toFixed(2), triangles: s.tris, reasons, attributes, _tris: p.tris,
    });
  });
  // a standing run (a hole's rim, a section's stub and its course of units, a remnant, a redrawn face) belongs on the
  // building's walls: one with ≥ 2 m² and a quarter of itself past the intact plan stands in the open (the strips of units
  // laid on the anatomy's box face metres in front of the drawn wall)
  for (const d of meshes) {
    if (!STANDING_RUN.test(d.name)) continue;
    surfaceSamples(d.tris, samples, 20000);
    let total = 0, outside = 0, high = -Infinity;
    for (let i = 0; i < samples.length; i += 4) {
      total += samples[i + 3];
      if (!footprint.has(samples[i], samples[i + 1])) { outside += samples[i + 3]; high = Math.max(high, samples[i + 2] - groundAt(samples[i], samples[i + 1])); }
    }
    if (!(outside >= 2 && outside >= 0.25 * total)) continue;
    const s = shapeOf(d.tris);
    findings.push({
      mesh: d.name, sheet: false, material: d.material.name, map: d.material.map, tint: d.material.color.map((c) => +c.toFixed(3)), slab: false,
      orientation: 'run', extentsM: s.ext.map((e) => +e.toFixed(2)), areaM2: +outside.toFixed(1), centre: s.centre.map((c) => +c.toFixed(2)),
      liftM: +high.toFixed(2), outsideShare: +(outside / total).toFixed(2), outsideM2: +outside.toFixed(1), floatingShare: 0, triangles: s.tris,
      reasons: [`off the walls: ${outside.toFixed(1)} m² (${(outside / total * 100).toFixed(0)} %) of a standing run past the intact walls, up to ${high.toFixed(1)} m up`],
      attributes: [], _tris: d.tris,
    });
  }
  // (destruction-slabs 227) a remnant pier or stub standing taller than the building was drawn at its spot (a lookout's
  // 16 m masonry piers, a tank's corner piers over its plinth): its pieces' tops against the intact top there — at the
  // top's own spot (round 4: a roof frame's rafter left by the phone's roof fall reads its ridge end against the roof's
  // height half way down its slope, 1.5-2.3 m lower, at its middle)
  if (drawnTopAt) for (const d of meshes) {
    if (!/^fx-structure-remnant-/.test(d.name)) continue;
    let worst = null;
    for (const tris of piecesOfTriangles(d.tris)) {
      const s = shapeOf(tris);
      if (s.max[1] - s.min[1] < 1) continue;
      let tx = s.centre[0], tz = s.centre[2], ty = -Infinity;
      for (let i = 0; i + 2 < tris.length; i += 3) if (tris[i + 1] > ty) { ty = tris[i + 1]; tx = tris[i]; tz = tris[i + 2]; }
      const top = drawnTopAt(tx, tz);
      const over = s.max[1] - (Number.isFinite(top) ? top : groundAt(tx, tz));
      if (over >= SLAB.tallerM && (!worst || over > worst.over)) worst = { over, s, tris, top };
    }
    if (!worst) continue;
    const s = worst.s;
    findings.push({
      mesh: d.name, sheet: false, material: d.material.name, map: d.material.map, tint: d.material.color.map((c) => +c.toFixed(3)), slab: false,
      orientation: 'pier', extentsM: s.ext.map((e) => +e.toFixed(2)), areaM2: +(s.ext[0] * s.ext[1]).toFixed(1), centre: s.centre.map((c) => +c.toFixed(2)),
      liftM: +(s.min[1] - groundAt(s.centre[0], s.centre[2])).toFixed(2), outsideShare: 0, outsideM2: 0, floatingShare: 0, triangles: s.tris,
      reasons: [`too tall: a remnant standing ${worst.over.toFixed(1)} m over the building as drawn at its spot (top ${s.max[1].toFixed(1)} m${Number.isFinite(worst.top) ? `, drawn ${worst.top.toFixed(1)} m` : ', nothing drawn there'})`],
      attributes: [], _tris: worst.tris,
    });
  }
  return { pieces: pieces.length, findings };
}

/** A storey room's runs (structureStages layInterior, structureFracture roomFor). */
const ROOM_RUN = /^fx-(structure|fracture)-room-/;
/** Closed six-quad room boxes judged by their sheets (structureFracture.ts roomFor: one mesh for the whole storey room). */
const CLOSED_ROOM = /^fx-fracture-room-/;

/**
 * The walls drawn in a height band (world y0..y1): the intact building's near-vertical triangles reaching through at
 * least 0.2 m of the band, their plan rasterised and closed as footprintOf does (an empty band covers nothing).
 */
export function bandFootprintOf(triLists, y0, y1) {
  const lists = [];
  for (const t of triLists) {
    const keep = [];
    for (let o = 0; o + 8 < t.length; o += 9) {
      const lo = Math.min(t[o + 1], t[o + 4], t[o + 7]), hi = Math.max(t[o + 1], t[o + 4], t[o + 7]);
      if (Math.min(hi, y1) - Math.max(lo, y0) < 0.2) continue;
      const ux = t[o + 3] - t[o], uy = t[o + 4] - t[o + 1], uz = t[o + 5] - t[o + 2], wx = t[o + 6] - t[o], wy = t[o + 7] - t[o + 1], wz = t[o + 8] - t[o + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (Math.abs(ny) > 0.6 * Math.hypot(nx, ny, nz)) continue;
      for (let k = 0; k < 9; k++) keep.push(t[o + k]);
    }
    if (keep.length) lists.push(Float32Array.from(keep));
  }
  return lists.length ? footprintOf(lists) : { has: () => false };
}

/** The intact building's top as drawn over the plan (0.5 m cells; −Infinity where nothing is drawn), read within a cell. */
export function drawnTopOf(triLists, cell = 0.5) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const t of triLists) for (let i = 0; i < t.length; i += 3) {
    x0 = Math.min(x0, t[i]); x1 = Math.max(x1, t[i]); z0 = Math.min(z0, t[i + 2]); z1 = Math.max(z1, t[i + 2]);
  }
  if (!Number.isFinite(x0)) return () => -Infinity;
  x0 -= cell; z0 -= cell; x1 += cell; z1 += cell;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const top = new Float32Array(nx * nz).fill(-Infinity);
  for (const t of triLists) for (let o = 0; o + 8 < t.length; o += 9) {
    const len = Math.max(Math.hypot(t[o + 3] - t[o], t[o + 5] - t[o + 2]), Math.hypot(t[o + 6] - t[o], t[o + 8] - t[o + 2]), Math.hypot(t[o + 6] - t[o + 3], t[o + 8] - t[o + 5]));
    const k = Math.max(1, Math.ceil(len / (cell * 0.5)));
    for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
      const u = i / k, v = j / k;
      const x = t[o] + (t[o + 3] - t[o]) * u + (t[o + 6] - t[o]) * v, z = t[o + 2] + (t[o + 5] - t[o + 2]) * u + (t[o + 8] - t[o + 2]) * v;
      const y = t[o + 1] + (t[o + 4] - t[o + 1]) * u + (t[o + 7] - t[o + 1]) * v;
      const ci = Math.floor((x - x0) / cell), ck = Math.floor((z - z0) / cell);
      if (ci >= 0 && ck >= 0 && ci < nx && ck < nz && y > top[ck * nx + ci]) top[ck * nx + ci] = y;
    }
  }
  return (x, z) => {
    const ci = Math.floor((x - x0) / cell), ck = Math.floor((z - z0) / cell);
    let best = -Infinity;
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, kk = ck + dk;
      if (i >= 0 && kk >= 0 && i < nx && kk < nz && top[kk * nx + i] > best) best = top[kk * nx + i];
    }
    return best;
  };
}

/**
 * (round 2) The standing building's own floors as drawn: its level surfaces (not its roof's) up to the top storey's floor,
 * per 0.5 m cell up to four heights — what a fallen roof slab inside a standing building lies on (a raised ground floor's
 * plinth, a drawn storey floor; the detector saw nothing under it and called it floating).
 */
export function floorsOf(triLists, maxY, cell = 0.5) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const t of triLists) for (let i = 0; i < t.length; i += 3) {
    x0 = Math.min(x0, t[i]); x1 = Math.max(x1, t[i]); z0 = Math.min(z0, t[i + 2]); z1 = Math.max(z1, t[i + 2]);
  }
  if (!Number.isFinite(x0)) return () => false;
  x0 -= cell; z0 -= cell; x1 += cell; z1 += cell;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
  const hs = new Float32Array(nx * nz * 4).fill(NaN);
  const put = (c, y) => {
    for (let k = 0; k < 4; k++) {
      const h = hs[c * 4 + k];
      if (Number.isNaN(h)) { hs[c * 4 + k] = y; return; }
      if (Math.abs(h - y) < 0.1) return;
    }
  };
  for (const t of triLists) for (let o = 0; o + 8 < t.length; o += 9) {
    const ux = t[o + 3] - t[o], uy = t[o + 4] - t[o + 1], uz = t[o + 5] - t[o + 2], wx = t[o + 6] - t[o], wy = t[o + 7] - t[o + 1], wz = t[o + 8] - t[o + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx, fl = Math.hypot(fx, fy, fz);
    if (!(fl > 1e-9) || fy < 0.9 * fl || Math.max(t[o + 1], t[o + 4], t[o + 7]) > maxY) continue;
    const len = Math.max(Math.hypot(ux, uz), Math.hypot(wx, wz), Math.hypot(t[o + 6] - t[o + 3], t[o + 8] - t[o + 5]));
    const k = Math.max(1, Math.min(48, Math.ceil(len / (cell * 0.5))));
    for (let i = 0; i <= k; i++) for (let j = 0; j <= k - i; j++) {
      const u = i / k, v = j / k;
      const ci = Math.floor((t[o] + ux * u + wx * v - x0) / cell), ck = Math.floor((t[o + 2] + uz * u + wz * v - z0) / cell);
      if (ci >= 0 && ck >= 0 && ci < nx && ck < nz) put(ck * nx + ci, t[o + 1] + uy * u + wy * v);
    }
  }
  return (x, z, y, band) => {
    const ci = Math.floor((x - x0) / cell), ck = Math.floor((z - z0) / cell);
    if (ci < 0 || ck < 0 || ci >= nx || ck >= nz) return false;
    for (let k = 0; k < 4; k++) { const h = hs[(ck * nx + ci) * 4 + k]; if (h >= y - band && h <= y + 0.05) return true; }
    return false;
  };
}

/** The runs that stand with the building (judged against its plan as a whole, not piece by piece). */
export const STANDING_RUN = /^fx-(structure-(rim|remnant)|fracture-face)-/;

/** The meshes of bodies that move until they come to rest (judged as slabs only once settled). */
export const IN_FLIGHT = /^fx-(collapse-(?!remnant|baked)|fracture-body|rubble-body|landmark-piece)/;

/** The intact spans' matrices: every bucket mesh and batch at identity, a batch's drawing instance finite and whole. */
export function spanTroubles(spans) {
  const out = [];
  const I = new THREE.Matrix4();
  const seen = new Set();
  for (const span of spans) {
    const mesh = span.mesh;
    mesh.updateMatrixWorld?.(true);
    if (!seen.has(mesh)) {
      seen.add(mesh);
      const e = mesh.matrixWorld.elements;
      const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      if (e.some((x, i) => Math.abs(x - id[i]) > 1e-6)) out.push(`${mesh.name || mesh.type}: matrixWorld not identity`);
    }
    if (mesh.isBatchedMesh && span.instanceId !== null && span.instanceId !== undefined) {
      try {
        mesh.getMatrixAt(span.instanceId, I);
        const tr = matrixTrouble(I.elements);
        if (tr) out.push(`${mesh.name || 'batch'} instance ${span.instanceId}: ${tr}`);
      } catch (err) { out.push(`${mesh.name || 'batch'} instance ${span.instanceId}: ${String(err).slice(0, 80)}`); }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- the software render

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Rasterise world triangle lists (each { tris, rgb: [r,g,b] 0..1, side?: three's side to cull by, bias?: m nearer }) from an
 *  eye toward a target into a PNG. */
export function renderPng(file, layers, { eye, target, fov = 50, width = 1280, height = 720, title = '' }) {
  const img = Buffer.alloc(width * height * 3);
  const zb = new Float32Array(width * height).fill(Infinity);
  // sky
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 3, t = y / height;
    img[o] = 150 + 60 * t; img[o + 1] = 180 + 40 * t; img[o + 2] = 215 + 20 * t;
  }
  const f = new THREE.Vector3(...target).sub(new THREE.Vector3(...eye)).normalize();
  const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
  const u = new THREE.Vector3().crossVectors(r, f);
  const k = 1 / Math.tan((fov * Math.PI) / 360), aspect = width / height;
  const sun = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();
  const proj = (x, y, z) => {
    const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2];
    const cz = dx * f.x + dy * f.y + dz * f.z;
    const cx = dx * r.x + dy * r.y + dz * r.z, cy = dx * u.x + dy * u.y + dz * u.z;
    return [width / 2 + (cx / cz) * k * (width / 2) / aspect, height / 2 - (cy / cz) * k * (height / 2), cz];
  };
  for (const layer of layers) {
    const T = layer.tris;
    for (let o = 0; o + 8 < T.length; o += 9) {
      const a = proj(T[o], T[o + 1], T[o + 2]), b = proj(T[o + 3], T[o + 4], T[o + 5]), c = proj(T[o + 6], T[o + 7], T[o + 8]);
      if (a[2] < 0.3 || b[2] < 0.3 || c[2] < 0.3) continue;
      const ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2];
      const wx = T[o + 6] - T[o], wy = T[o + 7] - T[o + 1], wz = T[o + 8] - T[o + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      // a one-sided material shows one face (three: FrontSide 0, BackSide 1, DoubleSide 2)
      if (layer.side === 0 || layer.side === 1) {
        const facing = nx * (eye[0] - T[o]) + ny * (eye[1] - T[o + 1]) + nz * (eye[2] - T[o + 2]) > 0;
        if (facing !== (layer.side === 0)) continue;
      }
      const lambert = Math.abs(nx * sun.x + ny * sun.y + nz * sun.z);
      const shade = 0.42 + 0.58 * lambert;
      const cr = Math.min(255, layer.rgb[0] * shade * 255), cg = Math.min(255, layer.rgb[1] * shade * 255), cb = Math.min(255, layer.rgb[2] * shade * 255);
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-9 || maxX - minX > width * 4) continue;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = 1 / (w0 / a[2] + w1 / b[2] + w2 / c[2]);
        const zi = y * width + x;
        const zz = z - (layer.bias ?? 0);
        if (zz >= zb[zi]) continue;
        zb[zi] = zz;
        img[zi * 3] = cr; img[zi * 3 + 1] = cg; img[zi * 3 + 2] = cb;
      }
    }
  }
  void title;
  writeFileSync(file, png(width, height, img));
}

// ---------------------------------------------------------------------------------------------------- the staging

/** The check, as a function: the report (pass, per-building rows with their snapshots and findings). */
export async function runSlabCheck({
  mapId = 'verdant', ids = null, builders = null, perBuilder = 1, rounds = 40, roundGapS = 0.45, settleS = 10, stopAfterRoof: stopAfterRoofAll = false, upper = true,
  sections = true, fracture = true, renderDir = null, maxSnapshots = 40, storeys = [0], log = () => {}, rejoin: rejoinAll = true,
  faces = ['wide'], seed = null, filmS = 0, filmFromS = 0, facesFor = null, fingerprint = null,
} = {}) {
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, models, fleet] = await Promise.all([
    import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'), import('../src/world/propsModelStore.ts'), import('../src/vehicles/fleetFactory.ts')]);
  const { createStructureMask } = await import('../src/fx/structureMask.ts');
  const debrisMod = await import('../src/fx/structureDebris.ts');
  const { createStructureStages } = await import('../src/fx/structureStages.ts');
  const rubbleMod = await import('../src/fx/rubbleBodies.ts').catch(() => null);
  const fractureMod = fracture ? await import('../src/fx/fractureStages.ts').catch(() => null) : null;
  // (round 4) the phone as the battle wires it (effects.ts): the kit's holes and falls, the stages' hanging sweep alone
  const phoneStages = fracture === 'phone' ? { sweepOnly: true, capacity: 16, poolShare: 0, hangingSteps: 4, hangingSlice: 4000 } : {};
  const { createStudioDestruction } = await import('../src/game/studioDestruction.ts');
  const { matchRulesetFor } = await import('../src/sim/matchRuleset.ts');
  const { DESTRUCTION_BUS_EVENTS } = await import('../src/sim/destructionEvents.ts');
  const { createStructureDamageSeam } = await import('../src/world/structureDamageSeam.ts');
  const { createStructureDamage } = await import('../src/sim/structureDamage.ts');
  const { rubbleHeightFor, rubbleMoundHeightAt } = await import('../src/sim/terrainDeformation.ts');
  const { createObstacleGrid, shellPassesThroughCollisionRecord } = await import('../src/world/collision.ts');
  const { munitionClassForShell, munitionChargeKg } = await import('../src/sim/munitionBlast.ts');
  const { STAGE_RUN_TAG, COLLAPSE_S } = await import('../src/fx/structureMask.ts');
  await models.preloadPropModels();

  const config = maps.getMapConfig(mapId);
  if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids).catch(() => {});
  const field = terrain.createHeightField(1337, config);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const built = props.createProps(field, engine, 2002, config, flora);
  log(`props built: ${built.structureDamage.size} structures`);
  const worldMaterials = new Map();
  for (const entry of built.structureMaterials) if (entry.role === 'surface' && !worldMaterials.has(entry.bucket)) worldMaterials.set(entry.bucket, entry.material);
  // the buckets the world draws without a texture by design (a redrawn wall in one is that bucket's own look)
  const byDesign = new Set(['dark', 'glass', 'curtain', 'baked'].map((b) => worldMaterials.get(b)).filter(Boolean));
  const table = createStructureDamage(built.obstacles, built.colliders);
  const seams = new Map();
  const seamOf = (id) => {
    if (seams.has(id)) return seams.get(id);
    const d = built.structureDamage.get(id);
    if (!d) return null;
    const st = table.byId(id);
    if (st && !d.anatomy.mound) d.anatomy.mound = { cx: st.cx, cz: st.cz, hw: st.hw, hd: st.hd, yaw: st.yaw, heightM: rubbleHeightFor(st.topY - st.baseY) };
    const seam = createStructureDamageSeam(id, d.builder, d.style, d.anatomy, built.structureSpans.get(id) ?? []);
    seams.set(id, seam);
    return seam;
  };
  const shellRecord = new Map();
  for (const r of built.colliders) if (r.structureIdx !== undefined && !shellRecord.has(r.structureIdx)) shellRecord.set(r.structureIdx, r);
  const picks = [];
  // (census9b, 2026-10-17) a kind is a builder under its damage kit (a regional kit's farmhouse and the default's are two
  // kinds); what cannot be struck this way (no shell record, no storeys) is listed, not silently left out
  const skipped = new Map();
  if (ids) for (const id of ids) { if (built.structureDamage.has(id) && shellRecord.has(id)) picks.push(id); else log(`#${id}: not a struck structure here`); }
  else {
    const byBuilder = new Map();
    for (const [id, d] of built.structureDamage) {
      const kind = `${d.builder}|${d.anatomy.kit}`;
      if (!shellRecord.has(id) || !d.anatomy.storeys?.length) {
        const reason = !shellRecord.has(id) ? 'no shell record' : 'no storeys';
        const s = skipped.get(kind) ?? { builder: d.builder, kit: d.anatomy.kit, reason, ids: [] };
        s.ids.push(id);
        skipped.set(kind, s);
        continue;
      }
      if (builders && !builders.includes(d.builder)) continue;
      const list = byBuilder.get(kind) ?? [];
      if (list.length < perBuilder) list.push(id);
      byBuilder.set(kind, list);
    }
    picks.push(...[...byBuilder.values()].flat());
  }
  if (skipped.size) log(`not struck: ${[...skipped.values()].map((s) => `${s.builder}/${s.kit} (${s.reason}; ${s.ids.length})`).join(', ')}`);
  // every structure's spans as built (a run restores them: a neighbour a round's splash reached, a rejoin's fresh page)
  const spanSaved = [];
  for (const list of built.structureSpans.values()) for (const span of list) {
    spanSaved.push([span, span.position.array.slice(span.first * 3, (span.first + span.count) * 3)]);
  }
  const restoreSpans = () => {
    for (const [span, saved] of spanSaved) { span.position.array.set(saved, span.first * 3); span.position.needsUpdate = true; }
  };
  const allRecords = [...built.obstacles, ...built.colliders];
  const recordState = () => allRecords.map((r) => [!!r.crushed, !!r.dead]);
  const setRecordState = (st) => allRecords.forEach((r, i) => { r.crushed = st[i][0]; r.dead = st[i][1]; });
  log(`buildings: ${picks.map((id) => `#${id} ${built.structureDamage.get(id).builder}`).join(', ')}`);
  const solids = [];
  for (const r of built.colliders) if (r.structureIdx !== undefined) solids.push(r);
  for (const r of built.obstacles) if (r.structureIdx === undefined && !shellPassesThroughCollisionRecord(r)) solids.push(r);
  const query = createObstacleGrid(solids, 16);
  const queryOut = [];
  const ground0 = (x, z) => (field.getContactHeightAt ? field.getContactHeightAt(x, z) : field.getHeightAt(x, z));

  const rows = [];
  // (destruction-slabs 227 round 2) each building struck from every face asked for (`faces`: wide, wide-back, narrow,
  // narrow-back — its wider or narrower side, the near or the far one), each face's rounds at its own seeded offsets
  // (the receipt's own at seed 0; the critic's variant census: the same building from another face flagged what the
  // widest face never showed)
  // (`facesFor(id, builder, kit)`: a caller's own faces per building — the kinds receipt's second face by the kind's hash)
  const runs = picks.flatMap((id) => {
    const d = built.structureDamage.get(id);
    return (facesFor?.(id, d.builder, d.anatomy.kit) ?? faces).map((faceName) => [id, faceName]);
  });
  for (const [id, runFace] of runs) {
    // (round 3) a face named `<face>+roof` is that face's roof pass alone (the kinds receipt strikes every roofed kind so:
    // what its roof's fall leaves standing over the eaves)
    const roofRun = runFace.endsWith('+roof');
    const faceName = roofRun ? runFace.slice(0, -5) : runFace;
    const stopAfterRoof = stopAfterRoofAll || roofRun, rejoin = rejoinAll && !roofRun;
    const faceSeed = seed ?? FACE_SEEDS[faceName] ?? 0;
    const seam = seamOf(id);
    const a = seam.anatomy;
    // (the roof pass) a building without a roof section has no roof to come down: the full pass covers it
    if (stopAfterRoof && !a.roof) { log(`#${id} ${seam.builder}: no roof section (skipped by the roof pass)`); continue; }
    for (const r of [...built.obstacles, ...built.colliders]) { r.crushed = false; r.dead = false; r.openings = null; }
    restoreSpans();
    // (round 3, the kinds receipt's cost) a run's fingerprint: what it strikes (the structure's spans as built, its anatomy
    // and its enclosure), how (the face, the seed, the staging) and with what (the caller's salt: the code's hash); a
    // fingerprint a clean run passed before is not run again
    let fp = null;
    if (fingerprint) {
      const h = createHash('sha1');
      h.update(`${fingerprint.salt}|${mapId}|${id}|${runFace}|${faceSeed}|${rounds}|${roundGapS}|${settleS}|${sections}|${fracture}|${storeys.join(',')}|${maxSnapshots}|${rejoin}|${stopAfterRoof}\n`);
      for (const span of seam.spans) {
        h.update(`${span.bucket}|${span.partClass}|${span.piece ?? ''}|${span.count}|`);
        const arr = span.position.array;
        h.update(Buffer.from(arr.buffer, arr.byteOffset + span.first * 12, span.count * 12));
      }
      h.update(JSON.stringify(a, (k, v) => (k === 'enclosure' || k === 'intact' ? undefined : ArrayBuffer.isView(v) ? Array.from(v.slice(0, 4096)) : v)));
      const e = a.enclosure;
      if (e) { h.update(Buffer.from(e.top.buffer)); for (const b of e.bands) h.update(Buffer.from(b.cells.buffer)); }
      fp = h.digest('hex');
      if (fingerprint.cached(fp)) {
        rows.push({ id, face: runFace, seed: faceSeed, builder: seam.builder, kit: a.kit, style: seam.style, anatomy: { w: +a.w.toFixed(2), d: +a.d.toFixed(2),
          h: +a.h.toFixed(2), storeys: a.storeys.length, floors: a.storeys.filter((st) => st.floor).length, roof: a.roof?.kind ?? null }, fired: 0,
        collapsedAtS: -1, staging: null, events: [], spanIssues: [], snapshots: [], pass: true, cached: true, fingerprint: fp, worst: [], phases: {} });
        log(`#${id} ${seam.builder}${faceName === 'wide' ? '' : ` (${faceName})`}: PASS (a clean run of this fingerprint passed before)`);
        continue;
      }
    }
    let clock = 0;
    // every event the match raised (any structure's), in order: what a late joiner's settled log replays
    const replay = [];
    // the stage the building reached (for the snapshot's phase): hit (holes only), damaged, heavily damaged, collapse
    let reached = 'intact', felled = false;
    const RANK = { intact: 0, hit: 1, damaged: 2, breached: 3, collapsed: 4 };
    const mounds = [];
    const ground = (x, z) => { let y = ground0(x, z); for (const m of mounds) y += rubbleMoundHeightAt(m, x, z); return y; };
    // the intact plan, from the spans as drawn before the first round
    const intactLists = drawnSpanTriangles(seam.spans);
    const ownMaterials = new Set();
    for (const span of seam.spans) for (const m of [span.mesh.material].flat()) if (m) ownMaterials.add(m);
    const footprint = footprintOf(intactLists);
    // the walls of a height band (a room's own), cached by half metre; the building's top as drawn over its plan
    const bandCache = new Map();
    const bandFootprint = (y0, y1) => {
      const a0 = Math.floor(y0 * 2) / 2, a1 = Math.ceil(y1 * 2) / 2, key = `${a0}:${a1}`;
      let f = bandCache.get(key);
      if (!f) { f = bandFootprintOf(intactLists, a0, a1); bandCache.set(key, f); }
      return f;
    };
    const drawnTopAt = drawnTopOf(intactLists);
    // (round 3) what the damage leaves hanging (destruction-hanging.mjs): the building's own pieces, slab or not, judged
    // against what is drawn round them — never the standing building's collision record
    // (the storeys' floor lines inside the walls: the simulation holds a storey on its floor until it drops — §3.4)
    const floorLines = a.storeys.slice(1).map((st) => a.placement.y + st.y0);
    let holdFloors = true;
    const floorLineUnder = (x, z, y) => {
      if (!footprint.has(x, z)) return -Infinity;
      let best = -Infinity;
      for (const fy of floorLines) if (fy <= y && fy > best) best = fy;
      return best;
    };
    const floorUnder = (x, z, y) => (holdFloors ? floorLineUnder(x, z, y) : -Infinity);
    // (round 3) a standing building's drawn floors, and its storeys' floor lines the simulation holds (§3.4: a storey's room
    // and walls stand on its floor until it drops)
    const floorOrLine = (x, z, y, band) => standingFloorAt(x, z, y, band) || floorLineUnder(x, z, y + 0.05) >= y - band;
    const hangingJudge = createHangingJudge(spanTrianglesAll(seam.spans), seam.spans.map((sp) => (sp.mesh.name || 'span').replace(/^props-bucket-/, '')), ground0, floorUnder);
    /** Its findings at a snapshot: `spansDrawn` the world's spans as the CPU holds them, or false (gone: a fallen building's). */
    const bucketOfMaterial = new Map([...worldMaterials].map(([b, m]) => [m, b]));
    const hangingAt = (meshes, spansDrawn, groundFn) => {
      const found = hangingJudge(spansDrawn ? spanTrianglesAll(seam.spans) : null,
        meshes.map((d) => ({ name: bucketOfMaterial.has(d.raw) ? `${d.name} (${bucketOfMaterial.get(d.raw)})` : d.name, tris: d.tris, standing: STANDING_MESH.test(d.name) })), groundFn);
      // (COT_HANG_DUMP=<file>: each finding's triangles and every drawn mesh's within 2 m of it, for a close look)
      if (process.env.COT_HANG_DUMP && found.length) {
        const near = (t, c) => { for (let o = 0; o + 8 < t.length; o += 9) if (Math.abs(t[o] - c[0]) < 2 && Math.abs(t[o + 1] - c[1]) < 2 && Math.abs(t[o + 2] - c[2]) < 2) return true; return false; };
        const out = found.map((f) => ({ id, clock, mesh: f.mesh, reason: f.reason, centre: f.centre, tris: Array.from(f.tris ?? []),
          near: meshes.filter((d) => near(d.tris, f.centre)).map((d) => ({ name: d.name, tris: Array.from(d.tris) })) }));
        appendFileSync(process.env.COT_HANG_DUMP, JSON.stringify(out) + '\n');
      }
      return found.map(hangingFinding);
    };
    const floorLists = drawnSpanTriangles(seam.spans.filter((sp) => sp.partClass !== 'roof'));
    const topFloorY = a.placement.y + (a.storeys.length ? a.storeys[a.storeys.length - 1].y0 : 0) + 0.5;
    const standingFloorAt = floorsOf(floorLists, topFloorY);
    // the walls' plan at height: the intact triangles reaching 1.5 m over the ground under them (no plinth, step or slab)
    const upperFootprint = upper ? footprintOf(intactLists.map((t) => {
      const keepTris = [];
      for (let o = 0; o + 8 < t.length; o += 9) {
        const top = Math.max(t[o + 1], t[o + 4], t[o + 7]);
        if (top >= ground0((t[o] + t[o + 3] + t[o + 6]) / 3, (t[o + 2] + t[o + 5] + t[o + 8]) / 3) + 1.5) for (let k = 0; k < 9; k++) keepTris.push(t[o + k]);
      }
      return Float32Array.from(keepTris);
    }).filter((t) => t.length)) : null;
    // when each of the building's falling bodies first drew (a body that has lain RESTED_S is judged where it lies)
    const firstSeen = new Map(), lastMoved = new Map(), motionKey = new Map();
    const rested = (name) => /^fx-collapse-roof-/.test(name) && firstSeen.has(name) && clock - firstSeen.get(name) >= SLAB.restedS
      && clock - (lastMoved.get(name) ?? -Infinity) >= SLAB.stillS;
    let roofDownAt = -1;
    const mask = createStructureMask(4096, { holes: true });
    const env = { groundAt: (x, z) => ground(x, z), queryStatic: query, isSolid: (r) => !r.crushed && !r.dead };
    const bodies = rubbleMod ? rubbleMod.createRubbleBodies({ now: () => clock, environment: () => env, capacity: rubbleMod.RUBBLE_BODY_CAPACITY,
      materialFor: (bucket) => worldMaterials.get(bucket) ?? null }) : null;
    const debris = debrisMod.createStructureDebris({ now: () => clock, groundY: ground, baseGroundY: ground0, poolCapacity: 256, pieceCap: 1024, bodies });
    const fxGroup = new THREE.Group();
    const fx = fractureMod ? fractureMod.createFractureStages({ group: fxGroup, now: () => clock, environment: () => env, groundAt: ground,
      materialFor: (bucket) => worldMaterials.get(bucket) ?? null, ...phoneStages }) : null;
    const stages = createStructureStages({ mask, debris, now: () => clock, materialFor: (bucket) => worldMaterials.get(bucket) ?? null,
      scars: null, crumble: 1, ...(fx ? { fracture: fx.attach } : {}) });
    const events = [];
    let collapsed = false, collapsedAt = -1, lastEventAt = -Infinity;
    // the world's spans: drawn (standing), moving (a storey's fall in flight carries what stood over it down; a kit's
    // collapse: the mask's front cuts them and folds them onto the pivot COLLAPSE_S after the blow — the CPU does not see
    // it), or gone (folded; or the fracture took the collapse)
    const spansState = () => (!collapsed ? (stages.falling?.(id) ? 'moving' : 'drawn') : fx?.took(id) ? 'gone' : collapsedAt >= 0 && clock >= collapsedAt + COLLAPSE_S - 1e-6 ? 'gone' : 'moving');
    const bus = { emit(type, e) {
      if (e?.structureId === id && !felled) {
        // the phase this event moves the building into; the phase it leaves is judged as it stands, before the event
        // lands (a fragile building runs through hit and damaged faster than the +0.8 s snapshot)
        const isStage = type === DESTRUCTION_BUS_EVENTS.stage;
        const next = isStage && e.stage === 'collapsed' ? 'collapsed'
          : isStage && e.stage === 'breached' ? 'breached' : !isStage && e.sectionDown ? 'breached'
            : isStage && e.stage === 'damaged' ? 'damaged' : !isStage ? 'hit' : reached;
        if (RANK[next] > RANK[reached]) {
          if (reached !== 'intact') phaseSnap(`pre-${next}`);
          if (next === 'collapsed') felled = true; else reached = next;
        }
      }
      replay.push({ type, e: { ...e } });
      if (e?.structureId === id && type === DESTRUCTION_BUS_EVENTS.breach && e.sectionDown && e.sectionKind === 'roof' && roofDownAt < 0) roofDownAt = clock;
      if (e?.structureId === id) {
        lastEventAt = clock;
        events.push({ t: +clock.toFixed(3), type, stage: e.stage ?? null, hole: e.hole ?? null, storeyDown: !!e.storeyDown,
          y: e.y !== undefined ? +(+e.y).toFixed(2) : null });
      }
      if (type === DESTRUCTION_BUS_EVENTS.stage && e.stage === 'collapsed') {
        const st = table.byId(e.structureId);
        if (st) mounds.push({ cx: st.cx, cz: st.cz, hw: st.hw, hd: st.hd, yaw: st.yaw, heightM: rubbleHeightFor(st.topY - st.baseY) });
        if (e.structureId === id) collapsed = true;
      }
      if (type === DESTRUCTION_BUS_EVENTS.stage) stages.stage(e, seamOf(e.structureId));
      if (type === DESTRUCTION_BUS_EVENTS.stage && e.stage === 'collapsed' && e.structureId === id) gone = new Set(debris.standingRuns(runTag));
      else if (type === DESTRUCTION_BUS_EVENTS.breach) { stages.breach(e, seamOf(e.structureId)); fx?.breach(e); }
    } };
    const sd = createStudioDestruction({ getObstacles: () => built.obstacles, getColliders: () => built.colliders }, bus,
      { rules: matchRulesetFor('standard').destruction, sections });
    const c = Math.cos(a.placement.yaw), s = Math.sin(a.placement.yaw);
    const toWorld = (bx, by, bz) => [a.placement.x + bx * c + bz * s, a.placement.y + by, a.placement.z - bx * s + bz * c];
    // (destruction-slabs 227) the staging is the building's as drawn, never its anatomy's (the fix moves the anatomy;
    // before and after strike alike): the intact plan's box in the body frame, its wider side struck, rounds cycling
    // through 3 m bands up its drawn height (`storeys`: which bands), each round traced along its flight to the
    // structure's own collision records (it strikes what a battle's round would)
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity, btop = 0;
    for (const t of intactLists) for (let i = 0; i < t.length; i += 3) {
      const dx = t[i] - a.placement.x, dz = t[i + 2] - a.placement.z;
      const bx = dx * c - dz * s, bz = dx * s + dz * c;
      bx0 = Math.min(bx0, bx); bx1 = Math.max(bx1, bx); bz0 = Math.min(bz0, bz); bz1 = Math.max(bz1, bz); btop = Math.max(btop, t[i + 1] - a.placement.y);
    }
    const alongX = (bx1 - bx0 >= bz1 - bz0) !== faceName.startsWith('narrow');
    const back = faceName.endsWith('-back');
    const face = alongX
      ? (back ? { origin: [(bx0 + bx1) / 2, 0, bz0], u: [-1, 0, 0], out: [0, 0, -1], width: bx1 - bx0, height: btop }
        : { origin: [(bx0 + bx1) / 2, 0, bz1], u: [1, 0, 0], out: [0, 0, 1], width: bx1 - bx0, height: btop })
      : (back ? { origin: [bx0, 0, (bz0 + bz1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: bz1 - bz0, height: btop }
        : { origin: [bx1, 0, (bz0 + bz1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: bz1 - bz0, height: btop });
    const bandsUp = storeys.map((k) => { const y0 = Math.min(k * 3, Math.max(0, btop - 3)); return [y0, Math.min(btop, y0 + 3)]; });
    const nx = face.out[0] * c + face.out[2] * s, nz = -face.out[0] * s + face.out[2] * c;
    const ownRecords = [...built.colliders, ...built.obstacles].filter((r) => r.structureIdx === id);
    // the building's records' state at the last tick's end (crushed 1, dead 2), and a scratch for now's
    const prevOwnState = new Uint8Array(ownRecords.length), nowOwnState = new Uint8Array(ownRecords.length);
    /** The first of the structure's records a round from outside meets at (x, y, z) flying (dx, dz): [t, record] or null. */
    const trace = (x, y, z, dx, dz) => {
      let best = null;
      for (const r of ownRecords) {
        if (y < r.min[1] || y > r.max[1]) continue;
        let t0 = 0, t1 = Infinity;
        for (const [o, d, lo, hi] of [[x, dx, r.min[0], r.max[0]], [z, dz, r.min[2], r.max[2]]]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
          let ta = (lo - o) / d, tb = (hi - o) / d;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        }
        if (t0 <= t1 && Number.isFinite(t0) && (!best || t0 < best[0])) best = [t0, r];
      }
      return best;
    };
    const offs0 = [0, -0.42, 0.38, -0.18, 0.24, -0.33, 0.1, 0.45, -0.45, 0.05, 0.3, -0.25, 0.15, -0.1];
    const ys0 = [0.35, 0.6, 0.45, 0.75, 0.3, 0.65, 0.5, 0.85, 0.4, 0.55, 0.7, 0.35, 0.6, 0.5];
    // a seeded face's rounds: a deterministic shuffle of the offsets along the face and the heights in each band
    let rs = (faceSeed * 2654435761 + id * 97 + 1) >>> 0;
    const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
    const offs = faceSeed ? offs0.map(() => (rnd() - 0.5) * 0.92) : offs0;
    const ys = faceSeed ? ys0.map(() => 0.25 + rnd() * 0.65) : ys0;
    const spec = { name: 'check', type: 'HE', caliberMm: 125, velocityMps: 850 };
    const munition = munitionClassForShell(spec), chargeKg = munitionChargeKg(spec, munition);
    const record = shellRecord.get(id);
    // the building's own drawn meshes: the fx group's for this structure, its stage runs, the rubble bodies
    const own = new RegExp(`-${id}(-|$)`);
    const runTag = STAGE_RUN_TAG + id + 1;
    // a stage run is the building's own (a neighbour a round's splash reached lays its runs in the same group)
    const ownRun = (m) => m.userData.structure === id || m.geometry?.userData?.stageTag === runTag
      || (!(m.userData.structure >= 0) && !m.geometry?.userData?.stageTag);
    // (destruction-slabs 227) once the building collapses its standing runs go with it: the mask carries them down with
    // its fall and folds them away (the fracture's collapse drops them at once)
    let gone = null;
    const accept = (m) => {
      // (round 2: every structure's collapse pieces were taken, a neighbour's roof slabs on its own walls judged against this
      // building's plan) the fx group's meshes of this building only
      if (m.parent === fxGroup) return own.test(m.name);
      if (gone?.has(m)) return false;
      return m.parent === debris.group ? ownRun(m) : true;
    };
    const supportAt = (x, z, y) => query(x - 0.3, z - 0.3, x + 0.3, z + 0.3, queryOut)
      .some((rr) => !rr.crushed && !rr.dead && rr.max[1] >= y - SLAB.supportBandM && rr.min[1] <= y + 0.05
        && x >= rr.min[0] - 0.3 && x <= rr.max[0] + 0.3 && z >= rr.min[2] - 0.3 && z <= rr.max[2] + 0.3);
    // the camera: off the struck face, up and back, the building's middle in view
    const mid = toWorld((bx0 + bx1) / 2, Math.min(btop * 0.35, 9), (bz0 + bz1) / 2);
    const reach = Math.max(bx1 - bx0, bz1 - bz0) * 1.25 + 10;
    const eye = [mid[0] + nx * reach * 0.82 + nz * reach * 0.45, mid[1] + reach * 0.32, mid[2] + nz * reach * 0.82 - nx * reach * 0.45];
    const groundTris = groundPatch(ground0, mid[0], mid[2], reach * 1.2, 3);
    // a battle's eye: a tank commander's height over the ground, off the struck face's corner
    const lowAt = [mid[0] + nx * reach * 0.9 - nz * reach * 0.55, 0, mid[2] + nz * reach * 0.9 + nx * reach * 0.55];
    const eyeLow = [lowAt[0], ground0(lowAt[0], lowAt[2]) + 3.2, lowAt[2]];
    const snapshots = [];
    const strikes = [];
    let rendered = 0;
    const shoot = (label, meshes, findings, standingSpans, groundFn = ground) => {
      if (!renderDir) return null;
      mkdirSync(renderDir, { recursive: true });
      const layers = [{ tris: groundPatch(groundFn, mid[0], mid[2], reach * 1.2, 3), rgb: [0.36, 0.48, 0.26] }];
      if (standingSpans) for (const t of drawnSpanTriangles(seam.spans)) layers.push({ tris: t, rgb: [0.82, 0.8, 0.76] });
      for (const m of meshes) layers.push({ tris: m.tris, rgb: tintOf(m), side: m.material.side });
      const base = path.join(renderDir, `${mapId}-s${id}${faceName === 'wide' ? '' : `-${faceName}`}-${String(rendered++).padStart(2, '0')}-${label}`);
      // as drawn (the CPU's approximation: flat tints, no texture, no hole cuts), then with the flagged pieces magenta
      renderPng(`${base}-look.png`, layers, { eye, target: mid });
      renderPng(`${base}-low.png`, layers, { eye: eyeLow, target: mid });
      for (const f of findings) layers.push({ tris: f._tris, rgb: [1, 0.1, 0.85], bias: 0.06 });
      // (the flags view shows every flagged surface from both sides; the look views cull as the materials do)
      renderPng(`${base}-flags.png`, layers, { eye, target: mid });
      return `${base}-flags.png`;
    };
    void groundTris;
    // before the first round: the building as it stands (its spans), judged as a control
    {
      const meshes = drawnMeshes([debris.group, fxGroup, bodies?.group], accept);
      const judged = judgeSlabs(meshes, { footprint, groundAt: ground, supportAt, ownMaterials, upperFootprint, bandFootprint, drawnTopAt, byDesign });
      snapshots.push({ t: 0, label: 'intact', phase: 'intact', meshes: meshes.length, pieces: judged.pieces, findings: judged.findings.map(strip),
        render: shoot('intact', meshes, judged.findings, true) });
    }
    const spanIssues = spanTroubles(seam.spans);
    const PHASE = { intact: 'intact', hit: 'hit', damaged: 'damaged', breached: 'heavily damaged' };
    // the last snapshot of each standing phase: where a late joiner's page is laid from the log so far (a mid-match rejoin)
    const midPoints = new Map();
    // the standing phase's last look, just before the event that ends it
    function phaseSnap(label) {
      if (snapshots.length >= maxSnapshots) return;
      // (round 4) judged as it stood: the building's records as they were before the event that ends the phase (the sim
      // crushes them, then raises the event — the critic's saltwind #0 slab, on the walls' records a tick before, read 64 %
      // over nothing in the instant between)
      for (let i = 0; i < ownRecords.length; i++) { const r = ownRecords[i]; nowOwnState[i] = (r.crushed ? 1 : 0) | (r.dead ? 2 : 0); r.crushed = !!(prevOwnState[i] & 1); r.dead = !!(prevOwnState[i] & 2); }
      try { phaseSnapJudged(label); } finally {
        for (let i = 0; i < ownRecords.length; i++) { const r = ownRecords[i]; r.crushed = !!(nowOwnState[i] & 1); r.dead = !!(nowOwnState[i] & 2); }
      }
    }
    function phaseSnapJudged(label) {
      const meshes = drawnMeshes([debris.group, fxGroup, bodies?.group], accept);
      const judged = judgeSlabs(meshes, { footprint, groundAt: ground, supportAt, settled: false, ownMaterials, upperFootprint, rested, bandFootprint, drawnTopAt, byDesign,
        floorAt: felled ? null : floorOrLine });
      // (what an event left hanging comes down in the presentation's next updates — its faces drawn, its storeys landed: a
      // look within HANG_SETTLE_S of the building's last event is none)
      holdFloors = !felled;
      { const st = spansState(); if (st !== 'moving' && clock - lastEventAt >= HANG_SETTLE_S) judged.findings.push(...hangingAt(meshes, st === 'drawn', ground)); }
      const flagged = judged.findings.length > 0;
      const firstFlag = flagged && !snapshots.some((p) => p.findings.length);
      const tag = `t${clock.toFixed(1)}-${label}`;
      snapshots.push({ t: +clock.toFixed(2), label: tag, phase: PHASE[reached], events: events.length, meshes: meshes.length, pieces: judged.pieces,
        findings: judged.findings.map(strip), render: firstFlag || (flagged && rendered < 5) ? shoot(tag, meshes, judged.findings, true) : null });
      midPoints.set(reached, { t: clock, count: replay.length, records: recordState() });
    }
    const due = [];
    let lastEventCount = 0, fired = 0;
    let nextFilm = filmFromS;
    const lastS = rounds * roundGapS + settleS + 4;
    // (destruction-slabs 227 round 4; the engineering critic's reservoir #11 cottage, roof pass from the narrow back: a
    // roof sheet shoved off a rest high past the walls was judged in mid-tumble off the corner, the standing end come in
    // its flight) the end waits for the building's bodies to come to rest and its hanging sweep to settle, REST_WAIT_S at
    // most
    let restWaited = 0;
    for (let tick = 0; tick * STEP <= lastS + REST_WAIT_S; tick++) {
      clock = tick * STEP;
      for (let i = 0; i < ownRecords.length; i++) prevOwnState[i] = (ownRecords[i].crushed ? 1 : 0) | (ownRecords[i].dead ? 2 : 0);
      if (collapsedAt < 0 && fired < rounds && !(stopAfterRoof && roofDownAt >= 0) && clock >= 0.3 + fired * roundGapS) {
        const [b0, b1] = bandsUp[fired % bandsUp.length];
        const uu = offs[fired % offs.length] * face.width * 0.8;
        const y = b0 + Math.max(Math.min(0.6, (b1 - b0) / 2), Math.min(b1 - b0 - 0.6, ys[fired % ys.length] * (b1 - b0)));
        let [hx, hy, hz] = toWorld(face.origin[0] + face.u[0] * uu + face.out[0] * 30, y, face.origin[2] + face.u[2] * uu + face.out[2] * 30);
        const hit = trace(hx, hy, hz, -nx, -nz);
        let rec = record;
        if (hit) { hx += -nx * hit[0]; hz += -nz * hit[0]; rec = hit[1]; } else { hx -= nx * 30; hz -= nz * 30; }
        strikes.push([+hx.toFixed(2), +hy.toFixed(2), +hz.toFixed(2), +clock.toFixed(2)]);
        sd.strike(spec, rec, hx, hy, hz, -nx, -nz);
        stages.strike(id, seam, hx, hy, hz, -nx, -nz, munition, chargeKg, spec.caliberMm);
        fired++;
      }
      sd.step();
      stages.update();
      fx?.update();
      debris.update();
      bodies?.update();
      fxGroup.traverse((m) => {
        if (!m.isMesh || !m.name) return;
        if (!firstSeen.has(m.name)) firstSeen.set(m.name, clock);
        if (!/^fx-collapse-roof-/.test(m.name)) return;
        // still: neither its matrix nor its positions changed (a merged mesh's pieces move in its positions)
        const pos = m.geometry?.attributes?.position;
        if (!pos) return;
        m.updateMatrixWorld?.(true);
        const step = Math.max(1, Math.floor(pos.count / 12));
        let key = `${pos.count}`;
        for (let i = 0; i < pos.count; i += step) { _still.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); key += `|${Math.round(_still.x * 50)},${Math.round(_still.y * 50)},${Math.round(_still.z * 50)}`; }
        if (motionKey.get(m.uuid) !== key) { motionKey.set(m.uuid, key); lastMoved.set(m.name, clock); }
      });
      if (collapsedAt < 0 && collapsed) collapsedAt = clock;
      // (round 2) a film's cadence: the CPU's renders every `filmS` from `filmFromS` (motion read headless: a pop, a chimney)
      if (filmS > 0 && renderDir && clock + 1e-9 >= nextFilm) {
        nextFilm += filmS;
        // (COT_SLAB_FILM_SPANS=1: the world's own spans alone, as the CPU flattens them — what a hide left standing)
        shoot(`film-${clock.toFixed(2).padStart(6, '0')}`, process.env.COT_SLAB_FILM_SPANS ? [] : drawnMeshes([debris.group, fxGroup, bodies?.group], accept), [],
          !!process.env.COT_SLAB_FILM_SPANS || spansState() !== 'gone');
      }
      if (events.length > lastEventCount) {
        // each new stage or breach: judged once its pieces are laid (0.8 s) and once they have fallen (3 s)
        for (const dt of [0.8, 3.0]) if (!due.some((d) => Math.abs(d - (clock + dt)) < 0.4)) due.push(clock + dt);
        lastEventCount = events.length;
      }
      let atEnd = (collapsedAt >= 0 && clock > collapsedAt + settleS) || (stopAfterRoof && roofDownAt >= 0 && collapsedAt < 0 && clock > roofDownAt + settleS)
        || (tick + 1) * STEP > lastS;
      if (atEnd && (tick + 1) * STEP <= lastS + REST_WAIT_S && (fx?.stats().awake > 0 || fx?.hangingPending() || bodies?.stats().awake > 0)) { atEnd = false; restWaited += STEP; }
      if ((due.length && clock >= due[0]) || atEnd) {
        due.shift();
        if (snapshots.length < maxSnapshots || atEnd) {
          const meshes = drawnMeshes([debris.group, fxGroup, bodies?.group], accept);
          // (COT_SLAB_DUMP=1: every drawn mesh's name, triangles and bounds at each judged snapshot — a diagnosis aid)
          if (process.env.COT_SLAB_DUMP) {
            for (const d of meshes) {
              const s = shapeOf(d.tris);
              log(`  dump t=${clock.toFixed(2)} ${d.name} [${d.material.name}] ${s.tris} tris, min ${s.min.map((v) => v.toFixed(1)).join(',')} max ${s.max.map((v) => v.toFixed(1)).join(',')}`);
            }
            const lists = drawnSpanTriangles(seam.spans, true);
            seam.spans.forEach((span, k) => {
              const t = lists[k];
              if (!t?.length) return;
              const s = shapeOf(t);
              let up = 0, uy0 = Infinity, uy1 = -Infinity;
              for (let o = 0; o + 8 < t.length; o += 9) {
                const ax = t[o + 3] - t[o], ay = t[o + 4] - t[o + 1], az = t[o + 5] - t[o + 2], bx = t[o + 6] - t[o], by = t[o + 7] - t[o + 1], bz = t[o + 8] - t[o + 2];
                const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz);
                if (ny > 0.85 * l) { up += l / 2; const y = (t[o + 1] + t[o + 4] + t[o + 7]) / 3; uy0 = Math.min(uy0, y); uy1 = Math.max(uy1, y); }
              }
              if (up > 20) log(`  dump t=${clock.toFixed(2)} span ${k} level tops ${up.toFixed(0)} m² at y ${uy0.toFixed(2)}..${uy1.toFixed(2)}`);
              log(`  dump t=${clock.toFixed(2)} span ${k} ${span.mesh.name || span.bucket || '?'} piece=${span.piece ?? '-'} class=${span.partClass ?? '-'} ${s.tris}/${Math.floor(span.count / 3)} tris drawn, min ${s.min.map((v) => v.toFixed(1)).join(',')} max ${s.max.map((v) => v.toFixed(1)).join(',')} took=${fx?.took(id) ?? '-'}`);
            });
          }
          const judged = judgeSlabs(meshes, { footprint, groundAt: ground, supportAt, settled: atEnd, ownMaterials, upperFootprint, rested, bandFootprint, drawnTopAt, byDesign,
            floorAt: felled ? null : floorOrLine });
          holdFloors = !felled;
          { const st = spansState(); if (st !== 'moving' && (atEnd || clock - lastEventAt >= HANG_SETTLE_S)) judged.findings.push(...hangingAt(meshes, st === 'drawn', ground)); }
          const last = events[events.length - 1];
          const label = atEnd ? 'final' : `t${clock.toFixed(1)}-${last ? (last.stage ?? (last.storeyDown ? 'storeyDown' : last.hole === 255 ? 'sectionDown' : 'hole')) : 'none'}`;
          const flagged = judged.findings.length > 0;
          const firstFlag = flagged && !snapshots.some((p) => p.findings.length);
          const phase = atEnd ? (felled ? 'settled ruin' : `standing end (${PHASE[reached]})`) : felled ? 'collapse' : PHASE[reached];
          snapshots.push({ t: +clock.toFixed(2), label, phase, events: events.length, meshes: meshes.length, pieces: judged.pieces, findings: judged.findings.map(strip),
            ...(atEnd ? { restWaitedS: +restWaited.toFixed(2), awakeAtEnd: fx?.stats().awake ?? 0 } : {}),
            render: firstFlag || atEnd || (flagged && rendered < 5) ? shoot(label, meshes, judged.findings, spansState() !== 'gone') : null });
          if (!felled && !atEnd && reached !== 'intact') midPoints.set(reached, { t: clock, count: replay.length, records: recordState() });
        }
        if (atEnd) break;
      }
    }
    // a late joiner (a reconnect, a migration): a fresh page lays the log so far down settled (destructionMirror.ts:
    // every stage and breach with `settled: true`) — mid-match at each standing phase's last snapshot, and the whole
    // destroyed set at the end; the live presentation stood back up first (reset() restores the spans it cut)
    if (rejoin) {
      const endRecords = recordState();
      stages.reset(); fx?.reset(); debris.reset(); bodies?.reset?.();
      restoreSpans();
      const points = [...midPoints.entries()].map(([k, p]) => ({ phase: `rejoin mid-match (${PHASE[k]}, t ${p.t.toFixed(1)} s)`, ...p }));
      points.push({ phase: `rejoin destroyed set (${felled ? 'settled ruin' : PHASE[reached]})`, t: clock, count: replay.length, records: endRecords });
      for (const p of points) {
        setRecordState(p.records);
        let rclock = 0;
        const rmounds = [];
        const rground = (x, z) => { let y = ground0(x, z); for (const m of rmounds) y += rubbleMoundHeightAt(m, x, z); return y; };
        const renv = { groundAt: (x, z) => rground(x, z), queryStatic: query, isSolid: (r) => !r.crushed && !r.dead };
        const rmask = createStructureMask(4096, { holes: true });
        const rbodies = rubbleMod ? rubbleMod.createRubbleBodies({ now: () => rclock, environment: () => renv, capacity: rubbleMod.RUBBLE_BODY_CAPACITY,
          materialFor: (bucket) => worldMaterials.get(bucket) ?? null }) : null;
        const rdebris = debrisMod.createStructureDebris({ now: () => rclock, groundY: rground, baseGroundY: ground0, poolCapacity: 256, pieceCap: 1024, bodies: rbodies });
        const rgroup = new THREE.Group();
        const rfx = fractureMod ? fractureMod.createFractureStages({ group: rgroup, now: () => rclock, environment: () => renv, groundAt: rground,
          materialFor: (bucket) => worldMaterials.get(bucket) ?? null, ...phoneStages }) : null;
        const rstages = createStructureStages({ mask: rmask, debris: rdebris, now: () => rclock, materialFor: (bucket) => worldMaterials.get(bucket) ?? null,
          scars: null, crumble: 1, ...(rfx ? { fracture: rfx.attach } : {}) });
        let rfelled = false;
        for (let k = 0; k < p.count; k++) {
          const { type, e: e0 } = replay[k];
          const e = { ...e0, settled: true };
          if (type === DESTRUCTION_BUS_EVENTS.stage && e.stage === 'collapsed') {
            const st = table.byId(e.structureId);
            if (st) rmounds.push({ cx: st.cx, cz: st.cz, hw: st.hw, hd: st.hd, yaw: st.yaw, heightM: rubbleHeightFor(st.topY - st.baseY) });
            if (e.structureId === id) rfelled = true;
          }
          if (type === DESTRUCTION_BUS_EVENTS.stage) rstages.stage(e, seamOf(e.structureId));
          else if (type === DESTRUCTION_BUS_EVENTS.breach) { rstages.breach(e, seamOf(e.structureId)); rfx?.breach(e); }
        }
        // the page's first frames (what it laid settles where it lands)
        // (and its hanging sweeps' end, and 1.5 s for what they took down to land: they run in steps a frame, a big building's
        // intact reading first — a late joiner's page reads every building it lays; at most 15 s)
        for (let k = 0, quiet = -1; k < 900; k++) {
          rclock += STEP; rstages.update(); rfx?.update(); rdebris.update(); rbodies?.update();
          if (rfx?.hangingPending?.()) quiet = -1; else if (quiet < 0) quiet = k;
          if (k >= 149 && quiet >= 0 && k >= quiet + 90) break;
        }
        const rgone = rfelled ? new Set(rdebris.standingRuns(runTag)) : null;
        const raccept = (m) => (m.parent === rgroup ? own.test(m.name)
          : m.parent === rdebris.group ? !rgone?.has(m) && ownRun(m) : true);
        const meshes = drawnMeshes([rdebris.group, rgroup, rbodies?.group], raccept);
        const judged = judgeSlabs(meshes, { footprint, groundAt: rground, supportAt, settled: true, ownMaterials, upperFootprint, bandFootprint, drawnTopAt, byDesign,
          floorAt: rfelled ? null : floorOrLine });
        // (a settled collapse is gone at once: the mask folds it, the fracture drops its spans)
        holdFloors = !rfelled;
        judged.findings.push(...hangingAt(meshes, !rfelled, rground));
        if (process.env.COT_SLAB_DUMP) {
          const lists = drawnSpanTriangles(seam.spans, true);
          seam.spans.forEach((span, k) => { const t = lists[k]; if (!t?.length) return; const sh = shapeOf(t);
            log(`  rdump ${p.phase} span ${k} ${span.mesh.name} piece=${span.piece ?? "-"} class=${span.partClass} ${sh.tris}/${Math.floor(span.count / 3)} min ${sh.min.map((v) => v.toFixed(1))} max ${sh.max.map((v) => v.toFixed(1))}`); });
          for (const d of meshes) { const sh = shapeOf(d.tris); log(`  rdump ${p.phase} ${d.name} ${sh.tris} min ${sh.min.map((v) => v.toFixed(1))} max ${sh.max.map((v) => v.toFixed(1))}`); }
        }
        const flagged = judged.findings.length > 0;
        const label = `rejoin-${p.phase.startsWith('rejoin mid') ? 'mid' : 'end'}-${snapshots.length}`;
        snapshots.push({ t: +p.t.toFixed(2), label, phase: p.phase, events: p.count, meshes: meshes.length, pieces: judged.pieces,
          findings: judged.findings.map(strip),
          render: flagged || !p.phase.startsWith('rejoin mid') ? shoot(label, meshes, judged.findings, !rfelled, rground) : null });
        rstages.reset(); rfx?.reset(); rdebris.reset(); rbodies?.reset?.();
        restoreSpans();
      }
      setRecordState(endRecords);
    }
    const flaggedSnaps = snapshots.filter((p) => p.findings.length);
    const row = {
      fingerprint: fp,
      id, face: runFace, seed: faceSeed, builder: seam.builder, kit: a.kit, style: seam.style, anatomy: { w: +a.w.toFixed(2), d: +a.d.toFixed(2), h: +a.h.toFixed(2), storeys: a.storeys.length,
        floors: a.storeys.filter((st) => st.floor).length, roof: a.roof?.kind ?? null }, fired, collapsedAtS: +collapsedAt.toFixed(2),
      staging: { placement: { x: +a.placement.x.toFixed(2), y: +a.placement.y.toFixed(2), z: +a.placement.z.toFixed(2), yaw: +a.placement.yaw.toFixed(4) },
        dir: [+(-nx).toFixed(4), +(-nz).toFixed(4)], mid: mid.map((v) => +v.toFixed(2)), eye: eye.map((v) => +v.toFixed(2)),
        eyeLow: eyeLow.map((v) => +v.toFixed(2)), strikes },
      events, spanIssues, snapshots, pass: !flaggedSnaps.length && !spanIssues.length,
      worst: flaggedSnaps.flatMap((p) => p.findings.map((f) => ({ t: p.t, label: p.label, phase: p.phase, ...f }))).sort((p, q) => q.areaM2 - p.areaM2).slice(0, 12),
      phases: snapshots.reduce((acc, p) => {
        const k = p.phase.replace(/ \(.*$/, '').replace(/^rejoin mid-match$/, 'rejoin mid-match');
        const e = acc[k] ?? (acc[k] = { snapshots: 0, flagged: 0 });
        e.snapshots++; if (p.findings.length) e.flagged++;
        return acc;
      }, {}),
    };
    rows.push(row);
    log(`#${id} ${seam.builder}${faceName === 'wide' ? '' : ` (${faceName})`}: ${row.pass ? 'PASS' : `FAIL (${flaggedSnaps.length} of ${snapshots.length} snapshots flag stray slabs; ${spanIssues.length} span issues)`}`);
  }
  return { mapId, sections, fracture, pass: rows.every((r) => r.pass), buildings: rows.length, skipped: [...skipped.values()], rows };
}

/** Each face's default seed (the wide face's rounds are the receipt's own; the others the critic's variant stagings). */
/** How long past its end a run waits for the building's bodies to rest before its last look (round 4). */
const REST_WAIT_S = 20;
const FACE_SEEDS = Object.freeze({ wide: 0, 'wide-back': 3, narrow: 5, 'narrow-back': 7 });

function strip(f) { const { _tris, ...rest } = f; void _tris; return rest; }

/** A drawn mesh's flat colour for the render: the material's tint × its mean vertex tint; untextured pieces bluer. */
function tintOf(m) {
  const vt = m.vertexTint ?? [1, 1, 1], c = m.material.color;
  const t = [c[0] * (m.material.vertexColors ? vt[0] : 1), c[1] * (m.material.vertexColors ? vt[1] : 1), c[2] * (m.material.vertexColors ? vt[2] : 1)];
  const g = (x) => Math.pow(Math.max(0, Math.min(1, x)), 1 / 2.2);
  return t.map(g);
}

/** The spans' triangles as drawn now (world space; a flattened triangle left out; `aligned`: one list per span, empty ones
 *  kept). */
function drawnSpanTriangles(spans, aligned = false) {
  const lists = [];
  const v = new THREE.Vector3();
  for (const span of spans) {
    span.mesh.updateMatrixWorld?.(true);
    const e = span.mesh.matrixWorld;
    const tris = [];
    for (let k = span.first; k + 2 < span.first + span.count; k += 3) {
      const p = [];
      for (let j = 0; j < 3; j++) { v.fromBufferAttribute(span.position, k + j).applyMatrix4(e); p.push(v.x, v.y, v.z); }
      const ux = p[3] - p[0], uy = p[4] - p[1], uz = p[5] - p[2], wx = p[6] - p[0], wy = p[7] - p[1], wz = p[8] - p[2];
      if (Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) < 1e-8) continue;
      tris.push(...p);
    }
    if (tris.length || aligned) lists.push(Float32Array.from(tris));
  }
  return lists;
}

/** The spans' triangles every one, as built or as drawn now (world space; a hidden one collapsed where it was): one
 *  list a span, aligned with its triangles (the hanging judge's identity). */
function spanTrianglesAll(spans) {
  const v = new THREE.Vector3();
  return spans.map((span) => {
    span.mesh.updateMatrixWorld?.(true);
    const e = span.mesh.matrixWorld;
    const n = Math.floor(span.count / 3);
    const out = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) for (let j = 0; j < 3; j++) {
      v.fromBufferAttribute(span.position, span.first + t * 3 + j).applyMatrix4(e);
      out[t * 9 + j * 3] = v.x; out[t * 9 + j * 3 + 1] = v.y; out[t * 9 + j * 3 + 2] = v.z;
    }
    return out;
  });
}

/** The presentation's meshes that stand where they were laid (the hanging check judges them, and they hold only once held
 *  themselves): a ruin's remnants, rims and stubs, a storey's room, a collapse's remnant, the fracture's redrawn faces and
 *  rooms (its heaps and a collapse's baked rests are debris lying where it fell: they hold, the slab check judges them). */
const STANDING_MESH = /^fx-(structure-(rim|remnant|stub|room)|fracture-(face|room)|collapse-remnant)-/;

/** A hanging judge's finding in the slab check's row format. */
function hangingFinding(h) {
  const area = h.extentsM.slice().sort((p, q) => q - p);
  return {
    mesh: h.mesh, sheet: false, material: '', map: null, tint: [0, 0, 0], slab: false, orientation: 'hanging', extentsM: h.extentsM,
    areaM2: +(area[0] * area[1]).toFixed(1), centre: h.centre, liftM: h.liftM, outsideShare: 0, outsideM2: 0, floatingShare: 0,
    triangles: h.tris.length / 9, reasons: [h.reason], attributes: [], _tris: h.tris,
  };
}

/** A square of the ground as drawn round (cx, cz), `cell` m quads. */
function groundPatch(groundAt, cx, cz, half, cell) {
  const tris = [];
  for (let x = cx - half; x < cx + half; x += cell) for (let z = cz - half; z < cz + half; z += cell) {
    const a = [x, groundAt(x, z) - 0.02, z], b = [x + cell, groundAt(x + cell, z) - 0.02, z];
    const c = [x + cell, groundAt(x + cell, z + cell) - 0.02, z + cell], d = [x, groundAt(x, z + cell) - 0.02, z + cell];
    tris.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return Float32Array.from(tris);
}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  const report = await runSlabCheck({
    mapId: args.map ?? 'verdant',
    ids: typeof args.ids === 'string' ? args.ids.split(',').map(Number) : null,
    builders: typeof args.builders === 'string' ? args.builders.split(',') : null,
    perBuilder: Number(args['per-builder'] ?? 1), rounds: Number(args.rounds ?? 40), roundGapS: Number(args.gap ?? 0.45),
    settleS: Number(args.settle ?? 10), sections: args.sections !== '0', fracture: args.fracture === 'phone' ? 'phone' : args.fracture !== '0',
    stopAfterRoof: args['stop-after'] === 'roof', upper: args.upper !== '0',
    renderDir: typeof args.render === 'string' ? args.render : null, maxSnapshots: Number(args['max-snapshots'] ?? 40), rejoin: args.rejoin !== '0',
    storeys: typeof args.storeys === 'string' ? args.storeys.split(',').map(Number) : [0],
    faces: typeof args.faces === 'string' ? args.faces.split(',') : ['wide'], seed: args.seed !== undefined ? Number(args.seed) : null,
    filmS: Number(args.film ?? 0), filmFromS: Number(args['film-from'] ?? 0),
    log: (...m) => console.log('[slab-check]', ...m),
  });
  if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify(report, null, 1));
  for (const r of report.rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} #${r.id} ${r.builder}${r.face === 'wide' ? '' : ` [${r.face}]`} (${r.kit}; ${r.anatomy.w} x ${r.anatomy.d} x ${r.anatomy.h} m, ${r.anatomy.storeys} storeys, ${r.anatomy.floors} floors):`
      + ` ${r.fired} rounds, ${r.events.length} events, ${r.collapsedAtS >= 0 ? `collapsed at ${r.collapsedAtS} s` : 'standing'}`);
    for (const p of r.snapshots) if (p.findings.length) {
      console.log(`  t=${p.t}s ${p.label} [${p.phase}]: ${p.findings.length} stray slab(s)${p.render ? ` -> ${p.render}` : ''}`);
      for (const f of p.findings.slice(0, 8)) console.log(`    ${f.mesh} [${f.material}] ${f.orientation} ${f.extentsM.join(' x ')} m at ${f.centre.join(', ')} (lift ${f.liftM} m): ${f.reasons.join('; ')}${f.attributes.length ? ` (${f.attributes.join(', ')})` : ''}`);
    }
    for (const s of r.spanIssues) console.log(`  span: ${s}`);
  }
  console.log(`destruction-slab-check ${report.mapId} (sections ${report.sections ? 'on' : 'off'}, fracture ${report.fracture === 'phone' ? 'as the phone' : report.fracture ? 'on' : 'off'}): ${report.pass ? 'PASS' : 'FAIL'} (${report.buildings} buildings)`);
  process.exit(report.pass ? 0 : 1);
}
