/**
 * The solo world kernels' provider (split from world/soloWorldKernels.ts by local-fps-265 so a Node receipt runs the code
 * the page runs): each world's kernels over the compiled module, the support field on them, the world's obstacle query on
 * them (the authority's own, headlessCollisionWorld), and ?simKernels=wasm-check's side-by-side comparison. The browser
 * loads the module in world/soloWorldKernels.ts.
 */
import type { CollisionRecord, ObstacleQuery } from './collision.ts';
import type { TerrainDeformation } from '../sim/terrainDeformation.ts';
import { createStructureSupportField, type StructureSupportField, type SupportHeightField } from '../sim/structureSupport.ts';
import { instantiateWorldKernels, type WorldKernelModule } from './wasmWorldKernels.ts';

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

/**
 * A provider of each world's kernels over the compiled module (game/state.ts setSoloWorldKernels; world/soloWorldKernels.ts
 * fetches and compiles it in the browser, a receipt from the package in Node).
 */
export function createSoloWorldKernels(module: WorldKernelModule, check: boolean) {
  const report: SimKernelsReport = { mode: check ? 'wasm-check' : 'wasm', worlds: 0, check: { compared: 0, mismatches: 0, first: null } };
  (globalThis as { __SIM_KERNELS?: SimKernelsReport }).__SIM_KERNELS = report;
  const byWorld = new WeakMap<object, ReturnType<typeof instantiateWorldKernels>>();
  // (local-fps-265) each world's obstacle grid on its kernels, the query the authority's world builds (headlessCollisionWorld)
  const queries = new WeakMap<object, ObstacleQuery>();
  return {
    mirrorGround(world: KernelWorld, overlay: TerrainDeformation): boolean {
      // the world's own grid, in its canonical order (createObstacleGrid's slots): the kernels' grid over the same records
      const order = world.queryObstacles?.rayOrder;
      if (!order || typeof world.heightField.getContactHeightAt !== 'function') return false;
      const records = new Array<CollisionRecord>(order.count);
      for (const [record, slot] of order.slotOf) records[slot] = record;
      const kernels = instantiateWorldKernels(module, world.heightField.getHeightAt);
      queries.set(world, kernels.obstacleGrid(records, 1 / order.inv, true));
      kernels.mirrorOverlay(overlay);
      byWorld.set(world, kernels);
      report.worlds++;
      return true;
    },
    /**
     * (local-fps-265) The world's obstacle query on its kernels once its ground is mirrored: the same records in the same
     * slots as the world's own grid, answered bit for bit, with the clearance scan the bots' solid sweeps read (ai.ts).
     * Null in check mode, where the TypeScript drives.
     */
    obstacleQuery(world: KernelWorld): ObstacleQuery | null {
      return check ? null : queries.get(world) ?? null;
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
