/**
 * hullBodyRow.selftest.mjs — a hull's body bits on the wire (audit M8, 2026-11-02; wire 10). The prediction world's tank
 * contacts (tankBodyContacts.ts prefersVerticalTankContact) run on the client against its copies of the hulls, and they
 * must split a pair the way the authority's do, or the replay pushes the viewer's hull where the authority held it (or
 * holds it where the authority pushed it) and the next snapshot corrects it. Before wire 10 the copies held neither the
 * rigid phase (a client rebuilt the tumble as overturned-or-righting) nor a support cache of their own (each stayed at its
 * creation at the origin, so any hull more than 0.5 m above world zero read as stacked). Here:
 *   1. the layout: TUMBLING and STACKED in the flag table (the sim's snapshot flags identical), the status word a varint,
 *      every flag round-tripping, an oversized word refused;
 *   2. a hull kicked off another's roof into a plain tumble on the ground (rigid, neither overturned nor righting), stepped
 *      by the real movement and contact pass, its rows captured by the authority's own capture and sent through the real
 *      wire onto a copy built as the battle presentation builds a remote hull: on every tick the copy's body mode is the
 *      authority's and the pair splits as the authority's does, with no push from the prediction world where the authority
 *      reserves it; the pre-wire-10 projection is the control, below and above the old 0.5 m line;
 *   3. hill traffic: hulls parked side by side on slopes are a horizontal contact on both sides (the control read half of
 *      them as stacks);
 *   4. the viewer's presented hull, which the battle's prediction world judges the own hull on, carries the replay's
 *      support terms.
 * Run with: node src/mp/match/hullBodyRow.selftest.mjs
 */
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../../sim/movement.ts';
import { hullBodyMode, restoreHullBodyMode, setHullGrounded } from '../../sim/hullBodyMode.ts';
import { hullBearsOnBody, hullBodyFlags, prefersVerticalTankContact, resolveTankBodyContacts } from '../../sim/tankBodyContacts.ts';
import { SNAPSHOT_FLAGS, captureEntitySnapshot } from '../../sim/worldSnapshot.ts';
import { captureEntityRow, createEraIndexer } from '../../../server/match/entityRows.ts';
import {
  ByteReader, ByteWriter, ENTITY_FLAGS, ENTITY_FLAG_BITS, PHASE, ROW_GROUP, STATUS_WORD_MAX, VERDICT, WIRE_VERSION,
  WireError, applyEntityRowPatch, applySnapshotPacket, buildSnapshotPacket, decodeMessage, diffEntityRow, encodeMessage,
  quantizeAngle, quantizePosition, quantizeVelocity, readEntityRowPatch, writeEntityRowPatch, zeroEntityRow,
} from '../wire/index.ts';
import { createEntitySample, decodeRow } from './interpolation.ts';
import { HULL_BODY_ROW_FLAGS, applyPresentedHullRowFlags, hullBodyRowFlags } from './hullBodyRow.ts';
import { captureMovementCheckpoint } from './movementCheckpoint.ts';
import { LocalPredictor } from './prediction.ts';
import { createPredictionWorld } from '../presentation/predictionWorld.ts';

// The medium-tank fixture of movement.selftest.mjs (contact plane at hull-local y = 0, closed-shell body points).
const SPEC = {
  id: 'fixture-medium', name: 'fixture-medium', enginePowerHp: 500, weightTons: 33, topSpeedKmh: 42, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24, gunElevationDeg: 25, gunDepressionDeg: 10,
  pivotStyle: 'pivot', terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: { caliberMm: 76, baseAccuracy: 0.38, aimTimeS: 2.3, bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 } },
  armor: {
    boundingRadiusM: 3.8, turretPivot: [0, 1.55, 0], gunPivot: [0, 0.25, 0.3], gunBarrel: { lengthM: 4.0 },
    bodyContactPoints: {
      hull: [-1.42, 0.42, -2.75, 1.42, 0.42, -2.75, -1.42, 1.48, -2.75, 1.42, 1.48, -2.75,
        -1.42, 0.42, 2.75, 1.42, 0.42, 2.75, -1.42, 1.48, 2.75, 1.42, 1.48, 2.75],
      turret: [-0.82, 0.02, -0.95, 0.82, 0.02, -0.95, -0.72, 0.60, -0.82, 0.72, 0.60, -0.82,
        -0.82, 0.02, 0.82, 0.82, 0.02, 0.82, -0.72, 0.60, 0.72, 0.72, 0.60, 0.72],
    },
  },
};
const DEG = Math.PI / 180;

