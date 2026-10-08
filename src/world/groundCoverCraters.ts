/**
 * groundCoverCraters.ts — the ground cover in a crater's footprint (crater-render-spec §C; ground lane, 2026-10-08, the
 * owner's "destructive explosions that leave holes and craters").
 *
 * Every ground-cover tier bakes its instance heights from the base field. Once the battle's overlay digs a crater
 * (sim/terrainDeformation.ts), the cover follows one law:
 * - inside 0.9 R of a crater the cover is gone (the blast stripped it; the FX lane's churned soil shows there);
 * - everywhere else the overlay reaches (the bowl's last tenth, the thrown rim out to 1.6 R, a rubble heap and its
 *   skirt) it is re-seated: its height is the base height + `offsetAt` — grass on the rim stands on the rim, a trunk in
 *   the bowl wall roots into it. A rubble heap clears nothing (the building's pile covers it).
 *
 * One law object per world, synced once a frame from the bound overlay (map.ts, right after the terrain's own sync);
 * each tier keeps a follower — the stamps it has applied, and the epoch they belong to — and applies only the new
 * stamps' reaches, or restores from its base copies when the epoch moves (a rebind, an unbind, a reset). No per-frame
 * allocation; a stamp allocates its hole entry.
 */
import { stampBounds, type TerrainDeformation } from '../sim/terrainDeformation.ts';

/** The share of a crater's radius its blast clears of cover (the bowl reaches at least 0.92 R round its ragged edge). */
export const CRATER_COVER_CLEAR = 0.9;

const BUCKET_M = 16, HALF_M = 512, BUCKETS = (HALF_M * 2) / BUCKET_M;
const bucketOf = (v: number): number => {
  const i = Math.floor((v + HALF_M) / BUCKET_M);
  return i < 0 ? 0 : i >= BUCKETS ? BUCKETS - 1 : i;
};

export interface GroundCoverCraters {
  /** The overlay the law follows (null between battles). */
  readonly overlay: TerrainDeformation | null;
  /** Moves when the stamps start over (a rebind, an unbind, a reset): a tier restores its base then. */
  readonly epoch: number;
  /** Stamps the law has indexed; a tier applies those past its own count. */
  readonly count: number;
  /** Whether any stamp is in force (a tier's fast path). */
  readonly active: boolean;
  /** Follow the overlay (once a frame, before the tiers). */
  sync(overlay: TerrainDeformation | null): void;
  /** Inside a crater's cleared bowl (0.9 R). */
  holeAt(x: number, z: number): boolean;
  /** The overlay at (x, z) — what a re-seated instance adds to its base height (0 without an overlay). */
  liftAt(x: number, z: number): number;
  /** Stamp i's reach (stampBounds: [minX, minZ, maxX, maxZ]) into `out`. */
  bounds(index: number, out: number[]): number[];
  /** Whether a box meets any stamp's reach (a built cell's or chunk's cheap reject). */
  touches(x0: number, z0: number, x1: number, z1: number): boolean;
}

export function createGroundCoverCraters(): GroundCoverCraters {
  let overlay: TerrainDeformation | null = null;
  let epoch = 0, count = 0, revision = 0;
  // the craters' cleared discs (x, z, r²), and per 16 m bucket the discs that reach it
  const holes: number[] = [];
  const buckets: Array<number[] | undefined> = new Array(BUCKETS * BUCKETS);
  const reaches: number[] = []; // every stamp's reach box, four numbers each
  const box = [0, 0, 0, 0];

  function clear(): void {
    holes.length = 0;
    reaches.length = 0;
    for (let i = 0; i < buckets.length; i++) if (buckets[i]) buckets[i]!.length = 0;
    count = 0;
  }

  function index(ov: TerrainDeformation, i: number): void {
    const stamp = ov.stamps[i];
    stampBounds(stamp, box);
    reaches.push(box[0], box[1], box[2], box[3]);
    if (stamp.kind !== 'crater') return;
    const r = stamp.radiusM * CRATER_COVER_CLEAR;
    const at = holes.length;
    holes.push(stamp.x, stamp.z, r * r);
    for (let bz = bucketOf(stamp.z - r); bz <= bucketOf(stamp.z + r); bz++) {
      for (let bx = bucketOf(stamp.x - r); bx <= bucketOf(stamp.x + r); bx++) {
        const k = bz * BUCKETS + bx;
        (buckets[k] ??= []).push(at);
      }
    }
  }

  return {
    get overlay() { return overlay; },
    get epoch() { return epoch; },
    get count() { return count; },
    get active() { return count > 0; },
    sync(next) {
      if (next !== overlay) {
        overlay = next;
        if (count) epoch++;
        clear();
        revision = next ? next.revision - next.stamps.length : 0;
      }
      if (!overlay) return;
      const ov = overlay, length = ov.stamps.length;
      if (length === count && ov.revision === revision) return;
      // a reset in between (fewer stamps, or the revision moved by more than the new stamps): start over
      if (length < count || ov.revision !== revision + (length - count)) {
        if (count) epoch++;
        clear();
        revision = ov.revision - length;
      }
      for (let i = count; i < length; i++) index(ov, i);
      count = length;
      revision = ov.revision;
    },
    holeAt(x, z) {
      if (!holes.length) return false;
      const list = buckets[bucketOf(z) * BUCKETS + bucketOf(x)];
      if (!list) return false;
      for (let k = 0; k < list.length; k++) {
        const h = list[k], dx = x - holes[h], dz = z - holes[h + 1];
        if (dx * dx + dz * dz < holes[h + 2]) return true;
      }
      return false;
    },
    liftAt(x, z) {
      return overlay && count ? overlay.offsetAt(x, z) : 0;
    },
    bounds(i, out) {
      out[0] = reaches[i * 4]; out[1] = reaches[i * 4 + 1]; out[2] = reaches[i * 4 + 2]; out[3] = reaches[i * 4 + 3];
      return out;
    },
    touches(x0, z0, x1, z1) {
      for (let i = 0; i < reaches.length; i += 4) {
        if (reaches[i] <= x1 && reaches[i + 2] >= x0 && reaches[i + 1] <= z1 && reaches[i + 3] >= z0) return true;
      }
      return false;
    },
  };
}

