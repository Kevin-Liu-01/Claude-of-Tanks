#!/usr/bin/env node
// glb-island-probe.mjs — "can this mesh be rigged as a tank?" probe (EXPLORATION r1).
//
// The modelLoader.js contract needs an identifiable turret node (+ gun node)
// to re-parent into TurretPivot/GunPivot. AI-generated GLBs (Meshy, Tripo,
// Hunyuan) arrive with no meaningful node names, so separability lives at the
// GEOMETRY level: either the generator emitted separate connected components
// (meshy-t2 "natively separated parts" = unnamed islands), or the mesh is one
// fused blob and needs cutting. This probe answers which, without a browser:
//
//   1. parses the GLB container directly (JSON+BIN chunks, positions/indices/
//      node transforms only — no three.js, no textures, no network),
//   2. welds vertices by quantized position (UV/normal seams duplicate verts;
//      welding stops fake island splits), union-finds triangle islands,
//   3. reports every island ≥ --min-tris with world bbox/dims/centroid, and
//      flags tank-part candidates by shape heuristics (glTF is Y-up):
//        TURRET? sits in the upper half, footprint ≲60% of total, near center
//        GUN?    long thin horizontal prism (length ≥ 3× the other dims)
//
// A model "passes" for our pipeline when a turret-like island and gun-like
// island exist (or the whole top is one island that a single ring-plane cut
// can free). One fused island = expect real segmentation work (see
// docs/research/genai-asset-pipelines.md for the options).
//
// Not handled (detected + reported, never silently wrong): Draco-compressed
// primitives (the roster GLBs are uncompressed — modelLoader registers no
// DRACOLoader), sparse accessors, skinned bind-pose transforms (islands still
// report, bboxes may sit at bind pose).
//
// Usage:
//   node tools/glb-island-probe.mjs <file.glb> [--min-tris 50] [--weld 1e-4] [--json out.json]

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const MIN_TRIS = Number(opt('min-tris', 50));
const WELD = Number(opt('weld', 1e-4));
const JSON_OUT = opt('json', null);
if (!file) {
  console.error('usage: node tools/glb-island-probe.mjs <file.glb> [--min-tris n] [--weld eps] [--json out.json]');
  process.exit(1);
}

// --- GLB container ----------------------------------------------------------
const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
let off = 12;
let gltf = null;
let bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  const chunk = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString('utf8'));
  else if (type === 0x004e4942) bin = chunk;
  off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
}
if (!gltf || !bin) throw new Error('GLB missing JSON or BIN chunk');

