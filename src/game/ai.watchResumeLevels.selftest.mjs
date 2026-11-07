// 2026-11-02 audit M7 (round 6 V4, split off from ai.watchResume.selftest): the Watch hand-back's checks that refine a
// rule ai.watchResume keeps a default check of, in the MANUAL bots suite (tools/selftest-tiers.mjs). ai.watchResume read
// 7.8-10 s of user CPU in the default tier (round three's file 5.9 s); these cases, the costliest of it (4.4-5.6 s at
// load 100-170), run when the owner names the suite. Each fails on its own mutant here (round 6 bots NOTES); the default receipt keeps a check of
// every rule they refine. The sections keep ai.watchResume's numbers and its history.
// [7] (round 2; round 3, A2) a level route held through a park on its way: here the 30 s park off the way (its deadline
// not yet up) and the 0.1 s, 0.5 s and 2 s coasting toggles; the default keeps the 200 s parks (on and off the way, the
// one on it coasting from route speed) and the revive, and [8]'s toggles of a search leg.
// [11] (round 4, F5; round 5, U6) a stretch is the hull's way only where it can drive to it: drops off a causeway's crest
// onto the floor beside it, over and under the gun's 8 m band, and a toggle on the crest; the default keeps [13]'s
// deck-side hand-backs, which fail without that walk (round 5 bots NOTES: noReachInWayOffset, oldBandInWayOffset).
// [12] (round 5, U5 and its fix-up r1; round 6, V3) the elevation dwell's record rule (hullOnParkLevel: each end's floor
// as the movement carries the hull, the walk between them record by record): off and onto a 2.2 m rock, onto its edge,
// off a 1 m box, a 0.5 m step, rock to rock, up a drawn top, into the air, and the 1 m box with no obstacle query; the
// default keeps the 1 m box through the match's query, which fails at f60d0aa200 and at a192a5a9a3.
import { SIM_DT, updateTank } from '../sim/movement.ts';
import { setConvexTopShape } from '../world/collision.ts';
import { createAI, mulberry32 } from './ai.ts';
import {
  beside, coasted, dwellHandBack, dwellLabel, kept, levelRouteHandBack, levelRouteLabel, planOf, restarted, setupOk, tank,
  takeAndLeave, where,
} from './ai.watchResume.test-support.mjs';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };

console.log('[7] a level route ends with no verdict at a hand-back that finds the hull off its way, and holds while it is on it (the rest)');
// ai.watchResume [7]'s history. On dbdbfc2ad5 a hull handed back 270 m off drove the last route on from there; on
// 92f415e879 a 0.5 s toggle (6.5 m of coast) and a 2 s one (20 m) ended the route; a 0.1 s one coasts 1.4 m.
{
  const label = levelRouteLabel;
  for (const parkS of [30]) {
    const far = await levelRouteHandBack({ parkS, far: true });
    ok(far.routing && far.before.routeOwner === 'level', `setup: the floor bot drives a level route to the deck (owner ${far.before.routeOwner})`);
    ok(far.after.unbearableVerdicts === far.before.unbearableVerdicts && !far.back.levelRouting && far.back.routeOwner !== 'level'
      && far.oldRouteTicks === 0,
      `a ${parkS} s park in which the watcher drove 270 m off: the route ends with no verdict and is not driven on from there (${label(far)}; ${(far.oldRouteTicks * SIM_DT).toFixed(1)} s of it after)`);
  }
  for (const parkS of [0.1, 0.5, 2]) {
    const toggled = await levelRouteHandBack({ parkS });
    ok(toggled.after.unbearableVerdicts === toggled.before.unbearableVerdicts && toggled.back.levelRouting
      && toggled.back.routeOwner === 'level' && toggled.after.levelRoutes === toggled.before.levelRoutes && toggled.oldRouteTicks > 400,
      `a ${parkS} s Take and Leave of the bot on its route: the hull coasts on along it and the route runs on (${coasted(toggled)}; ${label(toggled)})`);
  }
}

