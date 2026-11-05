// 2026-11-02 audit M7: a bot's waypoints carry an explicit owner. The mission read "these waypoints are mine" by
// comparing the last waypoint with its own planned end (waypointsAreMission, missionRouteEnded), so another driver's
// route that happened to end on the same point read as the mission's; and a level route's end cleared whatever stood in
// the waypoints, its own or not. Reproduced on the lane base: a search leg toward the hidden enemy's 50 m sector ends
// exactly where the mission route does when that enemy stands by the objective, and once the objective carries its
// mission label (missionOwnsRoute: "a route another driver left there is taken back") the search's route was kept.
// Pins: each writer tags the list; the mission takes back that search leg; its own route is never churned.
// Round 2 (U16): the overlays that keep a leg in the waypoints still drove and judged whatever list was in place. A point
// written over a live level route was driven as the level route ('levelRoute' owned the hull) and judged as its end, so
// the bot gave the live deck target up as unbearable (the reviewer's probe: 303 ticks); a search leg judged the route
// that displaced it, and its end counted as a failed leg. claimWaypoints now ends the overlay whose list it takes. Pins:
// [4] a point over a live level route ends the route with no verdict, and 'levelRoute' never drives a list not its
// own; [5] a search leg displaced by another route waits for that route and counts no failure for it.
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { CLASSIC_BOT_DOCTRINE } from '../sim/matchRuleset.ts';
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
function scene(bot, enemies, getObjective, doctrine = CLASSIC_BOT_DOCTRINE) {
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(9), doctrine: () => doctrine, deps: {
    heightField: field, raycast: () => null, getEnemies: () => enemies, getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => false }, getObjective,
  } });
  let t = 1;
  const run = (seconds, until = null) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      updateTank(bot, field, SIM_DT, null);
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  return { ctl, run };
}

console.log('[1] every writer tags the waypoints');
{
  const bot = tank('bot', 'alpha', 0, 0);
  const { ctl, run } = scene(bot, [], () => null);
  run(0.2);
  ok(ctl.debugInfo().routeOwner === 'patrol', `a bot with no route drives its own patrol loop (${ctl.debugInfo().routeOwner})`);
  ctl.setWaypoints([[0, 100], [100, 100]]);
  ok(ctl.debugInfo().routeOwner === 'route', `an integration's route list (${ctl.debugInfo().routeOwner})`);
  ctl.setWaypoints([[40, 40]], { loop: false });
  ok(ctl.debugInfo().routeOwner === 'destination', `a single destination (${ctl.debugInfo().routeOwner})`);
  ctl.setWaypoints([]);
  ok(ctl.debugInfo().routeOwner === 'none' && ctl.debugInfo().wpCount === 0, 'an empty list has no owner');
}

console.log('[2] a search leg ending on the mission\'s own last point is still the search\'s: the mission takes it back');
{
  const OWNS = { ...CLASSIC_BOT_DOCTRINE, missionOwnsRoute: true };
  const bot = tank('bot', 'alpha', 0, -450);
  const enemy = tank('enemy', 'bravo', 5, 150); // hidden, by the objective: its 50 m sector is the objective's point
  const objective = { x: 0, z: 150, radiusM: 30 }; // no mission label yet: the free bot may search
  const { ctl, run } = scene(bot, [enemy], () => objective, OWNS);
  ctl.setWaypoints([[objective.x, objective.z]], { loop: false }); // the mode's route push: the mission's route
  const searched = run(40, (info) => info.searching);
  const leg = ctl.debugInfo();
  ok(searched && leg.searchKind === 'sector', `the 25 s search takes the hull toward the sector (${leg.searchKind})`);
  ok(leg.wpCount === 2 && leg.searchGoalX === 0 && leg.searchGoalZ === 150,
    `its leg ends on the mission's last point (${leg.wpCount} waypoints, goal ${leg.searchGoalX},${leg.searchGoalZ})`);
  objective.mission = 'raid'; // the objective's mission arrives: it owns the route
  run(0.5);
  const after = ctl.debugInfo();
  ok(!after.searching, 'the search stands down for the mission');
  ok(after.wpCount === 1 && after.waypointX === 0 && after.waypointZ === 150,
    `the mission took its route back (${after.wpCount} waypoint(s), next ${after.waypointX},${after.waypointZ})`);
  ok(after.routeOwner === 'destination', `owner ${after.routeOwner}`);
  let churned = false;
  const first = after.wpIndex;
  run(2, (info) => { if (info.wpCount !== 1 || info.wpIndex !== first) churned = true; return false; });
  ok(!churned, 'the mission\'s own route is kept, not re-planned every tick');
}

