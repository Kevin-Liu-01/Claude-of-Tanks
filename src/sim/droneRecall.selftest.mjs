// The drone recall (owner 2026-10-14: "dont be able to instantly call it back, only be able to call back once weve
// entered screen, and if we do, show the landing animation and we should be able to launch it again after a shorter
// cooldown"). Pins the authority's lifecycle in the shared fixed-step flight (sim/aerialCombat.ts, timed by
// sim/droneRecall.ts, ruled by AERIAL_RULES.drone.recall): a recall is refused through the launch climb and the lens
// hand-over and accepted from the moment the pilot is in the drone's feed; the recalled airframe is held for its flight
// home and its landing, then parked; the relaunch waits the recall cooldown, shorter than the loss cooldown; a loss in
// the same step wins; a destroyed carrier clears the return; the migration checkpoint carries the gate and the return;
// two runs of one script are identical.
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { initializeAerial, stepAerial, captureAerial, restoreAerial } from './aerialCombat.ts';
import { AERIAL_RULES, matchRulesetFor } from './matchRuleset.ts';
import { DRONE_RECALL_OPENS_S, droneRecallOpen, droneReturnS, droneDockS, droneReturnSpeed } from './droneRecall.ts';
import { missionAttachmentPose } from './missionAttachmentPose.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { stepShell } from './ballistics.ts';
import { getSpec } from '../vehicles/specs.ts';
import { DRONE_ARRIVAL } from '../fx/droneArrival.ts';

const R = AERIAL_RULES.drone, RECALL = R.recall, DT = 1 / 60, DRONE = PLAYER_ACTION_BITS.DRONE;

// 1. The rules and the law.
assert.equal(DRONE_RECALL_OPENS_S, R.launchS + RECALL.feedS, 'a recall opens after the launch climb and the lens hand-over');
assert.ok(RECALL.feedS > 0 && RECALL.feedS < 1, 'the hand-over into the feed is a short beat');
assert.ok(!droneRecallOpen(0) && !droneRecallOpen(R.launchS) && !droneRecallOpen(DRONE_RECALL_OPENS_S - 1e-9) && droneRecallOpen(DRONE_RECALL_OPENS_S),
  'refused through the launch and the hand-over, open from the feed on');
assert.ok(RECALL.cooldownS < R.cooldownS, `the recall cooldown (${RECALL.cooldownS} s) is shorter than the loss cooldown (${R.cooldownS} s)`);
assert.ok(RECALL.landingS >= DRONE_ARRIVAL.descentS + DRONE_ARRIVAL.spoolS,
  `the authority's landing window (${RECALL.landingS} s) holds the dock's landing (${DRONE_ARRIVAL.descentS + DRONE_ARRIVAL.spoolS} s)`);
let previous = 0;
for (let h = 0; h <= R.rangeM; h += 5) {
  const speed = droneReturnSpeed(h), time = droneReturnS(h, RECALL.cruiseAboveDockM);
  assert.ok(speed >= RECALL.minMps && speed <= RECALL.maxMps, 'the flight home keeps its speed bounds');
  assert.ok(time >= previous - 1e-12, 'a longer way home never takes less time');
  assert.equal(droneDockS(h, RECALL.cruiseAboveDockM), time + RECALL.landingS, 'parked after the flight home and the landing');
  previous = time;
  // A recall anywhere the drone can spot (spotRangeM) and at any height it flies is relaunched sooner than a loss.
  if (h <= R.spotRangeM) for (const above of [0, 15, 40, 80]) {
    assert.ok(droneDockS(h, above) + RECALL.cooldownS < R.cooldownS, `a recall from ${h} m, ${above} m up relaunches before a loss would`);
  }
}

// 2. The lifecycle on a real carrier (the M1A2's certified dock), a fixed step at a time.
function pilot() {
  const spec = getSpec('m1a2');
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
  assert.ok(landingSteps * DT >= DRONE_ARRIVAL.descentS + DRONE_ARRIVAL.spoolS, 'the landing runs its full duration before the dock counts it parked');
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
