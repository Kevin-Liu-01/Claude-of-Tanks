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
 *  - a part BEARS where the ground, or a part that bears itself, lies within 0.8 m under 55 % of its lower envelope (its
 *    lowest point over each 0.4 m plan cell; a wall beside it at that height holds it too), or under points round its
 *    middle — support propagates up from the ground, so two parts side by side hold nothing up;
 *  - parts touching (a surface sample of each within 0.2 m of the other's) gather in clusters; a cluster touching the
 *    ground stands.
 * What the building draws besides its world parts — the fracture's redrawn faces, the kit's standing rims and remnants —
 * is read piece by piece (its triangles welded) the same way: it bears or not, up from the ground with the parts; its
 * rooms hold nothing up. A part that bore in the intact building and bears no more (its held share down by a fifth),
 * or whose cluster stood and stands no more, comes down: the caller throws each cluster of them as a body (the fracture's
 * landmark bodies) or lets it go (no fracture: the kit alone). A drawn piece touching nothing that stands comes down, and
 * so does one over a metre up held no more where the intact building held its spot (the parts as built round it, its own
 * twin — what lies within 0.1 m of it — left out: a frame's infill drawn as a face under its beam goes, a wall over an
 * arcade held at its columns' heads as built stands).
 *
 * The intact reading is made once a structure (its first sweep, from the spans as the stages kept them before their first
 * change); a sweep reuses a part's intact samples while its triangles have not moved. Numbers only, deterministic: the
 * spans and what the presentation draws. Presentation only: nothing here feeds the simulation.
 */
import * as THREE from 'three';
import type { StructureDamageSeam, StructureSpan } from '../world/structureDamageSeam.ts';
import { enclosedAt } from '../world/structureEnclosure.ts';

/** A triangle of a span (its first vertex, absolute in the span's position attribute). */
export interface HangingTri { span: StructureSpan; at: number }
/** What the presentation draws of a structure besides its world parts: the fracture's redrawn faces (read piece by piece),
 *  the kit's standing runs (rims, remnants, stubs) and its rooms (a storey's room behind its holes). */
export interface HangingDrawn { faces: readonly THREE.Mesh[]; runs: readonly THREE.Mesh[]; rooms: readonly THREE.Mesh[] }
/** What comes down: the world's parts (a body's triangles a cluster), the faces' pieces cut loose (each its mesh and its
 *  triangles), and the runs and rooms (by index) touching nothing that stands. */
export interface HangingResult {
  groups: HangingTri[][];
  faces: Array<{ mesh: THREE.Mesh; tris: number[] }>;
  /** The runs' pieces that come down, one a piece (its run's index, its triangles in the run's index). */
  runs: Array<{ run: number; tris: number[] }>;
  rooms: number[];
}

// (the sweep reads a little stricter than the slab check — touching at 0.2 m, bearing over 55 % of its envelope, down when
// its held share fell by a fifth — so what the check would call borderline has come down: their samples differ)
const SLICE = 12000;
/** Samples a putInto call puts between a step's checks (round 4). */
const PUT_CHUNK = 2048;
const CELL = 0.4, VOX = 0.25, JOIN = 0.2, SPACING = 0.3, BAND = 0.8, BEAR = 0.55, DROP = 0.2, TOUCH = 0.3, MOVED = 0.002, LIFT = 1, TWIN = 0.1;
const CELL_BITS = 2 ** 21;
const cellKey = (i: number, k: number): number => (i + 1048576) * CELL_BITS + (k + 1048576);
const VOX_X = 2 ** 34, VOX_Y = 2 ** 17;
const voxKey = (i: number, j: number, k: number): number => (i + 65536) * VOX_X + (j + 65536) * VOX_Y + (k + 65536);
/**
 * Corners welded at a millimetre: `mm` holds each corner's coordinates in whole millimetres (three a corner); the union of
 * the triangles (a corner each three) sharing one is made through `join(triangle, triangle)`. Keys are numbers while the
 * corners span under 131 m an axis (17 bits each), strings past that.
 */
function weldCorners(mm: Float64Array, join: (a: number, b: number) => void, skip: Uint8Array | null = null): void {
  const n = mm.length / 3;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    if (skip && skip[Math.floor(i / 3)]) continue;
    const x = mm[i * 3]!, y = mm[i * 3 + 1]!, z = mm[i * 3 + 2]!;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const small = x1 - x0 < 131072 && y1 - y0 < 131072 && z1 - z0 < 131072;
  const owner = new Map<number | string, number>();
  for (let i = 0; i < n; i++) {
    if (skip && skip[Math.floor(i / 3)]) continue;
    const x = mm[i * 3]!, y = mm[i * 3 + 1]!, z = mm[i * 3 + 2]!;
    const key = small ? ((x - x0) * 131072 + (y - y0)) * 131072 + (z - z0) : `${x},${y},${z}`;
    const t = Math.floor(i / 3), prev = owner.get(key);
    if (prev === undefined) owner.set(key, t); else join(prev, t);
  }
}

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
  /** Its intact box (x0, y0, z0, x1, y1, z1). */
  box: Float32Array;
}
interface Model {
  parts: Part[];
  /** The intact reading (the parts as built) and which of them bore: what held a drawn piece's spot before the damage. */
  intact: Sampled | null;
  sup0: Uint8Array;
  /** The keys' origin: plan cell (i, k) and voxel (i, j, k) indices. */
  origin: [number, number, number, number, number];
  /** The parts touching as built: [p, q, from, to] (their witnesses' range), the witnesses ([its triangle, the other's]
   *  a pair of samples within JOIN), and each part's triangles on the ground as built (groundTris from groundAt[p]). */
  pairs: Int32Array;
  witness: Int32Array;
  groundAt: Int32Array;
  groundTris: Int32Array;
}

interface Sampled {
  /** Per part: its samples now (null: it draws nothing); per part and judged piece: its lower envelope, its lowest y. */
  xyz: Array<Float32Array | null>;
  env: Array<Map<number, number> | null>;
  lo: Float32Array;
  /** Every sample by plan cell: [x, y, z, owner, triangle] each (owner: a part, or parts.length + a holder; triangle: its
   *  part's, -1 for an overlay's). */
  column: Map<number, number[]>;
  /** Samples by voxel (VOX): [x, y, z, owner, triangle] each. */
  voxels: Map<number, number[]>;
  /** The intact reading under these samples (a sweep's overlay over it), the parts it no longer reads (moved: their
   *  samples now in the overlay), and per part the triangles still drawn (null: all). */
  base: Sampled | null;
  dead: Uint8Array | null;
  alive: Array<Uint8Array | null> | null;
}

export interface HangingSweep {
  /**
   * The parts of `seam` its damage left hanging, gathered in clusters (each a body's triangles): read against what the
   * world draws of it now and `holders` (the presentation's meshes that stand: the fracture's faces, the kit's runs); and
   * which of its `rooms` (a storey's room behind its holes) stand touching nothing that stands (their walls gone round
   * them: a dark box in the air) — they go.
   */
  sweep(seam: StructureDamageSeam, drawn: HangingDrawn): HangingResult;
  /** The same sweep in steps, each about SLICE units of work (a frame's share): one sweep at a time, run to its end
   *  before another starts, the structure unchanged meanwhile (a change: start again). */
  steps(seam: StructureDamageSeam, drawn: HangingDrawn): Generator<void, HangingResult, void>;
  /** One step of a structure's intact reading (made ahead while its damage is still being drawn); true once it is made. */
  prepare(seam: StructureDamageSeam): boolean;
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
  const building = new Map<StructureDamageSeam, Generator<void, Model, void>>();
  /** The ground at a cell's middle, read once a sweep (heldOf and the clusters ask it of the same cells). */
  const groundMemo = new Map<number, number>();
  const cellGround = (x: number, z: number): number => {
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    let y = groundMemo.get(k);
    if (y === undefined) { y = o.groundAt(x, z); groundMemo.set(k, y); }
    return y;
  };
  const _m = new THREE.Matrix4(), _inst = new THREE.Matrix4(), _v = new THREE.Vector3();
  const a3 = new Float64Array(9);
  // plan cells and voxels keyed small (round the structure's own origin: small integers hash fast — the sweep's maps
  // are read a few million times a change)
  const LC = 4096, LV = 1024;
  let oI = 0, oK = 0, vI = 0, vJ = 0, vK = 0;
  const clampL = (v: number, n: number): number => (v < 0 ? 0 : v >= n ? n - 1 : v);
  const lck = (i: number, k: number): number => clampL(i - oI, LC) * LC + clampL(k - oK, LC);
  const lckI = (key: number): number => Math.floor(key / LC) + oI;
  const lckK = (key: number): number => (key % LC) + oK;
  const lvk = (i: number, j: number, k: number): number => (clampL(i - vI, LV) * LV + clampL(j - vJ, LV)) * LV + clampL(k - vK, LV);
  /** The structure's origin for the keys (set from its intact box before any reading of it). */
  function originOf(model: Model): void {
    [oI, oK, vI, vJ, vK] = model.origin;
  }
  // (the sweep runs in slices — a building's sweep is a few hundred thousand samples' work: whole, it held a frame for a
  // tenth of a second and more — each step SLICE units of work: a sample put, a pair of samples read, a cell's column)
  let work = 0;
  const drain = <T>(g: Generator<void, T, void>): T => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
  /** A sweep's (or an intact reading's) own reading state, kept across its steps: another may run between them. */
  type SweepState = [number, number, number, number, number, StructureDamageSeam | null, number[], number];
  function* guarded<T>(g: Generator<void, T, void>): Generator<void, T, void> {
    let st: SweepState | null = null;
    for (;;) {
      if (st) [oI, oK, vI, vJ, vK, floorSeam, floorLines, holdLimit] = st;
      const r = g.next();
      st = [oI, oK, vI, vJ, vK, floorSeam, floorLines, holdLimit];
      if (r.done) return r.value;
      yield;
    }
  }

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
  /** Samples of the triangle in a3 SPACING apart: rows across it from its longest edge to the opposite corner, each row
   *  SPACING-stepped along (a sliver gets a line of them, never a grid's square); its corners and edges among them — the
   *  slab check's own (destruction-hanging.mjs sampleTriangles): pushed as xyz with `tag`. */
  function sampleA3(out: number[], tags: number[] | null, tag: number): void {
    // the longest edge P→Q and the corner R opposite it
    const l01 = (a3[3]! - a3[0]!) ** 2 + (a3[4]! - a3[1]!) ** 2 + (a3[5]! - a3[2]!) ** 2;
    const l12 = (a3[6]! - a3[3]!) ** 2 + (a3[7]! - a3[4]!) ** 2 + (a3[8]! - a3[5]!) ** 2;
    const l20 = (a3[0]! - a3[6]!) ** 2 + (a3[1]! - a3[7]!) ** 2 + (a3[2]! - a3[8]!) ** 2;
    const p = l01 >= l12 && l01 >= l20 ? 0 : l12 >= l20 ? 3 : 6, q = (p + 3) % 9, r = (p + 6) % 9;
    const L = Math.sqrt(Math.max(l01, l12, l20));
    const px = a3[p]!, py = a3[p + 1]!, pz = a3[p + 2]!, ex = a3[q]! - px, ey = a3[q + 1]! - py, ez = a3[q + 2]! - pz;
    const rx = a3[r]!, ry = a3[r + 1]!, rz = a3[r + 2]!;
    // the height over the longest edge
    const cx = ey * (rz - pz) - ez * (ry - py), cy = ez * (rx - px) - ex * (rz - pz), cz = ex * (ry - py) - ey * (rx - px);
    const h = L > 1e-9 ? Math.hypot(cx, cy, cz) / L : 0;
    const kl = Math.max(1, Math.min(200, Math.ceil(L / SPACING))), kt = Math.max(1, Math.min(200, Math.ceil(h / SPACING)));
    for (let j = 0; j < kt; j++) {
      const t = j / kt, ks = Math.max(1, Math.ceil(kl * (1 - t)));
      for (let i = 0; i <= ks; i++) {
        const sv = i / ks, bx = px + ex * sv, by = py + ey * sv, bz = pz + ez * sv;
        out.push(bx + (rx - bx) * t, by + (ry - by) * t, bz + (rz - bz) * t);
        tags?.push(tag);
      }
    }
    out.push(rx, ry, rz);
    tags?.push(tag);
  }

  /** A part from its triangles and intact samples (and its box). */
  function partOf(span: number, list: number[], xyz: number[], tags: number[]): Part {
    const box = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    for (let i = 0; i < xyz.length; i += 3) {
      const x = xyz[i]!, y = xyz[i + 1]!, z = xyz[i + 2]!;
      if (x < box[0]!) box[0] = x; if (y < box[1]!) box[1] = y; if (z < box[2]!) box[2] = z;
      if (x > box[3]!) box[3] = x; if (y > box[4]!) box[4] = y; if (z > box[5]!) box[5] = z;
    }
    return { span, tris: Int32Array.from(list), xyz: Float32Array.from(xyz), owner: Int32Array.from(tags), sup0: false, held0: 0, stood0: false, box };
  }

  /** The intact reading of a structure: its parts, their samples, and which bore and stood. */
  /** The highest storey floor line (world y) under a point inside the building's ground plan, at or under `y` (−Infinity:
   *  none): the simulation holds a storey on its floor until it drops it (DESTRUCTION.md §3.4) — what stands on it is held. */
  let floorSeam: StructureDamageSeam | null = null;
  let floorLines: number[] = [];
  function setFloors(seam: StructureDamageSeam): void {
    const a = seam.anatomy as StructureDamageSeam['anatomy'] | undefined;
    floorSeam = a?.storeys ? seam : null;
    floorLines = a?.storeys ? a.storeys.slice(1).map((st) => a.placement.y + st.y0) : [];
  }
  function floorUnder(x: number, z: number, y: number): number {
    if (!floorSeam || !floorLines.length) return -Infinity;
    let best = -Infinity;
    for (const fy of floorLines) if (fy <= y && fy > best) best = fy;
    if (best === -Infinity) return best;
    const { x: px, z: pz, yaw } = floorSeam.anatomy.placement;
    const c = Math.cos(yaw), sn = Math.sin(yaw), wx = x - px, wz = z - pz;
    return enclosedAt(floorSeam.anatomy, wx * c - wz * sn, wx * sn + wz * c, 0.3, 0) === false ? -Infinity : best;
  }
  function* modelSteps(seam: StructureDamageSeam): Generator<void, Model, void> {
    setFloors(seam);
    const have = models.get(seam);
    if (have) return have;
    const parts: Part[] = [];
    for (let s = 0; s < seam.spans.length; s++) {
      const span = seam.spans[s]!;
      if (span.count < 3) continue;
      const orig = o.originalOf(span);
      const arr = orig ?? (span.position.array as Float32Array);
      const base = orig ? span.first : 0;
      const start = span.first + ((3 - (span.first % 3)) % 3);
      const ats: number[] = [];
      let M = spanMatrix(span);
      for (let at = start; at + 2 < span.first + span.count; at += 3) {
        if (corners(arr, base, at, M)) ats.push(at);
        if (++work >= SLICE) { work = 0; yield; M = spanMatrix(span); }
      }
      if (!ats.length) continue;
      // connected parts: corners welded at a millimetre
      const parent = new Int32Array(ats.length);
      for (let i = 0; i < ats.length; i++) parent[i] = i;
      const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
      const mm = new Float64Array(ats.length * 9);
      M = spanMatrix(span);
      ats.forEach((at, q) => { corners(arr, base, at, M); for (let k = 0; k < 9; k++) mm[q * 9 + k] = Math.round(a3[k]! * 1000); });
      work += ats.length * 4;
      if (work >= SLICE) { work = 0; yield; }
      weldCorners(mm, (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; });
      work += ats.length * 6;
      if (work >= SLICE) { work = 0; yield; }
      const groups = new Map<number, number[]>();
      ats.forEach((at, q) => { const r = find(q); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(at); });
      for (const list of groups.values()) {
        const xyz: number[] = [], tags: number[] = [];
        M = spanMatrix(span);
        for (let t = 0; t < list.length; t++) {
          corners(arr, base, list[t]!, M); sampleA3(xyz, tags, t);
          if ((t & 255) === 255) { work += 1024; if (work >= SLICE) { work = 0; yield; M = spanMatrix(span); } }
        }
        parts.push(partOf(s, list, xyz, tags));
      }
    }
    let mx0 = Infinity, my0 = Infinity, mz0 = Infinity;
    for (const part of parts) { mx0 = Math.min(mx0, part.box[0]!); my0 = Math.min(my0, part.box[1]!); mz0 = Math.min(mz0, part.box[2]!); }
    if (!Number.isFinite(mx0)) { mx0 = 0; my0 = 0; mz0 = 0; }
    const origin: [number, number, number, number, number] = [Math.floor((mx0 - 400) / CELL), Math.floor((mz0 - 400) / CELL),
      Math.floor((mx0 - 64) / VOX), Math.floor((my0 - 64) / VOX), Math.floor((mz0 - 64) / VOX)];
    const model: Model = { parts, intact: null, sup0: new Uint8Array(0), origin, pairs: new Int32Array(0), witness: new Int32Array(0),
      groundAt: new Int32Array(parts.length + 1), groundTris: new Int32Array(0) };
    originOf(model);
    groundMemo.clear();
    const sampled = yield* sampleIntactSteps(model);
    const sup = yield* propagateSteps(sampled, parts.length, cellGround);
    model.intact = sampled;
    model.sup0 = sup;
    const rec: IntactRecord = { pairs: new Map(), ground: new Map() };
    const stands = yield* clustersSteps(model, sampled, cellGround, rec);
    const P = parts.length, pairs: number[] = [], witness: number[] = [];
    for (const [k, set] of rec.pairs) {
      const from = witness.length;
      for (const w of set) witness.push(Math.floor(w / 1048576), w % 1048576);
      pairs.push(Math.floor(k / P), k % P, from, witness.length);
      work += 4 + set.size;
      if (work >= SLICE) { work = 0; yield; }
    }
    model.pairs = Int32Array.from(pairs);
    model.witness = Int32Array.from(witness);
    const gt: number[] = [];
    for (let p = 0; p < P; p++) { model.groundAt[p] = gt.length; for (const t of rec.ground.get(p) ?? []) gt.push(t); }
    model.groundAt[P] = gt.length;
    model.groundTris = Int32Array.from(gt);
    const pts: number[] = [];
    for (let p = 0; p < parts.length; p++) {
      parts[p]!.sup0 = sup[p] === 1;
      parts[p]!.held0 = sampled.env[p] ? yield* heldSteps(sampled, sampled.env[p]!, p, sup, cellGround, null, pts) : 0;
      parts[p]!.stood0 = stands.has(p);
    }
    models.set(seam, model);
    return model;
  }

  /** Samples into a column map (by plan cell) and a voxel map: [x, y, z, owner] each; the envelope and lowest y as read. */
  function putInto(column: Map<number, number[]>, voxels: Map<number, number[]>, owner: number, xyz: Float32Array, from: number, to: number,
    e: Map<number, number> | null, lo: Float32Array | null, tris: Int32Array | null = null): void {
    for (let i = from * 3; i < to * 3; i += 3) {
      const x = xyz[i]!, y = xyz[i + 1]!, z = xyz[i + 2]!, tri = tris ? tris[i / 3]! : -1;
      const ck = lck(Math.floor(x / CELL), Math.floor(z / CELL));
      let c = column.get(ck); if (!c) column.set(ck, c = []); c.push(x, y, z, owner, tri);
      if (e) { const v = e.get(ck); if (v === undefined || y < v) e.set(ck, y); }
      const vk = lvk(Math.floor(x / VOX), Math.floor(y / VOX), Math.floor(z / VOX));
      let vl = voxels.get(vk); if (!vl) voxels.set(vk, vl = []);
      // (a few samples of one owner a voxel: fine trim's many small triangles would crowd it)
      let mine = 0;
      for (let j = vl.length - 2; j >= 0 && mine < 6; j -= 5) if (vl[j] === owner) mine++;
      if (mine < 6) vl.push(x, y, z, owner, tri);
      if (lo && owner < lo.length && y < lo[owner]!) lo[owner] = y;
    }
  }
  /** A sample set's lower envelope (lowest y a plan cell) and lowest y. */
  function envOf(xyz: Float32Array): { env: Map<number, number>; lo: number } {
    const env = new Map<number, number>();
    let lo = Infinity;
    for (let i = 0; i < xyz.length; i += 3) {
      const y = xyz[i + 1]!, ck = lck(Math.floor(xyz[i]! / CELL), Math.floor(xyz[i + 2]! / CELL));
      const v = env.get(ck); if (v === undefined || y < v) env.set(ck, y);
      if (y < lo) lo = y;
    }
    return { env, lo };
  }

  /** The intact reading: every part's samples as built (the base the sweeps read their changes over). */
  function* sampleIntactSteps(model: Model): Generator<void, Sampled, void> {
    const P = model.parts.length;
    const xyzs: Array<Float32Array | null> = new Array(P).fill(null);
    const env: Array<Map<number, number> | null> = new Array(P).fill(null);
    const lo = new Float32Array(P).fill(Infinity);
    const column = new Map<number, number[]>(), voxels = new Map<number, number[]>();
    for (let p = 0; p < P; p++) {
      const xyz = model.parts[p]!.xyz;
      if (!xyz.length) continue;
      xyzs[p] = xyz; env[p] = new Map();
      for (let from = 0, n = xyz.length / 3; from < n; from += 1024) {
        putInto(column, voxels, p, xyz, from, Math.min(n, from + 1024), env[p]!, lo, model.parts[p]!.owner);
        work += Math.min(1024, n - from) * 2;
        if (work >= SLICE) { work = 0; yield; }
      }
    }
    return { xyz: xyzs, env, lo, column, voxels, base: null, dead: null, alive: null };
  }

  /**
   * The parts now, read over the intact base: each part's state — unchanged (as the intact reading read it), some triangles
   * hidden (its base samples of those are read no more), moved or gone (its base samples are read no more; its samples now
   * go in the overlay) — and the presentation's `holderXyz` in the overlay, the first `judged` of them read as the parts are.
   */
  function* sampleNowSteps(seam: StructureDamageSeam, model: Model, holderXyz: Float32Array[], judged: number): Generator<void, Sampled, void> {
    const P = model.parts.length, J = judged;
    const now: Array<Float32Array | null> = new Array(P).fill(null);
    const changed = new Uint8Array(P), dead = new Uint8Array(P);
    const alives: Array<Uint8Array | null> = new Array(P).fill(null);
    for (let p = 0; p < P; p++) {
      const part = model.parts[p]!;
      const span = seam.spans[part.span]!;
      const orig = o.originalOf(span);
      if (!orig) continue; // never changed: as built
      work += part.tris.length * 3;
      if (work >= SLICE) { work = 0; yield; }
      const arr = span.position.array as Float32Array;
      let M = spanMatrix(span);
      const alive = new Uint8Array(part.tris.length);
      let moved = false, any = false, all = true;
      for (let t = 0; t < part.tris.length; t++) {
        const at = part.tris[t]!;
        if ((t & 1023) === 1023) { work += 3072; if (work >= SLICE) { work = 0; yield; M = spanMatrix(span); } }
        if (!corners(arr, 0, at, M)) { all = false; continue; }
        alive[t] = 1; any = true;
        let off = false;
        for (let k = 0; k < 9 && !off; k++) if (Math.abs(arr[at * 3 + k]! - orig[(at - span.first) * 3 + k]!) > MOVED) off = true;
        if (off) moved = true;
      }
      if (all && !moved) continue;
      changed[p] = 1;
      if (!any) { dead[p] = 1; continue; }
      if (!moved) {
        // (its base samples stand where they were: those of its hidden triangles are read no more)
        alives[p] = alive;
        const keep: number[] = [];
        for (let i = 0; i < part.owner.length; i++) {
          if (alive[part.owner[i]!]) keep.push(part.xyz[i * 3]!, part.xyz[i * 3 + 1]!, part.xyz[i * 3 + 2]!);
          if ((i & 4095) === 4095) { work += 4096; if (work >= SLICE) { work = 0; yield; } }
        }
        now[p] = Float32Array.from(keep);
      } else {
        dead[p] = 1;
        const xyz: number[] = [];
        let Mm = spanMatrix(span);
        for (let t = 0; t < part.tris.length; t++) {
          if (alive[t] && corners(arr, 0, part.tris[t]!, Mm)) sampleA3(xyz, null, 0);
          if ((t & 255) === 255) { work += 1024; if (work >= SLICE) { work = 0; yield; Mm = spanMatrix(span); } }
        }
        now[p] = Float32Array.from(xyz);
      }
    }
    const xyzs: Array<Float32Array | null> = new Array(P).fill(null);
    const env: Array<Map<number, number> | null> = new Array(P + J).fill(null);
    const lo = new Float32Array(P + J).fill(Infinity);
    const column = new Map<number, number[]>(), voxels = new Map<number, number[]>();
    for (let p = 0; p < P; p++) {
      const part = model.parts[p]!;
      work += 8;
      if (work >= SLICE) { work = 0; yield; }
      if (dead[p]) {
        // moved: its samples now in the overlay
        const xyz = now[p];
        if (!xyz?.length) continue;
        xyzs[p] = xyz; env[p] = new Map();
        // (round 4, the engineering critic's frame times: a big moved part's samples put in one step held a frame 10 ms and
        // more) in chunks, a step's share at a time
        for (let i = 0, n = xyz.length / 3; i < n; i += PUT_CHUNK) {
          putInto(column, voxels, p, xyz, i, Math.min(n, i + PUT_CHUNK), env[p]!, lo);
          work += Math.min(n, i + PUT_CHUNK) - i;
          if (work >= SLICE) { work = 0; yield; }
        }
      } else if (changed[p]) {
        // some triangles hidden: its envelope from those still drawn (its samples stay in the base)
        const xyz = now[p]!;
        const r = envOf(xyz);
        xyzs[p] = xyz; env[p] = r.env; lo[p] = r.lo;
        work += xyz.length / 3;
      } else if (model.intact!.env[p]) {
        // as built: its envelope as the intact reading read it (every part is read again — what held it may have gone)
        xyzs[p] = part.xyz; env[p] = model.intact!.env[p]; lo[p] = model.intact!.lo[p]!;
      }
    }
    for (let h = 0; h < holderXyz.length; h++) {
      const xyz = holderXyz[h]!;
      if (h < J && xyz.length) env[P + h] = new Map();
      // (a redrawn face's or a run's samples in chunks: one face held a step 12 ms on a loaded machine)
      for (let i = 0, n = xyz.length / 3; i < n; i += PUT_CHUNK) {
        putInto(column, voxels, P + h, xyz, i, Math.min(n, i + PUT_CHUNK), h < J ? env[P + h] ?? null : null, lo);
        work += Math.min(n, i + PUT_CHUNK) - i;
        if (work >= SLICE) { work = 0; yield; }
      }
    }
    return { xyz: xyzs, env, lo, column, voxels, base: model.intact, dead, alive: alives };
  }

  const heldPts: number[] = [];
  /** A part's held share over its envelope: cells under which the ground, a holder or a part that bears lies within the
   *  band (the held cells left in `pts`) — the overlay's samples, then the base's of every part unchanged. In steps (a
   *  big part's envelope is thousands of cells). */
  let holdLimit = Infinity;
  function* heldSteps(sm: Sampled, env: Map<number, number>, self: number, sup: Uint8Array, ground: (x: number, z: number) => number,
    near: Set<number> | null, pts: number[]): Generator<void, number, void> {
    let held = 0;
    pts.length = 0;
    const P = sup.length, base = sm.base, dead = sm.dead, alive = sm.alive;
    for (const [ck, y] of env) {
      const i0 = lckI(ck), k0 = lckK(ck);
      const lo = y - BAND, hi = y + 0.1;
      const gx = (i0 + 0.5) * CELL, gz = (k0 + 0.5) * CELL;
      let ok = ground(gx, gz) >= lo || floorUnder(gx, gz, hi) >= lo;
      let read = 9;
      for (let di = -1; di <= 1 && !ok; di++) for (let dk = -1; dk <= 1 && !ok; dk++) {
        const key = lck(i0 + di, k0 + dk);
        for (let pass = 0; pass < 2 && !ok; pass++) {
          const c = pass === 0 ? sm.column.get(key) : base?.column.get(key);
          if (c) for (let j = 0; j < c.length; j += 5) {
            read++;
            const q = c[j + 3]!, cy = c[j + 1]!;
            if (q === self || cy < lo || cy > hi || q >= P || !sup[q] || q >= holdLimit) continue;
            if (pass === 1 && dead && (dead[q] || (alive![q] && !alive![q]![c[j + 4]!]))) continue;
            if (near && near.has(voxKey(Math.floor(c[j]! / TWIN), Math.floor(cy / TWIN), Math.floor(c[j + 2]! / TWIN)))) continue;
            ok = true; break;
          }
        }
      }
      if (ok) { held++; pts.push(i0, k0); }
      work += read;
      if (work >= SLICE) { work = 0; yield; }
    }
    return env.size ? held / env.size : 1;
  }
  /** Whether a part bears (after heldOf / heldSteps): half its envelope held, or its middle inside the held cells' hull. */
  function bears(env: Map<number, number>, share: number, pts: number[] = heldPts): boolean {
    if (share > BEAR) return true;
    if (pts.length < 6) return false;
    let mx = 0, mz = 0;
    for (const ck of env.keys()) { mx += lckI(ck); mz += lckK(ck); }
    return insideHull(pts, mx / env.size, mz / env.size);
  }
  /** Which parts and judged pieces (the first `R` owners) bear, up from the ground (read lowest first, so a round mostly
   *  settles it: what is left is read again while any came to bear); owners past them hold nothing. */
  function* propagateSteps(sm: Sampled, R: number, ground: (x: number, z: number) => number): Generator<void, Uint8Array, void> {
    const sup = new Uint8Array(R);
    let open: number[] = [];
    for (let p = 0; p < R; p++) if (sm.env[p]) open.push(p);
    open.sort((a, b) => sm.lo[a]! - sm.lo[b]! || a - b);
    const pts: number[] = [];
    for (let round = 0; round < 48 && open.length; round++) {
      const rest: number[] = [];
      for (const p of open) {
        const env = sm.env[p]!;
        const share = yield* heldSteps(sm, env, p, sup, ground, null, pts);
        if (bears(env, share, pts)) sup[p] = 1; else rest.push(p);
        work += 8;
        if (work >= SLICE) { work = 0; yield; }
      }
      if (rest.length === open.length) break;
      open = rest;
    }
    return sup;
  }
  /** What the intact reading records for the sweeps: each touching pair's witnesses and each part's triangles on the ground. */
  interface IntactRecord { pairs: Map<number, Set<number>>; ground: Map<number, Set<number>> }
  /**
   * The intact reading's clusters: the parts whose cluster (touching parts: a sample of each within JOIN) reaches the ground,
   * and, for the sweeps, each touching pair's witnesses (a triangle of each, one a sample of the first) and each part's
   * triangles on the ground.
   */
  function* clustersSteps(model: Model, sm: Sampled, ground: (x: number, z: number) => number, record: IntactRecord): Generator<void, Set<number>, void> {
    const P = model.parts.length;
    const parent = new Int32Array(P);
    for (let i = 0; i < P; i++) parent[i] = i;
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    const grounded = new Uint8Array(P);
    const D2 = JOIN * JOIN;
    const touch = (p: number, tp: number, q: number, tq: number): void => {
      const key = p < q ? p * P + q : q * P + p, w = p < q ? tp * 1048576 + tq : tq * 1048576 + tp;
      let set = record.pairs.get(key); if (!set) record.pairs.set(key, set = new Set());
      set.add(w);
      const ra = find(p), rb = find(q); if (ra !== rb) parent[ra] = rb;
    };
    // (a voxel's samples lie in runs of one owner — each owner's put in turn: one witness a sample of the first run)
    const runEnd = (l: number[], a: number): number => { const o = l[a + 3]; let e = a + 5; while (e < l.length && l[e + 3] === o) e += 5; return e; };
    const pairRuns = (A: number[], B: number[] | null): void => {
      const same = B === null, L = same ? A : B;
      for (let a = 0; a < A.length;) {
        const ae = runEnd(A, a), oa = A[a + 3]!;
        for (let b = same ? ae : 0; b < L.length;) {
          const be = runEnd(L, b), ob = L[b + 3]!;
          if (oa !== ob) for (let i = a; i < ae; i += 5) for (let j = b; j < be; j += 5) {
            work++;
            const dx = A[i]! - L[j]!, dy = A[i + 1]! - L[j + 1]!, dz = A[i + 2]! - L[j + 2]!;
            if (dx * dx + dy * dy + dz * dz > D2) continue;
            touch(oa, A[i + 4]!, ob, L[j + 4]!);
            break;
          }
          b = be;
        }
        a = ae;
      }
    };
    for (const [vk, list] of sm.voxels) {
      const vi = Math.floor(vk / (LV * LV)) + vI, vj = (Math.floor(vk / LV) % LV) + vJ, vz = (vk % LV) + vK;
      work += 40;
      if (work >= SLICE) { work = 0; yield; }
      pairRuns(list, null);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
        if (da < 0 || (da === 0 && (db < 0 || (db === 0 && dc <= 0)))) continue;
        const other = sm.voxels.get(lvk(vi + da, vj + db, vz + dc));
        if (other) pairRuns(list, other);
      }
    }
    for (const [ck, c] of sm.column) {
      const gx = (lckI(ck) + 0.5) * CELL, gz = (lckK(ck) + 0.5) * CELL;
      const g = ground(gx, gz) + TOUCH;
      for (let j = 1; j < c.length; j += 5) {
        if (!(c[j]! <= g || c[j]! - floorUnder(gx, gz, c[j]! + 0.05) <= TOUCH)) continue;
        const q = c[j + 2]!;
        grounded[q] = 1;
        let set = record.ground.get(q); if (!set) record.ground.set(q, set = new Set()); set.add(c[j + 3]!);
      }
    }
    const roots = new Set<number>();
    for (let i = 0; i < P; i++) if (grounded[i]) roots.add(find(i));
    const out = new Set<number>();
    for (let p = 0; p < P; p++) if (roots.has(find(p))) out.add(p);
    return out;
  }
  /**
   * Which of `queries` stand (their cluster of touching owners reaches the ground), read lazily over a sweep's overlay and
   * the base: the base parts unchanged join as they touched as built (a witness pair of triangles both still drawn) and
   * stand on the ground as they did; an owner with a sample on the ground stands. A query not standing so
   * far is searched from its samples (its lowest first) for owners within JOIN, on through what it touches, until one
   * stands or none is left: `flag` 1 stands, 2 touches nothing that stands.
   */
  function* standsSteps(model: Model, sm: Sampled, holderXyz: Float32Array[], ground: (x: number, z: number) => number,
    queries: readonly number[]): Generator<void, Uint8Array, void> {
    const P = model.parts.length, M = P + holderXyz.length;
    const parent = new Int32Array(M);
    for (let i = 0; i < M; i++) parent[i] = i;
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    const grounded = new Uint8Array(M);
    const join = (a: number, b: number): void => {
      const ra = find(a), rb = find(b);
      if (ra === rb) return;
      parent[ra] = rb;
      if (grounded[ra]) grounded[rb] = 1;
    };
    const dead = sm.dead!, alive = sm.alive!, base = sm.base!;
    const draws = (p: number, tri: number): boolean => !dead[p] && (tri < 0 || !alive[p] || alive[p]![tri] === 1);
    const { pairs, witness, groundAt, groundTris } = model;
    for (let p = 0; p < P; p++) {
      if (dead[p] || grounded[p]) continue;
      for (let g = groundAt[p]!; g < groundAt[p + 1]!; g++) if (draws(p, groundTris[g]!)) { grounded[p] = 1; break; }
    }
    for (const [ck, c] of sm.column) {
      const gx = (lckI(ck) + 0.5) * CELL, gz = (lckK(ck) + 0.5) * CELL;
      const g = ground(gx, gz) + TOUCH;
      for (let j = 1; j < c.length; j += 5) if (c[j]! <= g || c[j]! - floorUnder(gx, gz, c[j]! + 0.05) <= TOUCH) grounded[c[j + 2]!] = 1;
      work += c.length / 5;
      if (work >= SLICE) { work = 0; yield; }
    }
    for (let k = 0; k < pairs.length; k += 4) {
      const p = pairs[k]!, q = pairs[k + 1]!;
      if (dead[p] || dead[q] || find(p) === find(q)) continue;
      if (!alive[p] && !alive[q]) join(p, q);
      else for (let w = pairs[k + 2]!; w < pairs[k + 3]!; w += 2) if (draws(p, witness[w]!) && draws(q, witness[w + 1]!)) { join(p, q); break; }
      work += 2;
      if (work >= SLICE) { work = 0; yield; }
    }
    const flag = new Uint8Array(M), seen = new Uint8Array(M);
    const D2 = JOIN * JOIN;
    const samplesOf = (a: number): Float32Array | null => (a < P ? sm.xyz[a] ?? model.parts[a]!.xyz : holderXyz[a - P] ?? null);
    for (const q0 of queries) {
      if (flag[q0]) continue;
      if (grounded[find(q0)]) { flag[q0] = 1; continue; }
      const queue = [q0], visited = [q0];
      seen[q0] = 1;
      let ok = false;
      search: while (queue.length) {
        const a = queue.pop()!;
        const xyz = samplesOf(a);
        if (!xyz?.length) continue;
        let ymin = Infinity;
        for (let i = 1; i < xyz.length; i += 3) if (xyz[i]! < ymin) ymin = xyz[i]!;
        // (its lowest samples first: what holds a thing touches it from below)
        for (let pass = 0; pass < 2; pass++) for (let i = 0; i < xyz.length; i += 3) {
          const y = xyz[i + 1]!;
          if ((y <= ymin + 0.6) !== (pass === 0)) continue;
          const x = xyz[i]!, z = xyz[i + 2]!;
          const vi = Math.floor(x / VOX), vj = Math.floor(y / VOX), vk = Math.floor(z / VOX);
          for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
            const key = lvk(vi + da, vj + db, vk + dc);
            for (let src = 0; src < 2; src++) {
              const l = src === 0 ? sm.voxels.get(key) : base.voxels.get(key);
              if (!l) continue;
              work += l.length / 5;
              for (let j = 0; j < l.length; j += 5) {
                const b = l[j + 3]!;
                if (b === a || (src === 1 && !draws(b, l[j + 4]!))) continue;
                const dx = l[j]! - x, dy = l[j + 1]! - y, dz = l[j + 2]! - z;
                if (dx * dx + dy * dy + dz * dz > D2) continue;
                join(a, b);
                if (grounded[find(b)] || flag[b] === 1) { ok = true; break search; }
                if (!seen[b]) { seen[b] = 1; visited.push(b); queue.push(b); }
              }
            }
          }
          work += 54;
          if (work >= SLICE) { work = 0; yield; }
        }
      }
      for (const v of visited) { seen[v] = 0; if (!flag[v]) flag[v] = ok ? 1 : 2; }
    }
    return flag;
  }
  /** The parts coming down in clusters of those touching (one body each: a mill's sails with their stocks and shaft). */
  function groupsOf(model: Model, sm: Sampled, down: readonly number[]): number[][] {
    const parent = Int32Array.from(down.map((_p, i) => i));
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    // their samples by voxel, then each against its neighbours'
    const vox = new Map<number, number[]>();
    down.forEach((p, i) => {
      const xyz = sm.xyz[p] ?? model.parts[p]!.xyz;
      for (let s = 0; s < xyz.length; s += 3) {
        const key = lvk(Math.floor(xyz[s]! / VOX), Math.floor(xyz[s + 1]! / VOX), Math.floor(xyz[s + 2]! / VOX));
        let l = vox.get(key); if (!l) vox.set(key, l = []);
        l.push(xyz[s]!, xyz[s + 1]!, xyz[s + 2]!, i);
      }
    });
    const D2 = JOIN * JOIN;
    for (const [key, l] of vox) {
      const vi = Math.floor(key / (LV * LV)), vj = Math.floor(key / LV) % LV, vk = key % LV;
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
        const o2 = vox.get(((vi + da) * LV + (vj + db)) * LV + (vk + dc));
        if (!o2) continue;
        for (let a = 0; a < l.length; a += 4) for (let b = 0; b < o2.length; b += 4) {
          const ia = l[a + 3]!, ib = o2[b + 3]!;
          if (ia === ib || find(ia) === find(ib)) continue;
          const dx = l[a]! - o2[b]!, dy = l[a + 1]! - o2[b + 1]!, dz = l[a + 2]! - o2[b + 2]!;
          if (dx * dx + dy * dy + dz * dz <= D2) parent[find(ia)] = find(ib);
        }
      }
    }
    const byRoot = new Map<number, number[]>();
    down.forEach((p, i) => { const r = find(i); let g = byRoot.get(r); if (!g) byRoot.set(r, g = []); g.push(p); });
    return [...byRoot.values()];
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

  /** The voxels (TWIN) round a piece's samples: its own twin in the intact building, left out of what held its spot. */
  function nearSet(xyz: Float32Array): Set<number> {
    const out = new Set<number>();
    for (let i = 0; i < xyz.length; i += 3) {
      const vi = Math.floor(xyz[i]! / TWIN), vj = Math.floor(xyz[i + 1]! / TWIN), vk = Math.floor(xyz[i + 2]! / TWIN);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) out.add(voxKey(vi + a, vj + b, vk + c));
    }
    return out;
  }
  /** A face mesh's connected pieces (corners welded at a millimetre): each its triangles and their samples (world). */
  function facePieces(mesh: THREE.Mesh): Array<{ tris: number[]; xyz: Float32Array }> {
    const g = mesh.geometry as THREE.BufferGeometry | undefined;
    const pos = g?.getAttribute('position');
    if (!pos) return [];
    mesh.updateWorldMatrix(true, false);
    const M = mesh.matrixWorld, ix = g!.index;
    // (round 4, the engineering critic's frame times: every sweep welded every face mesh again, a step's 5 ms) a mesh's
    // pieces kept while its geometry, its triangles and its place are as they were
    const kept = pieceCache.get(mesh);
    const pv = (pos as THREE.BufferAttribute).version ?? 0, iv = ix?.version ?? -1;
    if (kept && kept.geometry === g && kept.pv === pv && kept.iv === iv && kept.m.every((v, k) => v === M.elements[k])) return kept.out;
    const out = facePiecesNow(pos as THREE.BufferAttribute, M, ix);
    pieceCache.set(mesh, { geometry: g!, pv, iv, m: Float64Array.from(M.elements), out });
    return out;
  }
  const pieceCache = new WeakMap<THREE.Mesh, { geometry: THREE.BufferGeometry; pv: number; iv: number; m: Float64Array;
    out: Array<{ tris: number[]; xyz: Float32Array }> }>();
  function facePiecesNow(pos: THREE.BufferAttribute, M: THREE.Matrix4, ix: THREE.BufferAttribute | null): Array<{ tris: number[]; xyz: Float32Array }> {
    const n = Math.floor((ix ? ix.count : pos.count) / 3);
    const parent = new Int32Array(n);
    for (let t = 0; t < n; t++) parent[t] = t;
    const find = (t: number): number => { while (parent[t] !== t) { parent[t] = parent[parent[t]!]!; t = parent[t]!; } return t; };
    // (a triangle drawn as a point — a piece dropped before, a hidden cell — is no piece)
    const flat = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
      for (let k = 0; k < 3; k++) {
        const i = ix ? ix.getX(t * 3 + k) : t * 3 + k;
        a3[k * 3] = pos.getX(i); a3[k * 3 + 1] = pos.getY(i); a3[k * 3 + 2] = pos.getZ(i);
      }
      const ax = a3[3]! - a3[0]!, ay = a3[4]! - a3[1]!, az = a3[5]! - a3[2]!, bx = a3[6]! - a3[0]!, by = a3[7]! - a3[1]!, bz = a3[8]! - a3[2]!;
      if ((ay * bz - az * by) ** 2 + (az * bx - ax * bz) ** 2 + (ax * by - ay * bx) ** 2 <= 1e-16) flat[t] = 1;
    }
    // (the drawn triangles' corners only)
    const mm = new Float64Array(n * 9);
    for (let t = 0; t < n; t++) for (let k = 0; k < 3 && !flat[t]; k++) {
      const i = ix ? ix.getX(t * 3 + k) : t * 3 + k;
      mm[t * 9 + k * 3] = Math.round(pos.getX(i) * 1000); mm[t * 9 + k * 3 + 1] = Math.round(pos.getY(i) * 1000); mm[t * 9 + k * 3 + 2] = Math.round(pos.getZ(i) * 1000);
    }
    weldCorners(mm, (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }, flat);
    const groups = new Map<number, number[]>();
    for (let t = 0; t < n; t++) { if (flat[t]) continue; const r = find(t); let l = groups.get(r); if (!l) groups.set(r, l = []); l.push(t); }
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

  function* sweepSteps(seam: StructureDamageSeam, drawn: HangingDrawn): Generator<void, HangingResult, void> {
      groundMemo.clear();
      holdLimit = Infinity;
      const { faces, runs, rooms } = drawn;
      // (the intact reading is built once, in steps that outlive a sweep started again: it reads the spans as built)
      let model = models.get(seam);
      if (!model) {
        let g = building.get(seam);
        if (!g) building.set(seam, g = guarded(modelSteps(seam)));
        for (let r = g.next(); ; r = g.next()) { if (r.done) { model = r.value; break; } yield; }
        building.delete(seam);
      }
      setFloors(seam);
      originOf(model);
      const P = model.parts.length;
      const none: HangingResult = { groups: [], faces: [], runs: [], rooms: [] };
      if (!P) return none;
      // the owners after the world's parts: the faces' pieces and the runs' pieces (judged as the parts are: each bears
      // or not, up from the ground), then the rooms (they hold nothing up: they stand inside walls)
      const pieces: Array<{ mesh: THREE.Mesh; run: number; tris: number[]; xyz: Float32Array }> = [];
      for (const mesh of faces) {
        for (const pc of facePieces(mesh)) pieces.push({ mesh, run: -1, ...pc });
        work += 4 * ((mesh.geometry as THREE.BufferGeometry).getAttribute('position')?.count ?? 0);
        if (work >= SLICE) { work = 0; yield; }
      }
      for (let r = 0; r < runs.length; r++) {
        const mesh = runs[r]!;
        for (const pc of facePieces(mesh)) pieces.push({ mesh, run: r, ...pc });
        work += 4 * ((mesh.geometry as THREE.BufferGeometry).getAttribute('position')?.count ?? 0);
        if (work >= SLICE) { work = 0; yield; }
      }
      const J = pieces.length, R = P + J;
      const hx = pieces.map((pc) => pc.xyz);
      for (const room of rooms) {
        hx.push(holderSamples(room));
        work += 4 * ((room.geometry as THREE.BufferGeometry).getAttribute('position')?.count ?? 0);
        if (work >= SLICE) { work = 0; yield; }
      }
      const sm = yield* sampleNowSteps(seam, model, hx, J);
      holdLimit = R;
      const sup = yield* propagateSteps(sm, R, cellGround);
      // what is asked to stand: every drawn piece and room, and each part read again that stood as built off the ground
      const queries: number[] = [];
      for (let p = 0; p < P; p++) {
        if (!sm.env[p] || !model.parts[p]!.stood0) continue;
        if (sm.lo[p]! - o.groundAt(sm.xyz[p]![0]!, sm.xyz[p]![2]!) < TOUCH) continue;
        queries.push(p);
      }
      for (let h = 0; h < hx.length; h++) if (hx[h]!.length) queries.push(P + h);
      const flag = yield* standsSteps(model, sm, hx, cellGround, queries);
      // what the presentation draws touching nothing that stands goes; a piece held where it stood in the intact building
      // (the parts as built round it, its own twin left out) and held no more — over a metre up — comes down too
      const loose = (id: number, xyz: Float32Array): boolean => xyz.length > 0 && flag[id] === 2;
      const facesDown: Array<{ mesh: THREE.Mesh; tris: number[] }> = [];
      const runsDown: Array<{ run: number; tris: number[] }> = [];
      for (let k = 0; k < pieces.length; k++) {
        const pc = pieces[k]!, id = P + k;
        if (!pc.xyz.length) continue;
        work += 16;
        if (work >= SLICE) { work = 0; yield; }
        let goes = loose(id, pc.xyz);
        if (!goes && !sup[id] && sm.env[id] && model.intact) {
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let i = 0; i < pc.xyz.length; i += 3) {
            const x = pc.xyz[i]!, z = pc.xyz[i + 2]!;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
          }
          if (sm.lo[id]! - o.groundAt((x0 + x1) / 2, (z0 + z1) / 2) >= LIFT) {
            const env = sm.env[id]!, pts: number[] = [];
            const held = yield* heldSteps(sm, env, id, sup, cellGround, null, pts);
            const near = nearSet(pc.xyz);
            work += pc.xyz.length * 9;
            if (work >= SLICE) { work = 0; yield; }
            const held0 = yield* heldSteps(model.intact!, env, -1, model.sup0, cellGround, near, pts);
            goes = bears(env, held0, pts) && held <= held0 - DROP;
          }
        }
        if (!goes) continue;
        if (pc.run < 0) facesDown.push({ mesh: pc.mesh, tris: pc.tris });
        else runsDown.push({ run: pc.run, tris: pc.tris });
      }
      holdLimit = Infinity;
      const roomsDown: number[] = [];
      rooms.forEach((_m, r) => { if (loose(R + r, hx[J + r]!)) roomsDown.push(r); });
      const down: number[] = [];
      for (let p = 0; p < P; p++) {
        const part = model.parts[p]!, env = sm.env[p];
        if (!env) continue;
        // what stands on the ground stands
        if (sm.lo[p]! - o.groundAt(sm.xyz[p]![0]!, sm.xyz[p]![2]!) < TOUCH) continue;
        if (part.stood0 && flag[p] === 2) { down.push(p); continue; }
        if (!part.sup0 || sup[p]) continue;
        if ((yield* heldSteps(sm, env, p, sup, cellGround, null, heldPts)) <= part.held0 - DROP) down.push(p);
      }
      if (!down.length) return { groups: [], faces: facesDown, runs: runsDown, rooms: roomsDown };
      // one body a cluster of what comes down (the parts touching: a mill's sails with their stocks and shaft)
      const groups: HangingTri[][] = [];
      for (const g of groupsOf(model, sm, down)) {
        const list: HangingTri[] = [];
        for (const p of g) {
          const part = model.parts[p]!, span = seam.spans[part.span]!;
          const arr = span.position.array as Float32Array, M = spanMatrix(span);
          for (let t = 0; t < part.tris.length; t++) if (corners(arr, 0, part.tris[t]!, M)) list.push({ span, at: part.tris[t]! });
        }
        if (list.length) groups.push(list);
      }
      return { groups, faces: facesDown, runs: runsDown, rooms: roomsDown };
  }

  return {
    sweep(seam, drawn) { return drain(sweepSteps(seam, drawn)); },
    steps(seam, drawn) { return guarded(sweepSteps(seam, drawn)); },
    prepare(seam) {
      if (models.has(seam)) return true;
      let g = building.get(seam);
      if (!g) building.set(seam, g = guarded(modelSteps(seam)));
      if (!g.next().done) return false;
      building.delete(seam);
      return true;
    },
    reset() { building.clear(); /* the intact readings stand: the spans as built do not change */ },
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
