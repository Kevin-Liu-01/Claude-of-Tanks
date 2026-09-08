import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { botNominalGunLaneClear } from './botGunLane.ts';
import { createTankState, updateTank, SIM_DT } from './movement.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createAI, mulberry32 } from '../game/ai.ts';
import { createHeadlessCollisionWorld } from '../world/headlessCollisionWorld.ts';
import { createHeightField } from '../world/terrain.ts';
import { getMapConfig } from '../world/maps/index.ts';

function entity(id, specId, pos, yaw = 0) {
  const spec = getSpec(specId);
  return {
    id, specId, spec, team: id === 'target' ? 'bravo' : 'alpha',
    state: createTankState(spec, new Vector3(...pos), yaw),
    combat: { hp: 2600, maxHp: 2600, destroyed: false, ammo: [24, 16, 12],
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 },
      magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false,
      aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
  };
}
const empty = { obstacles: [], colliders: [] };
const flat = { getHeightAt: () => 0, getNormalAt: () => new Vector3(0, 1, 0),
  getGroundType: () => 'hard', maxY: 10 };

// Canonical Airfield mapIndex22 / seed43001 / shell61, 391.983333s.
// Turret-top LOS clears the crest, but the actual lower muzzle does not.
const shooter = entity('shooter', 'm1a2', [113.765, 4.078, -130.383], 0);
const target = entity('target', 'strv103', [-63.781, 0.808, 183.19]);
// Exact pre-dispersion attitude from the deterministic failed match.
Object.assign(shooter.state, {
  yaw: -0.456, turretYaw: -0.05402412152841264, gunPitch: -0.15111017893973777,
  visualPitch: 0.1411400156117864, visualRoll: -0.05186608651551163,
});
const field = createHeightField(1337, getMapConfig('airfield'));
const world = createHeadlessCollisionWorld({ heightField: field, manifest: empty });
let queries = 0;
const raycast = (a, b, d) => { queries++; return world.raycast(a, b, d); };
const eye = new Vector3(shooter.state.pos.x,
  shooter.state.pos.y + shooter.spec.dims.heightM * 0.85, shooter.state.pos.z);
const targetEye = new Vector3(target.state.pos.x,
  target.state.pos.y + target.spec.dims.heightM * 0.85, target.state.pos.z);
const delta = targetEye.clone().sub(eye);
assert.equal(world.raycast(eye, delta.clone().normalize(), delta.length()), null,
  'real Airfield crest permits the old eye-to-eye visibility test');
assert.equal(botNominalGunLaneClear(shooter, target, shooter.spec.gun.shells[0], raycast), false,
  'real Airfield crest rejects the lower nominal muzzle lane');
assert.ok(queries <= 8, 'one probe makes at most eight existing world queries');

const openWorld = createHeadlessCollisionWorld({ heightField: flat, manifest: empty });
queries = 0;
const openRaycast = (a, b, d) => { queries++; return openWorld.raycast(a, b, d); };
assert.equal(botNominalGunLaneClear(shooter, target, shooter.spec.gun.shells[0], openRaycast), true,
  'the identical gun/target pose fires normally without the intervening crest');
assert.ok(queries <= 8);
const before = JSON.stringify({ shooter, target });
shooter.input.aimPoint.set(800, -200, -500); // intentionally bad sampled aim
assert.equal(botNominalGunLaneClear(shooter, target, shooter.spec.gun.shells[0], openRaycast), true,
  'random aim error is not inspected or filtered by the nominal lane');
shooter.input.aimPoint.set(0, 0, 0);
assert.equal(JSON.stringify({ shooter, target }), before, 'probe does not mutate entities');

// Controller integration: a low berm leaves the turret eye visible. Pin
// translation to isolate the trigger, then remove the berm without changing
// RNG, ammunition, reload, accuracy, or the controller instance.
let bermPresent = true;
const berm = { ...flat, getHeightAt: (x, z) => bermPresent && Math.abs(x) < 5
  ? 2 * Math.exp(-(((z - 20) / 4) ** 2)) : 0 };
