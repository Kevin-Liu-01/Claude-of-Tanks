/**
 * The world's WebAssembly kernels (workstream #3, the Rust core's flagged steps; RUST-ENGINE-DECISION §7): the terrain
 * contact surface, the obstacle grids and a hull's structure support, answered by crates/cot-sim-wasm behind their
 * TypeScript interfaces, bit for bit — the same Float32 lattice filled from the same height function at the same exact
 * coordinates, the same fold splits, the same grid visitation order, the match's deformed ground mirrored stamp for
 * stamp, the same tops over it (cargo test -p cot-sim; wasmWorldKernels.selftest.mjs). They change no answer, so a match
 * on them shares every state digest with one on the TypeScript, and peers may mix them.
 *
 * Off unless a world is built with `kernels` (headlessCollisionWorld.ts): the dedicated server under COT_SIM_KERNELS=wasm
 * (server/match/simKernels.ts) and the browser host under ?simKernels=wasm. One instance per world: its lattice, its
 * overlay and its records are that world's own. Node-runnable and DOM-free, like every authority module.
 */
import type { CollisionRecord, ObstacleQuery, SimpleCollisionShape } from './collision.ts';
import type { TerrainDeformation } from '../sim/terrainDeformation.ts';
import { driveGroundTypeAt } from '../sim/terrainMobility.ts';
import { topEdgeStationsIn, type StructureSupportField, type SupportHeightField } from '../sim/structureSupport.ts';

/** The compiled module (compile once per process; every world instantiates its own). */
export type WorldKernelModule = WebAssembly.Module;

interface CotSimExports {
  readonly memory: WebAssembly.Memory;
  scratch_ptr(bytes: number): number;
  contact_height(x: number, z: number): number;
  contact_flipped(x: number, z: number): number;
  grid_new(boxes: number, n: number, cellSize: number): number;
  grid_query(handle: number, minX: number, minZ: number, maxX: number, maxZ: number): number;
  grid_out_ptr(handle: number): number;
  overlay_add_crater(x: number, z: number, radiusM: number, depthM: number, rimM: number, seed: number): number;
  overlay_add_rubble(cx: number, cz: number, hw: number, hd: number, yaw: number, heightM: number, t0: number, hasT0: number): void;
  overlay_add_course(cx: number, cz: number, c: number, s: number, hw: number, skirtM: number, profile: number, n: number): void;
  overlay_reset(): void;
  overlay_set_time(timeS: number): void;
  records_load(data: number, len: number, grid: number): number;
  record_flags_ptr(): number;
  support_query(x: number, z: number): number;
  support_candidates_ptr(): number;
  support_begin(x: number, z: number, bellyY: number, posed: number, centerX: number, centerZ: number, forwardX: number,
    forwardZ: number, rightX: number, rightZ: number, halfLength: number, halfWidth: number, centerRise: number,
    riseAlong: number, riseAcross: number, frontLift: number, rearLift: number): void;
  support_contact(x: number, z: number): number;
  terrain_contact(x: number, z: number): number;
  support_top(x: number, z: number, ground: number): number;
  support_record_reads(): number;
  support_standing(): number;
}

/** The terrain contact surface on the kernel: `getContactHeightAt` and `getContactCellFlippedAt`. */
interface KernelContactSurface {
  heightAt(x: number, z: number): number;
  cellFlippedAt(x: number, z: number): boolean;
}

/** One world's kernels: its contact lattice, its obstacle grids, its ground overlay and its hulls' support. */
interface WorldKernels {
  contactSurface(): KernelContactSurface;
  /** A grid over `records`; `support`: the obstacles the hulls stand on (their table is loaded beside the grid). */
  obstacleGrid(records: CollisionRecord[], cellSize?: number, support?: boolean): ObstacleQuery;
  /** Mirror the match's overlay (its stamps so far, then every change, in the order the TypeScript makes them). */
  mirrorOverlay(overlay: TerrainDeformation | null): void;
  /** The structure support field (structureSupport.ts) over `terrain`, the match's deformed field, on the kernel. */
  supportField(terrain: SupportHeightField): StructureSupportField;
}

/** Compile the module's bytes (crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm). */
export function compileWorldKernels(bytes: BufferSource): Promise<WorldKernelModule> {
  return WebAssembly.compile(bytes);
}

