// Another level (bots lane, 2026-10-02). Cliffbridge pacing seed 53003: a T-90M on the gorge floor under the bridge
// and one on its deck stood engaged 570 s, 40 m apart vertically and 17-45 m apart on the map, neither gun able to
// lay on the other, until the 900 s cap. A target on another level the gun cannot be laid on is a verdict: the hull
// changes level by a route to the target's own level when the grid has one, and otherwise leaves the target alone —
// another spotted enemy takes the slot, or the objective and the search take the hull. A synthetic deck over a floor
// pins the rule (not any map's geometry): a 25 m cliff, with or without a ramp up to the deck.
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

const DECK_Y = 25, CLIFF_Z = 40;
/** The deck: north of a 4 m cliff face everything stands 25 m up; a ramp corridor (x 100..130, its sides 3 m faces)
 * climbs to it from z = 40 to z = 100. (Physics lane, 2026-10-03: the ramp ran to z = 125, and the route the 25 m
 * navigation grid takes off it at z = 100, west onto the deck, crossed a 7 m side face of 68 degrees the grid cannot
 * see; the bot reached the deck only because its own support samples carried it up that face, the terrain-wall bug.
 * A face is a wall now, so the ramp meets the deck where the route leaves it.) */
function deckField(ramp) {
  const cliff = (z) => Math.max(0, Math.min(DECK_Y, (z - (CLIFF_Z - 2)) / 4 * DECK_Y));
  const getHeightAt = (x, z) => {
    const plateau = cliff(z);
    if (!ramp || x < 97 || x > 133) return plateau;
    // inside the corridor the ramp (floor level up to the cliff line); across its 3 m side faces a blend to the deck
    const ramped = z <= CLIFF_Z ? 0 : Math.min(DECK_Y, (z - CLIFF_Z) / 60 * DECK_Y);
    const side = Math.max(0, Math.min(1, Math.max(100 - x, x - 130) / 3));
    return ramped + (plateau - ramped) * side;
  };
  const getNormalAt = (x, z) => {
    const e = 0.5, dx = getHeightAt(x + e, z) - getHeightAt(x - e, z), dz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    const nx = -dx / (2 * e), nz = -dz / (2 * e), length = Math.hypot(nx, 1, nz);
    return { x: nx / length, y: 1 / length, z: nz / length };
  };
  return { getHeightAt, getNormalAt, getGroundType: () => 'firm' };
}

/** Terrain sight: march the ray and stop where it runs under the ground. */
function terrainRaycast(field) {
  return (origin, dir, maxDist) => {
    for (let d = 1; d < maxDist; d += 1) {
      const x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
      if (y < field.getHeightAt(x, z)) return { dist: d };
    }
    return null;
  };
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

function controller(bot, field, enemies, extra = {}) {
  const navigation = createBotNavigationGrid({ heightField: field });
  const searchRng = mulberry32(431);
  const ctl = createAI(bot, {
    difficulty: 'normal',
    rng: mulberry32(73),
    deps: {
      heightField: field,
      raycast: terrainRaycast(field),
      getEnemies: () => enemies,
      getAllies: () => [],
      getObstacles: () => [],
      spotting: { isSpotted: () => true },
      planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation, rng: searchRng, role: 'brawler',
        spec: bot.spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
      ...extra,
    },
  });
  bot.aiCtl = ctl;
  return ctl;
}

/** Real movement for the bot under test; the others stand where they are. */
function drive(bot, ctl, field, seconds, onTick) {
  for (let i = 0; i < seconds / SIM_DT; i++) {
    const t = 300 + i * SIM_DT;
    ctl.update(SIM_DT, t);
    updateTank(bot, field, SIM_DT, null);
    if (onTick && onTick(i * SIM_DT) === false) break;
  }
}

console.log('[1] no way down: the deck bot leaves the floor target for one on its own level');
{
  const field = deckField(false);
  const floor = entity('floor', 't90m', 'player', 0, 30, field, Math.PI);
  const rival = entity('rival', 'm1a2', 'player', 150, 150, field, Math.PI);   // on the deck, 180 m off: in the arc
  const deck = entity('deck', 't90m', 'enemy', 0, 55, field, Math.PI);
  // the rival comes into sight only after the floor bot has been taken as the target
  let clock = 0;
  const ctl = controller(deck, field, [floor, rival],
    { spotting: { isSpotted: (id) => id !== 'rival' || clock > 10 } });
  let firstTarget = null, switchedAt = null;
  drive(deck, ctl, field, 30, (t) => {
    clock = t;
    const info = ctl.debugInfo();
    if (firstTarget === null && info.targetId) firstTarget = info.targetId;
    if (switchedAt === null && info.targetId === 'rival') switchedAt = t;
  });
  ok(firstTarget === 'floor', `the closest enemy, 25 m below, is the first target (${firstTarget})`);
  ok(ctl.debugInfo().unbearableVerdicts >= 1 && ctl.debugInfo().levelRoutes === 0,
    'with no route to its level it is left alone');
  ok(switchedAt !== null && switchedAt < 13, `the deck enemy takes the slot once seen (at ${switchedAt?.toFixed(1) ?? 'never'} s)`);
}

console.log('[2] a ramp: the floor bot changes level by the route up to the deck');
{
  const field = deckField(true);
  const deck = entity('deck', 't90m', 'enemy', 0, 55, field, Math.PI);
  const floor = entity('floor', 'm1a2', 'player', 0, 30, field, 0);
  const ctl = controller(floor, field, [deck]);
  let upAt = null;
  drive(floor, ctl, field, 120, (t) => {
    if (upAt === null && floor.state.pos.y > DECK_Y - 3) { upAt = t; return false; }
    return true;
  });
  ok(ctl.debugInfo().levelRoutes >= 1, 'a route to the target\'s level is taken');
  ok(upAt !== null, `it reaches the deck by the ramp (at ${upAt?.toFixed(0) ?? 'never'} s, y ${floor.state.pos.y.toFixed(1)} m)`);
}

console.log('[3] no ramp and nobody else: the floor bot gives up the deck target instead of standing on it');
{
  const field = deckField(false);
  const deck = entity('deck', 't90m', 'enemy', 0, 55, field, Math.PI);
  const floor = entity('floor', 'm1a2', 'player', 0, 30, field, 0);
  const ctl = controller(floor, field, [deck]);
  let engagedS = 0;
  drive(floor, ctl, field, 40, () => { if (ctl.debugInfo().targetId === 'deck') engagedS += SIM_DT; });
  ok(ctl.debugInfo().unbearableVerdicts >= 1, 'the verdict lands');
  ok(engagedS < 12, `it holds the deck target ${engagedS.toFixed(1)} s of 40 s, not the whole time`);
}

console.log('[4] control: a target up on the deck but far off stays in the arc and keeps the slot');
{
  const field = deckField(false);
  const far = entity('far', 't90m', 'enemy', 0, 330, field, Math.PI);   // 25 m up at 300 m: 4.8 degrees
  const floor = entity('floor', 'm1a2', 'player', 0, 30, field, 0);
  const ctl = controller(floor, field, [far]);
  drive(floor, ctl, field, 30);
  ok(ctl.debugInfo().unbearableVerdicts === 0 && ctl.debugInfo().levelRoutes === 0, 'no verdict, no level route');
}

if (failures) {
  console.error(`ai.levels.selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log('ai.levels.selftest: another level — retarget, route up, give up, in-arc control passed');