/** ai.levels.selftest's deck: a 25 m cliff north of z 40, a ramp corridor up it at x 100..130; a floor bot under a deck enemy. */
async function deckScene() {
  const DECK_Y = 25, CLIFF_Z = 40;
  const cliff = (z) => Math.max(0, Math.min(DECK_Y, (z - (CLIFF_Z - 2)) / 4 * DECK_Y));
  const getHeightAt = (x, z) => {
    const plateau = cliff(z);
    if (x < 97 || x > 133) return plateau;
    const ramped = z <= CLIFF_Z ? 0 : Math.min(DECK_Y, (z - CLIFF_Z) / 60 * DECK_Y);
    const side = Math.max(0, Math.min(1, Math.max(100 - x, x - 130) / 3));
    return ramped + (plateau - ramped) * side;
  };
  const getNormalAt = (x, z) => {
    const e = 0.5, dx = getHeightAt(x + e, z) - getHeightAt(x - e, z), dz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    const nx = -dx / (2 * e), nz = -dz / (2 * e), length = Math.hypot(nx, 1, nz);
    return { x: nx / length, y: 1 / length, z: nz / length };
  };
  const deckField = { getHeightAt, getNormalAt, getGroundType: () => 'firm' };
  const raycast = (origin, dir, maxDist) => {
    for (let d = 1; d < maxDist; d += 1) {
      if (origin.y + dir.y * d < getHeightAt(origin.x + dir.x * d, origin.z + dir.z * d)) return { dist: d };
    }
    return null;
  };
  const place = (id, team, x, z, yaw) => {
    const t = tank(id, team, x, z, yaw);
    t.state.pos.y = getHeightAt(x, z);
    return t;
  };
  const { createBotNavigationGrid, planBotRoute } = await import('../sim/botRoutePlanner.ts');
  const navigation = createBotNavigationGrid({ heightField: deckField });
  const routeRng = mulberry32(431);
  const floor = place('floor', 'alpha', 0, 30, 0);
  const deck = place('deck', 'bravo', 0, 55, Math.PI);
  const ctl = createAI(floor, { difficulty: 'normal', rng: mulberry32(73), deps: {
    heightField: deckField, raycast, getEnemies: () => [deck], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true },
    planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation, rng: routeRng, role: 'brawler',
      spec: floor.spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
  } });
  let t = 300;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      updateTank(floor, deckField, SIM_DT, null);
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  return { ctl, deck, run };
}

console.log('[3] a level route that ends clears only its own route');
{
  const { ctl, deck, run } = await deckScene();
  const routing = run(30, (info) => info.levelRouting);
  ok(routing && ctl.debugInfo().routeOwner === 'level', `the floor bot takes a route to the deck (owner ${ctl.debugInfo().routeOwner})`);
  ctl.setWaypoints([[-60, 0]], { loop: false }); // a commander's point over the leg
  ok(ctl.debugInfo().routeOwner === 'destination', 'the point takes the waypoints');
  deck.combat.destroyed = true; // the leg's target is gone: the leg ends
  run(SIM_DT);
  const info = ctl.debugInfo();
  ok(!info.levelRouting, 'the level route ends');
  ok(info.wpCount >= 1 && info.routeOwner === 'destination', `the commander's route stays (${info.wpCount} waypoint(s), ${info.routeOwner})`);
}