/** One tier's progress through the law: the epoch it follows and the stamps it has applied. */
interface CraterFollower {
  epoch: number;
  applied: number;
}

export function createCraterFollower(): CraterFollower {
  return { epoch: 0, applied: 0 };
}

const _reach = [0, 0, 0, 0];
/**
 * Bring a tier up to the law: when the epoch moved, `restore()` (back to the base), then `apply(box)` for every stamp
 * past the tier's count — the stamp's reach, where the tier re-reads its instances from their base. Returns whether
 * anything was applied or restored.
 */
export function followCraters(law: GroundCoverCraters, follower: CraterFollower,
  restore: () => void, apply: (x0: number, z0: number, x1: number, z1: number) => void): boolean {
  let moved = false;
  if (follower.epoch !== law.epoch) {
    restore(); // (a tier's builds apply the law too, so a tier with no stamp applied may still hold one)
    follower.epoch = law.epoch;
    follower.applied = 0;
    moved = true;
  }
  while (follower.applied < law.count) {
    law.bounds(follower.applied, _reach);
    apply(_reach[0], _reach[1], _reach[2], _reach[3]);
    follower.applied++;
    moved = true;
  }
  return moved;
}

/**
 * A static instanced mesh's crater state (grass chunks, bushes, the understorey): its base matrices from the first
 * stamp that reaches it, and an index of its instances by 8 m cell — their order untouched (the grass chunks' density
 * rolloff draws a prefix of a random order) — so a stamp walks only the cells of its reach and uploads only the
 * instances it moved (one 16-float range each; three merges neighbours).
 */
interface StaticCoverPatcher {
  /**
   * Re-read the instances of `mesh` (its first `count`, laid over the square [ax0, ax0 + size] × [az0, az0 + size])
   * inside the box by the law: a cleared bowl's instance shrinks to nothing at its base, the rest stands at base +
   * offsetAt. Returns the instances moved.
   */
  reseat(law: GroundCoverCraters, mesh: InstancedMeshLike, count: number, ax0: number, az0: number, size: number,
    x0: number, z0: number, x1: number, z1: number): number;
  /** Every touched mesh back to its base matrices (a full upload), and the states dropped. */
  restore(): void;
  readonly touched: number;
}

/** The slice of THREE.InstancedMesh the patcher reads and writes. */
interface InstancedMeshLike {
  instanceMatrix: { array: ArrayLike<number> & { [i: number]: number; slice(a?: number, b?: number): Float32Array }; addUpdateRange(start: number, count: number): void; clearUpdateRanges(): void; needsUpdate: boolean };
}

const PATCH_CELL_M = 8;
interface StaticState { base: Float32Array; ids: Int32Array; starts: Int32Array; x0: number; z0: number; side: number }

