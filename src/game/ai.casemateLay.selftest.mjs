// A casemate keeps its bow on its target (bots lane, 2026-10-03). The Strv 103 lays its gun with the hull. On Aegis
// Crossing pacing seed 53002 it fought two T-90Ms alone: its shoot-and-scoot drove to a spot 94-152 degrees off the
// bearing after every shot and its hit jink turned the bow onto the tank shooting it from the flank, so the gun stood
// 19-24 degrees off its target for seconds at a time and it died 12 s into the fight. Engaged, a casemate now backs
// straight off the line of fire to scoot and jinks with the bow on its target. Control: a turreted sniper still
// relocates sideways.
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
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
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function entity(id, spec, team, x, z, yaw) {
  return {
    id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: {
      hp: spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

/**
 * The bot at (0, 0) facing north, an enemy 70 m north and a second on its right flank, both in plain sight and still;
 * the gun fires whenever the controller pulls the trigger with a round ready. The flanker hits it at 7 s and 15 s,
 * while it reloads. Samples of the gun's bearing error to the bot's current target, its shots, and each scoot leg's
 * step sideways of the line to the target it had when the leg began.
 */
function fight(spec) {
  const bot = entity('bot', spec, 'alpha', 0, 0, 0);
  const target = entity('target', getSpec('t90m'), 'bravo', 0, 70, Math.PI);
  const flanker = entity('flanker', getSpec('t90m'), 'bravo', 60, 30, -Math.PI / 2);
  const enemies = [target, flanker];
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(5),
    deps: {
      heightField: FIELD, raycast: () => null, getEnemies: () => enemies, getAllies: () => [], getObstacles: () => [],
      spotting: { isSpotted: () => true },
    },
  });
  bot.aiCtl = ctl;
  const errors = [];
  let shots = 0, firstShotS = null, sideways = 0, leg = null;
  for (let i = 0; i < 24 / SIM_DT; i++) {
    const t = i * SIM_DT;
    if (Math.abs(t - 7) < SIM_DT / 2 || Math.abs(t - 15) < SIM_DT / 2) {
      ctl.notifyUnderFire(flanker, { selfHit: true, damaging: true });
    }
    ctl.update(SIM_DT, t);
    const reload = bot.combat.reload;
    if (bot.input.fire && reload.t <= 0) {
      reload.t = spec.gun.reloadS;
      shots++;
      if (firstShotS === null) firstShotS = t;
    }
    reload.t = Math.max(0, reload.t - SIM_DT);
    updateTank(bot, FIELD, SIM_DT, null);
    const current = enemies.find((enemy) => enemy.id === ctl.targetId);
    if (firstShotS !== null && t > firstShotS + 0.5 && t < firstShotS + 16 && current) {
      const p = bot.state.pos;
      errors.push(Math.abs(wrap(Math.atan2(current.state.pos.x - p.x, current.state.pos.z - p.z) - bot.state.yaw)));
    }
    const scooting = ctl.debugInfo().scooting;
    if (scooting && !leg && current) {
      const p = bot.state.pos;
      leg = { x: p.x, z: p.z, bearing: Math.atan2(current.state.pos.x - p.x, current.state.pos.z - p.z) };
    } else if (!scooting && leg) {
      const p = bot.state.pos;
      const dx = p.x - leg.x, dz = p.z - leg.z;
      sideways = Math.max(sideways, Math.abs(dx * Math.cos(leg.bearing) - dz * Math.sin(leg.bearing)));
      leg = null;
    }
  }
  const within = (deg) => errors.filter((e) => e < deg * Math.PI / 180).length / Math.max(1, errors.length);
  const worst = Math.max(0, ...errors) * 180 / Math.PI;
  return { shots, firstShotS, within, worst, sideways, relocations: ctl.debugInfo().relocations };
}

console.log('[1] the Strv 103 engaged: the bow stays on its target through its scoots and the flanker\'s hits');
{
  const spec = getSpec('strv103');
  const run = fight(spec);
  ok(run.firstShotS !== null && run.shots >= 4, `it keeps firing (${run.shots} shots, the first at ${run.firstShotS?.toFixed(1)} s)`);
  ok(run.within(8) >= 0.9, `its gun lies within 8 degrees of its target ${(run.within(8) * 100).toFixed(0)} % of the ` +
    `15 s after its first shot (worst ${run.worst.toFixed(0)} degrees)`);
  ok(run.relocations >= 1 && run.sideways < 6, `it scoots by backing along the line of fire (${run.relocations} ` +
    `scoots, at most ${run.sideways.toFixed(1)} m sideways of it)`);
}

console.log('[2] control: a turreted sniper still relocates sideways');
{
  const base = getSpec('m1a2');
  const run = fight({ ...base, role: 'td' });
  ok(run.relocations >= 1 && run.sideways > 25, `it scoots off the line (${run.relocations} scoots, ` +
    `${run.sideways.toFixed(0)} m sideways)`);
}

if (failures) {
  console.error(`ai.casemateLay.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.casemateLay.selftest: an engaged casemate keeps its bow on its target');
