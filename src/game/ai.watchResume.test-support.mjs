// ai.watchResume.test-support.mjs: (2026-11-02 audit M7; round 6 V4) the Watch hand-back fixtures that
// ai.watchResume.selftest (default tier) and ai.watchResumeLevels.selftest (MANUAL bots) share: a bot's hull, Watch
// mode's own Take and Leave around a stepped park, ai.levels' deck scene, a level route's hand-back on it ([7]) and the
// elevation lock's dwell over a hand-back ([12]). Importing it registers the fleet and finalizes the combat anatomy of the
// two specs the receipts drive, as the authority does (vehicles/authorityFleet.ts; round 6 V4: the player's fleet
// factory cost 0.3-1.3 s more of each receipt's user CPU and left both specs without their anatomy, so the contact
// rectangle the movement and hullOnParkLevel read was the published dims', not a battle hull's). Not a receipt itself (no
// .selftest suffix).
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, resetTankVerticalState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createHullSupportPose, createStructureSupportField, hullSupportPose } from '../sim/structureSupport.ts';
import { createObstacleGrid } from '../world/collision.ts';
import { createAI, mulberry32 } from './ai.ts';
import { leaveWatchSeat, openWatchSeats, prepareWatchSeat, takeWatchSeat } from './watchSeat.ts';

await ensureAuthorityFleet(['t90am', 'm1a1_abrams_hc']);

export function tank(id, team, x, z, yaw = 0, specId = 't90am') {
  const spec = getSpec(specId);
  return { id, specId: spec.id, spec, team, isPlayer: false, state: createTankState(spec, new Vector3(x, 0, z), yaw),
    combat: { hp: 1000, maxHp: 1000, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' }, shellSlot: 0,
      modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
    aiCtl: null };
}

/**
 * Watch mode's own Take and Leave of `entity` (driven by `ctl`) around a park in which `between(seconds)` steps the taken
 * hull, as the fixed step keeps stepping a player's hull with the input Take left it (nobody at the keys: it coasts);
 * `away` then moves it as a watcher's drive would. The session is the smallest watched battle: a human seat and this bot.
 */
export function takeAndLeave(entity, ctl, clock, between, seconds, away) {
  const seat = { id: 'watcher', team: entity.team, isPlayer: true, aiCtl: { park() {}, resume() {} },
    input: { throttle: 0, steer: 0, brake: false, fire: false, actionBits: 0 }, combat: { destroyed: false } };
  const game = { player: seat, tanks: [seat, entity], ruleset: { watch: { takeControl: true } }, watch: null, timeS: clock(), nextShellId: 1 };
  prepareWatchSeat(game, seat);
  openWatchSeats(game);
  entity.aiCtl = ctl;
  game.timeS = clock();
  const speedAtTake = entity.state.speed, x0 = entity.state.pos.x, z0 = entity.state.pos.z;
  if (!takeWatchSeat(game, entity)) throw new Error('setup: the watcher takes the bot');
  between(seconds);
  const coastM = Math.hypot(entity.state.pos.x - x0, entity.state.pos.z - z0);
  away?.();
  game.timeS = clock();
  if (leaveWatchSeat(game) !== entity || entity.aiCtl !== ctl) throw new Error('setup: Leave hands the bot back');
  return { speedAtTake, coastM };
}

/**
 * ai.levels' deck (as ai.routeOwner [3]-[4]): a 25 m cliff north of z 40, a ramp up it at x 100..130; a floor bot under a
 * deck enemy. With `records`, the hull is stepped through the structure support over them, as the match steps every hull,
 * and the bot reads them as its obstacles, as the match gives both the world's records (state.ts, botConstruction.ts):
 * the list, and (round 6 V3) the match's obstacle query over them (world/collision.ts createObstacleGrid, as
 * headlessCollisionWorld builds it; the solo battle's obstacleQuery), unless `query` is false (a fixture without one).
 */
export async function deckScene(records = null, { query = true } = {}) {
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
    const t = tank(id, team, x, z, yaw, 'm1a1_abrams_hc');
    t.state.pos.y = getHeightAt(x, z);
    return t;
  };
  const { createBotNavigationGrid, planBotRoute } = await import('../sim/botRoutePlanner.ts');
  const navigation = createBotNavigationGrid({ heightField: deckField });
  const routeRng = mulberry32(431);
  const floor = place('floor', 'alpha', 0, 30, 0);
  const deck = place('deck', 'bravo', 0, 55, Math.PI);
  const ctl = createAI(floor, { difficulty: 'normal', rng: mulberry32(73), deps: {
    heightField: deckField, raycast, getEnemies: () => [deck], getAllies: () => [], getObstacles: () => records ?? [],
    queryObstacles: records && query ? createObstacleGrid(records) : null,
    spotting: { isSpotted: () => true },
    planRoute: (start, goal, options) => planBotRoute({ start, goal, navigation, rng: routeRng, role: 'brawler',
      spec: floor.spec, useRoleDetour: false, requireGoalLevel: options?.requireGoalLevel === true }),
  } });
  const support = records ? createStructureSupportField(deckField, { getObstacles: () => records }) : null;
  const pose = createHullSupportPose();
  const stepHull = () => {
    if (!support) { updateTank(floor, deckField, SIM_DT, null); return; }
    support.beginHull(floor.state.pos.x, floor.state.pos.z, floor.state.pos.y, hullSupportPose(floor.spec, floor.state, pose));
    updateTank(floor, support, SIM_DT, null);
  };
  let t = 300;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      stepHull();
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  const moveTo = (x, z) => { floor.state.pos.x = x; floor.state.pos.z = z; floor.state.pos.y = getHeightAt(x, z); floor.state.speed = 0; };
  // the taken hull: stepped on the input it has (the controller is parked and writes nothing)
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      stepHull();
    }
  };
  return { ctl, floor, run, moveTo, hull, clock: () => t, skip: (seconds) => { t += seconds; } };
}

