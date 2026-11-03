// A solo battle's world-kernel choice is the battle's, decided once at its setup (2026-11-02 audit S2, game/state.ts
// setupBattle). The kernels load in their own chunk while a battle loads (game/soloBattleRuntime.ts), and the old step
// chose per world, lazily: a battle set up before the module landed read the TypeScript obstacle grid (fixed at setup)
// but mirrored its ground onto the kernels for the hulls' support at its first step if the module had landed by then,
// and a world first stepped on the TypeScript stayed on it for its life. Held here on Verdant through the page's own
// setupBattle and simStep over the provider the page runs (world/soloWorldKernelProvider.ts):
// - kernels that land between a battle's setup and its first step leave that battle on the TypeScript, its support and
//   its obstacle query alike (no world mirrored, no kernel grid);
// - the next battle on the same world rides the kernels from its setup (its ground mirrored once, the kernel grid);
// - a third battle on that world reuses the world's kernels (no second instance), and its stamps reach them once.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group } from 'three';
import { createBus, createCollider, createGameState, setSoloWorldKernels, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { compileWorldKernels } from '../world/wasmWorldKernels.ts';
import { createSoloWorldKernels } from '../world/soloWorldKernelProvider.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const MAP = 'verdant';
await ensureFullFleet();
const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));
const visual = () => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {},
  gunMuzzleWorld: (out) => out.set(0, 2, 0), gunDirWorld: (out) => out.set(0, 0, 1) });

const world = createDedicatedWorldCollision(MAP);
const authored = world.heightField._layout.spawns;
const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
const game = createGameState({ rosterSeed: 3 });
game.mapId = MAP;
spawnTanks(game, { scene: { remove() {} } });
for (const e of game.allTanks) e.visual = visual();
const bus = createBus(() => {});
const collider = createCollider(game, world);
const battle = (ticks) => {
  game.battleCount = (game.battleCount ?? 0) + 1;
  setupBattle(game, 'leo2a4', world, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true });
  for (const e of game.allTanks) if (!e.visual?.gunMuzzleWorld) e.visual = visual();
  game.preBattleS = 0;
  return () => { for (let tick = 0; tick < ticks; tick++) simStep(game, bus, world, null, collider); };
};

const provider = createSoloWorldKernels(module, false);
const report = globalThis.__SIM_KERNELS;
try {
  // battle 1: set up while the module is still loading; it lands before the first step
  setSoloWorldKernels(null);
  const step1 = battle(3);
  setSoloWorldKernels(provider);
  step1();
  assert.equal(report.worlds, 0, 'kernels that land after a battle\'s setup leave its hulls\' support on the TypeScript (the old step mirrored the ground at its first step)');
  assert.equal(game._obstacleQuery, world.queryObstacles, 'and its obstacle query');

  // battle 2 on the same world: the kernels from its setup
  const step2 = battle(3);
  assert.equal(report.worlds, 1, 'the next battle on the world rides the kernels: its ground mirrored at setup');
  assert.notEqual(game._obstacleQuery, world.queryObstacles, 'its obstacle query is the kernel grid');
  assert.equal(typeof game._obstacleQuery.clearance?.begin, 'function', 'with the bots\' clearance walk');
  const kernelQuery = game._obstacleQuery;
  step2();

  // battle 3: the world's kernels again, one instance
  const step3 = battle(3);
  assert.equal(report.worlds, 1, 'a world mirrors its ground onto one instance for its life');
  assert.equal(game._obstacleQuery, kernelQuery, 'the same kernel grid');
  step3();
} finally {
  setSoloWorldKernels(null);
  world.release?.();
}

console.log('soloKernelChoice selftest passed: kernels landing between a battle\'s setup and its first step leave it on the TypeScript; '
  + 'the next battle on the world rides them from its setup, on one instance for the world\'s life');
process.exit(0);