/** A fresh instance for one world over its height function (the module's one import, which fills the lattice). */
export function instantiateWorldKernels(module: WorldKernelModule, heightAt: (x: number, z: number) => number): WorldKernels {
  const w = new WebAssembly.Instance(module, { env: { terrain_height: heightAt } }).exports as unknown as CotSimExports;
  let supportRecords: CollisionRecord[] | null = null;
  let mirrored: TerrainDeformation | null = null;
  return {
    contactSurface: () => ({ heightAt: w.contact_height, cellFlippedAt: (x, z) => w.contact_flipped(x, z) === 1 }),
    obstacleGrid(records, cellSize = 24, support = false) {
      const grid = createObstacleGridKernel(w, records, cellSize);
      if (support) supportRecords = loadSupportRecords(w, grid.indexed, grid.handle);
      return grid.query;
    },
    mirrorOverlay(overlay) {
      w.overlay_reset();
      mirrored = overlay;
      if (overlay) mirrorOverlay(w, overlay, () => mirrored === overlay);
    },
    supportField(terrain) {
      if (!supportRecords) throw new Error('the support field needs the obstacles grid built with support');
      return createKernelSupportField(w, supportRecords, terrain);
    },
  };
}

interface GridKernel { query: ObstacleQuery; handle: number; indexed: CollisionRecord[] }

function createObstacleGridKernel(w: CotSimExports, records: CollisionRecord[], cellSize: number): GridKernel {
  // createObstacleGrid's canonical list: duplicates dropped, first-seen order kept (each record's slot in its cells)
  const indexed = [...new Set(records)];
  const n = indexed.length;
  const ptr = w.scratch_ptr(n * 32);
  const boxes = new Float64Array(w.memory.buffer, ptr, n * 4);
  for (let i = 0; i < n; i++) {
    const r = indexed[i];
    boxes[i * 4] = r.min[0]; boxes[i * 4 + 1] = r.min[2]; boxes[i * 4 + 2] = r.max[0]; boxes[i * 4 + 3] = r.max[2];
  }
  const handle = w.grid_new(ptr, n, cellSize);
  // the answer buffer is reserved for every record once, so it never moves
  const base = w.grid_out_ptr(handle) >>> 2;
  const query = w.grid_query;
  let u32 = new Uint32Array(w.memory.buffer);
  const slotOf = new Map<CollisionRecord, number>();
  for (let i = 0; i < n; i++) slotOf.set(indexed[i], i);
  const rayOrder: NonNullable<ObstacleQuery['rayOrder']> = { inv: 1 / cellSize, slotOf, count: n };
  return {
    handle,
    indexed,
    query: Object.assign(function kernelQuery(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]) {
      const m = query(handle, minX, minZ, maxX, maxZ);
      if (u32.buffer !== w.memory.buffer) u32 = new Uint32Array(w.memory.buffer);
      out.length = 0;
      for (let k = 0; k < m; k++) out.push(indexed[u32[base + k]]);
      return out;
    }, { rayOrder }),
  };
}

/** One part in the kernel's flat encoding (kind, extent flag and extent, then its shape: crates/cot-sim-wasm records_load). */
function encodePart(out: number[], part: SimpleCollisionShape | null | undefined): void {
  if (!part) { out.push(0, 0, 0, 0); return; }
  const ranged = part.y0 !== undefined && part.y1 !== undefined;
  const head = [ranged ? 1 : 0, ranged ? part.y0! : 0, ranged ? part.y1! : 0];
  if (part.kind === 'obb') out.push(1, ...head, part.cx, part.cz, part.hw, part.hl, part.yaw);
  else if (part.kind === 'circle') out.push(2, ...head, part.cx, part.cz, part.r);
  else {
    out.push(3, ...head, part.points.length, ...part.points, part.tp ? part.tp.length : 0);
    if (part.tp) out.push(...part.tp);
  }
}

/** Load the obstacles the hulls stand on into the kernel, in its grid's order; their flags are written per hull. */
function loadSupportRecords(w: CotSimExports, records: CollisionRecord[], grid: number): CollisionRecord[] {
  const flat: number[] = [];
  for (const record of records) {
    const wreck = record.kind === 'tank-wreck' || record.kind === 'tram-wreck';
    flat.push(...record.min, ...record.max, (record.crushable ? 1 : 0) | (wreck ? 2 : 0));
    const shape = record.shape2;
    if (!shape) flat.push(0);
    else if (shape.kind === 'compound') { flat.push(2, shape.parts.length); for (const part of shape.parts) encodePart(flat, part); }
    else { flat.push(1); encodePart(flat, shape); }
  }
  const ptr = w.scratch_ptr(flat.length * 8);
  new Float64Array(w.memory.buffer, ptr, flat.length).set(flat);
  w.records_load(ptr, flat.length, grid);
  return records;
}

