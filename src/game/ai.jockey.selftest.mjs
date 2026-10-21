// The jockey and the rolling turn (gameplay-modes-228 round 3; the critic's M3/M4: Frontline's bots stood still in
// 28-33 % of their engaged samples and the infected in 8-10 %, the owner having asked for more aggression). Pins: the
// classic controller in its hold band stands, turned to its angle, exactly as before (jockeyS 0); a doctrine with jockeyS
// strafes that stand round its target with way on — the turn-abouts swing the bow through the target, never braking
// to reverse — and a stall turns a leg about at once; the settled-shot halt is never jockeyed; a side with
// rollingTurns drives a hard turn round with way on where the classic hull pivots in place; and under the 'angle' hit
// policy the turn onto a shot is driven round too, where the classic reaction stands and pivots.
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE, JOCKEY_DRIVE, matchRulesetFor, rulesetBotDoctrine } from '../sim/matchRuleset.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, team, x, z, yaw = 0) {
  const spec = getSpec('m1a1_abrams_hc');
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
}
/** An engaged bot 70 m from a seen enemy that never moves, on open flat ground; samples every 0.5 s after the first 4 s. */
function stand(doctrine, { seconds = 30, enemyAt = [0, 70], yaw = 0 } = {}) {
  const bot = tank('bot', 'alpha', 0, 0, yaw), enemy = tank('enemy', 'bravo', enemyAt[0], enemyAt[1], Math.PI);
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => doctrine, deps: {
    heightField: field, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true }, getObjective: () => null,
  } });
  let samples = 0, still = 0, engaged = 0, maxOff = 0, minThrottle = Infinity, maxThrottle = -Infinity, pinned = 0, closest = Infinity;
  let prev = { x: bot.state.pos.x, z: bot.state.pos.z };
  const turnThrottle = [];
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 1 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    if (i < 90) turnThrottle.push(bot.input.throttle);
    updateTank(bot, field, SIM_DT, null);
    enemy.combat.hp = enemy.combat.maxHp; // the enemy is never killed: the stand is the subject
    if (t >= 5 && i % 30 === 0) {
      const speed = Math.hypot(bot.state.pos.x - prev.x, bot.state.pos.z - prev.z) / (30 * SIM_DT);
      if (ctl.state === 'engage') { engaged++; if (speed < 0.75) still++; }
      samples++;
      maxOff = Math.max(maxOff, Math.hypot(bot.state.pos.x, bot.state.pos.z));
      if (bot.state.atGunLimit) pinned++;
      closest = Math.min(closest, Math.hypot(bot.state.pos.x - enemy.state.pos.x, bot.state.pos.z - enemy.state.pos.z));
      minThrottle = Math.min(minThrottle, bot.input.throttle); maxThrottle = Math.max(maxThrottle, bot.input.throttle);
    }
    if (i % 30 === 0) prev = { x: bot.state.pos.x, z: bot.state.pos.z };
  }
  return { samples, engaged, still, maxOff, minThrottle, maxThrottle, pinned, closest, info: ctl.debugInfo(), turnThrottle, bot };
}

console.log('[1] the classic controller stands in its hold band (jockeyS 0): byte-for-byte the integ/228 stand');
const classic = stand(CLASSIC_BOT_DOCTRINE);
ok(classic.engaged > 20, `engaged (${classic.engaged} of ${classic.samples} samples)`);
ok(classic.still / classic.engaged > 0.8, `it stands (${classic.still} of ${classic.engaged} engaged samples still)`);
ok(classic.info.jockeyLegs === 0, 'no jockey leg');