// ---- 1. the layout -------------------------------------------------------------------------------------------------
{
  assert.ok(WIRE_VERSION >= 10, 'two flags and a varint status word are a layout change (wire 10)');
  assert.equal(ENTITY_FLAG_BITS, 11);
  assert.deepEqual(Object.keys(SNAPSHOT_FLAGS), Object.keys(ENTITY_FLAGS), 'the sim snapshot names the wire\'s flags');
  for (const [name, bit] of Object.entries(ENTITY_FLAGS)) assert.equal(SNAPSHOT_FLAGS[name], bit, `${name}: identical values`);
  for (const name of ['AIRBORNE', 'OVERTURNED', 'AUTO_RIGHTING', 'TUMBLING', 'STACKED']) {
    assert.ok(HULL_BODY_ROW_FLAGS & ENTITY_FLAGS[name], `the owner packs ${name}`);
  }
  assert.equal(STATUS_WORD_MAX, (1 << 18) - 1, 'seven status bits and eleven flags');
  // one packer (round 2, U14): the sim's viewer snapshot and the authority's wire rows pack the body bits through
  // tankBodyContacts.ts hullBodyFlags, so the two captures cannot drift apart
  const bodyBits = HULL_BODY_ROW_FLAGS;
  const states = [];
  for (const grounded of [true, false]) for (const tumbling of [false, true]) for (const overturned of [false, true])
    for (const autoRighting of [false, true]) for (const support of ['ground', 'roof', 'dynamic', 'elevated']) {
      const state = createTankState(SPEC, new Vector3(4, support === 'elevated' ? 3 : 1, -2), 0.3);
      setHullGrounded(state, grounded);
      restoreHullBodyMode(state, overturned, tumbling, autoRighting);
      state._sup.y = 1; state._sup.top = 1;
      if (support === 'roof') state._body.restSupportY = 2.4;
      if (support === 'dynamic') state._body.dynamicSupport = true;
      states.push(state);
    }
  let stacked = 0;
  for (const state of states) {
    const wire = hullBodyRowFlags(state);
    assert.equal(wire, hullBodyFlags(state, ENTITY_FLAGS), 'the wire row packs through the one packer');
    const snapshot = captureEntitySnapshot({ id: 'h', specId: SPEC.id, team: 'alpha', state, combat: { hp: 1, maxHp: 1, ammo: [0, 0, 0] }, input: {} });
    assert.equal(snapshot.flags & bodyBits, wire, 'the viewer snapshot packs the same body bits');
    if (wire & ENTITY_FLAGS.STACKED) stacked++;
  }
  assert.ok(stacked >= states.length * 3 / 4, `roof, contact-pass and elevated supports all read STACKED (${stacked} of ${states.length})`);

  const TICK = 600;
  const roundTrip = (flags) => {
    const row = Object.assign(zeroEntityRow(3), { tick: TICK, hp: 900, maxHp: 1000, reloadKind: 1, gunReloadKind: 1, shellSlot: 2, flags });
    const patch = diffEntityRow(row, null, TICK);
    const writer = new ByteWriter();
    writeEntityRowPatch(writer, patch, null, TICK);
    const bytes = writer.toBytes();
    return { bytes, row: applyEntityRowPatch(readEntityRowPatch(new ByteReader(bytes), () => null, TICK), null) };
  };
  const all = (1 << ENTITY_FLAG_BITS) - 1;
  assert.equal(roundTrip(all).row.flags, all, 'every flag round-trips');
  assert.equal(roundTrip(ENTITY_FLAGS.TUMBLING).row.flags, ENTITY_FLAGS.TUMBLING, 'a plain tumble is on the wire');
  assert.equal(roundTrip(ENTITY_FLAGS.STACKED).row.flags, ENTITY_FLAGS.STACKED, 'and a stack');
  const bare = roundTrip(0).bytes.length;
  assert.equal(roundTrip(ENTITY_FLAGS.FIRING | ENTITY_FLAGS.AIRBORNE).bytes.length - bare, 1, 'flags up to AIRBORNE: a second byte');
  assert.equal(roundTrip(ENTITY_FLAGS.TUMBLING).bytes.length - bare, 2, 'a body-mode bit: a third');
  // an oversized word: entity 3, the STATUS group alone, the varint 1 << 18
  const writer = new ByteWriter();
  writer.u8(3); writer.varint(ROW_GROUP.STATUS); writer.varint(1 << 18);
  assert.throws(() => readEntityRowPatch(new ByteReader(writer.toBytes()), () => null, TICK),
    (error) => error instanceof WireError && error.code === 'range', 'a status word past 18 bits is refused');
}

