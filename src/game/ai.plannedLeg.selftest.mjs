// A planned leg is judged by the planner's rule (268, Main item 10). The planner clears every leg it plans for the widest
// hull at the hull's half-width plus 0.5 m; the controller's local router judged a straight line at half-width + 1.4 m.
// Horde, desert seed 20: a TOS-1A's planned leg passed 2.6 m from a building, the router called even the leg blocked,
// replaced it with a corner 14 m into a walled courtyard, and the hull pivoted and wedged there 15 s before a release lined
// it up and it drove the straight line out. While the hull's body overlaps a planned leg's cleared corridor, the line on
// to the leg's end is judged by the planner's rule; further off the leg, the hull rejoins it before trying corners. A route
// the planner did not make keeps the router's own margin.
//
// The scene: flat ground and one building whose west face stands 2.6 m east of a straight planned leg (0, 0) -> (0, 40)
// -> (0, 80): outside the planner's 1.89 + 0.5 m for the TOS-1A, inside the router's 1.89 + 1.4 m.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { setObbShape } from '../world/collision.ts';
import { createAI, mulberry32 } from './ai.ts';

await ensureAuthorityFleet();
const spec = getSpec('tos1a_tagil');
const FIELD = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
const FACE_X = 2.6;
const building = setObbShape({ min: [0, 0, 0], max: [0, 6, 0], kind: 'structure' }, FACE_X + 3.9, 20, 3.9, 10, 0);
const halfWidth = spec.dims.widthM * 0.5;
assert.ok(FACE_X > halfWidth + 0.5 && FACE_X < halfWidth + 1.4, `the face lies between the two rules (${halfWidth.toFixed(2)} m half-width)`);

// the controller's planned-leg clearance is the planner's (sim/botRoutePlanner.ts is not edited here: it keys the world steps)
const planner = readFileSync(new URL('../sim/botRoutePlanner.ts', import.meta.url), 'utf8');
const controller = readFileSync(new URL('./ai.ts', import.meta.url), 'utf8');
assert.match(planner, /const NAV_LEG_CLEARANCE_M = NAV_HULL_HALF_WIDTH_M \+ 0\.5;/, "the planner's leg clearance is its widest half-width + 0.5 m");
assert.match(controller, /const PLANNED_LEG_CLEARANCE_M = 0\.5;/, "the controller's planned-leg clearance is the planner's 0.5 m");

function drive({ x, z, yaw, planned, seconds = 9 }) {
  const state = createTankState(spec, new Vector3(x, 0, z), yaw);
  const bot = { id: 'tos', specId: spec.id, spec, team: 'bravo', state,
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' },
      shellSlot: 0, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 }, aiCtl: null };
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(3), deps: {
    heightField: FIELD, raycast: () => null, getEnemies: () => [], getAllies: () => [],
    getObstacles: () => [building], spotting: { isSpotted: () => true } } });
  ctl.setWaypoints([[0, 0], [0, 40], [0, 80]], { loop: false, planned });
  let corners = 0, maxBesideX = -Infinity, info = null;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    ctl.update(SIM_DT, 10 + i * SIM_DT);
    info = ctl.debugInfo();
    if (info.routeCornerX != null) corners++;
    updateTank(bot, FIELD, SIM_DT, null);
    const p = bot.state.pos;
    if (p.z > 12 && p.z < 28) maxBesideX = Math.max(maxBesideX, p.x);
  }
  return { corners, maxBesideX, z: bot.state.pos.z, info };
}

console.log('[1] on the planned leg: the router keeps the leg past the building (the planner\'s rule)');
{
  const run = drive({ x: -0.5, z: 2, yaw: 0, planned: true });
  assert.ok(run.info.plannedLegRuns > 0, `the planner's rule judged the line (${run.info.plannedLegRuns})`);
  assert.equal(run.corners, 0, 'no corner replaced the leg');
  assert.ok(run.z > 30, `the hull drove on past the building (z ${run.z.toFixed(1)})`);
  assert.ok(run.maxBesideX < FACE_X - halfWidth, `and kept clear of its face (x <= ${run.maxBesideX.toFixed(2)})`);
  console.log(`  ok  ${run.info.plannedLegRuns} judgements by the leg's rule, no corner, z ${run.z.toFixed(1)}, beside the face at x <= ${run.maxBesideX.toFixed(2)}`);
}

console.log('[2] the same line on a route the planner did not make keeps the router\'s margin (a corner)');
{
  const run = drive({ x: -0.5, z: 2, yaw: 0, planned: false });
  assert.equal(run.info.plannedLegRuns, 0, 'no planned leg');
  assert.ok(run.corners > 0, 'the router steered for a corner round the building');
  console.log(`  ok  ${run.corners} ticks steering for a corner`);
}

console.log('[3] well off the planned leg: the hull rejoins the leg before trying corners');
{
  const run = drive({ x: 5, z: 2, yaw: -0.4, planned: true, seconds: 14 });
  assert.ok(run.info.plannedLegRejoins > 0, `a rejoin of the leg (${run.info.plannedLegRejoins})`);
  assert.ok(run.z > 30, `the hull drove on past the building (z ${run.z.toFixed(1)})`);
  assert.ok(run.maxBesideX < FACE_X - halfWidth, `on the leg beside the face (x <= ${run.maxBesideX.toFixed(2)})`);
  console.log(`  ok  ${run.info.plannedLegRejoins} rejoin(s), z ${run.z.toFixed(1)}, beside the face at x <= ${run.maxBesideX.toFixed(2)}`);
}
console.log('ai.plannedLeg.selftest: a planned leg is judged by the planner\'s clearance, and a hull off it rejoins it before corners');
