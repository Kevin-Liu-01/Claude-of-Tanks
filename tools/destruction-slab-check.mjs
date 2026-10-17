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
 *        [--gap=0.45] [--settle=10] [--sections=1] [--fracture=1] [--storeys=0,1] [--render=<dir>] [--json=<out>]
 *        [--max-snapshots=40]
 * (--storeys: the anatomy storeys whose widest face the rounds cycle through; the ground storey by default)
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
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorldBuildFixture } from './headlessWorldCollision.mjs';

const STEP = 1 / 60;

// ------------------------------------------------------------------------------------------------ the slab judgement

/** The thresholds of a stray slab (exported for the receipt). */
export const SLAB = {
  thickMaxM: 0.6, thickShare: 0.12, sideMinM: 2.0, areaMinM2: 8,
  elevatedM: 1.0, outsideShare: 0.1, outsideAreaM2: 3, floatingShare: 0.4, supportBandM: 0.8, darkLuma: 0.16, footprintGrowM: 0.3,
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
 * A mesh's drawn triangles in world space, split into connected pieces (vertices welded at 1 mm): for each piece its
 * triangle list (flat xyz × 3 per triangle) — degenerate triangles (a span flattened out of its bucket) left out.
 */
function piecesOfTriangles(tris) {
  const n = tris.length / 9;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const o = t * 9 + k * 3;
    const key = `${Math.round(tris[o] * 1000)},${Math.round(tris[o + 1] * 1000)},${Math.round(tris[o + 2] * 1000)}`;
    const prev = owner.get(key);
    if (prev === undefined) owner.set(key, t);
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

const vkey = (tris, o) => `${Math.round(tris[o] * 1000)},${Math.round(tris[o + 1] * 1000)},${Math.round(tris[o + 2] * 1000)}`;

/** Whether a piece has a boundary (an edge only one of its triangles uses). */
function isOpen(tris) {
  const uses = new Map();
  for (let o = 0; o + 8 < tris.length; o += 9) {
    const k = [vkey(tris, o), vkey(tris, o + 3), vkey(tris, o + 6)];
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3], key = a < b ? `${a}|${b}` : `${b}|${a}`;
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
  const edgeOwner = new Map();
  for (let t = 0; t < n; t++) {
    const o = t * 9, k = [vkey(tris, o), vkey(tris, o + 3), vkey(tris, o + 6)];
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3], key = a < b ? `${a}|${b}` : `${b}|${a}`;
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
  // close: every cell the outside cannot reach is inside (a court, a roofless room)
  const outside = new Uint8Array(nx * nz);
  const stack = [];
  for (let i = 0; i < nx; i++) { stack.push(i, (nz - 1) * nx + i); }
  for (let k = 0; k < nz; k++) { stack.push(k * nx, k * nx + nx - 1); }
  while (stack.length) {
    const c = stack.pop();
    if (outside[c] || grid[c]) continue;
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
export function judgeSlabs(meshes, { footprint, groundAt, supportAt = () => false, settled = true, ownMaterials = null }) {
  const pieces = [];
  let gid = 0;
  for (const d of meshes) for (const tris of piecesOfTriangles(d.tris)) {
    const shape = shapeOf(tris);
    gid++;
    // an open piece that is no slab as a whole (a room's four walls, an open shell) is judged sheet by sheet: its planar
    // facets; a closed one (a box, a block) keeps its thickness
    if (!isSlab(shape) && isOpen(tris)) {
      for (const sheet of planarFacets(tris)) { const sh = shapeOf(sheet); if (isSlab(sh)) pieces.push({ d, tris: sheet, shape: sh, sheet: true, gid }); }
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
    const slab = isSlab(s) && (settled || !IN_FLIGHT.test(p.d.name));
    if (!slab && !reasons.length) return;
    const groundC = groundAt(s.centre[0], s.centre[2]);
    const lift = s.min[1] - groundC;
    const elevated = lift >= SLAB.elevatedM;
    surfaceSamples(p.tris, samples);
    const ns = samples.length / 4;
    let total = 0, outside = 0, unsupported = 0, weighed = 0;
    for (let i = 0; i < ns; i++) {
      const x = samples[i * 4], z = samples[i * 4 + 1], y = samples[i * 4 + 2], w = samples[i * 4 + 3];
      total += w;
      if (!footprint.has(x, z)) outside += w;
      if (!elevated) continue;
      weighed += w;
      // under it: the ground, a live record, another drawn piece's box top within the band
      const below = y - SLAB.supportBandM;
      if (groundAt(x, z) >= below) continue;
      if (supportAt(x, z, y)) continue;
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
      if ((elevated || vertical) && outsideShare >= SLAB.outsideShare && outside >= SLAB.outsideAreaM2) {
        reasons.push(`outside: ${outside.toFixed(1)} m² (${(outsideShare * 100).toFixed(0)} %) past the intact walls, ${lift.toFixed(1)} m up`);
      }
      if (elevated && floatingShare >= SLAB.floatingShare) reasons.push(`floating: ${(floatingShare * 100).toFixed(0)} % of it unsupported, ${lift.toFixed(1)} m up`);
      // (census9b) a piece drawn in one of the intact building's own materials is no stranger to it, mapped or not (a
      // glazed or painted bucket without a texture): listed, not flagged
      if ((m.fallback || !m.map) && !m.fallback && ownMaterials?.has(p.d.raw)) attributes.push(`unmapped like the intact building (${m.name || 'unnamed'})`);
      else if (m.fallback || !m.map) reasons.push(`untextured: ${m.name || '(unnamed material)'}`);
      if (L < SLAB.darkLuma) attributes.push(`dark (tint luminance ${L.toFixed(3)})`);
    }
    if (!reasons.length) return;
    const horizontal = Math.abs(s.axes[2][1]) > 0.8;
    findings.push({
      mesh: p.d.name, sheet: !!p.sheet, material: m.name, map: m.map, tint: tint.map((c) => +c.toFixed(3)), slab,
      orientation: horizontal ? 'horizontal' : vertical ? 'vertical' : 'tilted',
      extentsM: s.ext.map((e) => +e.toFixed(2)), areaM2: +(s.ext[0] * s.ext[1]).toFixed(1),
      centre: s.centre.map((c) => +c.toFixed(2)), liftM: +lift.toFixed(2), outsideShare: +outsideShare.toFixed(2),
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
  return { pieces: pieces.length, findings };
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
  mapId = 'verdant', ids = null, builders = null, perBuilder = 1, rounds = 40, roundGapS = 0.45, settleS = 10,
  sections = true, fracture = true, renderDir = null, maxSnapshots = 40, storeys = [0], log = () => {}, rejoin = true,
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
  const { createStudioDestruction } = await import('../src/game/studioDestruction.ts');
  const { matchRulesetFor } = await import('../src/sim/matchRuleset.ts');
  const { DESTRUCTION_BUS_EVENTS } = await import('../src/sim/destructionEvents.ts');
  const { createStructureDamageSeam } = await import('../src/world/structureDamageSeam.ts');
  const { createStructureDamage } = await import('../src/sim/structureDamage.ts');
  const { rubbleHeightFor, rubbleMoundHeightAt } = await import('../src/sim/terrainDeformation.ts');
  const { createObstacleGrid, shellPassesThroughCollisionRecord } = await import('../src/world/collision.ts');
  const { munitionClassForShell, munitionChargeKg } = await import('../src/sim/munitionBlast.ts');
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
  for (const id of picks) {
    const seam = seamOf(id);
    const a = seam.anatomy;
    for (const r of [...built.obstacles, ...built.colliders]) { r.crushed = false; r.dead = false; r.openings = null; }
    restoreSpans();
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
    const mask = createStructureMask(4096, { holes: true });
    const env = { groundAt: (x, z) => ground(x, z), queryStatic: query, isSolid: (r) => !r.crushed && !r.dead };
    const bodies = rubbleMod ? rubbleMod.createRubbleBodies({ now: () => clock, environment: () => env, capacity: rubbleMod.RUBBLE_BODY_CAPACITY,
      materialFor: (bucket) => worldMaterials.get(bucket) ?? null }) : null;
    const debris = debrisMod.createStructureDebris({ now: () => clock, groundY: ground, baseGroundY: ground0, poolCapacity: 256, pieceCap: 1024, bodies });
    const fxGroup = new THREE.Group();
    const fx = fractureMod ? fractureMod.createFractureStages({ group: fxGroup, now: () => clock, environment: () => env, groundAt: ground,
      materialFor: (bucket) => worldMaterials.get(bucket) ?? null }) : null;
    const stages = createStructureStages({ mask, debris, now: () => clock, materialFor: (bucket) => worldMaterials.get(bucket) ?? null,
      scars: null, crumble: 1, ...(fx ? { fracture: fx.attach } : {}) });
    const events = [];
    let collapsed = false;
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
      if (e?.structureId === id) {
        events.push({ t: +clock.toFixed(3), type, stage: e.stage ?? null, hole: e.hole ?? null, storeyDown: !!e.storeyDown,
          y: e.y !== undefined ? +(+e.y).toFixed(2) : null });
      }
      if (type === DESTRUCTION_BUS_EVENTS.stage && e.stage === 'collapsed') {
        const st = table.byId(e.structureId);
        if (st) mounds.push({ cx: st.cx, cz: st.cz, hw: st.hw, hd: st.hd, yaw: st.yaw, heightM: rubbleHeightFor(st.topY - st.baseY) });
        if (e.structureId === id) collapsed = true;
      }
      if (type === DESTRUCTION_BUS_EVENTS.stage) stages.stage(e, seamOf(e.structureId));
      else if (type === DESTRUCTION_BUS_EVENTS.breach) { stages.breach(e, seamOf(e.structureId)); fx?.breach(e); }
    } };
    const sd = createStudioDestruction({ getObstacles: () => built.obstacles, getColliders: () => built.colliders }, bus,
      { rules: matchRulesetFor('standard').destruction, sections });
    const st0 = a.storeys[0];
    const face = [...st0.faces].sort((p, q) => q.width - p.width)[0];
    // the struck storeys' faces on the same side (the round's height cycles through them)
    const faceSide = st0.faces.indexOf(face);
    const struckFaces = storeys.map((k) => a.storeys[Math.min(k, a.storeys.length - 1)]?.faces[faceSide] ?? face);
    const c = Math.cos(a.placement.yaw), s = Math.sin(a.placement.yaw);
    const toWorld = (bx, by, bz) => [a.placement.x + bx * c + bz * s, a.placement.y + by, a.placement.z - bx * s + bz * c];
    const nx = face.out[0] * c + face.out[2] * s, nz = -face.out[0] * s + face.out[2] * c;
    const offs = [0, -0.42, 0.38, -0.18, 0.24, -0.33, 0.1, 0.45, -0.45, 0.05, 0.3, -0.25, 0.15, -0.1];
    const ys = [0.35, 0.6, 0.45, 0.75, 0.3, 0.65, 0.5, 0.85, 0.4, 0.55, 0.7, 0.35, 0.6, 0.5];
    const spec = { name: 'check', type: 'HE', caliberMm: 125, velocityMps: 850 };
    const munition = munitionClassForShell(spec), chargeKg = munitionChargeKg(spec, munition);
    const record = shellRecord.get(id);
    // the building's own drawn meshes: the fx group's for this structure, its stage runs, the rubble bodies
    const own = new RegExp(`-${id}(-|$)`);
    const accept = (m) => (m.parent === fxGroup ? own.test(m.name) || /^fx-collapse-(?!baked)/.test(m.name) : true);
    const supportAt = (x, z, y) => query(x - 0.3, z - 0.3, x + 0.3, z + 0.3, queryOut)
      .some((rr) => !rr.crushed && !rr.dead && rr.max[1] >= y - SLAB.supportBandM && rr.min[1] <= y + 0.05
        && x >= rr.min[0] - 0.3 && x <= rr.max[0] + 0.3 && z >= rr.min[2] - 0.3 && z <= rr.max[2] + 0.3);
    // the camera: off the struck face, up and back, the building's middle in view
    const mid = toWorld(0, Math.min(a.h * 0.35, 9), 0);
    const reach = Math.max(a.w, a.d) * 1.25 + 10;
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
      const base = path.join(renderDir, `${mapId}-s${id}-${String(rendered++).padStart(2, '0')}-${label}`);
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
      const judged = judgeSlabs(meshes, { footprint, groundAt: ground, supportAt, ownMaterials });
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
      const meshes = drawnMeshes([debris.group, fxGroup, bodies?.group], accept);
      const judged = judgeSlabs(meshes, { footprint, groundAt: ground, supportAt, settled: false, ownMaterials });
      const flagged = judged.findings.length > 0;
      const firstFlag = flagged && !snapshots.some((p) => p.findings.length);
      const tag = `t${clock.toFixed(1)}-${label}`;
      snapshots.push({ t: +clock.toFixed(2), label: tag, phase: PHASE[reached], events: events.length, meshes: meshes.length, pieces: judged.pieces,
        findings: judged.findings.map(strip), render: firstFlag || (flagged && rendered < 5) ? shoot(tag, meshes, judged.findings, true) : null });
      midPoints.set(reached, { t: clock, count: replay.length, records: recordState() });
    }
    const due = [];
    let lastEventCount = 0, fired = 0, collapsedAt = -1;
    const lastS = rounds * roundGapS + settleS + 4;
    for (let tick = 0; tick * STEP <= lastS; tick++) {
      clock = tick * STEP;
      if (collapsedAt < 0 && fired < rounds && clock >= 0.3 + fired * roundGapS) {
        const sf = struckFaces[fired % struckFaces.length];
        const uu = offs[fired % offs.length] * sf.width * 0.8;
        const y = sf.origin[1] + Math.max(0.6, Math.min(sf.height - 0.6, ys[fired % ys.length] * sf.height));
        const [hx, hy, hz] = toWorld(sf.origin[0] + sf.u[0] * uu, y, sf.origin[2] + sf.u[2] * uu);
        strikes.push([+hx.toFixed(2), +hy.toFixed(2), +hz.toFixed(2), +clock.toFixed(2)]);
        sd.strike(spec, record, hx, hy, hz, -nx, -nz);
        stages.strike(id, seam, hx, hy, hz, -nx, -nz, munition, chargeKg, spec.caliberMm);
        fired++;
      }
      sd.step();
      stages.update();
      fx?.update();
      debris.update();
      bodies?.update();
      if (collapsedAt < 0 && collapsed) collapsedAt = clock;
      if (events.length > lastEventCount) {
        // each new stage or breach: judged once its pieces are laid (0.8 s) and once they have fallen (3 s)
        for (const dt of [0.8, 3.0]) if (!due.some((d) => Math.abs(d - (clock + dt)) < 0.4)) due.push(clock + dt);
        lastEventCount = events.length;
      }
      const atEnd = (collapsedAt >= 0 && clock > collapsedAt + settleS) || (tick + 1) * STEP > lastS;
      if ((due.length && clock >= due[0]) || atEnd) {
        due.shift();
        if (snapshots.length < maxSnapshots || atEnd) {
          const meshes = drawnMeshes([debris.group, fxGroup, bodies?.group], accept);
          const judged = judgeSlabs(meshes, { footprint, groundAt: ground, supportAt, settled: atEnd, ownMaterials });
          const last = events[events.length - 1];
          const label = atEnd ? 'final' : `t${clock.toFixed(1)}-${last ? (last.stage ?? (last.storeyDown ? 'storeyDown' : last.hole === 255 ? 'sectionDown' : 'hole')) : 'none'}`;
          const flagged = judged.findings.length > 0;
          const firstFlag = flagged && !snapshots.some((p) => p.findings.length);
          const phase = atEnd ? (felled ? 'settled ruin' : `standing end (${PHASE[reached]})`) : felled ? 'collapse' : PHASE[reached];
          snapshots.push({ t: +clock.toFixed(2), label, phase, events: events.length, meshes: meshes.length, pieces: judged.pieces, findings: judged.findings.map(strip),
            render: firstFlag || atEnd || (flagged && rendered < 5) ? shoot(label, meshes, judged.findings, !collapsed || !fx?.took(id)) : null });
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
          materialFor: (bucket) => worldMaterials.get(bucket) ?? null }) : null;
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
        for (let k = 0; k < 150; k++) { rclock += STEP; rstages.update(); rfx?.update(); rdebris.update(); rbodies?.update(); }
        const raccept = (m) => (m.parent === rgroup ? own.test(m.name) || /^fx-collapse-(?!baked)/.test(m.name) : true);
        const meshes = drawnMeshes([rdebris.group, rgroup, rbodies?.group], raccept);
        const judged = judgeSlabs(meshes, { footprint, groundAt: rground, supportAt, settled: true, ownMaterials });
        const flagged = judged.findings.length > 0;
        const label = `rejoin-${p.phase.startsWith('rejoin mid') ? 'mid' : 'end'}-${snapshots.length}`;
        snapshots.push({ t: +p.t.toFixed(2), label, phase: p.phase, events: p.count, meshes: meshes.length, pieces: judged.pieces,
          findings: judged.findings.map(strip),
          render: flagged || !p.phase.startsWith('rejoin mid') ? shoot(label, meshes, judged.findings, !rfelled || !rfx?.took(id), rground) : null });
        rstages.reset(); rfx?.reset(); rdebris.reset(); rbodies?.reset?.();
        restoreSpans();
      }
      setRecordState(endRecords);
    }
    const flaggedSnaps = snapshots.filter((p) => p.findings.length);
    const row = {
      id, builder: seam.builder, kit: a.kit, style: seam.style, anatomy: { w: +a.w.toFixed(2), d: +a.d.toFixed(2), h: +a.h.toFixed(2), storeys: a.storeys.length,
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
    log(`#${id} ${seam.builder}: ${row.pass ? 'PASS' : `FAIL (${flaggedSnaps.length} of ${snapshots.length} snapshots flag stray slabs; ${spanIssues.length} span issues)`}`);
  }
  return { mapId, sections, fracture, pass: rows.every((r) => r.pass), buildings: rows.length, skipped: [...skipped.values()], rows };
}

function strip(f) { const { _tris, ...rest } = f; void _tris; return rest; }

/** A drawn mesh's flat colour for the render: the material's tint × its mean vertex tint; untextured pieces bluer. */
function tintOf(m) {
  const vt = m.vertexTint ?? [1, 1, 1], c = m.material.color;
  const t = [c[0] * (m.material.vertexColors ? vt[0] : 1), c[1] * (m.material.vertexColors ? vt[1] : 1), c[2] * (m.material.vertexColors ? vt[2] : 1)];
  const g = (x) => Math.pow(Math.max(0, Math.min(1, x)), 1 / 2.2);
  return t.map(g);
}

/** The spans' triangles as drawn now (world space; a flattened triangle left out). */
function drawnSpanTriangles(spans) {
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
    if (tris.length) lists.push(Float32Array.from(tris));
  }
  return lists;
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
    settleS: Number(args.settle ?? 10), sections: args.sections !== '0', fracture: args.fracture !== '0',
    renderDir: typeof args.render === 'string' ? args.render : null, maxSnapshots: Number(args['max-snapshots'] ?? 40), rejoin: args.rejoin !== '0',
    storeys: typeof args.storeys === 'string' ? args.storeys.split(',').map(Number) : [0],
    log: (...m) => console.log('[slab-check]', ...m),
  });
  if (typeof args.json === 'string') writeFileSync(args.json, JSON.stringify(report, null, 1));
  for (const r of report.rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} #${r.id} ${r.builder} (${r.kit}; ${r.anatomy.w} x ${r.anatomy.d} x ${r.anatomy.h} m, ${r.anatomy.storeys} storeys, ${r.anatomy.floors} floors):`
      + ` ${r.fired} rounds, ${r.events.length} events, ${r.collapsedAtS >= 0 ? `collapsed at ${r.collapsedAtS} s` : 'standing'}`);
    for (const p of r.snapshots) if (p.findings.length) {
      console.log(`  t=${p.t}s ${p.label} [${p.phase}]: ${p.findings.length} stray slab(s)${p.render ? ` -> ${p.render}` : ''}`);
      for (const f of p.findings.slice(0, 8)) console.log(`    ${f.mesh} [${f.material}] ${f.orientation} ${f.extentsM.join(' x ')} m at ${f.centre.join(', ')} (lift ${f.liftM} m): ${f.reasons.join('; ')}${f.attributes.length ? ` (${f.attributes.join(', ')})` : ''}`);
    }
    for (const s of r.spanIssues) console.log(`  span: ${s}`);
  }
  console.log(`destruction-slab-check ${report.mapId} (sections ${report.sections ? 'on' : 'off'}, fracture ${report.fracture ? 'on' : 'off'}): ${report.pass ? 'PASS' : 'FAIL'} (${report.buildings} buildings)`);
  process.exit(report.pass ? 0 : 1);
}
