// A seat's stall replays on the authority's rule (2026-10-13, the MP stream; plan step 9). When a seat's main thread
// stalls, its sampler skips the ticks it missed (InputStream.dueTicks: past 8 behind it samples only the newest 4), so the
// authority gets no control for them: it holds the last one for HELD_INPUT_LEASE_TICKS (500 ms) and then releases drive
// and fire (server/match/inputBuffer.ts). The seat's prediction replayed that gap with the held control all the way
// through (InputStream.controlAt answers the newest earlier control), predicting a hull still driving that the authority
// had braked — the next authority row snapped it back by metres. This receipt runs the real client sampler, the real
// authority input buffer and the real predictor against one shared movement model, stalls the seat for 0.3, 0.6, 1 and
// 2 s while it drives, and measures the correction each authority row after the stall applies.
//
// 2026-10-15 (the MP stream, the §7 side-by-side): in a browser the rows that reached a stalled tab are its queued message
// tasks, and they run before its next frame or after it. Rows first: the newest is newer than anything the stalled seat
// sampled (a tick jump that seats the hull on the authority's pose), and stepping the whole skipped range again from there
// over-ran the hull by the overlap. Frame first: every queued row is older than the replay window (maxReplayTicks), and
// each rewound the hull and replayed only the window's newest ticks, leaving it behind by the rest. The e2e's seat-pause
// probe read 2.8 m after a 0.3 s stall and 7.8 m (a hard snap) after 0.7 s. MatchClient now reconciles the newest own row
// once per frame, before its sampler (as `run` models it), and the prediction steps only the ticks after the hull's
// current one. Both wake orders are run; the per-row reconcile is kept as the control that fails.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../../sim/movement.ts';
import { ENTITY_FLAGS, HELD_INPUT_LEASE_TICKS, NO_TICK, quantizeAngle, quantizePosition, quantizeVelocity, zeroEntityRow } from '../wire/index.ts';
import { captureMovementCheckpoint } from './movementCheckpoint.ts';
import { InputStream } from './inputStream.ts';
import { LocalPredictor } from './prediction.ts';
import { createSeatInputBuffer } from '../../../server/match/inputBuffer.ts';

const SPEC = {
  enginePowerHp: 1500, weightTons: 60, topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
  turretTraverseDegS: 40, gunPitchDegS: 25, gunElevationDeg: 20, gunDepressionDeg: 10, pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: { caliberMm: 120, baseAccuracy: 0.3, aimTimeS: 2, bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 } },
  armor: { boundingRadiusM: 4.8, turretPivot: [0, 1.5, 0], gunPivot: [0, 0.3, 0.2], gunBarrel: { lengthM: 5.3 } },
};
const height = (x, z) => 0.25 * Math.sin(z / 2) + 0.15 * Math.sin(x / 2);
const FIELD = { getHeightAt: height, getHeightAtFast: height, getGroundType: () => 'hard' };

function rowOf(state) {
  return {
    ...zeroEntityRow(1),
    x: quantizePosition(state.pos.x), y: quantizePosition(state.pos.y), z: quantizePosition(state.pos.z),
    speed: quantizeVelocity(state.speed), verticalSpeed: quantizeVelocity(state.verticalSpeed),
    yaw: quantizeAngle(state.yaw), pitch: quantizeAngle(state.visualPitch), roll: quantizeAngle(state.visualRoll),
    turretYaw: quantizeAngle(state.turretYaw), gunPitch: quantizeAngle(state.gunPitch),
    hp: 2000, maxHp: 2000, flags: state.grounded ? 0 : ENTITY_FLAGS.AIRBORNE,
  };
}
function viewerOf(state) {
  const checkpoint = captureMovementCheckpoint(state);
  return {
    entityId: 1, modules: new Array(15).fill(0), crewBits: 3, equipment: [1000, 1000, 1000, 1000], modeSpeedMultiplier: 1000, modeGravityScale: 1000,
    movementVersion: checkpoint.version, movementFlags: checkpoint.flags, movementValues: checkpoint.values.map(Math.fround),
  };
}

/**
 * One seat driving (full throttle, a gentle turn) for `ticks`, its main thread stalled from `stallAt` for `stallTicks`.
 * The seat samples one tick per tick (its lead 0 here), the authority admits each frame in time for its tick and applies
 * control t at server tick t + 1; its rows reach the seat `lagTicks` later, every second tick.
 */