console.log('[2] a jockeying doctrine strafes the same stand round its target with way on');
const JOCKEY = { ...CLASSIC_BOT_DOCTRINE, jockeyS: 0.4 };
const strafing = stand(JOCKEY);
ok(strafing.engaged > 20, `engaged (${strafing.engaged} samples)`);
ok(strafing.still / strafing.engaged < 0.12, `it moves (${strafing.still} of ${strafing.engaged} engaged samples still)`);
ok(strafing.info.jockeyLegs >= 3, `leg after leg, turned about (${strafing.info.jockeyLegs} legs)`);
ok(strafing.minThrottle > 0, `never braked through a stand to reverse (least throttle ${strafing.minThrottle.toFixed(2)})`);
ok(strafing.pinned <= strafing.samples * 0.05, `the gun keeps its front arc (${strafing.pinned} of ${strafing.samples} samples at its limit)`);
ok(strafing.closest > 8, `it never runs into its target (${strafing.closest.toFixed(1)} m at the closest)`);

console.log('[3] the settled-shot halt is never jockeyed; the mode tables that jockey');
{
  // the halt belongs to settleShots sides: a jockeying side with the halt on still rolls only outside it (covered by
  // driveJockey's settleUntilS gate); the tables: Frontline both sides and the rushers jockey, the classic modes never
  for (const mode of ['standard', 'zone_control', 'mars', 'juggernaut', 'gun_game', 'realistic']) {
    for (const side of ['alpha', 'bravo']) {
      const d = rulesetBotDoctrine(matchRulesetFor(mode), side);
      ok(d.jockeyS === 0 && d.rollingTurns === false, `${mode} ${side}: stands and pivots as before`);
    }
  }
  for (const [mode, side] of [['frontline_assault', 'alpha'], ['frontline_assault', 'bravo']]) {
    const d = rulesetBotDoctrine(matchRulesetFor(mode), side);
    ok(d.jockeyS > 0 && d.rollingTurns === true, `${mode} ${side}: circles a stand after ${d.jockeyS} s and drives its turns round`);
  }
  // the rushers drive their turns round and never stand to circle: the hunt's orbit is their circuit
  for (const [mode, side] of [['endless_horde', 'bravo'], ['infected', 'bravo']]) {
    const d = rulesetBotDoctrine(matchRulesetFor(mode), side);
    ok(d.jockeyS === 0 && d.rollingTurns === true, `${mode} ${side}: drives its turns round, no jockey`);
  }
}

console.log('[4] rollingTurns: a hard turn keeps way on where the classic hull pivots');
{
  // a route dead astern, no enemy: the first 1.5 s are the turn onto it (driveToXZ's hard-turn branch)
  const turn = (doctrine) => {
    const bot = tank('bot', 'alpha', 0, 0, 0);
    const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), doctrine: () => doctrine, deps: {
      heightField: field, raycast: () => null, getEnemies: () => [], getAllies: () => [], getObstacles: () => [],
      spotting: { isSpotted: () => true }, getObjective: () => null } });
    ctl.setWaypoints([[0, -200]], { loop: false });
    let moved = 0, prev = { x: 0, z: 0 }, throttle = 0, n = 0;
    for (let i = 0; i < 1.5 / SIM_DT; i++) {
      ctl.update(SIM_DT, 1 + i * SIM_DT);
      throttle += bot.input.throttle; n++;
      updateTank(bot, field, SIM_DT, null);
      moved += Math.hypot(bot.state.pos.x - prev.x, bot.state.pos.z - prev.z); prev = { x: bot.state.pos.x, z: bot.state.pos.z };
    }
    return { throttle: throttle / n, moved };
  };
  const pivot = turn(CLASSIC_BOT_DOCTRINE), rolling = turn({ ...CLASSIC_BOT_DOCTRINE, rollingTurns: true });
  ok(rolling.throttle > pivot.throttle + 0.15, `drive through the turn: rolling ${rolling.throttle.toFixed(2)} vs pivot ${pivot.throttle.toFixed(2)} mean throttle`);
  ok(rolling.moved > pivot.moved, `way on: ${rolling.moved.toFixed(1)} m rolled vs ${pivot.moved.toFixed(1)} m pivoting`);
}

