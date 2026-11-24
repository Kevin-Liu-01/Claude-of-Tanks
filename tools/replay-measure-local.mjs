#!/usr/bin/env node
/**
 * Replay design measurement on the LOCAL driver (replay-system lane, 2026-11-22; docs/REPLAY.md). Node-only.
 *
 * A solo battle is stepped by game/state.ts simStep, not by the authority. This plays one full solo battle (the page's
 * own setupBattle and roster, its real bots, opening routes on), feeding the player's seat a scripted, wire-quantized
 * control stream through the seat stage (sim/playerInputStage.ts applyPlayerInput) as the page does, then plays it
 * again from the same seed and the same recorded controls, and compares every hull's Float64 state every `every` ticks.
 *
 *   node tools/replay-measure-local.mjs --ticks=25200 --map=verdant --mode=standard --seed=7
 */
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import * as detMath from '../src/sim/detMath.ts';
import { createBus, createCollider, createGameState, mulberry32, setupBattle, simStep } from '../src/game/state.ts';
import { spawnTanks } from '../src/game/rosterState.ts';
import { applyPlayerInput } from '../src/sim/playerInputStage.ts';
import { encodeAimIntent } from '../src/sim/aimIntent.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { quantizeAngle, dequantizeAngle, quantizeAimPitch, dequantizeAimPitch, quantizeAimDistance, dequantizeAimDistance, quantizeControlAxis, dequantizeControlAxis } from '../src/mp/wire/quantize.ts';
import { ensureFullFleet } from '../src/vehicles/fleetFactory.ts';

const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
const MAP = arg('map', 'verdant');
const MODE = arg('mode', 'standard');
const SEED = Number(arg('seed', 7));
const TICKS = Number(arg('ticks', 60 * 60 * 7));
const EVERY = Number(arg('every', 60));
const SPEC = arg('spec', 'm1a1_abrams_hc');
await ensureFullFleet?.();

const q = (input) => ({ ...input,
  throttle: dequantizeControlAxis(quantizeControlAxis(input.throttle)), steer: dequantizeControlAxis(quantizeControlAxis(input.steer)),
  aimYaw: dequantizeAngle(quantizeAngle(input.aimYaw)), aimPitch: dequantizeAimPitch(quantizeAimPitch(input.aimPitch)),
  aimDistance: dequantizeAimDistance(quantizeAimDistance(input.aimDistance)) });

// The gun's muzzle and bore from the simulated pose (authoritativeMatch.ts gunWorldPose, as driverStepParity stubs it):
// the replay design's fix for the solo driver reading the rendered barrel (state.ts prepareMuzzleDirection).
const _euler = new Euler(), _quat = new Quaternion(), _unit = new Vector3(), _hull = new Matrix4(), _local = new Matrix4(), _turret = new Matrix4(), _bore = new Vector3();
function simGunPose(entity, muzzleOut, dirOut) {
  const s = entity.state, armor = entity.spec.armor || {};
  const turretPivot = armor.turretPivot || [0, entity.spec.dims.heightM * 0.7, 0];
  const gunPivot = armor.gunPivot || [0, entity.spec.dims.heightM * 0.15, 0];
  const barrelM = Math.max(0.5, Number.isFinite(armor.gunBarrel?.lengthM) ? armor.gunBarrel.lengthM : 3);
  _euler.set(-s.visualPitch, s.yaw, s.visualRoll, 'YXZ'); _quat.setFromEuler(_euler); _unit.setScalar(s.modeScale ?? 1);
  _hull.compose(s.pos, _quat, _unit); _local.makeRotationY(s.turretYaw); _local.setPosition(turretPivot[0], turretPivot[1], turretPivot[2]);
  _turret.multiplyMatrices(_hull, _local);
  _bore.set(0, detMath.sin(s.gunPitch), detMath.cos(s.gunPitch)).transformDirection(_turret).normalize();
  if (dirOut) dirOut.copy(_bore);
  if (muzzleOut) muzzleOut.set(gunPivot[0], gunPivot[1], gunPivot[2]).applyMatrix4(_turret).addScaledVector(_bore, barrelM * (s.modeScale ?? 1));
}
const hex = (v) => Buffer.from(new Float64Array([Number(v)]).buffer).toString('hex');
function digest(game) {
  let out = '';
  for (const e of game.allTanks) {
    if (!e?.state) continue;
    const s = e.state, c = e.combat;
    out += `${e.id}|${hex(s.pos.x)}${hex(s.pos.y)}${hex(s.pos.z)}${hex(s.yaw)}${hex(s.speed)}${hex(s.turretYaw)}${hex(s.gunPitch)}|${hex(c.hp)}|${c.destroyed ? 1 : 0}|${(c.ammo ?? []).join(',')}\n`;
  }
  return out;
}

