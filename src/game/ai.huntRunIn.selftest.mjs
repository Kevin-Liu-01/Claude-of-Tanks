// The hunt's run-in and its orbit rings (gameplay-modes-228 round 3; the critic's M2/M3: aimed at the quarry's hull, a
// rushing hunter met the no-ram brake 10-20 m out at full pace and stood still beside it, and on Verdant up to a dozen
// zombies orbited the same humans 16-28 m out, yielding to one another and wedged nose to tail). Pins: a rusher run in
// on a seen target aims RUSH_DRIVE.runInSideM beside it and passes it on its orbit's side — it never closes inside
// orbitMinM nor stands still on the way; and each friendly hunter already nearer the target puts the next hunter's orbit
// orbitStepM further out (own-team positions only).
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { RUSH_DRIVE, matchRulesetFor, rulesetBotDoctrine } from '../sim/matchRuleset.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, team, x, z, yaw = 0) {
  const spec = getSpec('t90a');
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
}
const RUSH = rulesetBotDoctrine(matchRulesetFor('endless_horde'), 'bravo');
/** A rushing hunter 65 m from a seen, stationary quarry, its hunt objective on the quarry; `friends` stand where placed. */
function hunt({ seconds = 25, friends = [] } = {}) {
  const bot = tank('bot', 'bravo', 0, 0, 0), quarry = tank('quarry', 'alpha', 0, 65, Math.PI);
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(9), doctrine: () => RUSH, deps: {
    heightField: field, raycast: () => null, getEnemies: () => [quarry], getAllies: () => [bot, ...friends], getObstacles: () => [],
    spotting: { isSpotted: () => true }, getObjective: () => ({ x: quarry.state.pos.x, z: quarry.state.pos.z, mission: 'hunt', radiusM: 25 }),
  } });
  let closest = Infinity, engaged = 0, still = 0, prev = { x: 0, z: 0 };
  const late = [];
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 1 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    updateTank(bot, field, SIM_DT, null);
    quarry.combat.hp = quarry.combat.maxHp; // the quarry stands: the run-in is the subject
    const d = Math.hypot(bot.state.pos.x - quarry.state.pos.x, bot.state.pos.z - quarry.state.pos.z);
    closest = Math.min(closest, d);
    if (t >= 3 && i % 30 === 0) {
      const speed = Math.hypot(bot.state.pos.x - prev.x, bot.state.pos.z - prev.z) / (30 * SIM_DT);
      if (ctl.state === 'engage') { engaged++; if (speed < 0.75) still++; }
      if (t >= seconds - 8) late.push(d);
    }
    if (i % 30 === 0) prev = { x: bot.state.pos.x, z: bot.state.pos.z };
  }
  return { closest, engaged, still, lateMean: late.reduce((s, v) => s + v, 0) / Math.max(1, late.length) };
}

console.log('[1] the run-in passes beside the quarry onto the orbit, never into it, and never stands');
const alone = hunt();
ok(alone.engaged > 20, `engaged (${alone.engaged} samples)`);
ok(alone.closest >= RUSH_DRIVE.noRamM, `never inside the no-ram distance (${alone.closest.toFixed(1)} m at the closest)`);
ok(alone.still / alone.engaged < 0.05, `it keeps way on (${alone.still} of ${alone.engaged} engaged samples still)`);
ok(alone.lateMean >= RUSH_DRIVE.orbitMinM - 4 && alone.lateMean <= RUSH_DRIVE.orbitMaxM + 6,
  `then orbits in the band (${alone.lateMean.toFixed(1)} m on average, band ${RUSH_DRIVE.orbitMinM}-${RUSH_DRIVE.orbitMaxM})`);

console.log('[2] a friendly hunter already nearer the quarry puts this one a ring further out');
{
  // two friends standing on the quarry's near ring (they are nearer it than the hunter all the way in)
  const f1 = tank('f1', 'bravo', 18, 65, 0), f2 = tank('f2', 'bravo', -18, 65, 0);
  const crowded = hunt({ friends: [f1, f2] });
  ok(crowded.closest >= RUSH_DRIVE.orbitMinM + RUSH_DRIVE.orbitStepM - 6,
    `kept out (${crowded.closest.toFixed(1)} m at the closest against ${alone.closest.toFixed(1)} m alone)`);
  ok(crowded.lateMean >= alone.lateMean + RUSH_DRIVE.orbitStepM, `orbits further out (${crowded.lateMean.toFixed(1)} m against ${alone.lateMean.toFixed(1)} m)`);
  ok(crowded.still / crowded.engaged < 0.05, `and keeps way on (${crowded.still} of ${crowded.engaged} still)`);
}

if (failures) { console.error(`ai.huntRunIn.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.huntRunIn.selftest: the run-in passes beside its quarry onto the orbit, the orbit spreads ring by ring');
