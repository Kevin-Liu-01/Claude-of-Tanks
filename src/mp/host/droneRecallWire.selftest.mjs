// The drone recall over the network (owner 2026-10-14): the client only asks; the authority decides. Every press here
// travels the real path a guest's press takes to the host — a control frame through the wire codec, the seat's input
// buffer (edge sequences, the repeat window) and the authority's fixed step — and the authority refuses a recall
// before the pilot is in the drone's feed, accepts one after, holds the dock for the flight home and the landing, then
// relaunches after the recall cooldown; the snapshot's mode state carries the gate and the return to the client.
// Two runs of the same frames are identical.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { AERIAL_RULES } from '../../sim/matchRuleset.ts';
import { DRONE_RECALL_OPENS_S, droneRecallOpen } from '../../sim/droneRecall.ts';
import { encodeMessage, decodeMessage } from '../wire/codec.ts';
import { ACTION_BITS, MESSAGE_TYPE, NO_TICK } from '../wire/constants.ts';
import { quantizeAimDistance, quantizeControlAxis } from '../wire/quantize.ts';
import { createSeatInputBuffer } from '../../../server/match/inputBuffer.ts';

await ensureAuthorityFleet(['m1a2']); // the host is specs only: the roster's combat anatomy, nothing else

const DT = 1 / 60, RECALL = AERIAL_RULES.drone.recall;
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };

function host() {
  const match = createAuthoritativeMatch({ gameMode: 'drone', countdownS: 0, mapId: 'verdant', seed: 23,
    worldCollision: { mapId: 'verdant', heightField: flat, getObstacles: () => [] },
    players: [{ id: 'pilot', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } }, { id: 'target', specId: 'm1a2', team: 'bravo', spawn: { x: 260, z: 520, yaw: 0 } }] });
  match.onMatchReady();
  const seat = createSeatInputBuffer(), pilot = match.entityById.get('pilot'), transcript = [];
  let tick = 0, actionSeq = 0, launchTick = -1;
  /** One client frame (a press bumps the action sequence and carries the drone bit), over the wire, into one step. */
  function frame(press = false, throttle = 0) {
    if (press) actionSeq = (actionSeq + 1) & 0xffff;
    const control = { throttle: quantizeControlAxis(throttle), steer: 0, flags: 0, aimYaw: 0, aimPitch: 0, aimDistance: quantizeAimDistance(1000),
      shellSlot: 0, fireSeq: 0, actionSeq, actionBits: press ? ACTION_BITS.DRONE : 0 };
    const decoded = decodeMessage(encodeMessage({ type: MESSAGE_TYPE.INPUT, clientTick: tick, snapshotAckTick: NO_TICK, interpDelayMs: 0, controls: [control] }));
    assert.ok(decoded.ok && decoded.message.controls[0].actionBits === (press ? ACTION_BITS.DRONE : 0), 'the press crosses the wire intact');
    seat.admit(decoded.message, tick);
    tick++;
    const input = seat.inputFor(tick);
    if (press) assert.equal(input.actionBits, ACTION_BITS.DRONE, 'the seat hands the authority the press');
    const wasActive = !!pilot.aerial?.active;
    match.step({ dt: DT, inputs: new Map([['pilot', input]]) });
    if (!wasActive && pilot.aerial.active) launchTick = tick;
    transcript.push(JSON.stringify(pilot.aerial));
    return pilot.aerial;
  }
  function modeState() {
    const meta = match.snapshot({ tick, serverTimeMs: Math.round(tick * DT * 1000), viewerId: 'pilot', ackInputSeq: null }).meta;
    match.afterSnapshotBroadcast?.();
    // The client reads the mode state from its JSON (matchHostCore → modeStateJson → battlePresentation).
    return JSON.parse(JSON.stringify(meta.modeState));
  }
  return { match, pilot, frame, modeState, transcript, get tick() { return tick; }, get ageTicks() { return tick - launchTick; } };
}

function script(record = true) {
  const h = host(), { frame } = h;
  frame(); // the first applied frame seeds the edge sequences
  for (let i = 0; i < 10; i++) frame();
  assert.equal(frame(true).active, true, 'a launch press over the wire launches');
  const refused = [];
  // Early recall messages: in the launch climb and in the hand-over into the feed, each its own press (spaced past the
  // seat's repeat window), the last on the final step before the feed is live.
  const lastClosed = Math.ceil(DRONE_RECALL_OPENS_S / DT) - 2;
  for (const atTick of [30, 90, 146, lastClosed]) {
    while (h.ageTicks < atTick - 1) frame(false, 1);
    const view = frame(true, 1), age = h.ageTicks * DT;
    assert.ok(h.ageTicks === atTick && !droneRecallOpen(age));
    assert.equal(view.active, true, `the authority refuses a recall ${age.toFixed(2)} s into the flight`);
    const state = h.modeState();
    assert.ok(state.aerial.recallS > 0 && state.aerial.returnS === 0, 'the client is told how long until a recall is accepted');
    assert.equal(state.missionPayloads.find((row) => row.id === 'pilot').ready, false, 'the dock stays empty while it flies');
    refused.push(+age.toFixed(3));
    frame(false, 1); // a held frame clears the seat's repeat window, so the next press is the authority's to judge
  }
  assert.ok(refused.length === 4 && refused.some((a) => a < AERIAL_RULES.drone.launchS) && refused.some((a) => a >= AERIAL_RULES.drone.launchS),
    `refused in the climb and in the hand-over (${refused.join(', ')} s)`);
  while (h.pilot.aerial.recallS > 0) frame(false, 1);
  // The first press once the feed is live is accepted.
  const recall = frame(true, 1), accepted = h.ageTicks * DT;
  assert.equal(recall.active, false, 'a recall from the feed is accepted');
  const state = h.modeState();
  assert.ok(state.aerial.returnS > RECALL.landingS && state.aerial.cooldownS > state.aerial.returnS, 'the client is told it is flying home, then landing, then the cooldown');
  assert.equal(state.missionPayloads.find((row) => row.id === 'pilot').ready, false, 'the dock is not ready while the airframe returns');
  // Launch presses while it flies home and lands are refused by the authority.
  let pressed = 0;
  while (h.pilot.aerial.returnS > 0) { const v = frame(h.tick % 40 === 0); if (h.tick % 40 === 0) pressed++; assert.equal(v.active, false, 'no launch while the airframe returns'); }
  assert.ok(pressed >= 3 && Math.abs(h.pilot.aerial.cooldownS - RECALL.cooldownS) <= DT + 1e-9, 'parked, with the recall cooldown to run');
  while (h.pilot.aerial.cooldownS > 0) { const v = frame(h.tick % 40 === 0); assert.equal(v.active, false, 'no launch in the recall cooldown'); }
  frame();
  assert.equal(frame(true).active, true, 'relaunched after the recall cooldown');
  assert.equal(h.modeState().missionPayloads.find((row) => row.id === 'pilot').ready, false);
  return { transcript: h.transcript, accepted, refused };
}

const a = script(), b = script();
assert.ok(a.accepted >= DRONE_RECALL_OPENS_S - 1e-9 && a.accepted <= DRONE_RECALL_OPENS_S + 2 * DT + 1e-9, `the first press once the feed is live is accepted (${a.accepted.toFixed(3)} s)`);
assert.deepEqual(b.transcript, a.transcript, 'two hosts given the same frames agree on every step');
console.log(`droneRecallWire: early recall messages refused at ${a.refused.join(', ')} s, accepted from ${a.accepted.toFixed(2)} s; return, landing and recall cooldown held by the authority; ${a.transcript.length} steps identical across two hosts`);
