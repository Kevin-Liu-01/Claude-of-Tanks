/**
 * structureHanging.ts — what a building's damage leaves hanging comes down (destruction-slabs 227 round 3; the
 * engineering critic of round 2: a kolkhoz mill's four sails stood crossed in the air over its fallen body, a cottage's
 * verge boards as an A-frame over its roofless walls, a farmhouse's chimney and roof ladder beside its gable — each a part
 * of the world's buckets whatever held it had gone from under).
 *
 * After a building's damage changes what it draws (a section's hide, a storey's fall, the fracture's faces drawn again),
 * its world parts — each span's triangles welded into connected parts — are read against what is drawn round them, as
 * the slab check's hanging judge reads them (tools/destruction-hanging.mjs), never against a collision record:
 *
 *  - a part BEARS where the ground, or a part that bears itself, lies within 0.8 m under half its lower envelope (its
 *    lowest point over each 0.4 m plan cell; a wall beside it at that height holds it too), or under points round its
 *    middle — support propagates up from the ground, so two parts side by side hold nothing up;
 *  - parts touching (a surface sample of each within 0.25 m of the other's) gather in clusters; a cluster touching the
 *    ground stands.
 * What the building draws besides its world parts — the fracture's redrawn faces, the kit's standing rims and remnants —
 * holds and stands as drawn. A part that bore in the intact building and bears no more (its held share down by a quarter),
 * or whose cluster stood and stands no more, comes down: the caller throws each cluster of them as a body (the fracture's
 * landmark bodies) or lets it go (no fracture: the kit alone).
 *
 * The intact reading is made once a structure (its first sweep, from the spans as the stages kept them before their first
 * change); a sweep reuses a part's intact samples while its triangles have not moved. Numbers only, deterministic: the
 * spans and what the presentation draws. Presentation only: nothing here feeds the simulation.
 */
import * as THREE from 'three';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';

/** A triangle of a span (its first vertex, absolute in the span's position attribute). */
export interface HangingTri { span: StructureSpan; at: number }
/** What the presentation draws of a structure besides its world parts: the fracture's redrawn faces (read piece by piece),
 *  the kit's standing runs (rims, remnants, stubs) and its rooms (a storey's room behind its holes). */
export interface HangingDrawn { faces: readonly THREE.Mesh[]; runs: readonly THREE.Mesh[]; rooms: readonly THREE.Mesh[] }
/** What comes down: the world's parts (a body's triangles a cluster), the faces' pieces cut loose (each its mesh and its
 *  triangles), and the runs and rooms (by index) touching nothing that stands. */
export interface HangingResult { groups: HangingTri[][]; faces: Array<{ mesh: THREE.Mesh; tris: number[] }>; runs: number[]; rooms: number[] }

const CELL = 0.4, VOX = 0.25, SPACING = 0.3, BAND = 0.8, BEAR = 0.5, DROP = 0.25, TOUCH = 0.3, MOVED = 0.002;
const CELL_BITS = 2 ** 21;
const cellKey = (i: number, k: number): number => (i + 1048576) * CELL_BITS + (k + 1048576);
const VOX_X = 2 ** 34, VOX_Y = 2 ** 17;
const voxKey = (i: number, j: number, k: number): number => (i + 65536) * VOX_X + (j + 65536) * VOX_Y + (k + 65536);

interface Part {
  span: number;
  /** Its triangles' first vertices (absolute in the span's attribute). */
  tris: Int32Array;
  /** Its intact samples (world xyz) and the triangle (index into tris) each came from. */
  xyz: Float32Array;
  owner: Int32Array;
  sup0: boolean;
  held0: number;
  stood0: boolean;
}
interface Model { parts: Part[] }

interface Sampled {
  /** Per part: its samples now (null: it draws nothing), its lower envelope, its box. */
  xyz: Array<Float32Array | null>;
  env: Array<Map<number, number> | null>;
  lo: Float32Array;
  /** Every sample by plan cell: [y, owner] pairs (owner: a part, or parts.length + a holder). */
  column: Map<number, number[]>;
  /** Samples by voxel (VOX): [x, y, z, owner] each. */
  voxels: Map<number, number[]>;
}

