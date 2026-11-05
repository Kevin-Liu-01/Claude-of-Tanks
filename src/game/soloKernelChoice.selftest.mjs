// A solo battle's world-kernel choice is the battle's, decided once at its setup (2026-11-02 audit S2, game/state.ts
// setupBattle). The kernels load in their own chunk while a battle loads (game/soloBattleRuntime.ts), and the old step
// chose per world, lazily: a battle set up before the module landed read the TypeScript obstacle grid (fixed at setup)
// but mirrored its ground onto the kernels for the hulls' support at its first step if the module had landed by then,
// and a world first stepped on the TypeScript stayed on it for its life. Held here on Verdant through the page's own
// setupBattle and simStep over the provider the page runs (world/soloWorldKernelProvider.ts), the support field read
// where the hulls stand on it (round 2 Q19: the support half is the half the old step got wrong):
// - kernels that land between a battle's setup and its first step leave that battle on the TypeScript: its hulls stand
//   on its TypeScript support field (no kernel field made, no world mirrored), and its obstacle query is the world's;
// - the next battle on the same world rides the kernels from its setup: its support field is the kernels' (its hulls
//   stand on it, none on the TypeScript's) and its obstacle query the kernel grid;
// - a third battle on that world reuses the world's kernels (one instance, one field), and every stamp its ground holds
//   reaches them once: the kernels' ground reads the TypeScript deformed field's, bit for bit, at each crater.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus, createCollider, createGameState, setSoloWorldKernels, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_IDS } from '../vehicles/specs.ts';
import { compileWorldKernels } from '../world/wasmWorldKernels.ts';
import { createSoloWorldKernels } from '../world/soloWorldKernelProvider.ts';
import { createDeformedHeightField } from '../sim/terrainDeformation.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const MAP = 'verdant';
// (round 2 Q19) the staged roster (random: false) and its combat anatomy only, no vehicle builders: the full fleet's
// builders were 46 s of a 53 s run, and the kernel choice reads none of them
await ensureAuthorityFleet(TANK_IDS);
const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));
const visual = (entity) => ({ root: {}, setVisible() {}, syncFromState() {}, dispose() {}, resetDestroyed() {}, setDestroyed() {}, recoilKick() {},
  gunMuzzleWorld: (out) => out.set(entity.state.pos.x, entity.state.pos.y + 2.4, entity.state.pos.z),
  gunDirWorld: (out) => out.set(0, 0, 1) });

const world = createDedicatedWorldCollision(MAP);
const authored = world.heightField._layout.spawns;
const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
// the battle's ground, as setupBattle binds it
let ground = null;
const bindGround = world.bindGroundOverlay.bind(world);
world.bindGroundOverlay = (overlay) => { ground = overlay; bindGround(overlay); };
const game = createGameState({ rosterSeed: 3 });
game.mapId = MAP;
spawnTanks(game, { scene: { remove() {} } });
for (const e of game.allTanks) e.visual = visual(e);
const bus = createBus(() => {});
const collider = createCollider(game, world);
const battle = (ticks) => {
  game.battleCount = (game.battleCount ?? 0) + 1;
  setupBattle(game, TANK_IDS[0], world, { gameMode: 'standard', random: false, arrangement: null, brain: null, deferVisuals: true,
    deferCamoRepaint: true, deferOpeningRoutes: true });
  for (const e of game.allTanks) if (!e.visual?.gunMuzzleWorld) e.visual = visual(e);
  game.preBattleS = 0;
  return () => { for (let tick = 0; tick < ticks; tick++) simStep(game, bus, world, null, collider); };
};
/** Count the hulls begun on `field` from now on (none when there is no field). */
const hullsOn = (field) => {
  if (!field) return () => 0;
  let hulls = 0;
  const beginHull = field.beginHull;
  field.beginHull = function (...args) { hulls++; return beginHull.apply(this, args); };
  return () => hulls;
};