/** Replay `overlay`'s stamps into the kernel, then forward its every change while `live()`. */
function mirrorOverlay(w: CotSimExports, overlay: TerrainDeformation, live: () => boolean): void {
  const course = (stamp: { cx: number; cz: number; c: number; s: number; hw: number; skirtM: number; profile: Float64Array }) => {
    const ptr = w.scratch_ptr(stamp.profile.length * 8);
    new Float64Array(w.memory.buffer, ptr, stamp.profile.length).set(stamp.profile);
    w.overlay_add_course(stamp.cx, stamp.cz, stamp.c, stamp.s, stamp.hw, stamp.skirtM, ptr, stamp.profile.length);
  };
  for (const stamp of overlay.stamps) {
    // (each stamp as it was admitted: a heap with its resolved start, so a replay rises on the same clock)
    if (stamp.kind === 'crater') w.overlay_add_crater(stamp.x, stamp.z, stamp.radiusM, stamp.depthM, stamp.rimM, stamp.seed);
    else if (stamp.kind === 'rubble') w.overlay_add_rubble(stamp.cx, stamp.cz, stamp.hw, stamp.hd, stamp.yaw, stamp.heightM, stamp.t0, 1);
    else course(stamp);
  }
  const { addCrater, addRubble, addCourse, reset, setTime } = overlay;
  Object.assign(overlay, {
    addCrater(x: number, z: number, radiusM: number, depthM: number, rimM: number, seed: number) {
      const admitted = addCrater(x, z, radiusM, depthM, rimM, seed);
      if (live()) w.overlay_add_crater(x, z, radiusM, depthM, rimM, seed >>> 0);
      return admitted;
    },
    addRubble(cx: number, cz: number, hw: number, hd: number, yaw: number, heightM: number, t0?: number) {
      addRubble(cx, cz, hw, hd, yaw, heightM, t0);
      if (live()) w.overlay_add_rubble(cx, cz, hw, hd, yaw, heightM, t0 ?? 0, t0 === undefined ? 0 : 1);
    },
    addCourse(stamp: Parameters<TerrainDeformation['addCourse']>[0]) {
      addCourse(stamp);
      if (live()) course(stamp);
    },
    reset() {
      reset();
      if (live()) w.overlay_reset();
    },
    setTime(timeS: number) {
      setTime(timeS);
      if (live()) w.overlay_set_time(timeS);
    },
  });
}

/**
 * structureSupport.ts createStructureSupportField on the kernel: a hull's candidates come from the kernel's obstacle
 * grid, their crushed and dead flags are written before it begins (the authority sets them as props fall), and a
 * contact sample — the contact surface, the overlay on it and the tops over it — is one call.
 */
function createKernelSupportField(w: CotSimExports, records: CollisionRecord[], terrain: SupportHeightField): StructureSupportField {
  const candidates: CollisionRecord[] = [];
  let count = 0;
  let flags = new Uint8Array(0);
  let ids = new Uint32Array(0);
  const terrainAt = terrain.getHeightAt.bind(terrain);
  const terrainFast = terrain.getHeightAtFast ? terrain.getHeightAtFast.bind(terrain) : terrainAt;
  const top = w.support_top;
  return {
    getHeightAt: (x, z) => top(x, z, terrainAt(x, z)),
    getHeightAtFast: (x, z) => top(x, z, terrainFast(x, z)),
    getContactHeightAt: w.support_contact,
    getTerrainContactHeightAt: w.terrain_contact,
    getGroundType: (x, z) => terrain.getGroundType(x, z),
    getDriveGroundType: (x, z) => driveGroundTypeAt(terrain, x, z),
    beginHull(x, z, bellyY, pose) {
      count = w.support_query(x, z);
      if (flags.buffer !== w.memory.buffer) flags = new Uint8Array(w.memory.buffer, w.record_flags_ptr(), records.length);
      // (the candidates' buffer moves when it grows, and the memory when the kernel allocates: the view follows both)
      const at = w.support_candidates_ptr();
      if (ids.buffer !== w.memory.buffer || ids.byteOffset !== at || ids.length < count) ids = new Uint32Array(w.memory.buffer, at, count);
      candidates.length = count;
      for (let k = 0; k < count; k++) {
        const record = records[ids[k]];
        candidates[k] = record;
        flags[ids[k]] = (record.crushed ? 1 : 0) | (record.dead ? 2 : 0);
      }
      if (pose) {
        w.support_begin(x, z, bellyY, 1, pose.centerX, pose.centerZ, pose.forwardX, pose.forwardZ, pose.rightX, pose.rightZ,
          pose.halfLength, pose.halfWidth, pose.centerRise, pose.riseAlong, pose.riseAcross, pose.frontLift, pose.rearLift);
      } else {
        w.support_begin(x, z, bellyY, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    },
    get candidateCount() { return count; },
    get standingDeck() { return w.support_standing() === 1; },
    get recordReads() { return w.support_record_reads(); },
    topEdgeStations(quad, out, max) { return topEdgeStationsIn(candidates, count, quad, out, max, terrainFast); },
  };
}
