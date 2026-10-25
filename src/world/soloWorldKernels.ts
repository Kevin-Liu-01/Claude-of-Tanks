/**
 * The world kernels for solo battles (?simKernels=wasm; docs/RUST-KERNELS.md). A solo battle steps its own integration
 * on the main thread over the rendered world (game/state.ts), so its hulls' support — the contact surface, the ground
 * the battle deforms and the tops over it — runs on the kernels here, as the multiplayer host's and the server's do
 * (wasmWorldKernels.ts). Each world gets its own instance: its lattice filled from the world's height function, its
 * obstacles loaded in the order of the world's own grid (so a hull's candidates are the TypeScript's), its ground mirrored
 * from the battle's overlay.
 *
 * ?simKernels=wasm-check runs both: the TypeScript field drives the battle and every answer of the kernels' is compared
 * with it (globalThis.__SIM_KERNELS.check). Browser-only; loaded only with the flag.
 */
import kernelsUrl from '../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm?url';
import type { CollisionRecord, ObstacleQuery } from './collision.ts';
import type { TerrainDeformation } from '../sim/terrainDeformation.ts';
import { createStructureSupportField, type StructureSupportField, type SupportHeightField } from '../sim/structureSupport.ts';
import { compileWorldKernels, instantiateWorldKernels } from './wasmWorldKernels.ts';

interface KernelWorld {
  heightField: SupportHeightField & { getContactHeightAt?(x: number, z: number): number };
  queryObstacles?: ObstacleQuery;
  getObstacles(): CollisionRecord[];
}

/** What the page reports (globalThis.__SIM_KERNELS): the worlds on the kernels and, in check mode, the comparison. */
interface SimKernelsReport {
  mode: 'wasm' | 'wasm-check';
  worlds: number;
  check: { compared: number; mismatches: number; first: null | { what: string; x: number; z: number; typescript: number; kernels: number } };
}

/** The kernels' module compiled, and a provider of each world's kernels (game/state.ts setSoloWorldKernels). */
export async function loadSoloWorldKernels(check: boolean) {
  const response = await fetch(kernelsUrl);
  if (!response.ok) throw new Error(`world kernels: HTTP ${response.status}`);
  const module = await compileWorldKernels(await response.arrayBuffer());
  const report: SimKernelsReport = { mode: check ? 'wasm-check' : 'wasm', worlds: 0, check: { compared: 0, mismatches: 0, first: null } };
  (globalThis as { __SIM_KERNELS?: SimKernelsReport }).__SIM_KERNELS = report;
  const byWorld = new WeakMap<object, ReturnType<typeof instantiateWorldKernels>>();
  return {
    mirrorGround(world: KernelWorld, overlay: TerrainDeformation): boolean {
      // the world's own grid, in its canonical order (createObstacleGrid's slots): the kernels' grid over the same records
      const order = world.queryObstacles?.rayOrder;
      if (!order || typeof world.heightField.getContactHeightAt !== 'function') return false;
      const records = new Array<CollisionRecord>(order.count);
      for (const [record, slot] of order.slotOf) records[slot] = record;
      const kernels = instantiateWorldKernels(module, world.heightField.getHeightAt);
      kernels.obstacleGrid(records, 1 / order.inv, true);
      kernels.mirrorOverlay(overlay);
      byWorld.set(world, kernels);
      report.worlds++;
      return true;
    },
    supportField(world: KernelWorld, terrain: SupportHeightField): StructureSupportField {
      const kernels = byWorld.get(world);
      if (!kernels) throw new Error('the world kernels mirror the ground of a world before its support field');
      const field = kernels.supportField(terrain);
      return check ? checkedSupportField(createStructureSupportField(terrain, world), field, report.check) : field;
    },
  };
}

/** The TypeScript field drives; the kernels' answers are compared with its own, call by call. */
function checkedSupportField(ts: StructureSupportField, kernels: StructureSupportField, stats: SimKernelsReport['check']): StructureSupportField {
  const compare = (what: string, a: number, b: number, x: number, z: number): number => {
    stats.compared++;
    if (!Object.is(a, b)) {
      stats.mismatches++;
      stats.first ??= { what, x, z, typescript: a, kernels: b };
    }
    return a;
  };
  return {
    getHeightAt: (x, z) => compare('getHeightAt', ts.getHeightAt(x, z), kernels.getHeightAt(x, z), x, z),
    getHeightAtFast: (x, z) => compare('getHeightAtFast', ts.getHeightAtFast!(x, z), kernels.getHeightAtFast!(x, z), x, z),
    getContactHeightAt: (x, z) => compare('getContactHeightAt', ts.getContactHeightAt!(x, z), kernels.getContactHeightAt!(x, z), x, z),
    getTerrainContactHeightAt: (x, z) => compare('getTerrainContactHeightAt', ts.getTerrainContactHeightAt!(x, z),
      kernels.getTerrainContactHeightAt!(x, z), x, z),
    getGroundType: (x, z) => ts.getGroundType(x, z),
    getDriveGroundType: (x, z) => ts.getDriveGroundType!(x, z),
    beginHull(x, z, bellyY, pose) {
      ts.beginHull(x, z, bellyY, pose);
      kernels.beginHull(x, z, bellyY, pose);
      compare('candidates', ts.candidateCount, kernels.candidateCount, x, z);
      compare('standingDeck', ts.standingDeck ? 1 : 0, kernels.standingDeck ? 1 : 0, x, z);
    },
    get candidateCount() { return ts.candidateCount; },
    get standingDeck() { return ts.standingDeck; },
    get recordReads() { return compare('recordReads', ts.recordReads, kernels.recordReads, NaN, NaN); },
    topEdgeStations: (quad, out, max) => ts.topEdgeStations(quad, out, max),
  };
}