/**
 * A causeway (round 4, F5): a 16 m crest with 2 m sides runs up from the floor at z 0 to a 25 m plateau north of z 100,
 * where the enemy stands; the floor bot below the plateau's cliff takes the road up the crest to it. The planner is a
 * fixture that lays that road: the navigation grid's 25 m cells cannot see a crest narrower than a cell, and over this
 * one the real planner sends the floor bot straight up its 2 m side.
 */
function causewayScene() {
  const TOP = 25, HALF = 8, SIDE = 2;
  const plateau = (z) => Math.max(0, Math.min(TOP, (z - 98) / 4 * TOP));
  const crest = (x, z) => {
    if (z < 0 || z > 104) return 0;
    const top = Math.min(TOP, z / 100 * TOP), ax = Math.abs(x);
    return ax <= HALF ? top : ax >= HALF + SIDE ? 0 : top * (HALF + SIDE - ax) / SIDE;
  };
  const getHeightAt = (x, z) => Math.max(plateau(z), crest(x, z));
  const getNormalAt = (x, z) => {
    const e = 0.5, dx = getHeightAt(x + e, z) - getHeightAt(x - e, z), dz = getHeightAt(x, z + e) - getHeightAt(x, z - e);
    const nx = -dx / (2 * e), nz = -dz / (2 * e), length = Math.hypot(nx, 1, nz);
    return { x: nx / length, y: 1 / length, z: nz / length };
  };
  const causeway = { getHeightAt, getNormalAt, getGroundType: () => 'firm' };
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
  const ROAD = Object.freeze([[25, 0], [0, -10], [0, 25], [0, 50], [0, 75], [0, 100], [30, 112]]);
  const floor = place('floor', 'alpha', 40, 70, Math.PI);
  const plateauEnemy = place('plateau', 'bravo', 30, 112, Math.PI);
  const ctl = createAI(floor, { difficulty: 'normal', rng: mulberry32(73), deps: {
    heightField: causeway, raycast, getEnemies: () => [plateauEnemy], getAllies: () => [], getObstacles: () => [],
    spotting: { isSpotted: () => true },
    planRoute: (_start, _goal, options) => (options?.requireGoalLevel ? ROAD : []),
  } });
  let t = 300;
  const run = (seconds, until) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      ctl.update(SIM_DT, t);
      updateTank(floor, causeway, SIM_DT, null);
      if (until && until(ctl.debugInfo())) return true;
    }
    return false;
  };
  const moveTo = (x, z) => { floor.state.pos.x = x; floor.state.pos.z = z; floor.state.pos.y = getHeightAt(x, z); floor.state.speed = 0; };
  const hull = (seconds) => {
    for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
      t += SIM_DT;
      updateTank(floor, causeway, SIM_DT, null);
    }
  };
  return { ctl, floor, run, moveTo, hull, clock: () => t, getHeightAt };
}