// ---- 2. a plain tumble on the ground after a stack kick, through the real capture and wire --------------------------
/** The pre-wire-10 projection (d6cad10896 battlePresentation.ts applySamplePose): the tumble rebuilt from its sub-states,
 * the copy's support cache untouched. */
function legacyProjection(copy, flags) {
  setHullGrounded(copy, (flags & ENTITY_FLAGS.AIRBORNE) === 0);
  const overturned = (flags & ENTITY_FLAGS.OVERTURNED) !== 0, autoRighting = (flags & ENTITY_FLAGS.AUTO_RIGHTING) !== 0;
  restoreHullBodyMode(copy, overturned, overturned || autoRighting, autoRighting);
}
/** battlePresentation.ts applySamplePose's pose writes. */
function poseFromSample(copy, sample) {
  copy.pos.set(sample.x, sample.y, sample.z);
  copy.verticalSpeed = sample.vy; copy._ride.y = sample.y; copy._ride.v = sample.vy;
  copy.yaw = sample.yaw; copy.visualPitch = sample.pitch; copy.visualRoll = sample.roll;
  copy.turretYaw = sample.turretYaw; copy.gunPitch = sample.gunPitch;
}
function authorityEntity(x, y, z) {
  return {
    spec: SPEC, specId: SPEC.id, bot: true, state: createTankState(SPEC, new Vector3(x, y, z), 0),
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: null },
    combat: { hp: 1000, maxHp: 1000, reload: { t: 0, totalS: 6, kind: 'ready' }, ammo: [10, 10, 10], shellSlot: 0, destroyed: false, fire: null, eraSpent: null },
    specialAction: null,
  };
}
function snapshotFrame(tick, entities) {
  return {
    tick, serverTimeMs: Math.floor(tick * 1000 / 60), ackedInputTick: 0, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 0,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 0, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], entities, shells: [], viewer: null, modeStateJson: null,
  };
}

