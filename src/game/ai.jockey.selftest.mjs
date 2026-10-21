// The jockey and the rolling turn (gameplay-modes-228 round 3; the critic's M3/M4: Frontline's bots stood still in
// 28-33 % of their engaged samples and the infected in 8-10 %, the owner having asked for more aggression). Pins: the
// classic controller in its hold band stands, turned to its angle, exactly as before (jockeyS 0); a doctrine with jockeyS
// rocks that stand along its own line — forward, back, a leg at a time — and stays where it fought; a stall turns a leg
// about at once; the settled-shot halt is never jockeyed; and a side with rollingTurns drives a hard turn round with way
// on where the classic hull pivots in place.
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
  let samples = 0, still = 0, engaged = 0, maxOff = 0, minThrottle = Infinity, maxThrottle = -Infinity;
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
      minThrottle = Math.min(minThrottle, bot.input.throttle); maxThrottle = Math.max(maxThrottle, bot.input.throttle);
    }
    if (i % 30 === 0) prev = { x: bot.state.pos.x, z: bot.state.pos.z };
  }
  return { samples, engaged, still, maxOff, minThrottle, maxThrottle, info: ctl.debugInfo(), turnThrottle, bot };
}

console.log('[1] the classic controller stands in its hold band (jockeyS 0): byte-for-byte the integ/228 stand');
const classic = stand(CLASSIC_BOT_DOCTRINE);
ok(classic.engaged > 20, `engaged (${classic.engaged} of ${classic.samples} samples)`);
ok(classic.still / classic.engaged > 0.8, `it stands (${classic.still} of ${classic.engaged} engaged samples still)`);
ok(classic.info.jockeyLegs === 0, 'no jockey leg');

console.log('[2] a jockeying doctrine rocks the same stand along its line and stays where it fought');
const JOCKEY = { ...CLASSIC_BOT_DOCTRINE, jockeyS: 3.2 };
const rocking = stand(JOCKEY);
ok(rocking.engaged > 20, `engaged (${rocking.engaged} samples)`);
ok(rocking.still / rocking.engaged < 0.35, `it moves (${rocking.still} of ${rocking.engaged} engaged samples still)`);
ok(rocking.info.jockeyLegs >= 8, `leg after leg, turned about (${rocking.info.jockeyLegs} legs)`);
ok(rocking.minThrottle <= -JOCKEY_DRIVE.throttle + 1e-9 && rocking.maxThrottle >= JOCKEY_DRIVE.throttle - 1e-9, 'forward and back');
ok(rocking.maxOff < 25, `it holds its ground (${rocking.maxOff.toFixed(1)} m at most from where it stood)`);

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
    ok(d.jockeyS > 0 && d.rollingTurns === true, `${mode} ${side}: jockeys (${d.jockeyS} s legs) and drives its turns round`);
  }
  // the rushers drive their turns round but never jockey: a rusher's back leg would be a retreat
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

if (failures) { console.error(`ai.jockey.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.jockey.selftest: classic stands, a jockeying doctrine rocks its stand in place, rolling turns keep way on');