console.log('[4] a point written over a live level route ends the route: no verdict, and no other list driven as it');
{
  const { ctl, deck, run } = await deckScene();
  const routing = run(30, (info) => info.levelRouting);
  ok(routing && ctl.debugInfo().routeOwner === 'level', `the floor bot takes a route to the deck (owner ${ctl.debugInfo().routeOwner})`);
  const verdicts = ctl.debugInfo().unbearableVerdicts;
  ctl.setWaypoints([[-60, 0]], { loop: false }); // a commander's point over the leg; the deck target stays alive
  const taken = ctl.debugInfo();
  ok(!taken.levelRouting && taken.routeOwner === 'destination',
    `the point takes the waypoints and the level route ends with it (levelRouting ${taken.levelRouting}, owner ${taken.routeOwner})`);
  let foreign = 0, ticks = 0, levelTicks = 0, foreignOwner = '';
  const watch = (info) => {
    ticks++;
    if (info.driveOwner === 'levelRoute') {
      levelTicks++;
      if (info.routeOwner !== 'level') { foreign++; foreignOwner ||= info.routeOwner; }
    }
    return false;
  };
  // the base's verdict came at the displaced route's end, 303 ticks on; the lock re-arms only after ELEVATION_LOCK_S (6 s)
  run(5.5, watch);
  const after = ctl.debugInfo();
  ok(!deck.combat.destroyed && after.unbearableVerdicts === verdicts,
    `the live deck target is not given up for the point's end (${after.unbearableVerdicts - verdicts} verdict(s) in ${ticks} ticks)`);
  ok(foreign === 0, `'levelRoute' drove no list but its own (${foreign} of ${levelTicks} 'levelRoute' ticks on another list${foreignOwner ? `, first '${foreignOwner}'` : ''})`);
  // the lock may take the long way again later: that route is the level route's own, and only it is driven as one
  run(12, watch);
  ok(foreign === 0, `and later (${ctl.debugInfo().levelRoutes} level route(s) begun, ${foreign} foreign 'levelRoute' ticks of ${ticks})`);
}

console.log('[5] a search leg displaced by another route waits for that route and counts no failed leg for it');
{
  const bot = tank('bot', 'alpha', 0, -450);
  const enemy = tank('enemy', 'bravo', 5, 150); // hidden, far: the 25 s search heads for its sector
  const { ctl, run } = scene(bot, [enemy], () => null);
  const searched = run(40, (info) => info.searching);
  const leg = ctl.debugInfo();
  ok(searched && leg.routeOwner === 'search' && leg.searchFailures === 0,
    `the search takes the hull (${leg.searchKind}, owner ${leg.routeOwner}, ${leg.searchLegs} leg(s))`);
  // another driver's route over the leg (the support a retreat drives to, a mode's route push): 30 m off
  const point = { x: bot.state.pos.x + 25, z: bot.state.pos.z + 18 };
  ctl.setWaypoints([[point.x, point.z]], { loop: false });
  ok(ctl.debugInfo().routeOwner === 'destination', 'the route takes the waypoints');
  let nearest = Infinity;
  const replanned = run(30, (info) => {
    nearest = Math.min(nearest, Math.hypot(bot.state.pos.x - point.x, bot.state.pos.z - point.z));
    return info.searchLegs > leg.searchLegs;
  });
  const next = ctl.debugInfo();
  ok(replanned && nearest < 12, `the route is driven out before the search plans again (${nearest.toFixed(1)} m from its end)`);
  ok(next.searchFailures === 0, `the displaced leg is no failed leg of the search's (failures ${next.searchFailures})`);
  ok(next.routeOwner === 'search' && next.searchKind === leg.searchKind,
    `the next leg is the search's own, from the same goals (${next.searchKind}, owner ${next.routeOwner})`);
}

if (failures) { console.error(`ai.routeOwner.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.routeOwner.selftest: the waypoints carry their writer; the mission takes back a route that only ends where its own does');