const provider = createSoloWorldKernels(module, false);
/** The kernel support fields the provider made, and the hulls begun on each. */
const kernelFields = [];
const spied = {
  ...provider,
  supportField(w, terrain) {
    const field = provider.supportField(w, terrain);
    kernelFields.push({ field, hulls: hullsOn(field) });
    return field;
  },
};
const report = globalThis.__SIM_KERNELS;
try {
  // battle 1: set up while the module is still loading; it lands before the first step
  setSoloWorldKernels(null);
  const step1 = battle(3);
  const typescriptField = game._supportField;
  const typescriptHulls = hullsOn(typescriptField);
  setSoloWorldKernels(spied);
  step1();
  assert.equal(kernelFields.length, 0, 'kernels that land after a battle\'s setup leave its hulls\' support on the TypeScript (the old step made the kernel field at its first step)');
  assert.ok(typescriptHulls() > 0, `its hulls stood on the battle's TypeScript field (${typescriptHulls()})`);
  assert.equal(typeof typescriptField.sampleSupportLines, 'undefined', 'a TypeScript field, not the kernels\'');
  assert.equal(report.worlds, 0, 'no world mirrored');
  assert.equal(game._obstacleQuery, world.queryObstacles, 'and its obstacle query is the world\'s');

  // battle 2 on the same world: the kernels from its setup
  const step2 = battle(3);
  assert.equal(kernelFields.length, 1, 'the next battle on the world rides the kernels from its setup: their field made once');
  const kernels = kernelFields[0];
  assert.equal(game._supportField, kernels.field, 'its support field is the kernels\'');
  assert.equal(report.worlds, 1, 'its ground mirrored at setup');
  assert.notEqual(game._obstacleQuery, world.queryObstacles, 'its obstacle query is the kernel grid');
  assert.equal(typeof game._obstacleQuery.clearance?.begin, 'function', 'with the bots\' clearance walk');
  const kernelQuery = game._obstacleQuery;
  const typescriptBefore = typescriptHulls();
  step2();
  assert.ok(kernels.hulls() > 0, `its hulls stood on the kernels' field (${kernels.hulls()})`);
  assert.equal(typescriptHulls(), typescriptBefore, 'and none on the TypeScript\'s');

  // battle 3: the world's kernels again, one instance; its ground's every stamp reaches them once
  const step3 = battle(3);
  assert.equal(kernelFields.length, 1, 'a world keeps one kernel field');
  assert.equal(game._supportField, kernels.field, 'the battle reads it');
  assert.equal(report.worlds, 1, 'a world mirrors its ground onto one instance for its life');
  assert.equal(game._obstacleQuery, kernelQuery, 'the same kernel grid');
  const [px, , pz] = world.spawnPoints.player.pos;
  assert.ok(ground.addCrater(px + 18, pz + 14, 3, 1, 0.4, 77), 'a crater laid on the battle\'s ground');
  const typescriptGround = createDeformedHeightField(world.heightField, ground);
  const bits = (value) => Buffer.from(new Float64Array([value]).buffer).toString('hex');
  const craters = ground.stamps.filter((stamp) => stamp.kind === 'crater');
  for (const crater of craters) {
    for (let i = -3; i <= 3; i++) {
      for (let k = -3; k <= 3; k++) {
        const x = crater.x + i * 0.61 * crater.radiusM, z = crater.z + k * 0.53 * crater.radiusM;
        const want = typescriptGround.getContactHeightAt(x, z), got = kernels.field.getTerrainContactHeightAt(x, z);
        assert.equal(bits(got), bits(want), `battle 3, the crater at (${crater.x}, ${crater.z}): the kernels' ground at (${x}, ${z}) reads ${got} where the TypeScript's reads ${want} (a stamp told twice, or lost)`);
      }
    }
  }
  step3();
  assert.ok(kernels.hulls() > 0);
} finally {
  setSoloWorldKernels(null);
  world.release?.();
}

console.log('soloKernelChoice selftest passed: kernels landing between a battle\'s setup and its first step leave its hulls on the '
  + 'TypeScript field; the next battle on the world stands its hulls on the kernels\' field from its setup, and a third reuses '
  + 'that one instance, its ground\'s every crater reading once on it');
process.exit(0);
