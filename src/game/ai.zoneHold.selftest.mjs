// A zone's hold point (bots lane, 2026-10-03). Redrock Divide's frontline line 3 has its centre on the plateau's
// 55-63 degree south face; every zone holder drove to that centre, climbed onto the face, pivoted there while the
// terrain guard flickered, slid off and fell. A zone mission holds the ground nearest the centre a hull can stand on;
// a zone on holdable ground is still held at its centre. A synthetic face pins the rule (not any map's geometry):
// a floor, a 52 degree face rising 26 m over 20 m, a plateau, and a zone centred halfway up the face.
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createBotNavigationGrid, planBotRoute } from '../sim/botRoutePlanner.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const FACE_Z0 = 60, PLATEAU_Y = 26;
/** Floor (y 0) south of z 60, a face rising 26 m over `run` m, a 26 m plateau north of it; `flat` keeps it level. */
function faceField(run, flat = false) {
  const getHeightAt = (x, z) => (flat ? 0 : Math.max(0, Math.min(PLATEAU_Y, (z - FACE_Z0) / run * PLATEAU_Y)));
  const getNormalAt = (x, z) => {
    const e = 0.5, dx = getHeightAt(x + e, z) - getHeightAt(x - e, z), dz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    const nx = -dx / (2 * e), nz = -dz / (2 * e), length = Math.hypot(nx, 1, nz);
    return { x: nx / length, y: 1 / length, z: nz / length };
  };
  return { getHeightAt, getNormalAt, getGroundType: () => 'firm' };
}

function entity(id, specId, team, x, z, field, yaw = 0) {
  const spec = getSpec(specId);
  const state = createTankState(spec, new Vector3(x, field.getHeightAt(x, z), z), yaw);
  return {
    id, specId, spec, team, state,
    combat: {
      hp: spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

function controller(bot, field, objective) {
  const navigation = createBotNavigationGrid({ heightField: field });
  const searchRng = mulberry32(431);
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(73),
    deps: {
      heightField: field,
      raycast: () => null,
      getEnemies: () => [],
      getAllies: () => [],
      getObstacles: () => [],
      spotting: { isSpotted: () => true },
      getObjective: () => objective,
      planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation, rng: searchRng, role: 'brawler',
        spec: bot.spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
    },
  });
  bot.aiCtl = ctl;
  return ctl;
}

/** Real movement; how long the hull stood on ground steeper than a holdable spot, and its height range. */
function drive(bot, ctl, field, seconds) {
  let steepS = 0, maxY = -Infinity, minY = Infinity;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    ctl.update(SIM_DT, 300 + i * SIM_DT);
    updateTank(bot, field, SIM_DT, null);
    const p = bot.state.pos;
    if (field.getNormalAt(p.x, p.z).y < 0.9) steepS += SIM_DT;
    maxY = Math.max(maxY, p.y);
    minY = Math.min(minY, p.y);
  }
  return { steepS, maxY, minY };
}

/** The hull's own footprint (a hull's length round its centre) stands on ground as level as a relocation spot. */
const holdable = (field, x, z, r = 4) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]
  .every(([dx, dz]) => field.getNormalAt(x + dx, z + dz).y >= 0.9);

console.log('[1] an attacker holds a zone centred on a 52 degree face from the floor it comes from');
{
  const field = faceField(20);
  const zone = { mission: 'assault', x: 0, z: 70, radiusM: 30 };
  const bot = entity('attacker', 'm1a2', 'alpha', 60, 55, field, -Math.PI / 2);
  const ctl = controller(bot, field, zone);
  const run = drive(bot, ctl, field, 90);
  const info = ctl.debugInfo();
  const p = bot.state.pos;
  ok(Number.isFinite(info.zoneHoldX) && info.zoneHoldZ < FACE_Z0 && holdable(field, info.zoneHoldX, info.zoneHoldZ),
    `the hold point (${info.zoneHoldX}, ${info.zoneHoldZ}) is holdable floor`);
  ok(run.steepS < 2, `the hull keeps off the face (${run.steepS.toFixed(1)} s on unholdable ground, up to ${run.maxY.toFixed(1)} m)`);
  ok(holdable(field, p.x, p.z) && Math.hypot(p.x - zone.x, p.z - zone.z) <= zone.radiusM * 0.8,
    `it holds inside the zone on level ground (${Math.hypot(p.x - zone.x, p.z - zone.z).toFixed(1)} m from the centre)`);
}

console.log('[2] a defender coming off the plateau holds a zone centred on the same face from the plateau');
{
  const field = faceField(20);
  const zone = { mission: 'assault', x: 0, z: 70, radiusM: 30 };
  const bot = entity('defender', 't90m', 'bravo', 0, 160, field, Math.PI);
  const ctl = controller(bot, field, zone);
  const run = drive(bot, ctl, field, 90);
  const info = ctl.debugInfo();
  const p = bot.state.pos;
  ok(Number.isFinite(info.zoneHoldZ) && info.zoneHoldZ > FACE_Z0 + 20 && holdable(field, info.zoneHoldX, info.zoneHoldZ),
    `the hold point (${info.zoneHoldX}, ${info.zoneHoldZ}) is holdable plateau`);
  ok(run.minY > PLATEAU_Y - 1 && run.steepS < 2,
    `the hull never goes over the edge (lowest ${run.minY.toFixed(1)} m, ${run.steepS.toFixed(1)} s on the face)`);
  ok(holdable(field, p.x, p.z) && Math.hypot(p.x - zone.x, p.z - zone.z) <= zone.radiusM * 0.8,
    `it holds inside the zone on level ground (${Math.hypot(p.x - zone.x, p.z - zone.z).toFixed(1)} m from the centre)`);
}

console.log('[3] control: a zone on level ground is held at its centre');
{
  const field = faceField(15, true);
  const zone = { mission: 'capture', x: 0, z: 67, radiusM: 30 };
  const bot = entity('holder', 'm1a2', 'alpha', 0, -40, field, 0);
  const ctl = controller(bot, field, zone);
  drive(bot, ctl, field, 60);
  const info = ctl.debugInfo();
  const p = bot.state.pos;
  ok(info.zoneHoldMoves === 0 && info.zoneHoldX === zone.x && info.zoneHoldZ === zone.z,
    `the hold point is the centre (${info.zoneHoldX}, ${info.zoneHoldZ}), moved ${info.zoneHoldMoves} times`);
  ok(Math.hypot(p.x - zone.x, p.z - zone.z) < 8, `the hull reaches the centre (${Math.hypot(p.x - zone.x, p.z - zone.z).toFixed(1)} m)`);
}

if (failures) {
  console.error(`ai.zoneHold.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.zoneHold.selftest: zone holders stand on holdable ground');