export interface HangingSweep {
  /**
   * The parts of `seam` its damage left hanging, gathered in clusters (each a body's triangles): read against what the
   * world draws of it now and `holders` (the presentation's meshes that stand: the fracture's faces, the kit's runs); and
   * which of its `rooms` (a storey's room behind its holes) stand touching nothing that stands (their walls gone round
   * them: a dark box in the air) — they go.
   */
  sweep(seam: StructureDamageSeam, drawn: HangingDrawn): HangingResult;
  reset(): void;
}

export interface HangingSweepOptions {
  /** A span's positions as they stood before the presentation's first change to it (null: never changed). */
  originalOf(span: StructureSpan): Float32Array | null;
  /** The ground as drawn under a point. */
  groundAt(x: number, z: number): number;
}

export function createHangingSweep(o: HangingSweepOptions): HangingSweep {
  const models = new WeakMap<StructureDamageSeam, Model>();
  const _m = new THREE.Matrix4(), _inst = new THREE.Matrix4(), _v = new THREE.Vector3();
  const a3 = new Float64Array(9);

  function spanMatrix(span: StructureSpan): THREE.Matrix4 {
    const mesh = span.mesh as THREE.Object3D & { getMatrixAt?(index: number, target: THREE.Matrix4): THREE.Matrix4 };
    mesh.updateWorldMatrix(true, false);
    _m.copy(mesh.matrixWorld);
    if (span.instanceId !== null && typeof mesh.getMatrixAt === 'function') { mesh.getMatrixAt(span.instanceId, _inst); _m.multiply(_inst); }
    return _m;
  }
  /** A triangle's corners (world) into a3: from `src` (a span's own range, `base` its first vertex) or the attribute. */
  function corners(arr: ArrayLike<number>, base: number, at: number, M: THREE.Matrix4): boolean {
    for (let k = 0; k < 3; k++) {
      const i = (at + k - base) * 3;
      _v.set(arr[i]!, arr[i + 1]!, arr[i + 2]!).applyMatrix4(M);
      a3[k * 3] = _v.x; a3[k * 3 + 1] = _v.y; a3[k * 3 + 2] = _v.z;
    }
    const ax = a3[3]! - a3[0]!, ay = a3[4]! - a3[1]!, az = a3[5]! - a3[2]!, bx = a3[6]! - a3[0]!, by = a3[7]! - a3[1]!, bz = a3[8]! - a3[2]!;
    return (ay * bz - az * by) ** 2 + (az * bx - ax * bz) ** 2 + (ax * by - ay * bx) ** 2 > 1e-16;
  }
  /** Samples of the triangle in a3 about SPACING apart (at least its centroid): pushed as xyz with `tag`. */
  function sampleA3(out: number[], tags: number[] | null, tag: number): void {
    const ax = a3[3]! - a3[0]!, ay = a3[4]! - a3[1]!, az = a3[5]! - a3[2]!, bx = a3[6]! - a3[0]!, by = a3[7]! - a3[1]!, bz = a3[8]! - a3[2]!;
    const longest = Math.max(Math.hypot(ax, ay, az), Math.hypot(bx, by, bz), Math.hypot(bx - ax, by - ay, bz - az));
    const k = Math.max(1, Math.min(40, Math.ceil(longest / SPACING)));
    for (let u = 0; u <= k; u++) for (let v = 0; v <= k - u; v++) {
      const wb = k === 1 ? 1 / 3 : u / k, wc = k === 1 ? 1 / 3 : v / k;
      out.push(a3[0]! + ax * wb + bx * wc, a3[1]! + ay * wb + by * wc, a3[2]! + az * wb + bz * wc);
      tags?.push(tag);
      if (k === 1) return;
    }
  }

  /** The intact reading of a structure: its parts, their samples, and which bore and stood. */
  function modelOf(seam: StructureDamageSeam): Model {
    let model = models.get(seam);
    if (model) return model;
    const parts: Part[] = [];
    seam.spans.forEach((span, s) => {
      if (span.count < 3) return;
      const orig = o.originalOf(span);
      const arr = orig ?? (span.position.array as Float32Array);
      const base = orig ? span.first : 0;
      const M = spanMatrix(span);
      const start = span.first + ((3 - (span.first % 3)) % 3);
      const ats: number[] = [];
      for (let at = start; at + 2 < span.first + span.count; at += 3) if (corners(arr, base, at, M)) ats.push(at);
      if (!ats.length) return;
      // connected parts: corners welded at a millimetre
      const parent = new Int32Array(ats.length);
      for (let i = 0; i < ats.length; i++) parent[i] = i;
      const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
      const owner = new Map<string, number>();
      ats.forEach((at, q) => {
        corners(arr, base, at, M);
        for (let k = 0; k < 3; k++) {
          const key = `${Math.round(a3[k * 3]! * 1000)},${Math.round(a3[k * 3 + 1]! * 1000)},${Math.round(a3[k * 3 + 2]! * 1000)}`;
          const prev = owner.get(key);
          if (prev === undefined) owner.set(key, q);
          else { const ra = find(prev), rb = find(q); if (ra !== rb) parent[ra] = rb; }
        }
      });
      const groups = new Map<number, number[]>();
      ats.forEach((at, q) => { const r = find(q); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(at); });
      for (const list of groups.values()) {
        const xyz: number[] = [], tags: number[] = [];
        list.forEach((at, t) => { corners(arr, base, at, M); sampleA3(xyz, tags, t); });
        parts.push({ span: s, tris: Int32Array.from(list), xyz: Float32Array.from(xyz), owner: Int32Array.from(tags), sup0: false, held0: 0, stood0: false });
      }
    });
    model = { parts };
    const sampled = sample(seam, model, null, [], true);
    const sup = propagate(model, sampled, 0, o.groundAt);
    const stands = clusters(model, sampled, 0, o.groundAt);
    for (let p = 0; p < parts.length; p++) {
      parts[p]!.sup0 = sup[p] === 1;
      parts[p]!.held0 = sampled.env[p] ? heldOf(sampled, sampled.env[p]!, p, sup, o.groundAt) : 0;
      parts[p]!.stood0 = stands.has(p);
    }
    models.set(seam, model);
    return model;
  }

  /**
   * The parts' samples now (intact: as built), and the holders' after them: a part's intact samples while its triangles
   * stand where they were (those still drawn), sampled again where they moved.
   */
  function sample(seam: StructureDamageSeam, model: Model, holderXyz: Float32Array[] | null, _holders: readonly THREE.Mesh[], intact: boolean): Sampled {
    const P = model.parts.length;
    const xyzs: Array<Float32Array | null> = new Array(P).fill(null);
    for (let p = 0; p < P; p++) {
      const part = model.parts[p]!;
      if (intact) { xyzs[p] = part.xyz; continue; }
      const span = seam.spans[part.span]!;
      const arr = span.position.array as Float32Array;
      const orig = o.originalOf(span);
      const M = spanMatrix(span);
      // what of it draws now, and whether any of it moved
      const alive = new Uint8Array(part.tris.length);
      let moved = false, any = false;
      for (let t = 0; t < part.tris.length; t++) {
        const at = part.tris[t]!;
        if (!corners(arr, 0, at, M)) continue;
        alive[t] = 1; any = true;
        if (orig && !moved) {
          for (let k = 0; k < 9 && !moved; k++) if (Math.abs(arr[at * 3 + k]! - orig[(at - span.first) * 3 + k]!) > MOVED) moved = true;
        }
      }
      if (!any) continue;
      if (!moved) {
        const keep: number[] = [];
        for (let i = 0; i < part.owner.length; i++) if (alive[part.owner[i]!]) keep.push(part.xyz[i * 3]!, part.xyz[i * 3 + 1]!, part.xyz[i * 3 + 2]!);
        xyzs[p] = Float32Array.from(keep);
      } else {
        const xyz: number[] = [];
        for (let t = 0; t < part.tris.length; t++) if (alive[t] && corners(arr, 0, part.tris[t]!, M)) sampleA3(xyz, null, 0);
        xyzs[p] = Float32Array.from(xyz);
      }
    }
    const env: Array<Map<number, number> | null> = new Array(P).fill(null);
    const lo = new Float32Array(P).fill(Infinity);
    const column = new Map<number, number[]>(), voxels = new Map<number, number[]>();
    const put = (owner: number, xyz: Float32Array, e: Map<number, number> | null): void => {
      for (let i = 0; i < xyz.length; i += 3) {
        const x = xyz[i]!, y = xyz[i + 1]!, z = xyz[i + 2]!;
        const ck = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
        let c = column.get(ck); if (!c) column.set(ck, c = []); c.push(y, owner);
        if (e) { const v = e.get(ck); if (v === undefined || y < v) e.set(ck, y); }
        const vk = voxKey(Math.floor(x / VOX), Math.floor(y / VOX), Math.floor(z / VOX));
        let vl = voxels.get(vk); if (!vl) voxels.set(vk, vl = []);
        // (a few samples of one owner a voxel: fine trim's many small triangles would crowd it)
        let mine = 0;
        for (let j = vl.length - 1; j >= 0 && mine < 6; j -= 4) if (vl[j] === owner) mine++;
        if (mine < 6) vl.push(x, y, z, owner);
        if (owner < P && y < lo[owner]!) lo[owner] = y;
      }
    };
    for (let p = 0; p < P; p++) { const xyz = xyzs[p]; if (!xyz?.length) { xyzs[p] = null; continue; } env[p] = new Map(); put(p, xyz, env[p]!); }
    if (holderXyz) holderXyz.forEach((xyz, h) => put(P + h, xyz, null));
    return { xyz: xyzs, env, lo, column, voxels };
  }

  const heldPts: number[] = [];
  /** A part's held share over its envelope: cells under which the ground, a holder or a part that bears lies within the
   *  band (the held cells left in heldPts). */
  let holdLimit = Infinity;
  function heldOf(sm: Sampled, env: Map<number, number>, self: number, sup: Uint8Array, ground: (x: number, z: number) => number): number {
    let held = 0;
    heldPts.length = 0;
    const P = sup.length;
    for (const [ck, y] of env) {
      const i0 = Math.floor(ck / CELL_BITS) - 1048576, k0 = (ck % CELL_BITS) - 1048576;
      const lo = y - BAND, hi = y + 0.1;
      let ok = ground((i0 + 0.5) * CELL, (k0 + 0.5) * CELL) >= lo;
      for (let di = -1; di <= 1 && !ok; di++) for (let dk = -1; dk <= 1 && !ok; dk++) {
        const c = sm.column.get(cellKey(i0 + di, k0 + dk));
        if (c) for (let j = 0; j < c.length; j += 2) {
          const q = c[j + 1]!;
          if (q === self || c[j]! < lo || c[j]! > hi || (q < P && !sup[q]) || q >= holdLimit) continue;
          ok = true; break;
        }
      }
      if (ok) { held++; heldPts.push(i0, k0); }
    }
    return env.size ? held / env.size : 1;
  }
  /** Whether a part bears (after heldOf): half its envelope held, or its middle inside the held cells' hull. */
  function bears(env: Map<number, number>, share: number): boolean {
    if (share > BEAR) return true;
    if (heldPts.length < 6) return false;
    let mx = 0, mz = 0;
    for (const ck of env.keys()) { mx += Math.floor(ck / CELL_BITS) - 1048576; mz += (ck % CELL_BITS) - 1048576; }
    return insideHull(heldPts, mx / env.size, mz / env.size);
  }
  /** Which parts bear, up from the ground (holders bear as drawn). */
  function propagate(model: Model, sm: Sampled, _holders: number, ground: (x: number, z: number) => number): Uint8Array {
    const P = model.parts.length;
    const sup = new Uint8Array(P);
    const open: number[] = [];
    for (let p = 0; p < P; p++) if (sm.env[p]) open.push(p);
    for (let round = 0; round < 48 && open.length; round++) {
      let changed = false;
      for (let j = open.length - 1; j >= 0; j--) {
        const p = open[j]!, env = sm.env[p]!;
        if (bears(env, heldOf(sm, env, p, sup, ground))) { sup[p] = 1; open[j] = open[open.length - 1]!; open.pop(); changed = true; }
      }
      if (!changed) break;
    }
    return sup;
  }
  /** The parts whose cluster (touching parts and holders) touches the ground; `find` for the clusters of the rest. */
  let lastFind: ((i: number) => number) | null = null;
  let lastRoots: Set<number> = new Set();
  function clusters(model: Model, sm: Sampled, holders: number, ground: (x: number, z: number) => number): Set<number> {
    const P = model.parts.length, M = P + holders;
    const parent = new Int32Array(M);
    for (let i = 0; i < M; i++) parent[i] = i;
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    const grounded = new Uint8Array(M);
    // touching: two owners' samples within VOX of each other (each voxel against itself and its 13 forward neighbours)
    const D2 = VOX * VOX;
    const join = (p: number, q: number): void => { if (p === q) return; const ra = find(p), rb = find(q); if (ra !== rb) parent[ra] = rb; };
    for (const [vk, list] of sm.voxels) {
      const vi = Math.floor(vk / VOX_X) - 65536, vj = Math.floor((vk % VOX_X) / VOX_Y) - 65536, vz = (vk % VOX_Y) - 65536;
      for (let a = 0; a < list.length; a += 4) for (let b = a + 4; b < list.length; b += 4) {
        if (list[a + 3] === list[b + 3]) continue;
        const dx = list[a]! - list[b]!, dy = list[a + 1]! - list[b + 1]!, dz = list[a + 2]! - list[b + 2]!;
        if (dx * dx + dy * dy + dz * dz <= D2) join(list[a + 3]!, list[b + 3]!);
      }
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
        if (da < 0 || (da === 0 && (db < 0 || (db === 0 && dc <= 0)))) continue;
        const other = sm.voxels.get(voxKey(vi + da, vj + db, vz + dc));
        if (!other) continue;
        for (let a = 0; a < list.length; a += 4) for (let b = 0; b < other.length; b += 4) {
          if (list[a + 3] === other[b + 3]) continue;
          const dx = list[a]! - other[b]!, dy = list[a + 1]! - other[b + 1]!, dz = list[a + 2]! - other[b + 2]!;
          if (dx * dx + dy * dy + dz * dz <= D2) join(list[a + 3]!, other[b + 3]!);
        }
      }
    }
    for (const [ck, c] of sm.column) {
      const i0 = Math.floor(ck / CELL_BITS) - 1048576, k0 = (ck % CELL_BITS) - 1048576;
      const g = ground((i0 + 0.5) * CELL, (k0 + 0.5) * CELL) + TOUCH;
      for (let j = 0; j < c.length; j += 2) if (c[j]! <= g) grounded[c[j + 1]!] = 1;
    }
    const roots = new Set<number>();
    for (let i = 0; i < M; i++) if (grounded[i]) roots.add(find(i));
    const out = new Set<number>();
    for (let p = 0; p < P; p++) if (roots.has(find(p))) out.add(p);
    lastFind = find;
    lastRoots = roots;
    return out;
  }
  /** A holder mesh's triangles sampled (world). */
  function holderSamples(mesh: THREE.Mesh): Float32Array {
    const g = mesh.geometry as THREE.BufferGeometry | undefined;
    const pos = g?.getAttribute('position');
    if (!pos) return new Float32Array(0);
    mesh.updateWorldMatrix(true, false);
    const M = mesh.matrixWorld, ix = g!.index;
    const n = ix ? ix.count : pos.count;
    const out: number[] = [];
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = ix ? ix.getX(t + k) : t + k;
        _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(M);
        a3[k * 3] = _v.x; a3[k * 3 + 1] = _v.y; a3[k * 3 + 2] = _v.z;
      }
      sampleA3(out, null, 0);
    }
    return Float32Array.from(out);
  }

  /** A face mesh's connected pieces (corners welded at a millimetre): each its triangles and their samples (world). */
  function facePieces(mesh: THREE.Mesh): Array<{ tris: number[]; xyz: Float32Array }> {
    const g = mesh.geometry as THREE.BufferGeometry | undefined;
    const pos = g?.getAttribute('position');
    if (!pos) return [];
    mesh.updateWorldMatrix(true, false);
    const M = mesh.matrixWorld, ix = g!.index;
    const n = Math.floor((ix ? ix.count : pos.count) / 3);
    const parent = new Int32Array(n);
    for (let t = 0; t < n; t++) parent[t] = t;
    const find = (t: number): number => { while (parent[t] !== t) { parent[t] = parent[parent[t]!]!; t = parent[t]!; } return t; };
    const owner = new Map<string, number>();
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const i = ix ? ix.getX(t * 3 + k) : t * 3 + k;
      const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
      const prev = owner.get(key);
      if (prev === undefined) owner.set(key, t); else { const ra = find(prev), rb = find(t); if (ra !== rb) parent[ra] = rb; }
    }
    const groups = new Map<number, number[]>();
    for (let t = 0; t < n; t++) { const r = find(t); let l = groups.get(r); if (!l) groups.set(r, l = []); l.push(t); }
    const out: Array<{ tris: number[]; xyz: Float32Array }> = [];
    for (const tris of groups.values()) {
      const xyz: number[] = [];
      for (const t of tris) {
        for (let k = 0; k < 3; k++) {
          const i = ix ? ix.getX(t * 3 + k) : t * 3 + k;
          _v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(M);
          a3[k * 3] = _v.x; a3[k * 3 + 1] = _v.y; a3[k * 3 + 2] = _v.z;
        }
        sampleA3(xyz, null, 0);
      }
      out.push({ tris, xyz: Float32Array.from(xyz) });
    }
    return out;
  }

  return {
    sweep(seam, drawn) {
      const { faces, runs, rooms } = drawn;
      const model = modelOf(seam);
      const P = model.parts.length;
      const none: HangingResult = { groups: [], faces: [], runs: [], rooms: [] };
      if (!P) return none;
      // the owners after the world's parts: the faces' pieces, the runs, the rooms (in that order)
      const pieces: Array<{ mesh: THREE.Mesh; tris: number[]; xyz: Float32Array }> = [];
      for (const mesh of faces) for (const pc of facePieces(mesh)) pieces.push({ mesh, ...pc });
      const hx = [...pieces.map((pc) => pc.xyz), ...runs.map(holderSamples), ...rooms.map(holderSamples)];
      const sm = sample(seam, model, hx, [], false);
      // (a room holds nothing up: it stands inside walls)
      const F = P + pieces.length, R = F + runs.length;
      holdLimit = R;
      const sup = propagate(model, sm, hx.length, o.groundAt);
      const stands = clusters(model, sm, hx.length, o.groundAt);
      holdLimit = Infinity;
      const find = lastFind!, roots = lastRoots;
      // what the presentation draws, touching nothing that stands (none of it on the ground, nor touching what is): it goes
      const loose = (id: number, xyz: Float32Array): boolean => xyz.length > 0 && !roots.has(find(id));
      const facesDown: Array<{ mesh: THREE.Mesh; tris: number[] }> = [];
      pieces.forEach((pc, k) => { if (loose(P + k, pc.xyz)) facesDown.push({ mesh: pc.mesh, tris: pc.tris }); });
      const runsDown: number[] = [];
      runs.forEach((_m, r) => { if (loose(F + r, hx[pieces.length + r]!)) runsDown.push(r); });
      const roomsDown: number[] = [];
      rooms.forEach((_m, r) => { if (loose(R + r, hx[pieces.length + runs.length + r]!)) roomsDown.push(r); });
      const down: number[] = [];
      for (let p = 0; p < P; p++) {
        const part = model.parts[p]!, env = sm.env[p];
        if (!env) continue;
        // what stands on the ground stands
        if (sm.lo[p]! - o.groundAt(sm.xyz[p]![0]!, sm.xyz[p]![2]!) < TOUCH) continue;
        if (part.stood0 && !stands.has(p)) { down.push(p); continue; }
        if (!part.sup0 || sup[p]) continue;
        if (heldOf(sm, env, p, sup, o.groundAt) <= part.held0 - DROP) down.push(p);
      }
      if (!down.length) return { groups: [], faces: facesDown, runs: runsDown, rooms: roomsDown };
      // one body a cluster of what comes down (the parts touching: a mill's sails with their stocks and shaft)
      const byRoot = new Map<number, HangingTri[]>();
      for (const p of down) {
        const part = model.parts[p]!, span = seam.spans[part.span]!;
        const arr = span.position.array as Float32Array, M = spanMatrix(span);
        const r = find(p);
        let list = byRoot.get(r);
        if (!list) byRoot.set(r, list = []);
        for (let t = 0; t < part.tris.length; t++) if (corners(arr, 0, part.tris[t]!, M)) list.push({ span, at: part.tris[t]! });
      }
      return { groups: [...byRoot.values()].filter((l) => l.length), faces: facesDown, runs: runsDown, rooms: roomsDown };
    },
    reset() { /* the intact readings stand: the spans as built do not change */ },
  };
}

/** Whether (x, z) lies inside the convex hull of the cell points `pts` ([i, k, ...]; within half a cell). */
function insideHull(pts: readonly number[], x: number, z: number): boolean {
  const P: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i]!, pts[i + 1]!]);
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (q: [number, number], a: [number, number], b: [number, number]): number => (a[0] - q[0]) * (b[1] - q[1]) - (a[1] - q[1]) * (b[0] - q[0]);
  const lower: Array<[number, number]> = [], upper: Array<[number, number]> = [];
  for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop(); lower.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]!; while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop(); upper.push(p); }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!, b = hull[(i + 1) % hull.length]!;
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    if ((ex * (z - a[1]) - ez * (x - a[0])) / l < -0.5) return false;
  }
  return true;
}