function run({ ticks = 420, stallAt = 150, stallTicks = 0, lagTicks = 6, rowsFirst = true, coalesce = true }) {
  const stream = new InputStream({ initialLeadTicks: 0 });
  stream.start(0);
  const buffer = createSeatInputBuffer();
  const server = { spec: SPEC, state: createTankState(SPEC, new Vector3(0, height(0, 0), 0), 0), combat: null, input: { throttle: 0, steer: 0, brake: false, aimLocked: true, aimPoint: new Vector3(0, 0, 500) } };
  const predictor = new LocalPredictor(SPEC, { heightField: FIELD });
  const rows = new Map();
  const corrections = [];
  let seeded = false;
  // the rows that reach the seat while it is stalled wait as its queued message tasks
  const queued = [];
  const deliver = (tick, authorityTick, authority) => {
    if (!seeded) { predictor.reconcile({ tick: authorityTick, ...authority }, (t) => stream.controlAt(t), stream.lastSampledTick); seeded = true; return; }
    predictor.reconcile({ tick: authorityTick, ...authority }, (t) => stream.controlAt(t), stream.lastSampledTick);
    corrections.push({ tick, authorityTick, errorM: predictor.getStats().lastPositionErrorM });
  };
  // MatchClient: a row is held as the newest and reconciled at the next frame, before the sampler (coalesce); the control
  // reconciles every row as it arrives (the client before 2026-10-15)
  let pending = null;
  const arrive = (tick, authorityTick, authority) => { if (coalesce) pending = { authorityTick, authority }; else deliver(tick, authorityTick, authority); };
  for (let tick = 0; tick < ticks; tick++) {
    const stalled = tick >= stallAt && tick < stallAt + stallTicks;
    const woke = stallTicks > 0 && tick === stallAt + stallTicks;
    // a browser's wake: the queued messages run before the tab's next frame (rowsFirst); the other order is kept as a control
    if (woke && rowsFirst) for (const entry of queued.splice(0)) arrive(tick, entry.authorityTick, entry.authority);
    if (!stalled) {
      if (pending) { const { authorityTick, authority } = pending; pending = null; deliver(tick, authorityTick, authority); }
      // the seat's frame: its sampler catches up to this tick (skipping what the stall missed)
      // exactly as MatchClient.sampleInputs: the ticks the sampler jumps over are stepped by the prediction first
      const skippedFrom = stream.pendingTick;
      const due = stream.dueTicks(tick, 4, 8);
      if (stream.pendingTick > skippedFrom) predictor.skipTicks(skippedFrom, stream.pendingTick - skippedFrom);
      for (let n = 0; n < due; n++) {
        const control = stream.sample({ throttle: 1, steer: tick > 60 ? 0.25 : 0, brake: false, fire: false, aimLocked: true, aimYaw: 0.4, aimPitch: 0, aimDistance: 600, shellSlot: 0, actionPresses: 0 });
        predictor.recordTick(control);
      }
      if (due > 0) buffer.admit(stream.frame(NO_TICK, 100), tick);
    }
    if (woke && !rowsFirst) for (const entry of queued.splice(0)) arrive(tick, entry.authorityTick, entry.authority);
    // the authority's tick (applies control tick - 1 + 1 = this tick's control at the next server tick)
    const input = buffer.inputFor(tick + 1);
    server.input.throttle = input.throttle; server.input.steer = input.steer; server.input.brake = input.brake; server.input.aimLocked = input.aimLocked;
    const origin = server.state.pos, cosPitch = Math.cos(input.aimPitch);
    server.input.aimPoint.set(origin.x + Math.sin(input.aimYaw) * cosPitch * input.aimDistance, origin.y + Math.sin(input.aimPitch) * input.aimDistance, origin.z + Math.cos(input.aimYaw) * cosPitch * input.aimDistance);
    updateTank(server, FIELD, SIM_DT, null);
    if (tick % 2 === 0) rows.set(tick, { row: rowOf(server.state), viewer: viewerOf(server.state) });
    // the row for tick - lagTicks reaches the seat now (a stalled seat queues it until it wakes)
    const authorityTick = tick - lagTicks;
    if (authorityTick < 0 || authorityTick % 2 !== 0) continue;
    const authority = rows.get(authorityTick);
    if (stalled) { queued.push({ authorityTick, authority }); continue; }
    arrive(tick, authorityTick, authority);
  }
  const after = corrections.filter((entry) => entry.tick >= stallAt + stallTicks);
  return { maxAfter: Math.max(0, ...after.slice(0, 40).map((entry) => entry.errorM)), speed: Math.abs(server.state.speed), stats: predictor.getStats(), skipped: stream.stats?.skippedTicks };
}

const baseline = run({ stallTicks: 0 });
assert.ok(baseline.speed > 10, `the hull drives (${baseline.speed.toFixed(1)} m/s)`);
assert.ok(baseline.maxAfter < 0.05, `no stall, no correction (${baseline.maxAfter.toFixed(3)} m)`);
assert.equal(HELD_INPUT_LEASE_TICKS, 30, 'the authority holds 500 ms');
const rows = [];
for (const rowsFirst of [true, false]) {
  for (const stallS of [0.3, 0.6, 1, 2]) {
    const stallTicks = Math.round(stallS * 60);
    const result = run({ stallTicks, rowsFirst });
    rows.push(`${rowsFirst ? 'rows first' : 'frame first'} ${stallS} s: ${result.maxAfter.toFixed(3)} m`);
    // a stall within the hold: the authority held the control exactly as the replay does; past it, it released, as the replay now does
    assert.ok(result.maxAfter < 0.1, `a ${stallS} s stall (${rowsFirst ? 'the queued rows before the frame, as a browser wakes' : 'the frame before the rows'}) corrects by ${result.maxAfter.toFixed(3)} m after the seat wakes (the replay follows the authority's hold and release)`);
    assert.equal(result.stats.hardSnaps, 0, `no hard snap after a ${stallS} s stall (${rowsFirst ? 'rows first' : 'frame first'})`);
  }
}
// the control: every queued row reconciled as it arrives after the waking frame (the client before 2026-10-15) — the
// replay window leaves the hull metres behind
const perRow = run({ stallTicks: 36, rowsFirst: false, coalesce: false });
assert.ok(perRow.maxAfter > 1, `control: per-row reconcile after the waking frame corrects by ${perRow.maxAfter.toFixed(3)} m`);
console.log(`predictionStall.selftest: a driving seat stalled 0.3 / 0.6 / 1 / 2 s replays its gap on the authority's ${HELD_INPUT_LEASE_TICKS}-tick hold and release, whichever wakes first; largest correction after waking: ${rows.join(', ')} (no stall ${baseline.maxAfter.toFixed(3)} m; control, per-row reconcile after the frame, 0.6 s: ${perRow.maxAfter.toFixed(2)} m)`);
