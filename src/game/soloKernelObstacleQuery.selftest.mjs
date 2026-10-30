// The page's step on the world's obstacle grid on its kernels (local-fps-265): a solo battle's bots and its collisions
// read the obstacle query the authority's world reads (headlessCollisionWorld builds it on the same kernel grid), its
// clearance scan taking the bots' solid sweeps (ai.ts solidAhead, avoidObstacles) off the TypeScript fallback; the step
// was 16 % cheaper a tick in the lane's bench (7v7 Verdant). The kernel grid holds the world grid's records in the same
// slots and answers bit for bit, so the battle is the same world: here a 7v7 on Verdant seated by the page's own
// setupBattle twice, once with the provider's obstacle query (world/soloWorldKernelProvider.ts, the code the page runs)
// and once on the world's TypeScript grid, every hull's state, combat and input compared as Float64 bytes every 60 ticks.
// Negative control: one moving bot's speed a billionth higher at tick 120 on the kernel side is found by the next checkpoint.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import * as detMath from '../sim/detMath.ts';
import { createBus, createCollider, createGameState, setSoloWorldKernels, setupBattle, simStep } from './state.ts';
import { spawnTanks } from './rosterState.ts';
import { ensureFullFleet } from '../vehicles/fleetFactory.ts';
import { compileWorldKernels } from '../world/wasmWorldKernels.ts';
import { createSoloWorldKernels } from '../world/soloWorldKernelProvider.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const MAP = 'verdant';
const TICKS = 360;
await ensureFullFleet();
const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));

// the gun's muzzle and bore as the authority poses them (the page fires from its visual's; a headless visual stands in)
const _euler = new Euler(), _quat = new Quaternion(), _unit = new Vector3(), _hull = new Matrix4(), _local = new Matrix4();
const _turret = new Matrix4(), _bore = new Vector3();
function gunPose(entity, muzzleOut, dirOut) {
  const s = entity.state, armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, Number.isFinite(armor.gunBarrel?.lengthM) ? armor.gunBarrel.lengthM : 3);
  _euler.set(-s.visualPitch, s.yaw, s.visualRoll, 'YXZ');
  _quat.setFromEuler(_euler);
  _unit.setScalar(s.modeScale ?? 1);
  _hull.compose(s.pos, _quat, _unit);
  _local.makeRotationY(s.turretYaw);
  _local.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turret.multiplyMatrices(_hull, _local);
  _bore.set(0, detMath.sin(s.gunPitch), detMath.cos(s.gunPitch)).transformDirection(_turret).normalize();
  if (dirOut) dirOut.copy(_bore);
  if (muzzleOut) muzzleOut.set(gunPivot[0], gunPivot[1], gunPivot[2]).applyMatrix4(_turret).addScaledVector(_bore, barrelM * (s.modeScale ?? 1));
}
const visualFor = (entity) => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {},
  gunMuzzleWorld: (out) => gunPose(entity, out, null), gunDirWorld: (out) => gunPose(entity, null, out) });

const FIELDS = ['yaw', 'speed', 'verticalSpeed', 'yawRate', 'turretYaw', 'gunPitch', 'visualPitch', 'visualRoll'];
const hex = (value) => Buffer.from(new Float64Array([Number(value)]).buffer).toString('hex');
/** Every hull's simulated state, combat and controls as bytes. */
function worldBytes(game) {
  const rows = [];
  for (const e of game.allTanks) {
    if (!e.state) continue;
    const s = e.state, c = e.combat ?? {};
    rows.push(e.id, hex(s.pos.x), hex(s.pos.y), hex(s.pos.z), ...FIELDS.map((key) => hex(s[key])), hex(c.hp ?? 0), c.destroyed ? 1 : 0,
      hex(e.input.throttle ?? 0), hex(e.input.steer ?? 0), e.input.brake ? 1 : 0, e.input.fire ? 1 : 0);
  }
  rows.push(`shells ${game.shells.length}`);
  return rows.join(' ');
}

/** The battle stepped `TICKS` ticks; `kernelQuery` puts the step on the provider's obstacle query. */
function run(kernelQuery, perturb = null) {
  const provider = createSoloWorldKernels(module, false);
  setSoloWorldKernels(kernelQuery ? provider : { mirrorGround: provider.mirrorGround, supportField: provider.supportField });
  const world = createDedicatedWorldCollision(MAP);
  const authored = world.heightField._layout.spawns;
  const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  for (const e of game.allTanks) e.visual = visualFor(e);
  game.battleCount = 1;
  setupBattle(game, 'leo2a4', world, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true });
  for (const e of game.allTanks) if (!e.visual?.gunMuzzleWorld) e.visual = visualFor(e);
  game.preBattleS = 0;
  const query = game._obstacleQuery;
  const bus = createBus(() => {});
  const collider = createCollider(game, world);
  const checkpoints = [];
  const start = game.tanks.map((e) => [e.state.pos.x, e.state.pos.z]);
  for (let tick = 1; tick <= TICKS; tick++) {
    if (perturb) perturb(tick, game);
    simStep(game, bus, world, null, collider);
    if (tick % 60 === 0) checkpoints.push(worldBytes(game));
  }
  const moved = game.tanks.filter((e, i) => Math.hypot(e.state.pos.x - start[i][0], e.state.pos.z - start[i][1]) > 5).length;
  world.release?.();
  setSoloWorldKernels(null);
  return { checkpoints, query, worldQuery: world.queryObstacles, tanks: game.tanks.length, moved };
}

const kernel = run(true);
const typescript = run(false);
assert.equal(kernel.tanks, 14, 'a 7v7 battle');
assert.ok(kernel.query && typeof kernel.query.clearance?.lane === 'function', 'the step reads the kernel grid, with its clearance scan');
assert.notEqual(kernel.query, kernel.worldQuery, 'not the world\'s own TypeScript grid');
assert.equal(typescript.query, typescript.worldQuery, 'without the provider\'s query the step reads the world\'s grid');
assert.ok(kernel.moved >= 8, `the bots drove (${kernel.moved} of 14 hulls moved past 5 m)`);
for (let i = 0; i < kernel.checkpoints.length; i++) {
  assert.equal(kernel.checkpoints[i], typescript.checkpoints[i], `the kernel query's battle parts from the TypeScript grid's at tick ${(i + 1) * 60}`);
}

// negative control: one moving bot's speed a billionth higher before tick 121 (state its controller does not rewrite) is a
// different world
const nudged = run(true, (tick, game) => {
  if (tick === 121) { const bot = game.tanks.find((e) => !e.isPlayer && Math.abs(e.state.speed) > 0.5); bot.state.speed += 1e-9; }
});
const parted = nudged.checkpoints.findIndex((bytes, i) => bytes !== kernel.checkpoints[i]);
assert.ok(parted >= 0 && parted <= 2, `the nudge is caught by the checkpoint after it (parted at ${(parted + 1) * 60})`);

console.log(`soloKernelObstacleQuery selftest passed: the page's step on the kernel obstacle grid plays the TypeScript grid's 7v7 byte for byte over ${TICKS} ticks (${kernel.moved} hulls moved); a 1e-9 nudge parts at tick ${(parted + 1) * 60}`);
process.exit(0);
