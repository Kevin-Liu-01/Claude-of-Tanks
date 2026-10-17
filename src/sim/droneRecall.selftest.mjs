// The drone recall (owner 2026-10-14: "dont be able to instantly call it back, only be able to call back once weve
// entered screen, and if we do, show the landing animation and we should be able to launch it again after a shorter
// cooldown"). Pins the authority's lifecycle in the shared fixed-step flight (sim/aerialCombat.ts, timed by
// sim/droneRecall.ts, ruled by AERIAL_RULES.drone.recall): a recall is refused through the launch climb and the lens
// hand-over and accepted from the moment the pilot is in the drone's feed; the recalled airframe is held for its flight
// home and its landing, then parked; the relaunch waits the recall cooldown, shorter than the loss cooldown; a loss in
// the same step wins; a destroyed carrier clears the return; the migration checkpoint carries the gate and the return;
// two runs of one script are identical. Verifier 2026-10-14: the flight home had no bound, so a recall from high above
// the tank (>161 m), far below it or past 732 m out relaunched later than a loss (up to 71 s); the law now bounds the
// transit, and this sweeps the whole reachable envelope (the law over every height and distance the link allows, and
// the real fixed-step flight climbing, diving and running out to the link's edge) for a relaunch a clear margin sooner.
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { initializeAerial, stepAerial, captureAerial, restoreAerial } from './aerialCombat.ts';
import { AERIAL_RULES, matchRulesetFor } from './matchRuleset.ts';
import { DRONE_RECALL_OPENS_S, DRONE_RECALL_RELAUNCH_MAX_S, droneRecallOpen, droneReturnS, droneDockS, droneReturnSpeed, droneReturnClimbS } from './droneRecall.ts';
import { missionAttachmentPose } from './missionAttachmentPose.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { stepShell } from './ballistics.ts';
import { getSpec } from '../vehicles/specs.ts';
import { DRONE_ARRIVAL } from '../fx/droneArrival.ts';

const R = AERIAL_RULES.drone, RECALL = R.recall, DT = 1 / 60, DRONE = PLAYER_ACTION_BITS.DRONE;
/** "A shorter cooldown than after a loss", by a clear margin: a fifth of the loss cooldown (5 s of 25 s). */
const MARGIN_S = R.cooldownS / 5;

// 1. The rules and the law.
assert.equal(DRONE_RECALL_OPENS_S, R.launchS + RECALL.feedS, 'a recall opens after the launch climb and the lens hand-over');
assert.ok(RECALL.feedS > 0 && RECALL.feedS < 1, 'the hand-over into the feed is a short beat');
assert.ok(!droneRecallOpen(0) && !droneRecallOpen(R.launchS) && !droneRecallOpen(DRONE_RECALL_OPENS_S - 1e-9) && droneRecallOpen(DRONE_RECALL_OPENS_S),
  'refused through the launch and the hand-over, open from the feed on');
assert.ok(RECALL.cooldownS < R.cooldownS, `the recall cooldown (${RECALL.cooldownS} s) is shorter than the loss cooldown (${R.cooldownS} s)`);
const DOCK_LANDING_S = DRONE_ARRIVAL.descentS + DRONE_ARRIVAL.spoolS + DRONE_ARRIVAL.pauseS;
assert.ok(RECALL.landingS >= DOCK_LANDING_S + 1 / 30,
  `the authority's landing window (${RECALL.landingS} s) holds the dock's landing (${DOCK_LANDING_S} s, drawn to the frame at 30 fps)`);
// The bound: from anywhere, the flight home, the landing and the recall cooldown end a clear margin before a loss's.
assert.equal(DRONE_RECALL_RELAUNCH_MAX_S, RECALL.maxTransitS + RECALL.approachS + RECALL.landingS + RECALL.cooldownS);
assert.ok(DRONE_RECALL_RELAUNCH_MAX_S <= R.cooldownS - MARGIN_S,
  `the longest recall relaunch (${DRONE_RECALL_RELAUNCH_MAX_S} s) is at least ${MARGIN_S} s inside the loss cooldown (${R.cooldownS} s)`);