function runOnce(recorded) {
  const world = createDedicatedWorldCollision(MAP, { retain: true });
  const authored = world.heightField._layout.spawns;
  const spawnOf = (p) => ({ pos: [p.x, world.heightField.getHeightAt(p.x, p.z), p.z], yaw: p.yaw ?? 0 });
  world.spawnPoints = { player: spawnOf(authored.player), enemies: authored.enemies.map(spawnOf) };
  const game = createGameState({ rosterSeed: SEED });
  game.mapId = MAP;
  spawnTanks(game, { scene: { remove() {} } });
  const stubVisual = (entity) => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {},
    gunMuzzleWorld: (out) => simGunPose(entity, out, null), gunDirWorld: (out) => simGunPose(entity, null, out) });
  for (const entity of game.allTanks) if (entity) entity.visual = stubVisual(entity);
  game.battleCount = 1;
  setupBattle(game, SPEC, world, { gameMode: MODE, random: true, brain: null, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false, seed: SEED });
  for (const entity of game.allTanks) { if (!entity?.state) continue; entity.visual = stubVisual(entity); if (entity.input) entity.input.aimPoint ??= new Vector3(); }
  game.combatRng = mulberry32(SEED);
  const bus = createBus(() => {});
  const emit = (type, payload) => bus.emit(type, payload);
  const counts = {};
  const countType = (type) => { counts[type] = (counts[type] ?? 0) + 1; };
  for (const type of ['tank:destroyed', 'shell:fired', 'shell:hit', 'tank:spotted', 'fire:start']) bus.on(type, () => countType(type));
  const collider = createCollider(game, world);
  const own = game.tanks.find((e) => e.isPlayer);
  const foes = () => game.tanks.filter((e) => e.team !== own.team && !e.combat.destroyed);
  const controls = recorded ?? [];
  const digests = [];
  let stepMs = 0, ticks = 0;
  for (let tick = 0; tick < TICKS; tick++) {
    let input;
    if (recorded) input = recorded[tick];
    else {
      // the player: drives toward the nearest live hostile, laying on it, firing every 4 s
      const target = foes().sort((a, b) => a.state.pos.distanceTo(own.state.pos) - b.state.pos.distanceTo(own.state.pos))[0] ?? own;
      let error = Math.atan2(target.state.pos.x - own.state.pos.x, target.state.pos.z - own.state.pos.z) - own.state.yaw;
      error = Math.atan2(Math.sin(error), Math.cos(error));
      input = q({ throttle: tick > 120 ? 0.8 : 0, steer: Math.max(-1, Math.min(1, error * 2)), brake: false, fire: tick % 240 === 200, shellSlot: 0,
        actionBits: 0, aimLocked: false, ...encodeAimIntent(own.state.pos, { x: target.state.pos.x, y: target.state.pos.y + 1.5, z: target.state.pos.z }) });
      controls.push(input);
    }
    const t0 = performance.now();
    if (!own.combat.destroyed) applyPlayerInput(own, input, emit);
    simStep(game, bus, world, null, collider);
    stepMs += performance.now() - t0;
    ticks = tick + 1;
    if (tick % EVERY === 0) digests.push(digest(game));
    if (game.matchResult || game.result) break;
  }
  world.release?.();
  return { digests, controls, stepMs, ticks, counts, alive: game.tanks.filter((e) => !e.combat.destroyed).length, total: game.tanks.length, result: game.matchResult ?? game.result ?? null };
}

const a = runOnce(null);
const b = runOnce(a.controls);
let firstDiff = null;
for (let i = 0; i < Math.max(a.digests.length, b.digests.length); i++) if (a.digests[i] !== b.digests[i]) { firstDiff = i * EVERY; break; }
console.log(JSON.stringify({ driver: 'local (game/state.ts simStep)', map: MAP, mode: MODE, seed: SEED, spec: SPEC, tanks: a.total, ticksA: a.ticks, ticksB: b.ticks,
  battleS: Math.round(a.ticks / 60), result: typeof a.result === 'object' ? JSON.stringify(a.result) : a.result, aliveAtEnd: a.alive,
  stepMsPerTick: Math.round(1000 * a.stepMs / a.ticks) / 1000, countsA: a.counts, countsB: b.counts,
  replayIdentical: firstDiff === null && a.ticks === b.ticks, firstDiffTick: firstDiff }, null, 2));
process.exitCode = firstDiff === null ? 0 : 1;