const COMP = {
  5120: { T: Int8Array, n: 1 }, 5121: { T: Uint8Array, n: 1 },
  5122: { T: Int16Array, n: 2 }, 5123: { T: Uint16Array, n: 2 },
  5125: { T: Uint32Array, n: 4 }, 5126: { T: Float32Array, n: 4 },
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(idx) {
  const acc = gltf.accessors[idx];
  if (acc.sparse) throw new Error(`accessor ${idx}: sparse not supported`);
  const bv = gltf.bufferViews[acc.bufferView];
  const { T, n } = COMP[acc.componentType];
  const ncomp = NCOMP[acc.type];
  const stride = bv.byteStride || ncomp * n;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new (acc.componentType === 5126 ? Float32Array : Uint32Array)(acc.count * ncomp);
  for (let i = 0; i < acc.count; i++) {
    const p = base + i * stride;
    const view = new T(bin.buffer, bin.byteOffset + p, ncomp);
    for (let c = 0; c < ncomp; c++) out[i * ncomp + c] = view[c];
  }
  return { data: out, count: acc.count, ncomp };
}

// --- node world transforms ---------------------------------------------------
function matMul(a, b) { // column-major 4x4
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function nodeLocal(n) {
  if (n.matrix) return Float64Array.from(n.matrix);
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return Float64Array.from([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}
const IDENT = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const meshInstances = []; // { meshIdx, world, name }
(function walk(nodeIdxs, parent) {
  for (const ni of nodeIdxs || []) {
    const n = gltf.nodes[ni];
    const world = matMul(parent, nodeLocal(n));
    if (n.mesh != null) meshInstances.push({ meshIdx: n.mesh, world, name: n.name || `node_${ni}`, skinned: n.skin != null });
    walk(n.children, world);
  }
})(gltf.scenes[gltf.scene ?? 0].nodes, IDENT);

// --- islands ------------------------------------------------------------------
class UF {
  constructor(n) { this.p = new Uint32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
  find(x) { let r = x; while (this.p[r] !== r) r = this.p[r]; while (this.p[x] !== r) { const nx = this.p[x]; this.p[x] = r; x = nx; } return r; }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p[rb] = ra; }
}

const islands = [];
let fusedWarnings = 0;
for (const inst of meshInstances) {
  const mesh = gltf.meshes[inst.meshIdx];
  for (const [pi, prim] of (mesh.primitives || []).entries()) {
    if (prim.extensions?.KHR_draco_mesh_compression) {
      console.error(`SKIP ${inst.name}[${pi}]: Draco-compressed (probe can't parse — decompress first: npx gltf-transform draco in.glb out.glb --decode)`);
      continue;
    }
    if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION == null) continue;
    const pos = readAccessor(prim.attributes.POSITION);
    const idx = prim.indices != null
      ? readAccessor(prim.indices).data
      : Uint32Array.from({ length: pos.count }, (_, i) => i);

    // weld by quantized world-space-agnostic local position
    const weldMap = new Map();
    const vert2weld = new Uint32Array(pos.count);
    let nw = 0;
    for (let v = 0; v < pos.count; v++) {
      const k = `${Math.round(pos.data[v * 3] / WELD)},${Math.round(pos.data[v * 3 + 1] / WELD)},${Math.round(pos.data[v * 3 + 2] / WELD)}`;
      let w = weldMap.get(k);
      if (w === undefined) { w = nw++; weldMap.set(k, w); }
      vert2weld[v] = w;
    }
    const uf = new UF(nw);
    for (let t = 0; t < idx.length; t += 3) {
      uf.union(vert2weld[idx[t]], vert2weld[idx[t + 1]]);
      uf.union(vert2weld[idx[t]], vert2weld[idx[t + 2]]);
    }
    // gather triangles per root
    const groups = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const root = uf.find(vert2weld[idx[t]]);
      let g = groups.get(root);
      if (!g) { g = []; groups.set(root, g); }
      g.push(t);
    }
    const m = inst.world;
    for (const tris of groups.values()) {
      if (tris.length < MIN_TRIS) continue;
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      let cx = 0, cy = 0, cz = 0, np = 0;
      const seen = new Set();
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const v = idx[t + k];
        if (seen.has(v)) continue;
        seen.add(v);
        const lx = pos.data[v * 3], ly = pos.data[v * 3 + 1], lz = pos.data[v * 3 + 2];
        const x = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        const y = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        const z = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        cx += x; cy += y; cz += z; np++;
      }
      islands.push({
        node: inst.name, prim: pi, tris: tris.length, skinned: inst.skinned || undefined,
        bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
        dims: [maxX - minX, maxY - minY, maxZ - minZ],
        centroid: [cx / np, cy / np, cz / np],
      });
      if (inst.skinned) fusedWarnings++;
    }
  }
}

if (!islands.length) {
  console.error('no islands above --min-tris found (empty scene? all Draco?)');
  process.exit(1);
}

// --- heuristics (glTF Y-up; a tank's length runs along X or Z) ---------------
const gMin = [Infinity, Infinity, Infinity];
const gMax = [-Infinity, -Infinity, -Infinity];
for (const isl of islands) for (let a = 0; a < 3; a++) {
  if (isl.bbox.min[a] < gMin[a]) gMin[a] = isl.bbox.min[a];
  if (isl.bbox.max[a] > gMax[a]) gMax[a] = isl.bbox.max[a];
}
const gDims = [gMax[0] - gMin[0], gMax[1] - gMin[1], gMax[2] - gMin[2]];
const totalH = gDims[1];
const footprint = (d) => Math.max(d[0], d[2]) / Math.max(gDims[0], gDims[2]);

for (const isl of islands) {
  const d = isl.dims;
  const tags = [];
  const relBottom = (isl.bbox.min[1] - gMin[1]) / totalH;
  const long = Math.max(d[0], d[2]);
  const others = [d[1], Math.min(d[0], d[2])];
  if (relBottom > 0.30 && footprint(d) < 0.62 && footprint(d) > 0.15
      && Math.abs(isl.centroid[0] - (gMin[0] + gMax[0]) / 2) < gDims[0] * 0.30
      && Math.abs(isl.centroid[2] - (gMin[2] + gMax[2]) / 2) < gDims[2] * 0.30) tags.push('TURRET?');
  if (long >= 3 * Math.max(...others) && relBottom > 0.35 && footprint(d) > 0.2) tags.push('GUN?');
  isl.tags = tags;
}

islands.sort((a, b) => b.tris - a.tris);
const fmt = (v) => v.map((x) => x.toFixed(2)).join(' ');
console.log(`${file}\n  ${meshInstances.length} mesh node(s), ${islands.length} island(s) >= ${MIN_TRIS} tris, `
  + `scene dims [${fmt(gDims)}] (glTF Y-up)\n`);
for (const isl of islands.slice(0, 40)) {
  console.log(`  ${String(isl.tris).padStart(7)} tris  node="${isl.node}"[${isl.prim}]`
    + `  dims [${fmt(isl.dims)}]  yBottom ${(isl.bbox.min[1] - gMin[1]).toFixed(2)}`
    + (isl.skinned ? '  (skinned: bind-pose bbox)' : '')
    + (isl.tags.length ? `  <-- ${isl.tags.join(' ')}` : ''));
}
if (islands.length > 40) console.log(`  … ${islands.length - 40} more (use --json for all)`);

const turrets = islands.filter((i) => i.tags.includes('TURRET?'));
const guns = islands.filter((i) => i.tags.includes('GUN?'));
console.log(`\n  VERDICT: ${turrets.length ? `turret-like island present (${turrets.length})` : 'NO turret-like island'}`
  + ` | ${guns.length ? `gun-like island present (${guns.length})` : 'NO gun-like island'}`
  + `\n  ${turrets.length && guns.length
    ? '-> separable: re-parent islands under TurretPivot/GunPivot offline, no cutting needed'
    : islands.length === 1
      ? '-> single fused island: needs real segmentation (ring-plane cut / Tripo segmentation / Hunyuan3D-Part)'
      : '-> partially separated: inspect islands above; expect some cutting'}`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify({ file, sceneDims: gDims, islands }, null, 2));
  console.log(`  full island list -> ${JSON_OUT}`);
}