// The law over the reachable envelope: every distance out to the link's edge (and half again, for a carrier pushed off
// its launch point), every height from the link's depth below the dock to its ceiling above, at 5 m.
let checked = 0, slowest = 0, slowestAt = '';
for (let h = 0; h <= R.rangeM * 1.5; h += 5) {
  const speed = droneReturnSpeed(h);
  assert.ok(speed >= RECALL.minMps && (h <= RECALL.maxMps * RECALL.maxTransitS ? speed <= RECALL.maxMps + 1e-9 : true),
    `${h} m out: the usual pace, faster only where it would not be home inside the bound (${speed.toFixed(1)} m/s)`);
  let previous = -Infinity;
  for (let above = -R.rangeM * 1.5; above <= R.rangeM * 1.5; above += 5) {
    const dock = droneDockS(h, above), relaunch = dock + RECALL.cooldownS;
    assert.ok(Math.abs(dock - (droneReturnS(h, above) + RECALL.landingS)) < 1e-9, 'parked after the flight home and the landing');
    assert.ok(droneReturnS(h, above) >= RECALL.approachS + droneReturnClimbS(above) - 1e-9, 'the transit covers the climb or sink');
    assert.ok(relaunch <= DRONE_RECALL_RELAUNCH_MAX_S + 1e-9 && relaunch < R.cooldownS - MARGIN_S + 1e-9,
      `a recall from ${h} m out, ${above} m over the dock relaunches in ${relaunch.toFixed(2)} s, a clear margin inside a loss's ${R.cooldownS} s`);
    if (relaunch > slowest) { slowest = relaunch; slowestAt = `${h} m out, ${above} m up`; }
    // Farther above the cruise height never comes home sooner (and likewise below it).
    if (above >= RECALL.cruiseAboveDockM) { assert.ok(dock >= previous - 1e-9, 'a longer sink never takes less time'); previous = dock; }
    checked++;
  }
}
for (let h = 0; h <= R.rangeM; h += 5) assert.ok(droneDockS(h + 5, 15) >= droneDockS(h, 15) - 1e-9, 'a longer way home never takes less time');
// Unreachable inputs (a non-finite position) still read as the bound, never a longer or an undefined wait.
for (const [h, above] of [[Infinity, 0], [0, Infinity], [0, -Infinity], [NaN, NaN], [1e12, -1e12], [-5, 15]]) {
  const relaunch = droneDockS(h, above) + RECALL.cooldownS;
  assert.ok(Number.isFinite(relaunch) && relaunch <= DRONE_RECALL_RELAUNCH_MAX_S + 1e-9, `${h} m out, ${above} m up: ${relaunch} s`);
}
// The usual pace is unchanged inside the spotting range at a usual height (the bound only lifts the far and the high).
assert.ok(Math.abs(droneDockS(R.spotRangeM, RECALL.cruiseAboveDockM) - (R.spotRangeM / RECALL.maxMps + RECALL.approachS + RECALL.landingS)) < 1e-9);
console.log(`droneRecall: the law over ${checked} recall points out to ${R.rangeM * 1.5} m and ${R.rangeM * 1.5} m above or below; slowest ${slowest.toFixed(2)} s (${slowestAt}), bound ${DRONE_RECALL_RELAUNCH_MAX_S} s vs ${R.cooldownS} s after a loss`);