function stackKick(groundY) {
  const field = { getHeightAt: () => groundY, getNormalAt: () => null, getGroundType: () => 'medium' };
  const lower = authorityEntity(0, groundY, 0);
  for (let tick = 0; tick < 60; tick++) updateTank(lower, field, SIM_DT);
  // dropped at 7 m/s onto the lower hull's roof edge: the off-centre impact kicks it into a tumble (tankBodyContacts.ts)
  const upper = authorityEntity(1.3, groundY + 3.2, 0.6);
  Object.assign(upper.state, { verticalSpeed: -7, grounded: false });
  Object.assign(upper.state._ride, { v: -7, grounded: false, y: groundY + 3.2, airTime: 0.5 });
  // the client's copies, as battlePresentation.ensureActor builds a remote hull: at the origin, never stepped
  const copy = createTankState(SPEC, new Vector3(), 0);
  const legacy = createTankState(SPEC, new Vector3(), 0);
  const sample = createEntitySample(2);
  const era = createEraIndexer();
  const others = [{ spec: SPEC, state: copy, collidable: true }];
  const world = createPredictionWorld({
    worldCollision: { heightField: field, getObstacles: () => [] }, ownSpec: SPEC, ownState: () => lower.state, others: () => others,
  });
  const push = new Vector3();
  const pushFrom = (state) => {
    others[0].state = state;
    world.collide(lower.state.pos.clone(), 4, push);
    return Math.hypot(push.x, push.z);
  };
  const out = { plain: 0, reserved: 0, modeWrong: 0, splitWrong: 0, pushedWhereHeld: 0, legacySplitWrong: 0, legacyMaxPushM: 0 };
  let baseline = null;
  for (let tick = 1; tick <= 600; tick++) {
    updateTank(lower, field, SIM_DT);
    updateTank(upper, field, SIM_DT);
    resolveTankBodyContacts([lower, upper], SIM_DT);
    const packet = buildSnapshotPacket(snapshotFrame(tick, [captureEntityRow(upper, 2, era, tick)]), baseline);
    const decoded = decodeMessage(encodeMessage(packet, baseline), { resolveBaseline: () => baseline });
    assert.ok(decoded.ok, 'the snapshot decodes');
    baseline = applySnapshotPacket(decoded.message, baseline);
    decodeRow(baseline.entities[0], sample);
    poseFromSample(copy, sample);
    applyPresentedHullRowFlags(copy, sample.flags);
    poseFromSample(legacy, sample);
    legacyProjection(legacy, sample.flags);
    const s = upper.state;
    if (hullBodyMode(copy) !== hullBodyMode(s) || copy.overturned !== s.overturned || copy.grounded !== s.grounded) out.modeWrong++;
    const authority = prefersVerticalTankContact(lower, upper);
    if (prefersVerticalTankContact(lower, { spec: SPEC, state: copy }) !== authority) out.splitWrong++;
    const legacySplit = prefersVerticalTankContact(lower, { spec: SPEC, state: legacy });
    if (!(s.grounded && s._body.tumbling && !s.overturned && !s._body.autoRighting)) continue;
    out.plain++;
    if (legacySplit !== authority) out.legacySplitWrong++;
    if (!authority) continue;
    out.reserved++;
    if (pushFrom(copy) > 0) out.pushedWhereHeld++;
    out.legacyMaxPushM = Math.max(out.legacyMaxPushM, pushFrom(legacy));
  }
  return out;
}

for (const groundY of [-2, 12]) {
  const run = stackKick(groundY);
  const label = `stack kick, ground at ${groundY} m`;
  assert.ok(run.plain > 120, `${label}: the kicked hull lies in a plain tumble on the ground (${run.plain} ticks)`);
  assert.ok(run.reserved > 60, `${label}: and the authority reserves the pair for the vertical contact (${run.reserved} ticks)`);
  assert.equal(run.modeWrong, 0, `${label}: the copy's body mode is the authority's on every tick`);
  assert.equal(run.splitWrong, 0, `${label}: the client splits the pair as the authority does on every tick`);
  assert.equal(run.pushedWhereHeld, 0, `${label}: the prediction world never pushes where the authority holds the pair`);
  console.log(`hullBodyRow.selftest: ${label}: ${run.plain} plain-tumble ticks, ${run.reserved} reserved, copy exact; ` +
    `control (pre-wire-10 projection): ${run.legacySplitWrong} split the other way, push up to ${run.legacyMaxPushM.toFixed(2)} m`);
  // the control: below the old 0.5 m line the lost tumble split the pair; above it the stale support cache hid the loss
  if (groundY < 0) {
    assert.equal(run.legacySplitWrong, run.reserved, 'control: below 0.5 m the pre-wire-10 copy split every reserved tick');
    assert.ok(run.legacyMaxPushM > 1, `control: and the prediction world pushed the viewer's hull off it (${run.legacyMaxPushM.toFixed(2)} m)`);
  }
}