/**
 * [7]'s hand-back of the floor bot driving its level route up to the deck: a park of `parkS` through Watch mode's Take
 * and Leave (`far`: the watcher drove 270 m off), or a revive's resume with no park; then 8 s of the bot's own driving.
 */
export async function levelRouteHandBack({ parkS, far = false, revive = false }) {
  const { ctl, floor, run, moveTo, hull, clock, skip } = await deckScene();
  const routing = run(30, (info) => info.levelRouting);
  run(4); // up to route speed
  const before = ctl.debugInfo();
  let took = { speedAtTake: floor.state.speed, coastM: 0 };
  if (revive) { skip(parkS); ctl.resume(clock()); } // a revive's resume comes with no park (both drivers' revive hooks)
  else took = takeAndLeave(floor, ctl, clock, hull, parkS, far ? () => moveTo(-200, -150) : null);
  const back = ctl.debugInfo();
  const handBackS = clock();
  let oldRouteTicks = 0, nextRouteAfterS = null;
  run(8, (info) => {
    if (info.levelRouting && info.levelRoutes === before.levelRoutes) oldRouteTicks++;
    if (info.levelRoutes > before.levelRoutes && nextRouteAfterS === null) nextRouteAfterS = clock() - handBackS;
    return false;
  });
  return { routing, before, back, oldRouteTicks, nextRouteAfterS, after: ctl.debugInfo(), ...took };
}
export const levelRouteLabel = (r) => `verdicts ${r.before.unbearableVerdicts} -> ${r.after.unbearableVerdicts}, levelRouting ${r.before.levelRouting} -> ${r.back.levelRouting}, owner ${r.back.routeOwner}, routes ${r.before.levelRoutes} -> ${r.after.levelRoutes}`;
export const coasted = (r) => `taken at ${r.speedAtTake.toFixed(1)} m/s, coasted ${r.coastM.toFixed(1)} m`;

