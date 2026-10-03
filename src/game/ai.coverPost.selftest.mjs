// A bot covering its human holds its post (bots lane, 2026-10-03). The no-contact search sends a bot that has seen
// nobody for 25 s toward the nearest enemy; it ran for every mission, so a frontline bot covering its idle human left
// on a search leg a minute after taking post, and the human was found alone at its pad. A bot on a 'cover' mission does
// not search: it holds its post until contact. Control: a bot pushing for a sector still searches.
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

function entity(id, specId, team, x, z, yaw = 0) {
  const spec = getSpec(specId);
  return {
    id, specId, spec, team, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: {
      hp: spec.hp, maxHp: spec.hp, destroyed: false,
      reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null,
    },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null,
  };
}

/** A bot on its post at (0, 0) with `mission` there, an enemy 600 m off it never sees; its farthest wander in 90 s. */
function hold(mission) {
  const bot = entity('cover', 'm1a2', 'alpha', 0, 0, 0);
  const enemy = entity('far', 't90m', 'bravo', 0, 600, Math.PI);
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(11),
    deps: {
      heightField: FIELD, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
      spotting: { isSpotted: () => false }, getObjective: () => ({ mission, x: 0, z: 0, radiusM: 30 }),
    },
  });
  bot.aiCtl = ctl;
  let farthest = 0, searched = false;
  for (let i = 0; i < 90 / SIM_DT; i++) {
    ctl.update(SIM_DT, i * SIM_DT);
    updateTank(bot, FIELD, SIM_DT, null);
    farthest = Math.max(farthest, Math.hypot(bot.state.pos.x, bot.state.pos.z));
    if (ctl.debugInfo().searching) searched = true;
  }
  return { farthest, searched };
}

console.log('[1] a bot covering its human, with nobody in sight, holds its post');
{
  const { farthest, searched } = hold('cover');
  ok(!searched, 'it never starts the no-contact search');
  ok(farthest < 15, `it stays on its post (farthest ${farthest.toFixed(1)} m in 90 s)`);
}

console.log('[2] control: a bot pushing for a sector still searches');
{
  const { farthest, searched } = hold('assault');
  ok(searched && farthest > 40, `it searches and leaves the point (farthest ${farthest.toFixed(1)} m)`);
}

if (failures) {
  console.error(`ai.coverPost.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.coverPost.selftest: a covering bot holds its post');
