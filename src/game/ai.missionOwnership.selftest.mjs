// A labelled mission owns its waypoints (gameplay-modes-228, study-bots 2.5). On integ/228 the 25 s no-contact search
// put a leg toward the nearest enemy's LIVE position into a mission bot's waypoints; the leg outlived the contact and
// ended in the 20 s mission release (6-28 % of Frontline samples; every logged release ended at a search leg's goal).
// Pins: with a mission no search leg ever begins and the hull keeps closing on its objective; a route another driver
// left in the waypoints is taken back; without a mission the search still runs (the classic receipt's behaviour); the
// honest search (searchRouting 'spotted') goes to the side's sighting or the enemy's deployment, never a hidden enemy.
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createBotNavigationGrid, planBotRoute } from '../sim/botRoutePlanner.ts';
import { CLASSIC_BOT_DOCTRINE } from '../sim/matchRuleset.ts';
import { createAI, mulberry32 } from './ai.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };
const field = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
function tank(id, team, x, z) {
  const spec = getSpec('m1a1_abrams_hc');
  return { id, specId: spec.id, spec, team, state: createTankState(spec, new Vector3(x, 0, z), 0),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
}
function scenario({ objective, doctrine = CLASSIC_BOT_DOCTRINE, intel = null, seconds = 45 }) {
  const bot = tank('bot', 'alpha', 0, -200), enemy = tank('enemy', 'bravo', 260, 220);
  const navigation = createBotNavigationGrid({ heightField: field });
  const searchRng = mulberry32(5);
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(9), doctrine: () => doctrine, deps: {
    heightField: field, raycast: () => null, getEnemies: () => [enemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => false }, getObjective: () => objective,
    ...(intel ? { intel } : {}),
    planRoute: (start, goal) => planBotRoute({ start, goal, navigation, rng: searchRng, role: 'brawler', spec: bot.spec, useRoleDetour: false }),
  } });
  if (objective) ctl.setWaypoints([[objective.x, objective.z]], { loop: false });
  let searched = 0, released = 0, minObjective = Infinity, goals = [];
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 1 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    updateTank(bot, field, SIM_DT, null);
    if (i % 30 === 0) {
      const info = ctl.debugInfo();
      if (info.searching) { searched++; goals.push([info.searchGoalX, info.searchGoalZ]); }
      if (info.missionReleased) released++;
      if (objective) minObjective = Math.min(minObjective, Math.hypot(bot.state.pos.x - objective.x, bot.state.pos.z - objective.z));
    }
  }
  return { searched, released, minObjective, goals, ctl, bot, enemy };
}
console.log('[1] a mission bot never begins a no-contact search, and closes on its objective');
{
  const objective = { x: 0, z: 150, radiusM: 30, mission: 'capture' };
  const r = scenario({ objective });
  ok(r.searched === 0, `no search leg in 45 s of silence (${r.searched} samples searching)`);
  ok(r.released === 0, 'no mission release');
  ok(r.minObjective < 120, `the hull closes on the objective (${r.minObjective.toFixed(0)} m at best)`);
}
console.log('[2] without a mission the classic search still begins after 25 s');
{
  const r = scenario({ objective: null });
  ok(r.searched > 0, `a free bot searches (${r.searched} samples)`);
}
console.log('[3] the honest search goes to what the side knows, never to the hidden enemy');
{
  const sighting = { x: -300, z: 100 };
  const r = scenario({ objective: null, doctrine: { ...CLASSIC_BOT_DOCTRINE, searchRouting: 'spotted' },
    intel: { freshestContact: () => sighting, enemyDeployment: () => ({ x: 0, z: 400 }) } });
  ok(r.searched > 0, 'it searches');
  const nearEnemy = r.goals.filter(([x, z]) => Math.hypot(x - r.enemy.state.pos.x, z - r.enemy.state.pos.z) < 60).length;
  ok(nearEnemy === 0, `no search goal at the hidden enemy (${r.goals.length} goal samples)`);
  ok(r.goals.every(([x, z]) => Math.hypot(x - sighting.x, z - sighting.z) < 260), 'the goals ring the side\'s sighting');
}
if (failures) { console.error(`ai.missionOwnership.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.missionOwnership.selftest: a mission owns its waypoints; the classic search stays for free bots; the honest search reads the side\'s intel');