/**
 * [12]'s hand-back of the floor bot 3 s into the elevation lock's 6 s dwell (its deck target out of the gun's reach, no
 * route yet): a 0.5 s Take and Leave, then a whole dwell and a margin of the bot's own ticks. `away`: where the watcher
 * leaves the hull ([x, z], or a function of the spot it was taken on); `rock`: a record the structure support carries the
 * hull on (or a list of them), which it starts on (`onY`: the height it stands at, the first record's top by default) or
 * is left on (`awayY`: the height the watcher leaves it at); `query`: deckScene's.
 */
export async function dwellHandBack(away, from = null, rock = null,
  { onY = rock && !Array.isArray(rock) ? rock.max[1] : null, awayY = null, query = true } = {}) {
  const { ctl, floor, run, moveTo, hull, clock } = await deckScene(rock ? (Array.isArray(rock) ? rock : [rock]) : null, { query });
  if (from) moveTo(...from);
  if (onY !== null) resetTankVerticalState(floor.state, onY); // the floor bot stands on the rock's top
  run(3); // the floor bot sees the deck target its gun cannot reach: 3 s into the 6 s dwell, no route yet
  const before = ctl.debugInfo();
  const parkedAt = [floor.state.pos.x, floor.state.pos.y, floor.state.pos.z];
  const leave = () => {
    moveTo(...(typeof away === 'function' ? away(parkedAt) : away));
    if (awayY !== null) resetTankVerticalState(floor.state, awayY); // left on a record's top (or over the ground)
  };
  const took = takeAndLeave(floor, ctl, clock, hull, 0.5, away ? leave : null);
  const back = ctl.debugInfo();
  const handedBackAt = [floor.state.pos.x, floor.state.pos.y, floor.state.pos.z];
  const handBackS = clock();
  let decidedAfterS = null;
  // a whole dwell (ELEVATION_LOCK_S, 6 s) and a margin: a dwell that held decides within its rest, one that restarted
  // at 6 s (round 5, U6: 10 s before)
  run(6.5, (info) => {
    if (info.levelRoutes > before.levelRoutes || info.unbearableVerdicts > before.unbearableVerdicts) { decidedAfterS = clock() - handBackS; return true; }
    return false;
  });
  return { before, back, decidedAfterS, parkedAt, handedBackAt, ...took };
}
export const dwellLabel = (r) => `dwell ${r.before.elevationLockT} -> ${r.back.elevationLockT} s, the lock decided ${r.decidedAfterS === null ? 'never' : `${r.decidedAfterS.toFixed(2)} s`} after Leave`;
export const planOf = (r) => Math.hypot(r.handedBackAt[0] - r.parkedAt[0], r.handedBackAt[2] - r.parkedAt[2]);
export const where = (r) => `taken at (${r.parkedAt.map((v) => v.toFixed(1)).join(', ')}), handed back at (${r.handedBackAt.map((v) => v.toFixed(1)).join(', ')}), ${planOf(r).toFixed(1)} m on the plan`;
/** [12]'s setup: taken at `takenY` and left at `leftY`, within 12 m on the plan, 3 s into the dwell, no route yet. */
export const setupOk = (r, takenY, leftY) => Math.abs(r.parkedAt[1] - takenY) < 0.3 && Math.abs(r.handedBackAt[1] - leftY) < 0.3
  && planOf(r) < 12 && r.before.elevationLockT >= 2.5 && r.before.levelRoutes === 0;
// the dwell restarts, and the lock decides nothing before a whole dwell from the hand-back (the bot's own drive after
// Leave may bring the target into the gun's arc first: then it decides nothing in the 6.5 s window)
export const restarted = (r) => r.back.elevationLockT === 0 && (r.decidedAfterS === null || r.decidedAfterS >= 6 - 0.05);
export const kept = (r) => r.back.elevationLockT >= 2.5 && r.decidedAfterS !== null && r.decidedAfterS < 4;
// a record south of where the bot dwells on the ground (clear of its hull), its top within 12 m of that spot
export const beside = (top, bottom = 0) => Object.freeze({ min: [-40, bottom, 14], max: [-10, top, 26] });