// 2. The lifecycle on a real carrier (the M1A2's certified dock), a fixed step at a time.
function pilot() {
  const spec = getSpec('m1a1_abrams_hc');
  return { id: 'pilot', team: 'alpha', spec, bot: false, isPlayer: true, state: { pos: new Vector3(4, 0, -6), yaw: .3, turretYaw: -.4, speed: 0 },
    combat: { destroyed: false }, input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(140, 22, 400), auxiliaryBits: 0 } };
}
function session(entity = pilot()) {
  initializeAerial(entity, matchRulesetFor('drone'));
  const shells = []; let id = 1, tick = 0;
  return {
    entity, shells, view: () => entity.aerial,
    get tick() { return tick; }, get timeS() { return tick * DT; },
    step(press = false) {
      tick++;
      if (press) entity.input.auxiliaryBits |= DRONE;
      stepAerial(entity, tick * DT, DT, () => id++, (shell) => shells.push(shell));
      const live = shells[shells.length - 1];
      if (live && !live.dead) stepShell(live, DT);
    },
  };
}
const dock = new Vector3(), dockAxes = new Quaternion();
const transcript = [];
function lifecycle(record) {
  const s = session(), v = s.view;
  for (let i = 0; i < 30; i++) s.step();
  s.step(true);
  assert.equal(s.shells.length, 1, 'the press launches');
  const born = s.timeS, flight = s.shells[0];
  assert.ok(v().active && v().launching && Math.abs(v().recallS - DRONE_RECALL_OPENS_S) < 1e-9, 'launching, the recall closed for the whole gate');
  s.entity.input.throttle = 1;
  // Refused through the launch climb and the hand-over into the feed, at every press; the countdown is the gate's.
  let refusedClimb = 0, refusedHandOver = 0, opened = -1;
  while (opened < 0) {
    const age = (s.tick + 1) * DT - born, open = droneRecallOpen(age);
    s.step(true);
    if (!open) {
      assert.ok(v().active && !flight.dead && v().returnS === 0 && v().cooldownS === 0, `a recall ${age.toFixed(3)} s into the flight is refused`);
      assert.ok(Math.abs(v().recallS - (DRONE_RECALL_OPENS_S - age)) < 1e-9 && v().recallS > 0, 'the view counts the gate down');
      if (age < R.launchS) refusedClimb++; else refusedHandOver++;
      // An early press is dropped, never queued: the next step without a press keeps flying.
      s.step(); assert.ok(v().active, 'a refused press is not remembered');
    } else opened = age;
    if (record) record.push(JSON.stringify(v()));
  }
  assert.ok(refusedClimb > 50 && refusedHandOver >= 10, `presses refused in the climb (${refusedClimb}) and the hand-over (${refusedHandOver})`);
  assert.ok(opened >= DRONE_RECALL_OPENS_S && opened < DRONE_RECALL_OPENS_S + 2 * DT, 'accepted the step the feed is live');
  assert.equal(v().active, false, 'the recall is accepted'); assert.equal(flight.dead, true, 'its warhead is retired with the shell');
  return { s, flight };
}
{
  const { s, flight } = lifecycle(transcript), v = s.view;
  assert.ok(v().returnS > 0 && v().cooldownS > v().returnS, 'held for the flight home and the landing, then the cooldown');
  // The window is the law's, from the airframe's distance to the dock as it stood at the recall.
  missionAttachmentPose(s.entity.spec, s.entity.state, dock, dockAxes);
  const law = droneDockS(Math.hypot(flight.pos.x - dock.x, flight.pos.z - dock.z), flight.pos.y - dock.y);
  assert.ok(Math.abs(v().returnS - law) < 1e-9, `the return window is the law's (${v().returnS.toFixed(3)} s vs ${law.toFixed(3)} s)`);
  assert.ok(Math.abs(v().cooldownS - (law + RECALL.cooldownS)) < 1e-9, 'the relaunch waits the recall cooldown after it is parked');
  const recalledAt = s.timeS, landingFrom = recalledAt + law - RECALL.landingS;
  // Through the flight home and the landing: a press never launches; the return counts down to the parked airframe.
  let landingSteps = 0, docked = -1;
  while (docked < 0) {
    s.step(s.tick % 20 === 0);
    assert.equal(s.shells.length, 1, 'no launch while the airframe flies home or lands');
    if (s.timeS >= landingFrom) landingSteps++;
    if (v().returnS === 0) docked = s.timeS;
  }
  assert.ok(Math.abs(docked - (recalledAt + law)) <= DT + 1e-9, 'parked when the landing window closes');
  assert.ok(landingSteps * DT >= DOCK_LANDING_S, 'the landing runs its full duration before the dock counts it parked');
  assert.ok(Math.abs(v().cooldownS - RECALL.cooldownS) <= DT + 1e-9, `parked with the recall cooldown to run (${v().cooldownS.toFixed(3)} s)`);
  while (v().cooldownS > 0) { s.step(s.tick % 15 === 0); assert.equal(s.shells.length, 1, 'refused through the recall cooldown'); }
  s.step(true);
  assert.equal(s.shells.length, 2, 'relaunched the recall cooldown after the airframe was parked');
  const relaunch = s.timeS - recalledAt;
  // 3. A loss: the second airframe strikes something. The loss cooldown applies, with no return.
  for (let i = 0; i < 200; i++) s.step();
  s.shells[1].dead = true; s.step();
  assert.equal(v().active, false); assert.equal(v().returnS, 0, 'a lost airframe never flies home');
  assert.ok(Math.abs(v().cooldownS - R.cooldownS) < 1e-9, 'a loss waits the full cooldown');
  assert.ok(relaunch < R.cooldownS, `the recall relaunched in ${relaunch.toFixed(2)} s from the press; a loss takes ${R.cooldownS} s`);
  console.log(`droneRecall: gate ${DRONE_RECALL_OPENS_S.toFixed(2)} s, the return ${law.toFixed(2)} s (landing ${RECALL.landingS} s), relaunch ${relaunch.toFixed(2)} s after the recall vs ${R.cooldownS} s after a loss`);
}
// 3b. The real fixed-step flight over the envelope (the verifier's path, widened): flat out straight up and at 45° with
//     Space held, level out to the link's edge, diving at 45° and straight down, and a strafing turn; recalled every
//     half second from the gate until the airframe is lost, each from a fresh launch. The relaunch is read the step the
//     authority accepts the recall (section 2 pins that it relaunches exactly then).
{
  const styles = [
    { name: 'straight up, Space held', dir: [0, 1, 0], brake: true },
    { name: '45 deg climb, Space held', dir: [0, 1, 1], brake: true },
    { name: 'level out', dir: [0, 0, 1] },
    { name: '45 deg dive', dir: [0, -1, 1] },
    { name: 'straight down', dir: [0, -1, 0] },
    { name: 'strafing turn', dir: [1, .15, 0], steer: 1 },
  ];
  const aim = new Vector3(), at = new Vector3();
  let recalls = 0, slowest = 0, slowestAt = '', highest = -Infinity, lowest = Infinity, farthest = 0;
  for (const style of styles) {
    const heading = new Vector3(...style.dir).normalize();
    for (let recallAt = DRONE_RECALL_OPENS_S; recallAt < R.batteryS; recallAt += .5) {
      const s = session(), v = s.view;
      s.step(true);
      const born = s.timeS, flight = s.shells[0];
      Object.assign(s.entity.input, { throttle: 1, brake: !!style.brake, steer: style.steer ?? 0 });
      while (v().active && s.timeS - born < recallAt - 1e-9) { s.entity.input.aimPoint = aim.copy(flight.pos).addScaledVector(heading, 1000); s.step(); }
      if (!v().active) break;
      at.copy(flight.pos);
      s.step(true);
      if (v().returnS === 0) { assert.ok(v().cooldownS > R.cooldownS - 2 * DT, `${style.name}: lost in the recall's step, a loss`); break; }
      assert.equal(v().active, false, `${style.name}: the recall ${recallAt.toFixed(2)} s in is accepted`);
      missionAttachmentPose(s.entity.spec, s.entity.state, dock, dockAxes);
      const above = at.y - dock.y, out = Math.hypot(at.x - dock.x, at.z - dock.z), relaunch = v().cooldownS;
      assert.ok(relaunch <= DRONE_RECALL_RELAUNCH_MAX_S + 1e-9 && relaunch <= R.cooldownS - MARGIN_S + 1e-9,
        `${style.name}: recalled ${recallAt.toFixed(2)} s in, ${out.toFixed(0)} m out and ${above.toFixed(0)} m over the dock, relaunched in ${relaunch.toFixed(2)} s (a loss: ${R.cooldownS} s)`);
      if (relaunch > slowest) { slowest = relaunch; slowestAt = `${style.name}, ${out.toFixed(0)} m out, ${above.toFixed(0)} m up`; }
      highest = Math.max(highest, above); lowest = Math.min(lowest, above); farthest = Math.max(farthest, out); recalls++;
    }
  }
  // The sweep reaches the envelope's edges: the link's ceiling above, its depth below, its edge out.
  assert.ok(highest > R.rangeM * .9 && lowest < -R.rangeM * .9 && farthest > R.rangeM * .9,
    `recalled up to ${highest.toFixed(0)} m above, ${(-lowest).toFixed(0)} m below and ${farthest.toFixed(0)} m out (link ${R.rangeM} m)`);
  console.log(`droneRecall: ${recalls} real recalls (climbing, level, diving, turning; up to ${highest.toFixed(0)} m above, ${(-lowest).toFixed(0)} m below, ${farthest.toFixed(0)} m out): slowest relaunch ${slowest.toFixed(2)} s (${slowestAt}) vs ${R.cooldownS} s after a loss`);
}
// 4. A loss in the same step as a recall wins; the battery spent is a loss; a destroyed carrier clears the return.
{
  const s = session(), v = s.view;
  s.step(true); s.entity.input.throttle = 1;
  while (v().recallS > 0) s.step();
  for (let i = 0; i < 20; i++) s.step();
  s.shells[0].dead = true; s.step(true);
  assert.ok(v().returnS === 0 && Math.abs(v().cooldownS - R.cooldownS) < 1e-9, 'an impact in the recall\'s step is a loss');
  for (let i = 0; i < R.cooldownS / DT + 2; i++) s.step();
  s.step(true); assert.equal(s.shells.length, 2);
  s.entity.input.throttle = 0; s.entity.input.brake = false;
  for (let i = 0; i < R.batteryS / DT + 2 && v().active; i++) s.step();
  assert.ok(!v().active && v().returnS === 0 && v().cooldownS > R.cooldownS - 2 * DT, 'a spent battery is a loss');
  for (let i = 0; i < R.cooldownS / DT + 2; i++) s.step();
  s.step(true); assert.equal(s.shells.length, 3);
  while (v().recallS > 0) s.step();
  s.step(true); assert.ok(v().returnS > 0, 'recalled');
  s.entity.combat.destroyed = true; s.step();
  assert.ok(v().returnS === 0 && v().recallS === 0, 'a destroyed carrier clears the return');
}
// 5. The host-migration checkpoint carries the gate (from the original launch) and the return window.
{
  const a = session(), b = session();
  a.step(true); for (let i = 0; i < 60; i++) a.step();
  const lockedAt = captureAerial(a.entity);
  const restored = session(); for (let i = 0; i < a.tick; i++) restored.step();
  restoreAerial(restored.entity, lockedAt, () => 999, () => {});
  restored.step(true);
  assert.ok(restored.view().active && restored.view().recallS > 0, 'a restored flight still refuses an early recall');
  while (restored.view().recallS > 0) restored.step();
  restored.step(true);
  assert.ok(!restored.view().active && restored.view().returnS > 0, 'and accepts it from the original gate');
  b.step(true); while (b.view().recallS > 0) b.step(); b.step(true);
  for (let i = 0; i < 90; i++) b.step();
  const returning = captureAerial(b.entity);
  assert.ok(returning.dockAt > b.timeS, 'the checkpoint carries the parked time');
  const c = session(); for (let i = 0; i < b.tick; i++) c.step();
  restoreAerial(c.entity, returning, () => 999, () => {});
  while (b.view().cooldownS > 0) { b.step(); c.step(b.tick % 30 === 0); assert.equal(c.view().returnS, b.view().returnS); }
  assert.equal(c.view().cooldownS, 0, 'the restored dock is ready on the same step');
}
// 6. Determinism: one script, twice, the same view every step.
{
  const again = [];
  lifecycle(again);
  assert.deepEqual(again, transcript, 'two runs of the same presses fly, refuse and recall identically');
}
console.log('droneRecall: refused through the launch and the hand-over, accepted in the feed; flies home and lands inside the window, then the shorter cooldown; losses keep the long one; migration and determinism hold');
