// A bot that starts in the liquid (bots lane, 2026-10-02). Reservoir pacing seed 120006 on the maps lane's tree: the
// last bravo M1A2 ended its fight on the lake-shore flat with its hull's corners over the shallow mask. The liquid
// corridor guard refused every move from that pose, forward, reverse and standing still, so the controller's final
// liquid brake parked it for the last 720 s while its search legs failed one after another (the 900 s draw). The dry
// route grid also refuses a start whose own cell is liquid, which leaves a hull pushed into the lake no route at all.
// A synthetic shore pins the rules, not the map: a bot whose cell the grid refuses, in the water with only one way out.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
// Register the same complete production specs without executing roster tests.
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createNavigationLiquidSafety } from './navigationLiquidSafety.ts';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';
import { createTankState, updateTank, SIM_DT } from './movement.ts';
import { createAI, mulberry32 } from '../game/ai.ts';

// The lake fills x > 6 (the shallows 2-6 m out), and its arms reach back west along z = ±18 for 40 m: the only way out
// of the water for a hull at (14, 0) is west, between the arms, onto the shore.
const mask = (x, z) => {
  if (x > 6) return 1;
  if (x > 2) return 0.4;
  return x > -38 && Math.abs(z) > 18 && Math.abs(z) < 60 ? 1 : 0;
};
const field = {
  navigationWaterPolicy: 'avoid-liquid',
  getHeightAt: () => 0, getHeightAtFast: () => 0,
  getNormalAt: () => ({ x: 0, y: 1, z: 0 }),
  getGroundType: () => 'medium',
  getWaterMaskAt: mask,
};
const spec = getSpec('m1a2');
const safe = createNavigationLiquidSafety(field, spec);
const START = { x: 14, z: 0 };
const WEST = -Math.PI / 2, EAST = Math.PI / 2;

console.log('[1] the guard lets a hull already in the liquid drive out, never further in');
assert.equal(safe(START.x, START.z, EAST, 0), false, 'a hull in the water is no dry pose');
assert.equal(safe(START.x, START.z, WEST, 8), true, 'the way out, toward the shore, is driven');
// a hull with its bow in the shallows: out is driven, deeper is refused (the summed mask under it would grow)
assert.equal(safe(3, 0, WEST, 6), true, 'backing the bow out of the shallows is driven');
assert.equal(safe(3, 0, EAST, 6), false, 'the way further in is still refused');
assert.equal(safe(-20, 0, EAST, 30), false, 'a dry hull is still refused a corridor that enters the water');
assert.equal(safe(-20, 0, WEST, 30), true, 'and a dry corridor is driven as before');
console.log('  ok  out yes, in no, dry corridors as before');

console.log('[2] the dry grid plans out of a start cell it refuses');
const navigation = createBotNavigationGrid({ heightField: field, getObstacles: () => [] });
const route = planBotRoute({ navigation, start: START, goal: { x: -200, z: 0 }, spec, rng: mulberry32(9),
  role: 'brawler', useRoleDetour: false });
assert.ok(route.length > 0, 'a hull in a refused (liquid) cell still gets a route');
const [fx, fz] = route[0];
assert.ok(safe(START.x, START.z, Math.atan2(fx - START.x, fz - START.z), Math.hypot(fx - START.x, fz - START.z)),
  `its first leg is one the liquid guard drives (${JSON.stringify(route[0])})`);
assert.ok(Math.hypot(route.at(-1)[0] + 200, route.at(-1)[1]) < 30, `and it reaches the goal (${JSON.stringify(route.at(-1))})`);
console.log(`  ok  ${JSON.stringify(route.slice(0, 3))} … ${JSON.stringify(route.at(-1))}`);

console.log('[3] a bot starting in the refused cell, facing the lake, gets out and searches on');
{
  const state = createTankState(spec, new Vector3(START.x, 0, START.z), EAST);
  const bot = { id: 'bot', specId: spec.id, spec, team: 'enemy', state,
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' },
      shellSlot: 0, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
  const host = { id: 'host', specId: 'm1a2', spec, team: 'player', isPlayer: true,
    state: createTankState(spec, new Vector3(-200, 0, 0), 0),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: 6, kind: 'ready' } } };
  const searchRng = mulberry32(431);
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(73), deps: {
    heightField: field, raycast: () => null,
    getEnemies: () => [host], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => false },
    planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation, rng: searchRng, role: 'flanker',
      spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
  } });
  bot.aiCtl = ctl;
  let dryAt = null, maxWest = 0;
  for (let i = 0; i < 90 / SIM_DT; i++) {
    const t = 300 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    updateTank(bot, field, SIM_DT, null);
    maxWest = Math.max(maxWest, START.x - bot.state.pos.x);
    if (dryAt === null && safe(bot.state.pos.x, bot.state.pos.z, bot.state.yaw, 0)) dryAt = i * SIM_DT;
  }
  const info = ctl.debugInfo();
  assert.ok(dryAt !== null && dryAt < 45, `the hull is on dry ground (at ${dryAt?.toFixed(1) ?? 'never'} s)`);
  assert.ok(maxWest > 40, `and drives on from the shore (${maxWest.toFixed(0)} m west of the start, ${info.searchLegs} search legs)`);
  console.log(`  ok  dry at ${dryAt.toFixed(1)} s, ${maxWest.toFixed(0)} m west, ${info.searchLegs} search legs, ${info.searchFailures} failed`);
}

console.log('navigationLiquidStart.selftest: the way out of the liquid, a route from a refused cell and a bot that gets out passed');