const bermWorld = createHeadlessCollisionWorld({ heightField: berm, manifest: empty });
const bot = entity('bot', 'm1a2', [0, 0, 0]);
const opponent = entity('target', 'm1a2', [0, 0, 80]);
const ai = createAI(bot, { difficulty: 'normal', rng: mulberry32(41), deps: {
  heightField: berm, raycast: bermWorld.raycast, getEnemies: () => [opponent],
  getAllies: () => [], getObstacles: () => [], spotting: { isSpotted: () => true },
} });
let time = 180;
function tick(seconds) {
  let fired = false;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    time += SIM_DT;
    ai.update(SIM_DT, time);
    fired ||= bot.input.fire;
    bot.input.throttle = 0; bot.input.steer = 0; bot.input.brake = false;
    updateTank(bot, berm, SIM_DT);
  }
  return fired;
}
assert.equal(tick(8), false, 'visible target behind a muzzle-height berm never consumes a shot');
assert.ok(ai.debugInfo().gunLaneMoves > 0, 'persistent muzzle obstruction schedules existing relocation');
assert.ok(ai.debugInfo().gunLaneChecks <= Math.ceil(8 / 0.14) + 1,
  'blocked fire attempts are bounded by the existing LOS decision cadence');
assert.deepEqual(bot.combat.ammo, [24, 16, 12]);
bermPresent = false;
assert.equal(tick(8), true, 'ordinary firing resumes when the same physical gun lane clears');

// A failed relocation must wait for another blocked dwell, not rescan all
// three eight-cell rings at 60 Hz. Keep eye LOS clear but the muzzle blocked;
// only the current tank footprint is flat, so every relocation candidate fails.
const upNormal = new Vector3(0, 1, 0);
const steepNormal = new Vector3(0.4, 0.9, 0).normalize();
const laneHit = { dist: 0.1 };
let flatCandidatesAvailable = false;
let normalQueries = 0;
const noFlatField = {
  ...flat,
  getNormalAt(x, z) {
    normalQueries++;
    return flatCandidatesAvailable || Math.hypot(x, z) < 8 ? upNormal : steepNormal;
  },
};
const pocketBot = entity('pocket', 'm1a2', [0, 0, 0]);
const pocketTarget = entity('target', 'm1a2', [0, 0, 80]);
const pocketAI = createAI(pocketBot, { difficulty: 'normal', rng: mulberry32(41), deps: {
  heightField: noFlatField,
  raycast: (origin) => origin.z > 1 && origin.z < 10 ? laneHit : null,
  getEnemies: () => [pocketTarget], getAllies: () => [], getObstacles: () => [],
  spotting: { isSpotted: () => true },
} });
let pocketTime = 180;
const searchTimes = [];
let searchQueries = 0;
function tickPocket() {
  pocketTime += SIM_DT;
  normalQueries = 0;
  pocketAI.update(SIM_DT, pocketTime);
  const queriesThisFrame = normalQueries;
  pocketBot.input.throttle = 0; pocketBot.input.steer = 0; pocketBot.input.brake = false;
  updateTank(pocketBot, noFlatField, SIM_DT);
  return queriesThisFrame;
}
for (let frame = 0; frame < 8 / SIM_DT; frame++) {
  const queriesThisFrame = tickPocket();
  if (queriesThisFrame) searchTimes.push(pocketTime);
  searchQueries += queriesThisFrame;
  assert.equal(pocketBot.input.fire, false, 'failed relocation never bypasses the blocked gun lane');
}
assert.ok(searchTimes.length >= 2, 'fixture exercises repeated failed relocation attempts');
assert.ok(searchQueries <= 24 * Math.ceil(8 / 1.5),
  'failed relocation terrain queries remain bounded by the 1.5-second blocked dwell');
for (let i = 1; i < searchTimes.length; i++) {
  assert.ok(searchTimes[i] - searchTimes[i - 1] >= 1.5 - SIM_DT,
    'each failed relocation waits for fresh blocked dwell before retrying');
}
assert.equal(pocketAI.debugInfo().gunLaneMoves, 0, 'failed searches do not count as moves');
assert.ok(pocketAI.debugInfo().gunLaneChecks <= Math.ceil(8 / 0.14) + 1,
  'failed relocation does not accelerate nominal lane probes');
assert.deepEqual(pocketBot.combat.ammo, [24, 16, 12]);
flatCandidatesAvailable = true;
for (let frame = 0; frame < 3 / SIM_DT; frame++) tickPocket();
assert.ok(pocketAI.debugInfo().gunLaneMoves > 0,
  'bounded failure retries still relocate when a valid flat cell becomes available');
console.log('botGunLane.selftest: real crest, nominal-error independence, relocation and bounded failed retries pass');