console.log('[11] a level route ends with no verdict when the watcher drives its hull off the road onto the level below, within reach of it');
// Round 4 (F5): hullOnItsWay measured the hull's way on the ground plan alone, 12 m either side of the route ahead. A
// watcher who drove the hull off the causeway's crest onto the floor beside it, 11 m from the road and 13 m below it,
// left the level route held from the wrong level: on 0edd0e1ab5 the follower drove at the crest's side, and its stuck
// strikes ended the route with the 75 s unbearable verdict (the class round 2 removed). Fix-up r1 (both reviews): the
// first fix read another level as ELEVATION_LEVEL_M (8 m) above or below, the gun's band, so a drop under it still held
// the route from below: taken on the crest past z 14 and left on the floor 5.5 m under the road, the verdict came 21.4 s
// after Leave on ab8a817159 (44.8 s on 0edd0e1ab5). A stretch is the hull's way only where the hull can drive to it: no
// step of the ground from the hull to the stretch's nearest point (every RESUME_STEP_M, 1.5 m) is steeper than its hull
// can climb or hold (terrainTravelCostFactor, the slope law the planner and the local router read).
{
  const crestHandBack = async ({ parkS, offTheSide, takeZ = 45 }) => {
    const { ctl, floor, run, moveTo, hull, clock, getHeightAt } = causewayScene();
    const routing = run(30, (info) => info.levelRouting);
    const onCrest = run(60, () => Math.abs(floor.state.pos.x) < 3 && floor.state.pos.z > takeZ);
    const before = ctl.debugInfo();
    const took = takeAndLeave(floor, ctl, clock, hull, parkS, offTheSide ? () => moveTo(11, floor.state.pos.z + 3) : null);
    const back = ctl.debugInfo();
    const dropM = getHeightAt(0, floor.state.pos.z) - floor.state.pos.y;
    const handBackS = clock();
    let nextRouteAfterS = null;
    // round 5 (U6): the window after Leave runs only until what the case reads is settled, at most 60 s: a verdict (a
    // route held from the wrong level ends in one, 44.8-46.6 s after Leave on 0edd0e1ab5), the road planned again (the
    // drops), or the route's end (on the crest)
    run(60, (info) => {
      if (info.unbearableVerdicts > before.unbearableVerdicts) return true;
      if (info.levelRoutes > before.levelRoutes) { nextRouteAfterS = clock() - handBackS; return true; }
      return !offTheSide && !info.levelRouting;
    });
    return { routing, onCrest, before, back, after: ctl.debugInfo(), nextRouteAfterS, dropM, windowS: clock() - handBackS, ...took };
  };
  const label = (r) => `verdicts ${r.before.unbearableVerdicts} -> ${r.after.unbearableVerdicts}, levelRouting ${r.before.levelRouting} -> ${r.back.levelRouting}, owner ${r.back.routeOwner}, routes ${r.before.levelRoutes} -> ${r.after.levelRoutes}; window ${r.windowS.toFixed(1)} s`;
  // taken high on the crest (a drop over the gun's 8 m band) and low on it (under the band: the review's case)
  for (const [takeZ, low, high] of [[45, 8, Infinity], [14, 4, 8]]) {
    const dropped = await crestHandBack({ parkS: 0.5, offTheSide: true, takeZ });
    ok(dropped.routing && dropped.onCrest && dropped.before.routeOwner === 'level' && dropped.dropM > low && dropped.dropM < high,
      `setup: the floor bot drives its level route up the causeway's crest past z ${takeZ} (owner ${dropped.before.routeOwner}); the watcher leaves it ${dropped.dropM.toFixed(1)} m below the road`);
    ok(!dropped.back.levelRouting && dropped.back.routeOwner !== 'level'
      && dropped.after.unbearableVerdicts === dropped.before.unbearableVerdicts,
      `a 0.5 s Take and Leave in which the watcher drove off the crest onto the floor 11 m beside the road, ${dropped.dropM.toFixed(1)} m below it: the route ends at the hand-back with no verdict, then or before the road is planned again (${label(dropped)})`);
    ok(dropped.nextRouteAfterS !== null && dropped.nextRouteAfterS >= 6 - 0.05,
      `and the lock plans the road again from the floor (${dropped.nextRouteAfterS === null ? 'never' : `${dropped.nextRouteAfterS.toFixed(2)} s`} after the hand-back; ELEVATION_LOCK_S 6 s)`);
  }
  const stayed = await crestHandBack({ parkS: 0.5, offTheSide: false });
  ok(stayed.back.levelRouting && stayed.back.routeOwner === 'level' && stayed.after.unbearableVerdicts === stayed.before.unbearableVerdicts
    && stayed.after.levelRoutes === stayed.before.levelRoutes,
    `a 0.5 s Take and Leave on the crest: the hull coasts on up the road on its level, and the route runs on to its end (coasted ${stayed.coastM.toFixed(1)} m; ${label(stayed)})`);
}

