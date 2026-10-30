// The solo battle's kernels across a WebAssembly memory growth (fix-detached-buffer-265). wasmWorldKernels.ts views its
// kernel's buffers as typed arrays over `memory.buffer`; a growth detaches every older view. The hulls' support sampler
// read `w.memory.buffer` and then called the kernel for its frame and output pointers in the same constructor's
// arguments, and that call's first run allocates the sampler (crates/cot-sim-wasm sampling()): where the allocation grew
// the memory, the view was built on the buffer the growth had just detached ("Cannot perform Construct on a detached
// ArrayBuffer"). On Desert the page's first step threw it (live 264c, 8eee6be724: once a battle, its first tick cut short).
// Held here:
// - a 7v7 Desert battle seated by the page's own setupBattle on the provider (world/soloWorldKernelProvider.ts) steps
//   from its first tick, and on through a hull moved across the map mid-battle (a respawn moves a hull the same way);
// - the invariant on any map: every kernel pointer export grows the memory by a page on its first call (wrapped at
//   WebAssembly.Instance), and the battle still steps, its every hull's state byte for byte the unwrapped battle's.
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

await ensureFullFleet();
const module = await compileWorldKernels(readFileSync(new URL('../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url)));

// the gun's muzzle and bore as the authority poses them (soloKernelObstacleQuery.selftest.mjs)
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

const hex = (value) => Buffer.from(new Float64Array([Number(value)]).buffer).toString('hex');
const worldBytes = (game) => game.allTanks.filter((e) => e.state).map((e) =>
  [e.id, hex(e.state.pos.x), hex(e.state.pos.y), hex(e.state.pos.z), hex(e.state.yaw), hex(e.state.speed)].join(' ')).join('|');

/** A 7v7 on `map` stepped `ticks` ticks on the provider's kernels; `onTick` may move a hull. */
function battle(map, ticks, onTick = null) {
  const provider = createSoloWorldKernels(module, false);
  setSoloWorldKernels(provider);
  const world = createDedicatedWorldCollision(map);
  const authored = world.heightField._layout.spawns;
  const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: 3 });
  game.mapId = map;
  spawnTanks(game, { scene: { remove() {} } });
  for (const e of game.allTanks) e.visual = visualFor(e);
  game.battleCount = 1;
  setupBattle(game, 'leo2a4', world, { gameMode: 'standard', random: true, brain: null, deferVisuals: true, deferCamoRepaint: true });
  for (const e of game.allTanks) if (!e.visual?.gunMuzzleWorld) e.visual = visualFor(e);
  game.preBattleS = 0;
  const bus = createBus(() => {});
  const collider = createCollider(game, world);
  try {
    for (let tick = 1; tick <= ticks; tick++) {
      onTick?.(tick, game, world);
      simStep(game, bus, world, null, collider);
    }
    return worldBytes(game);
  } finally {
    world.release?.();
    setSoloWorldKernels(null);
  }
}

// Desert from its first tick, and a hull moved across the map at tick 40 (to the far side of the spawn line)
{
  const bytes = battle('desert', 90, (tick, game, world) => {
    if (tick !== 40) return;
    const bot = game.tanks.find((e) => !e.isPlayer);
    const x = -bot.state.pos.x * 0.6, z = -bot.state.pos.z * 0.6;
    bot.state.pos.set(x, world.heightField.getHeightAt(x, z) + 0.2, z);
    bot.state.speed = 0;
  });
  assert.ok(bytes.length > 0, 'the Desert battle stepped from its first tick through a hull moved across the map');
}

// the invariant on a map whose memory never grew there (Verdant): every pointer export grows the memory by a page on its
// first call; the battle steps, the same battle to the byte
{
  const plain = battle('verdant', 60);
  const RealInstance = WebAssembly.Instance;
  let grown = 0;
  WebAssembly.Instance = function GrowingInstance(mod, imports) {
    const real = new RealInstance(mod, imports);
    const exports = { ...real.exports };
    for (const [name, fn] of Object.entries(real.exports)) {
      if (typeof fn !== 'function' || !name.endsWith('_ptr')) continue;
      let first = true;
      exports[name] = (...args) => { const at = fn(...args); if (first) { first = false; real.exports.memory.grow(1); grown++; } return at; };
    }
    return { exports };
  };
  let grownBytes;
  try { grownBytes = battle('verdant', 60); } finally { WebAssembly.Instance = RealInstance; }
  assert.ok(grown > 0, 'the pointer exports grew the memory');
  assert.equal(grownBytes, plain, 'a growth inside any pointer call changes nothing: the same battle to the byte');
}

console.log('soloKernelMemoryGrowth selftest passed: the page step on Desert from its first tick and across a moved hull; '
  + 'every kernel pointer growing the memory on its first call leaves a Verdant battle byte-identical');
process.exit(0);