// ---- 3. hill traffic: hulls side by side on a slope are a horizontal contact on both sides ---------------------------
{
  let pairs = 0, wrong = 0, legacyWrong = 0;
  for (const deg of [20, 40]) for (const dx of [2.4, 2.7, 3.1]) for (const base of [0, 20]) {
    const t = Math.tan(deg * DEG);
    const field = { getHeightAt: (x) => base + x * t, getNormalAt: () => null, getGroundType: () => 'medium' };
    const own = authorityEntity(0, base, 0);
    const other = authorityEntity(dx, field.getHeightAt(dx), 2);
    for (let tick = 0; tick < 90; tick++) { updateTank(own, field, SIM_DT); updateTank(other, field, SIM_DT); }
    const copy = createTankState(SPEC, new Vector3(), 0);
    const legacy = createTankState(SPEC, new Vector3(), 0);
    const s = other.state;
    const sample = {
      x: s.pos.x, y: s.pos.y, z: s.pos.z, vy: 0, yaw: s.yaw, pitch: s.visualPitch, roll: s.visualRoll, turretYaw: s.turretYaw, gunPitch: s.gunPitch,
    };
    poseFromSample(copy, sample);
    applyPresentedHullRowFlags(copy, hullBodyRowFlags(s));
    poseFromSample(legacy, sample);
    legacyProjection(legacy, hullBodyRowFlags(s));
    const authority = prefersVerticalTankContact(own, other);
    assert.equal(authority, false, `${deg} deg, ${dx} m apart: two parked hulls are ground traffic to the authority`);
    pairs++;
    if (prefersVerticalTankContact(own, { spec: SPEC, state: copy }) !== authority) wrong++;
    if (prefersVerticalTankContact(own, { spec: SPEC, state: legacy }) !== authority) legacyWrong++;
  }
  assert.equal(wrong, 0, `hill traffic: the client splits all ${pairs} slope pairs as the authority does`);
  assert.ok(legacyWrong > 0, `control: the pre-wire-10 copy read ${legacyWrong} of ${pairs} slope pairs as stacks`);
  console.log(`hullBodyRow.selftest: hill traffic: ${pairs} slope pairs split as the authority's; control read ${legacyWrong} as stacks`);
}

// ---- 4. the viewer's presented hull carries the replay's support terms -----------------------------------------------
{
  const groundY = 20;
  const field = { getHeightAt: () => groundY, getHeightAtFast: () => groundY, getGroundType: () => 'hard' };
  const server = authorityEntity(0, groundY, 0);
  for (let tick = 0; tick < 30; tick++) updateTank(server, field, SIM_DT);
  const s = server.state;
  const row = Object.assign(zeroEntityRow(1), {
    x: quantizePosition(s.pos.x), y: quantizePosition(s.pos.y), z: quantizePosition(s.pos.z),
    speed: quantizeVelocity(s.speed), verticalSpeed: quantizeVelocity(s.verticalSpeed),
    yaw: quantizeAngle(s.yaw), pitch: quantizeAngle(s.visualPitch), roll: quantizeAngle(s.visualRoll),
    turretYaw: quantizeAngle(s.turretYaw), gunPitch: quantizeAngle(s.gunPitch), hp: 1000, maxHp: 1000, flags: hullBodyRowFlags(s),
  });
  const checkpoint = captureMovementCheckpoint(s);
  const viewer = {
    entityId: 1, modules: new Array(15).fill(0), crewBits: 3, equipment: [1000, 1000, 1000, 1000, 1000],
    modeSpeedMultiplier: 1000, modeGravityScale: 1000,
    movementVersion: checkpoint.version, movementFlags: checkpoint.flags, movementValues: checkpoint.values.map(Math.fround),
  };
  const predictor = new LocalPredictor(SPEC, { heightField: field });
  predictor.reconcile({ tick: 30, row, viewer }, () => null, 30);
  predictor.present(SIM_DT, 30);
  const sim = predictor.simulationState, presented = predictor.presented;
  assert.equal(presented._sup.top, sim._sup.top, 'the presented hull holds the replay\'s support top');
  assert.equal(hullBearsOnBody(sim), false, 'a hull parked on the ground 20 m up bears on nothing');
  assert.equal(hullBearsOnBody(presented), false, 'and neither does its presented copy');
  const stale = createTankState(SPEC, new Vector3(), 0);
  stale.pos.copy(presented.pos);
  assert.equal(hullBearsOnBody(stale), true, 'control: a copy holding the origin\'s support cache reads as stacked');
  sim._body.restSupportY = sim.pos.y;
  predictor.present(SIM_DT, 30);
  assert.equal(hullBearsOnBody(presented), true, 'a roof rest the replay holds reaches the presented copy');
}

console.log('hullBodyRow.selftest: ok');