console.log('[12] the elevation lock\'s dwell after a park onto, off or between records: the record rule (the rest)');
// ai.watchResume [12]'s history. Round 5 (U5, the round-four correctness review; fix-up r1, the round's two reviews): the
// walk reads a record's top as the ground under it at both ends, so a park that moved the hull onto, off or between
// records read only the ground between. The stood-put test now reads each end's floor as the movement carries the hull
// (hullOnParkLevel): onto a flat top's vertical side it steps no more than HULL_STEP_UP_M (0.55 m: the structure
// support's floor rule; the round's correctness review drove an M1A1 onto 0.55 m and under 0.6-2.2 m, a wall in game),
// up a drawn top (a stone's surface) by its slope law, and off any top. On f60d0aa200 each restart below kept 2.9 s of
// dwell and the lock decided 3.15 s after Leave; round 5's first fix (a192a5a9a3) read the ride difference as one 1.5 m
// slope-law step, which kept the 1 m boxes and the rock-to-rock park and restarted the drawn top and the hull in the air.
{
  const label = dwellLabel;
  // round 5 (U5, the round-four correctness review; fix-up r1, the round's two reviews): the walk reads a record's top as
  // the ground under it at both ends, so a park that moved the hull onto, off or between records read only the ground
  // between. The stood-put test now reads each end's floor as the movement carries the hull (hullOnParkLevel): onto a
  // flat top's vertical side it steps no more than HULL_STEP_UP_M (0.55 m: the structure support's floor rule; the
  // review's mount probe drove an M1A1 onto 0.55 m and under 0.6-2.2 m, a wall in game), up a drawn top (a stone's
  // surface) by its slope law, and off any top. On f60d0aa200 each of the five restarts below kept 2.9 s of dwell and
  // the lock decided 3.15 s after Leave; round 5's first fix (a192a5a9a3) read the ride difference as one 1.5 m slope-law
  // step, which kept the 1 m box and the rock-to-rock park and restarted the drawn top and the hull in the air.
  const HIGH = Object.freeze({ min: [-10, 0, 18], max: [10, 2.2, 38] });
  const offHigh = await dwellHandBack((at) => [-13, at[2]], null, HIGH);
  ok(setupOk(offHigh, 2.2, 0), `setup: the floor bot dwells on a 2.2 m rock's top; the watcher leaves it on the ground beside the rock (${where(offHigh)})`);
  ok(restarted(offHigh),
    `a 0.5 s park that left the hull on the ground below the 2.2 m rock it was taken on: the dwell restarts (${label(offHigh)}; ELEVATION_LOCK_S 6 s)`);
  const ontoHigh = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(2.2), { onY: null, awayY: 2.2 });
  ok(setupOk(ontoHigh, 0, 2.2), `setup: the floor bot dwells on the ground; the watcher leaves it on a 2.2 m rock's top (${where(ontoHigh)})`);
  ok(restarted(ontoHigh),
    `a 0.5 s park that left the hull on a 2.2 m rock beside the ground it was taken on: the dwell restarts (${label(ontoHigh)}; ELEVATION_LOCK_S 6 s)`);
  // fix-up r1: a hull the watcher pulls up on a rock's edge, its root 0.3 m past it and its rear half on the top (the
  // floor under its root is the ground; under its contact rect, the rock)
  const ontoEdge = await dwellHandBack((at) => [at[0], 26.3], [-16, 31], beside(2.2), { onY: null, awayY: 2.2 });
  ok(setupOk(ontoEdge, 0, 2.2), `setup: the floor bot dwells on the ground; the watcher leaves it on a 2.2 m rock's edge, its root 0.3 m past it (${where(ontoEdge)})`);
  ok(restarted(ontoEdge),
    `a 0.5 s park that left the hull on a 2.2 m rock's edge, its root past it: the dwell restarts (${label(ontoEdge)})`);
  // round 6 (V3; the correctness review's example for (a)): taken on a 1 m box's top, left on the ground beside it (the
  // hull drives off the box, never back up its side); kept at f60d0aa200 and at a192a5a9a3 (1 m over one 1.5 m step: 0.67)
  const LOW = Object.freeze({ min: [-10, 0, 18], max: [10, 1, 38] });
  const offBox = await dwellHandBack((at) => [-13, at[2]], null, LOW);
  ok(setupOk(offBox, 1, 0), `setup: the floor bot dwells on a 1 m box's top; the watcher leaves it on the ground beside the box (${where(offBox)})`);
  ok(restarted(offBox),
    `a 0.5 s park that left the hull on the ground below the 1 m box it was taken on: the dwell restarts (${label(offBox)})`);
  // round 6 (V3): the default receipt's 1 m box reads the records through the match's obstacle query; a fixture without
  // one reads the controller's last obstacle list (parkLevelSolids' other branch), to the same restart
  const ontoBoxList = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(1), { onY: null, awayY: 1, query: false });
  ok(setupOk(ontoBoxList, 0, 1), `setup: as the default receipt's 1 m box, with no obstacle query (${where(ontoBoxList)})`);
  ok(restarted(ontoBoxList),
    `a 0.5 s park that left the hull on a 1 m box, read from the last obstacle list: the dwell restarts (${label(ontoBoxList)})`);
  // a step the hull mounts: a record standing 1 m from its foot 0.5 m under the ground, its top 0.5 m over it
  const ontoStep = await dwellHandBack((at) => [at[0], 22], [-16, 31], beside(0.5, -0.5), { onY: null, awayY: 0.5 });
  ok(setupOk(ontoStep, 0, 0.5), `setup: the floor bot dwells on the ground; the watcher leaves it on a record's top 0.5 m over the ground (${where(ontoStep)})`);
  ok(kept(ontoStep), `a 0.5 s park that left the hull on a 0.5 m step it mounts and drives off: the dwell holds (${label(ontoStep)})`);
  // fix-up r1 (the completeness review): from one 2.2 m rock's top onto another's across 3 m of ground
  const rockA = Object.freeze({ min: [-40, 0, 27], max: [-10, 2.2, 37] }), rockB = Object.freeze({ min: [-40, 0, 8], max: [-10, 2.2, 24] });
  const rockToRock = await dwellHandBack((at) => [at[0], 23], [-16, 32], [rockA, rockB], { onY: 2.2, awayY: 2.2 });
  ok(setupOk(rockToRock, 2.2, 2.2), `setup: the floor bot dwells on one 2.2 m rock's top; the watcher leaves it on another's past 3 m of ground (${where(rockToRock)})`);
  ok(restarted(rockToRock),
    `a 0.5 s park from one 2.2 m rock's top onto another's: the dwell restarts (${label(rockToRock)})`);
  // fix-up r1 (the correctness review, b): a drawn top (a formation's cap) rising 0.4 per metre from its edge at z 26,
  // which the hull drives up and back down as terrain (the review's probe: up to 3.1 m and back down to the spot)
  const ramp = setConvexTopShape({ min: [-40, -0.5, 10], max: [-10, 3, 26] }, [-40, 10, -10, 10, -10, 26, -40, 26], [0, 26, 0, -0.4, 0], -0.5, 3);
  const upRamp = await dwellHandBack((at) => [at[0], 22], [-16, 31], ramp, { onY: null, awayY: 1.6 });
  ok(setupOk(upRamp, 0, 1.6), `setup: the floor bot dwells on the ground; the watcher leaves it 1.6 m up a drawn top that rises 0.4 per metre (${where(upRamp)})`);
  ok(kept(upRamp), `a 0.5 s park that left the hull up a drawn top it drives down and back up: the dwell holds (${label(upRamp)})`);
  // fix-up r1 (the completeness review's risk): a hull riding over the ground with no record under it is on that ground
  const aloft = await dwellHandBack((at) => [at[0], at[2]], null, null, { onY: null, awayY: 1.5 });
  ok(Math.abs(aloft.handedBackAt[1] - 1.5) < 0.05 && planOf(aloft) < 12 && aloft.before.elevationLockT >= 2.5,
    `setup: the watcher leaves the hull in the air 1.5 m over the ground it was taken on (${where(aloft)})`);
  ok(kept(aloft), `a 0.5 s park that left the hull in the air over the same ground: the dwell holds (${label(aloft)})`);
}

if (failures) { console.error(`ai.watchResumeLevels.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.watchResumeLevels.selftest: a parked brain resumes from the hull as it stands, on every level');