export function createStaticCoverPatcher(): StaticCoverPatcher {
  const states = new Map<InstancedMeshLike, StaticState>();
  function stateOf(mesh: InstancedMeshLike, count: number, x0: number, z0: number, size: number): StaticState {
    let st = states.get(mesh);
    if (st) return st;
    const m = mesh.instanceMatrix.array;
    const side = Math.max(1, Math.ceil(size / PATCH_CELL_M)), cells = side * side;
    const cellOf = (i: number): number => {
      const cx = Math.min(side - 1, Math.max(0, Math.floor((m[i * 16 + 12] - x0) / PATCH_CELL_M)));
      const cz = Math.min(side - 1, Math.max(0, Math.floor((m[i * 16 + 14] - z0) / PATCH_CELL_M)));
      return cz * side + cx;
    };
    const starts = new Int32Array(cells + 1), ids = new Int32Array(count);
    for (let i = 0; i < count; i++) starts[cellOf(i) + 1]++;
    for (let c = 0; c < cells; c++) starts[c + 1] += starts[c];
    const fill = starts.slice(0, cells);
    for (let i = 0; i < count; i++) ids[fill[cellOf(i)]++] = i;
    st = { base: m.slice(0, count * 16), ids, starts, x0, z0, side };
    states.set(mesh, st);
    return st;
  }
  return {
    get touched() { return states.size; },
    reseat(law, mesh, count, ax0, az0, size, x0, z0, x1, z1) {
      if (count <= 0) return 0;
      const st = stateOf(mesh, count, ax0, az0, size);
      const m = mesh.instanceMatrix.array, b = st.base;
      const cx0 = Math.max(0, Math.floor((x0 - st.x0) / PATCH_CELL_M)), cx1 = Math.min(st.side - 1, Math.floor((x1 - st.x0) / PATCH_CELL_M));
      const cz0 = Math.max(0, Math.floor((z0 - st.z0) / PATCH_CELL_M)), cz1 = Math.min(st.side - 1, Math.floor((z1 - st.z0) / PATCH_CELL_M));
      let moved = 0;
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const c = cz * st.side + cx;
          for (let k = st.starts[c]; k < st.starts[c + 1]; k++) {
            const o = st.ids[k] * 16;
            const x = b[o + 12], z = b[o + 14];
            if (x < x0 || x > x1 || z < z0 || z > z1) continue;
            const hole = law.holeAt(x, z);
            const y = Math.fround(hole ? b[o + 13] : b[o + 13] + law.liftAt(x, z));
            const scale = hole ? 0 : 1;
            if (m[o + 13] === y && m[o] === b[o] * scale && m[o + 5] === b[o + 5] * scale && m[o + 10] === b[o + 10] * scale) continue;
            for (let e = 0; e < 12; e++) m[o + e] = b[o + e] * scale;
            m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = b[o + 15];
            mesh.instanceMatrix.addUpdateRange(o, 16);
            moved++;
          }
        }
      }
      if (moved) mesh.instanceMatrix.needsUpdate = true;
      return moved;
    },
    restore() {
      for (const [mesh, st] of states) {
        const m = mesh.instanceMatrix.array;
        for (let i = 0; i < st.base.length; i++) m[i] = st.base[i];
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.needsUpdate = true;
      }
      states.clear();
    },
  };
}

/** A placed tree as the crater law moves it: its spot, its placement matrix (column-major elements), its state. */
interface CraterTreeLike {
  x: number;
  z: number;
  crushed?: boolean;
  mat: { elements: number[]; copy(m: unknown): unknown; clone(): unknown };
  craterBase?: unknown;
}

/**
 * Standing trees in a stamp's reach root into the bowl's wall or stand on the thrown rim: their placement moves by
 * offsetAt from the base kept on first touch (a felled trunk is the simulation's and stays where it fell). `write(t)`
 * writes a moved tree to its instance slots. Returns the trees moved.
 */
export function reseatCraterTrees<T extends CraterTreeLike>(law: GroundCoverCraters, trees: readonly T[],
  x0: number, z0: number, x1: number, z1: number, write: (tree: T) => void): number {
  let moved = 0;
  for (const t of trees) {
    if (t.crushed || t.x < x0 || t.x > x1 || t.z < z0 || t.z > z1) continue;
    const lift = law.liftAt(t.x, t.z);
    if (!t.craterBase && lift === 0) continue;
    const base = (t.craterBase ??= t.mat.clone());
    t.mat.copy(base);
    t.mat.elements[13] += lift;
    write(t);
    moved++;
  }
  return moved;
}

/** Every re-seated tree back to its placement (a felled one keeps its fall) and the bases dropped. */
export function restoreCraterTrees<T extends CraterTreeLike>(trees: readonly T[], write: (tree: T) => void): void {
  for (const t of trees) {
    if (!t.craterBase) continue;
    if (!t.crushed) { t.mat.copy(t.craterBase); write(t); }
    t.craterBase = undefined;
  }
}
