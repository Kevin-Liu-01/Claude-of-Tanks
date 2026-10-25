/**
 * The world's WebAssembly kernels (workstream #3, the Rust core's first flagged step; RUST-ENGINE-DECISION §7.1): the
 * terrain contact surface and the obstacle grids answered by crates/cot-sim-wasm behind their TypeScript interfaces,
 * bit for bit — the same Float32 lattice filled lazily from the same height function at the same exact coordinates,
 * the same fold splits, the same grid visitation order (cargo test -p cot-sim; wasmWorldKernels.selftest.mjs). They
 * change no answer, so a match on them shares every state digest with one on the TypeScript, and peers may mix them.
 *
 * Off unless a world is built with `kernels` (headlessCollisionWorld.ts): the dedicated server under COT_SIM_KERNELS=wasm
 * (server/match/simKernels.ts) and the browser host under ?simKernels=wasm. One instance per world: its contact lattice
 * is that world's own. Node-runnable and DOM-free, like every authority module.
 */
import type { CollisionRecord, ObstacleQuery } from './collision.ts';

/** The compiled module (compile once per process; every world instantiates its own). */
export type WorldKernelModule = WebAssembly.Module;

/** terrainContactSurface.ts's lattice: a 1024 m square of 128 m chunks of 96 segments. */
const N = 1024 / 128 * 96 + 1;
const STEP = 128 / 96;

interface CotSimExports {
  readonly memory: WebAssembly.Memory;
  scratch_ptr(bytes: number): number;
  lattice_heights_ptr(): number;
  lattice_ready_ptr(): number;
  lattice_flips_ptr(): number;
  lattice_vertex_coordinate(i: number): number;
  lattice_set_flip_from_centre(ix: number, iz: number, centre: number): void;
  contact_sample(x: number, z: number): number;
  contact_cell_flipped(x: number, z: number): number;
  contact_status(): number;
  contact_missing_ix(): number;
  contact_missing_iz(): number;
  grid_new(boxes: number, n: number, cellSize: number): number;
  grid_query(handle: number, minX: number, minZ: number, maxX: number, maxZ: number): number;
  grid_out_ptr(handle: number): number;
}

/** The terrain contact surface on the kernel: `getContactHeightAt` and `getContactCellFlippedAt`. */
interface KernelContactSurface {
  heightAt(x: number, z: number): number;
  cellFlippedAt(x: number, z: number): boolean;
}

/** One world's kernels: its contact lattice and any number of obstacle grids. */
interface WorldKernels {
  contactSurface(heightAt: (x: number, z: number) => number): KernelContactSurface;
  obstacleGrid(records: CollisionRecord[], cellSize?: number): ObstacleQuery;
}

/** Compile the module's bytes (crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm). */
export function compileWorldKernels(bytes: BufferSource): Promise<WorldKernelModule> {
  return WebAssembly.compile(bytes);
}

/** A fresh instance for one world (the module has no imports; 62 KB instantiates synchronously everywhere). */
export function instantiateWorldKernels(module: WorldKernelModule): WorldKernels {
  const w = new WebAssembly.Instance(module, {}).exports as unknown as CotSimExports;
  let contact: KernelContactSurface | null = null;
  return {
    contactSurface(heightAt) {
      if (contact) throw new Error('a kernel instance holds one contact lattice: instantiate one per world');
      contact = createContactSurface(w, heightAt);
      return contact;
    },
    obstacleGrid: (records, cellSize = 24) => createObstacleGridKernel(w, records, cellSize),
  };
}

function createContactSurface(w: CotSimExports, heightAt: (x: number, z: number) => number): KernelContactSurface {
  // the state exists before any view is taken (its first allocation may grow, and so detach, the memory)
  const heightsPtr = w.lattice_heights_ptr(), readyPtr = w.lattice_ready_ptr();
  w.lattice_flips_ptr();
  const coordinate = new Float64Array(N);
  for (let i = 0; i < N; i++) coordinate[i] = w.lattice_vertex_coordinate(i);
  let buffer: ArrayBuffer | null = null;
  let heights = new Float32Array(0), ready = new Uint8Array(0);
  const vertex = (x: number, z: number): void => {
    const i = z * N + x, byte = i >>> 3, bit = 1 << (i & 7);
    if (ready[byte] & bit) return;
    heights[i] = heightAt(coordinate[x], coordinate[z]);
    ready[byte] |= bit;
  };
  /** Hand the kernel what its last answer lacked: a cell's corners (status 2) or a fold's split from its centre (3). */
  const supply = (status: number): void => {
    const ix = w.contact_missing_ix(), iz = w.contact_missing_iz();
    if (status === 2) {
      if (buffer !== w.memory.buffer) {
        buffer = w.memory.buffer as ArrayBuffer;
        heights = new Float32Array(buffer, heightsPtr, N * N);
        ready = new Uint8Array(buffer, readyPtr, Math.ceil(N * N / 8));
      }
      vertex(ix, iz); vertex(ix + 1, iz); vertex(ix, iz + 1); vertex(ix + 1, iz + 1);
    } else {
      w.lattice_set_flip_from_centre(ix, iz, heightAt(coordinate[ix] + STEP * 0.5, coordinate[iz] + STEP * 0.5));
    }
  };
  const sample = w.contact_sample, flipped = w.contact_cell_flipped;
  return {
    heightAt(x, z) {
      let h = sample(x, z);
      while (h !== h) {
        const status = w.contact_status();
        // off the square the TypeScript reads the height function; a NaN corner is the TypeScript's NaN too
        if (status === 1) return heightAt(x, z);
        if (status === 0) return h;
        supply(status);
        h = sample(x, z);
      }
      return h;
    },
    cellFlippedAt(x, z) {
      let answer = flipped(x, z);
      while (answer > 1) { supply(answer); answer = flipped(x, z); }
      return answer === 1;
    },
  };
}

function createObstacleGridKernel(w: CotSimExports, records: CollisionRecord[], cellSize: number): ObstacleQuery {
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
  return Object.assign(function kernelQuery(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]) {
    const m = query(handle, minX, minZ, maxX, maxZ);
    if (u32.buffer !== w.memory.buffer) u32 = new Uint32Array(w.memory.buffer);
    out.length = 0;
    for (let k = 0; k < m; k++) out.push(indexed[u32[base + k]]);
    return out;
  }, { rayOrder });
}
