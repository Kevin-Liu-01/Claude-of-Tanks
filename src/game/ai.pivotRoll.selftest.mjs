// A pivot is a turn in place (gameplay lane, 2026-10-09). botModes' Aegis Crossing Turbo Ball scenario (seed 57001) on
// the tree that first carried the careful-driving rules: a T-90M whose goal lay more than 1.2 rad off its bow took the
// classic pivot, whose 0.3 drive held for the whole turn, and at Turbo Ball's 1.85x speed and 0.6 g it rolled from 2.9
// to 8.6 m/s in 2.3 s on full steer, heeled 0.5-0.9 rad, ran 6 m off the bank beside the bridge onto the gorge's
// 55-degree side and rolled down it: a 31 m/s landing, 896 points, the receipt's catastrophic-fall line. A pivot never
// drives faster than PIVOT_ROLL_MAX_MPS (4 m/s): above it the drive is cut and the hull coasts into the turn (no brake: a
// scout swinging onto a contact at 14 m/s keeps its way on, ai.underFire's fresh-contact case). A flat,
// empty field pins the rule (no solids, so the creeping pivot beside walls stays out of it).
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.error(`FAIL  ${label}`); }
}

const FIELD = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };

/** A T-90M heading north (+z) at `speed`, its one waypoint 60 m behind it: the goal is pi rad off the bow. */
function setup(speed, turbo = false) {
  const spec = getSpec('t90m');
  const state = createTankState(spec, new Vector3(0, 0, 0), 0);
  state.speed = speed;
  const bot = {
    id: 'bot', specId: 't90m', spec, team: 'bravo', state,
    combat: {
      hp: spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
    ...(turbo ? { modeSpeedMultiplier: 1.85, modeGravityScale: 0.6 } : {}),
  };
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(11),
    deps: {
      heightField: FIELD, raycast: () => null, getEnemies: () => [], getAllies: () => [],
      getObstacles: () => [], spotting: { isSpotted: () => true },
    },
  });
  ctl.setWaypoints([[0, -60]], { loop: false });
  bot.aiCtl = ctl;
  return { bot, ctl };
}

console.log('[1] rolling at 7 m/s with the goal behind: no pivot drive, the hull coasts into the turn');
{
  const { bot, ctl } = setup(7);
  ctl.update(SIM_DT, 300);
  ok(bot.input.throttle === 0 && bot.input.brake === false,
    `throttle ${bot.input.throttle}, brake ${bot.input.brake}: it coasts (the classic pivot drove 0.3 here)`);
  ok(Math.abs(bot.input.steer) > 0.9, `the turn is still steered (${bot.input.steer.toFixed(2)})`);
  ok(ctl.debugInfo().pivotRollCuts >= 1, `the cut is counted (${ctl.debugInfo().pivotRollCuts})`);
}

console.log('[2] control: at 2 m/s the pivot keeps its friction-breaking drive');
{
  const { bot, ctl } = setup(2);
  ctl.update(SIM_DT, 300);
  ok(Math.abs(bot.input.throttle - 0.3) < 1e-9 && bot.input.brake === false,
    `throttle ${bot.input.throttle}, brake ${bot.input.brake}`);
  ok(ctl.debugInfo().pivotRollCuts === 0, 'no cut');
}

console.log('[3] Turbo Ball speed and gravity, from a 3 m/s start: the pivot stays under the cap until it ends');
{
  const { bot, ctl } = setup(3, true);
  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  let top = 0, pivotS = 0, endedAt = null;
  for (let i = 0; i < 6 / SIM_DT; i++) {
    const st = bot.state;
    // the pivot branch drives while the goal lies more than 1.2 rad off the bow (ai.ts driveToXZ)
    const err = wrap(Math.atan2(0 - st.pos.x, -60 - st.pos.z) - st.yaw);
    if (Math.abs(err) <= 1.2) { endedAt = i * SIM_DT; break; }
    ctl.update(SIM_DT, 300 + i * SIM_DT);
    updateTank(bot, FIELD, SIM_DT, null);
    top = Math.max(top, Math.abs(bot.state.speed));
    pivotS += SIM_DT;
  }
  ok(top <= 4.5, `top speed in the pivot ${top.toFixed(2)} m/s over ${pivotS.toFixed(1)} s (cap 4; the classic pivot reached 8.6)`);
  ok(endedAt !== null && endedAt < 5, `the hull comes round to its goal (the pivot ends at ${endedAt?.toFixed(1) ?? 'never'} s)`);
}

if (failures) {
  console.error(`ai.pivotRoll.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.pivotRoll.selftest: a pivot turns in place — cut above 4 m/s, drive below, Turbo turn under the cap');