console.log("[5] the 'angle' hit reaction turns onto the shot with way on; the classic one pivots in place");
{
  // a bot holding 70 m from its target is hit from its beam by a second, seen hull: the classic reaction stands and
  // pivots onto the shooter; under the 'angle' policy (gameplay-modes-228) the same turn is driven round, never a stand
  const hitTurn = (doctrine) => {
    const bot = tank('bot', 'alpha', 0, 0, 0), front = tank('front', 'bravo', 0, 70, Math.PI), beam = tank('beam', 'bravo', 60, 0, -Math.PI / 2);
    const enemies = [front];
    const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(5), doctrine: () => doctrine, deps: {
      heightField: field, raycast: () => null, getEnemies: () => enemies, getAllies: () => [], getObstacles: () => [],
      spotting: { isSpotted: () => true }, getObjective: () => null } });
    for (let i = 0; i < 6 / SIM_DT; i++) {
      ctl.update(SIM_DT, 1 + i * SIM_DT); updateTank(bot, field, SIM_DT, null);
      front.combat.hp = front.combat.maxHp; beam.combat.hp = beam.combat.maxHp;
    }
    // stand it still at its hold, then the hit from a hull on its beam that it now sees
    bot.state.speed = 0;
    beam.state.pos.x = bot.state.pos.x + Math.cos(bot.state.yaw) * 60; beam.state.pos.z = bot.state.pos.z - Math.sin(bot.state.yaw) * 60;
    enemies.push(beam);
    ctl.notifyUnderFire(beam, { selfHit: true, damaging: true });
    let throttle = 0, n = 0, moved = 0, lock = 0, prev = { x: bot.state.pos.x, z: bot.state.pos.z };
    for (let i = 0; i < 2 / SIM_DT; i++) {
      ctl.update(SIM_DT, 7 + i * SIM_DT);
      if (ctl.debugInfo().reaction === 'angle') { throttle += bot.input.throttle; n++; lock = Math.max(lock, Math.abs(bot.input.steer)); }
      updateTank(bot, field, SIM_DT, null);
      moved += Math.hypot(bot.state.pos.x - prev.x, bot.state.pos.z - prev.z); prev = { x: bot.state.pos.x, z: bot.state.pos.z };
      front.combat.hp = front.combat.maxHp; beam.combat.hp = beam.combat.maxHp;
    }
    return { throttle: n ? throttle / n : 0, n, moved, lock };
  };
  const classicTurn = hitTurn(CLASSIC_BOT_DOCTRINE), rolled = hitTurn({ ...CLASSIC_BOT_DOCTRINE, hitReactions: 'angle' });
  ok(classicTurn.n > 0 && rolled.n > 0, `both turn onto the shot (${classicTurn.n} and ${rolled.n} reacting ticks)`);
  ok(classicTurn.throttle === 0, `classic: a stand and a pivot (mean throttle ${classicTurn.throttle.toFixed(2)})`);
  ok(rolled.throttle >= JOCKEY_DRIVE.reactRollThrottle - 1e-9 && rolled.moved > classicTurn.moved + 2,
    `'angle': driven round (mean throttle ${rolled.throttle.toFixed(2)}, ${rolled.moved.toFixed(1)} m against ${classicTurn.moved.toFixed(1)} m)`);
  // round 3b: an arc at the rolling steer, never the full lock (at 0.7 a full lock still turned the hull nearly in place)
  ok(rolled.lock <= JOCKEY_DRIVE.rollSteer + 1e-9, `'angle': at most the rolling steer (${rolled.lock.toFixed(2)} against ${JOCKEY_DRIVE.rollSteer})`);
}

if (failures) { console.error(`ai.jockey.selftest: ${failures} failure(s)`); process.exit(1); }
console.log("ai.jockey.selftest: classic stands, a jockeying doctrine strafes its stand with way on, rolling turns keep way on, the 'angle' hit turn keeps way on");
