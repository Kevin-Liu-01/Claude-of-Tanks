import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTankState } from '../sim/movement.ts';
import { LocalTankPredictor } from './localTankPrediction.ts';
import { SNAPSHOT_FLAGS } from './snapshot.ts';

const SPEC = {
  enginePowerHp: 1500,
  weightTons: 60,
  topSpeedKmh: 65,
  reverseSpeedKmh: 30,
  hullTraverseDegS: 42,
  turretTraverseDegS: 40,
  gunPitchDegS: 25,
  gunElevationDeg: 20,
  gunDepressionDeg: 10,
  pivotStyle: 'neutral',
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
  dims: { hullLengthM: 7.8, overallLengthM: 9.8, widthM: 3.7, heightM: 2.4 },
  gun: {
    caliberMm: 120,
    baseAccuracy: 0.3,
    aimTimeS: 2,
    bloom: { move: 0.1, hullRot: 0.1, turret: 0.08, afterShot: 3 },
  },
  armor: {
    boundingRadiusM: 4.8,
    turretPivot: [0, 1.5, 0],
    gunPivot: [0, 0.3, 0.2],
    gunBarrel: { lengthM: 5.3 },
  },
};

const FIELD = {
  getHeightAt: () => 0,
  getHeightAtFast: () => 0,
  getNormalAt: () => new Vector3(0, 1, 0),
  getGroundType: () => 'hard',
};

function authority(tick, ackInputSeq, x = 0, z = 0, overrides = {}) {
  return {
    tick,
    ackInputSeq,
    entity: {
      x, y: 0, z,
      vx: 0, vz: 0,
      yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
      destroyed: false,
      ...overrides,
    },
  };
}

const state = createTankState(SPEC, new Vector3(), 0);
const entity = { spec: SPEC, state, combat: null, contactGeom: null, rigidGear: false };
const predictor = new LocalTankPredictor({ entity, heightField: FIELD });
predictor.reconcile(authority(0, null, 300, -220));
assert.deepEqual(
  { x: entity.state.pos.x, z: entity.state.pos.z },
  { x: 300, z: -220 },
  'the first authority pose seeds presentation directly from the staging origin',
);
assert.deepEqual(
  { reconciliations: predictor.getStats().reconciliations,
    hardSnaps: predictor.getStats().hardSnaps,
    maxPositionErrorM: predictor.getStats().maxPositionErrorM },
  { reconciliations: 0, hardSnaps: 0, maxPositionErrorM: 0 },
  'initial spawn placement is not counted as rubberband correction',
);
predictor.reconcile(authority(1, null, 300, -220));
const driving = {
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0, aimLocked: false,
};
for (let seq = 0; seq < 4; seq++) predictor.recordInput(driving, 1 / 60, seq);
assert.ok(entity.state.pos.z > -220,
  'local input advances presentation before authority returns');
const shownBeforeReconcile = entity.state.pos.z;

predictor.reconcile(authority(3, 1, 300, -220), 0);
assert.equal(predictor.getStats().pendingInputs, 2,
  'authority acknowledgement removes only confirmed input history');
assert.equal(predictor.getStats().replayedInputs, 2,
  'reconciliation advances every unacknowledged input exactly once');
assert.ok(predictor.simEntity.state.pos.z > -220,
  'unacknowledged input replay advances the authoritative prediction copy');
assert.ok(Math.abs(entity.state.pos.z - shownBeforeReconcile) < 1e-9,
  'small reconciliation begins from the already displayed pose');
for (let index = 0; index < 60; index++) predictor.present(1 / 60);
assert.ok(Math.abs(entity.state.pos.z - predictor.simEntity.state.pos.z) < 1e-4,
  'visual correction converges smoothly to replayed authority');

predictor.reconcile(authority(6, 3, 20, 0), 1 / 60);
assert.ok(Math.abs(entity.state.pos.x - 20) < 1e-6,
  'large authority corrections hard-snap instead of dragging across the map');
assert.equal(predictor.getStats().hardSnaps, 1);
assert.deepEqual(
  predictor.correction,
  { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 },
  'hard snap clears every presentation correction channel',
);

// The prediction copy must honor the same gun-hold state as host authority;
// otherwise the local barrel chases the sight and snaps backward on snapshot.
{
  const holdState = createTankState(SPEC, new Vector3(), 0);
  const holdEntity = {
    spec: SPEC,
    state: holdState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const hold = new LocalTankPredictor({ entity: holdEntity, heightField: FIELD });
  hold.reconcile(authority(0, null));
  for (let seq = 0; seq < 120; seq++) hold.recordInput({
    ...driving,
    throttle: 0,
    aimYaw: 0.55,
    aimPitch: 0.12,
  }, 1 / 60, seq);
  const heldYaw = hold.simEntity.state.turretYaw;
  const heldPitch = hold.simEntity.state.gunPitch;
  for (let seq = 120; seq < 180; seq++) hold.recordInput({
    ...driving,
    throttle: 0,
    aimYaw: -0.8,
    aimPitch: -0.08,
    aimLocked: true,
  }, 1 / 60, seq);
  assert.ok(Math.abs(hold.simEntity.state.turretYaw - heldYaw) < 1e-12 &&
    Math.abs(hold.simEntity.state.gunPitch - heldPitch) < 1e-12,
  'local prediction holds both articulated axes while the network sight moves');
  hold.recordInput({
    ...driving,
    throttle: 0,
    aimYaw: -0.8,
    aimPitch: -0.08,
    aimLocked: false,
  }, 1 / 60, 180);
  assert.ok(Math.abs(hold.simEntity.state.turretYaw - heldYaw) > 1e-4,
    'local prediction releases the gun toward the latest sight without a snap');
}

// A destroyed local vehicle is intentionally locked to its terminal authority
// pose. Repeated wreck snapshots are lifecycle synchronization, not repeated
// network teleports, and must not poison the visible rubber-band metric.
{
  const wreckState = createTankState(SPEC, new Vector3(), 0);
  const wreckEntity = {
    spec: SPEC,
    state: wreckState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const wreck = new LocalTankPredictor({ entity: wreckEntity, heightField: FIELD });
  wreck.reconcile(authority(0, null));
  wreck.reconcile(authority(3, null, 0, -0.4, { destroyed: true }), 1 / 60, true);
  assert.ok(wreckEntity.state.pos.z > -0.1,
    'the first terminal authority sample preserves the displayed pose instead of popping the wreck');
  for (let index = 0; index < 45; index++) wreck.present(1 / 60);
  assert.ok(Math.abs(wreckEntity.state.pos.z + 0.4) < 0.002,
    'the wreck settles smoothly onto its terminal authoritative pose');
  wreck.reconcile(authority(6, null, 0, -0.4, { destroyed: true }), 1 / 60, true);
  assert.deepEqual(
    { hardSnaps: wreck.getStats().hardSnaps, terminalSyncs: wreck.getStats().terminalSyncs },
    { hardSnaps: 0, terminalSyncs: 1 },
    'repeated terminal wreck snapshots record one lifecycle sync and no rubber-band snaps',
  );
  assert.deepEqual(
    {
      terminalDestroyed: wreck.terminalDestroyed,
      pendingInputs: wreck.getStats().pendingInputs,
      motionIntent: wreck.motionIntent,
      contactSmoothingS: wreck.contactSmoothingS,
    },
    { terminalDestroyed: true, pendingInputs: 0, motionIntent: false, contactSmoothingS: 0 },
    'terminal authority clears local input and contact ownership',
  );
}

predictor.recordInput(driving, 1 / 60, 4);
predictor.recordInput(driving, 1 / 60, 0);
assert.equal(predictor.getStats().pendingInputs, 1,
  'fresh reconnect sequence discards history from the dead transport');

// Browser snapshots expose a clock-corrected own-entity sample alongside the
// raw acknowledged authority row. Inputs are replaceable held states rather
// than commands with server-owned durations, so that sampled path must not
// replay the unacknowledged render-frame dt a second time.
{
  const sampledState = createTankState(SPEC, new Vector3(), 0);
  const sampledEntity = {
    spec: SPEC,
    state: sampledState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const sampled = new LocalTankPredictor({ entity: sampledEntity, heightField: FIELD });
  sampled.reconcile(authority(0, null));
  for (let seq = 0; seq < 4; seq++) sampled.recordInput(driving, 1 / 60, seq);
  const sampledTarget = authority(3, 1, 0, 1.25);
  sampledTarget.sampledEntity = { ...sampledTarget.entity, z: 2.5 };
  sampled.reconcile(sampledTarget, 1 / 60);
  assert.equal(sampled.simEntity.state.pos.z, 2.5,
    'clock-corrected authority is not advanced again by pending input durations');
  assert.equal(sampled.getStats().pendingInputs, 2,
    'sampled reconciliation still retains inputs newer than authority acknowledgement');
  assert.equal(sampled.getStats().replayedInputs, 0,
    'browser sampled authority performs no command-style replay');
}

// A parked authority tank can quantize between adjacent support-height and
// hull-angle samples at the 20 Hz snapshot cadence. Presentation must not
// turn that sub-contact-patch noise into a visible 60 Hz vibration. Turret
// and gun articulation remain live because stationary players still aim.
{
  const parkedState = createTankState(SPEC, new Vector3(), 0);
  const parkedEntity = {
    spec: SPEC,
    state: parkedState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const parked = new LocalTankPredictor({ entity: parkedEntity, heightField: FIELD });
  parked.reconcile(authority(0, null));
  const samples = [];
  let tick = 0;
  for (let frame = 0; frame < 180; frame++) {
    if (frame % 3 === 0) {
      tick += 3;
      const sign = (frame / 3) % 2 ? -1 : 1;
      parked.reconcile(authority(tick, null, 0, 0, {
        y: sign * 0.01,
        pitch: sign * 0.0015,
        roll: sign * -0.0012,
        turretYaw: tick * 0.00035,
        gunPitch: tick * -0.00012,
      }), 1 / 60);
    } else {
      parked.present(1 / 60);
    }
    if (frame >= 60) samples.push({
      y: parkedEntity.state.pos.y,
      pitch: parkedEntity.state.visualPitch,
      roll: parkedEntity.state.visualRoll,
    });
  }
  const range = (key) => Math.max(...samples.map((sample) => sample[key])) -
    Math.min(...samples.map((sample) => sample[key]));
  assert.ok(range('y') < 0.001,
    `parked local support-height noise is held below 1 mm (range=${range('y')})`);
  assert.ok(range('pitch') < 0.0002 && range('roll') < 0.0002,
    `parked local hull-angle noise is visually stable (pitch=${range('pitch')}, roll=${range('roll')})`);
  assert.ok(Math.abs(parkedEntity.state.turretYaw) > 0.02 &&
    Math.abs(parkedEntity.state.gunPitch) > 0.005,
  'stationary hull stabilization never freezes turret or gun aim');

  const beforeMove = parkedEntity.state.pos.z;
  parked.recordInput(driving, 1 / 30, 1);
  assert.ok(parkedEntity.state.pos.z > beforeMove + 0.0001,
    'real local movement input releases the parked hold immediately');
}

// Reconciliation must seed the complete ballistic state, not just Y. Pending
// input replay then advances the exact shared gravity integrator while leaving
// horizontal momentum intact.
{
  const flightState = createTankState(SPEC, new Vector3(0, 5, 0), 0);
  const flightEntity = {
    spec: SPEC,
    state: flightState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const flight = new LocalTankPredictor({ entity: flightEntity, heightField: FIELD });
  flight.reconcile(authority(0, null, 0, 0, {
    y: 5,
    vy: 2,
    vz: 8,
    flags: SNAPSHOT_FLAGS.AIRBORNE,
  }));
  const startY = flightEntity.state.pos.y;
  flight.recordInput(driving, 0.1, 1);
  assert.equal(flightEntity.state.grounded, false,
    'airborne authority phase survives local input replay');
  assert.ok(flightEntity.state.pos.y > startY,
    'positive authority vertical velocity continues upward during replay');
  assert.ok(flightEntity.state.verticalSpeed < 2 && flightEntity.state.verticalSpeed > 0.8,
    `replay integrates gravity into vertical velocity (${flightEntity.state.verticalSpeed})`);
  assert.ok(flightEntity.state.pos.z > 0.7,
    'airborne replay preserves authoritative horizontal momentum');
}

// Authority lifecycle flags are independent bits. Verify every meaningful
// overturned/auto-righting combination through the predictor's public
// reconciliation boundary so presentation cannot silently invent or drop a
// recovery phase.
{
  const recoveryStateFor = (flags) => {
    const recoveryState = createTankState(SPEC, new Vector3(), 0);
    const recoveryEntity = { spec: SPEC, state: recoveryState };
    const recovery = new LocalTankPredictor({
      entity: recoveryEntity,
      heightField: FIELD,
    });
    recovery.reconcile(authority(0, null, 0, 0,
      flags === undefined ? {} : { flags }));
    return {
      overturned: recoveryEntity.state.overturned,
      tumbling: recoveryEntity.state._body.tumbling,
      autoRighting: recoveryEntity.state._body.autoRighting,
    };
  };

  assert.deepEqual(
    recoveryStateFor(undefined),
    { overturned: false, tumbling: false, autoRighting: false },
    'an omitted flag field keeps a stable resting tank out of recovery',
  );
  assert.deepEqual(
    recoveryStateFor(SNAPSHOT_FLAGS.OVERTURNED),
    { overturned: true, tumbling: true, autoRighting: false },
    'overturned authority tumbles without inventing an auto-righting phase',
  );
  assert.deepEqual(
    recoveryStateFor(SNAPSHOT_FLAGS.AUTO_RIGHTING),
    { overturned: false, tumbling: true, autoRighting: true },
    'auto-righting authority tumbles even after the overturned bit clears',
  );
  assert.deepEqual(
    recoveryStateFor(SNAPSHOT_FLAGS.OVERTURNED | SNAPSHOT_FLAGS.AUTO_RIGHTING),
    { overturned: true, tumbling: true, autoRighting: true },
    'combined recovery flags preserve every authority state channel',
  );
}

// Collision/contact corrections should never dump terrain support-height error
// into one rendered frame. The collision owner records the contact; authority
// and replay stay exact while presentation adopts the heavier contact decay.
{
  const contactState = createTankState(SPEC, new Vector3(), 0);
  const contactEntity = {
    spec: SPEC,
    state: contactState,
    combat: null,
    contactGeom: null,
    rigidGear: false,
  };
  const collide = (predictionEntity, _pos, _radius, outPush) => {
    predictionEntity._predictionDynamicContacts =
      (predictionEntity._predictionDynamicContacts || 0) + 1;
    outPush.set(0, 0, 0);
    return false;
  };
  const contact = new LocalTankPredictor({
    entity: contactEntity,
    heightField: FIELD,
    collide,
  });
  contact.reconcile(authority(0, null));
  contact.recordInput(driving, 1 / 60, 1);
  contact.reconcile(authority(3, 1, 0.18, 0, {
    y: 0.12,
    pitch: 0.04,
    roll: -0.025,
  }), 1 / 60);
  const contactStats = contact.getStats();
  assert.equal(contactStats.contactReconciliations, 1,
    'collision-marked authority samples select the contact correction channel');
  assert.ok(contactStats.maxVerticalCorrectionStepM < 0.02,
    `contact support correction stays below 2 cm per frame ` +
    `(${contactStats.maxVerticalCorrectionStepM})`);
  assert.ok(contactStats.maxCorrectionStepM < 0.03,
    `combined contact correction stays below 3 cm per frame ` +
    `(${contactStats.maxCorrectionStepM})`);
  assert.equal(contactStats.reconciliations, 1,
    'contact reconciliation increments the total diagnostic count once');
  assert.ok(contactStats.lastPositionErrorM > 0,
    'contact reconciliation records a non-zero current position error');
  assert.equal(contactStats.maxContactPositionErrorM, contactStats.lastPositionErrorM,
    'first contact reconciliation establishes contact maximum');
  assert.equal(contactStats.maxFreePositionErrorM, 0,
    'contact reconciliation never contaminates free-motion maximum');
  assert.equal(contactStats.maxPositionErrorM, contactStats.lastPositionErrorM,
    'first reconciliation establishes the aggregate maximum');

  contact.reconcile(authority(6, 1, 0.2, 0, { y: 0.13 }), 1 / 60);
  const freeStats = contact.getStats();
  assert.deepEqual(
    {
      reconciliations: freeStats.reconciliations,
      contactReconciliations: freeStats.contactReconciliations,
      maxContactPositionErrorM: freeStats.maxContactPositionErrorM,
    },
    {
      reconciliations: 2,
      contactReconciliations: 1,
      maxContactPositionErrorM: contactStats.maxContactPositionErrorM,
    },
    'unchanged contact counters route the next correction through free motion',
  );
  assert.ok(freeStats.maxFreePositionErrorM > 0,
    'free-motion reconciliation records its independent maximum');
}

// Constructor validation, retained drive intent, and bounded replay history
// are boundary contracts rather than ordinary frame-loop behavior.
{
  assert.throws(
    () => new LocalTankPredictor(),
    /prediction entity is required/,
    'predictor rejects a missing entity',
  );
  assert.throws(
    () => new LocalTankPredictor({ entity: {}, heightField: FIELD }),
    /prediction entity is required/,
    'predictor rejects an entity without its spec and state',
  );
  assert.throws(
    () => new LocalTankPredictor({ entity: { spec: SPEC }, heightField: FIELD }),
    /prediction entity is required/,
    'predictor rejects an entity without movement state',
  );
  assert.throws(
    () => new LocalTankPredictor({ entity, heightField: {} }),
    /prediction height field is required/,
    'predictor rejects a height field without the authoritative sampler',
  );

  const pendingState = createTankState(SPEC, new Vector3(), 0);
  const pending = new LocalTankPredictor({
    entity: { spec: SPEC, state: pendingState },
    heightField: FIELD,
  });
  pending.reconcile(authority(0, null));
  pending.recordInput(driving, 1 / 60, 1);
  pending.recordInput({ ...driving, throttle: 0 }, 1 / 60, 2);
  pending.reconcile(authority(3, null, 0, 0), 1 / 60);
  assert.equal(pending.holdRestingHull, false,
    'an older unacknowledged drive input prevents a false parked-hull hold');

  const boundedState = createTankState(SPEC, new Vector3(), 0);
  const bounded = new LocalTankPredictor({
    entity: { spec: SPEC, state: boundedState },
    heightField: FIELD,
  });
  bounded.reconcile(authority(0, null));
  const idle = { ...driving, throttle: 0 };
  for (let seq = 0; seq <= 240; seq++) bounded.recordInput(idle, 0, seq);
  assert.deepEqual(
    { pendingInputs: bounded.getStats().pendingInputs, droppedHistory: bounded.getStats().droppedHistory },
    { pendingInputs: 240, droppedHistory: 1 },
    'prediction history keeps the latest bounded input window',
  );
}

// The predictor boundary is intentionally strict and fully observable. Assert
// every seeded authority field and every public initialization field so a test
// cannot execute this path while silently accepting a changed contract.
{
  const seededState = createTankState(SPEC, new Vector3(9, 4, -7), 0.8);
  const contactGeom = { halfLenM: 3, halfWidM: 1.5, zCenterM: 0.2 };
  const combat = { destroyed: false };
  const seededEntity = {
    spec: SPEC,
    state: seededState,
    combat,
    contactGeom,
    rigidGear: true,
  };
  const seeded = new LocalTankPredictor({ entity: seededEntity, heightField: FIELD });
  assert.deepEqual(
    {
      combat: seeded.simEntity.combat,
      contactGeom: seeded.simEntity.contactGeom,
      rigidGear: seeded.simEntity.rigidGear,
      input: {
        throttle: seeded.simEntity.input.throttle,
        steer: seeded.simEntity.input.steer,
        brake: seeded.simEntity.input.brake,
        fire: seeded.simEntity.input.fire,
        aimLocked: seeded.simEntity.input.aimLocked,
        shellSlot: seeded.simEntity.input.shellSlot,
      },
      correction: seeded.correction,
      displayedPose: seeded.displayedPose,
      collisionResolver: seeded.collisionResolver,
      holdRestingHull: seeded.holdRestingHull,
    },
    {
      combat,
      contactGeom,
      rigidGear: true,
      input: {
        throttle: 0,
        steer: 0,
        brake: false,
        fire: false,
        aimLocked: false,
        shellSlot: 0,
      },
      correction: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
      },
      displayedPose: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
      },
      collisionResolver: null,
      holdRestingHull: false,
    },
    'constructor copies gameplay owners and initializes every presentation channel',
  );
  assert.deepEqual(
    seeded.getStats(),
    {
      reconciliations: 0,
      hardSnaps: 0,
      terminalSyncs: 0,
      replayedInputs: 0,
      droppedHistory: 0,
      maxPositionErrorM: 0,
      maxFreePositionErrorM: 0,
      maxContactPositionErrorM: 0,
      contactReconciliations: 0,
      lastPositionErrorM: 0,
      restingHullHolds: 0,
      maxCorrectionStepM: 0,
      maxVerticalCorrectionStepM: 0,
      presentationAdvances: 0,
      maxPresentationAdvanceS: 0,
      maxRecordedInputElapsedS: 0,
      pendingInputs: 0,
      correctionM: 0,
    },
    'constructor initializes the complete diagnostic contract',
  );

  const seedSample = authority(0, null, 2, 4, {
    y: 3,
    yaw: Math.PI / 2,
    pitch: 0.2,
    roll: -0.15,
    turretYaw: 2.9,
    gunPitch: -0.12,
    vx: -4,
    vy: 1.25,
    vz: 0.5,
    flags: SNAPSHOT_FLAGS.AIRBORNE,
  });
  Object.assign(seeded.correction, {
    x: 1, y: 2, z: 3, yaw: 0.4, pitch: 0.5, roll: 0.6, turretYaw: 0.7, gunPitch: 0.8,
  });
  seeded.holdRestingHull = true;
  assert.equal(seeded.reconcile(seedSample), true,
    'a valid first authority sample initializes prediction');
  assert.deepEqual(
    {
      position: seededEntity.state.pos.toArray(),
      yaw: seededEntity.state.yaw,
      pitch: seededEntity.state.visualPitch,
      roll: seededEntity.state.visualRoll,
      turretYaw: seededEntity.state.turretYaw,
      gunPitch: seededEntity.state.gunPitch,
      verticalSpeed: seededEntity.state.verticalSpeed,
      grounded: seededEntity.state.grounded,
      rideY: seeded.simEntity.state._ride.y,
      rideV: seeded.simEntity.state._ride.v,
      rideGrounded: seeded.simEntity.state._ride.grounded,
      rideAirTime: seeded.simEntity.state._ride.airTime,
      correction: seeded.correction,
    },
    {
      position: [2, 3, 4],
      yaw: Math.PI / 2,
      pitch: 0.2,
      roll: -0.15,
      turretYaw: 2.9,
      gunPitch: -0.12,
      verticalSpeed: 1.25,
      grounded: false,
      rideY: 3,
      rideV: 1.25,
      rideGrounded: false,
      rideAirTime: 0,
      correction: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
      },
    },
    'initial authority seeds the complete ballistic and presentation pose',
  );
  assert.ok(Math.abs(seededEntity.state.speed + Math.hypot(4, 0.5)) < 1e-12,
    'authority velocity is signed against hull forward');
  assert.equal(seeded.holdRestingHull, false,
    'initial authority clears any pre-initialization resting hold');

  assert.equal(seeded.reconcile({ tick: 1 }), false,
    'authority without an entity snapshot is rejected');
  assert.equal(seeded.reconcile({ tick: '2', entity: seedSample.entity }), false,
    'authority with a non-numeric tick is rejected');
  assert.equal(seeded.reconcile({ tick: 1.5, entity: seedSample.entity }), false,
    'authority with a non-integer tick is rejected');
  assert.equal(seeded.reconcile({ tick: 0, entity: seedSample.entity }), false,
    'duplicate authority ticks are rejected');
}

// Input history admission is a wire-boundary policy, including exact sequence
// validity and the stable collision adapter used by every replay substep.
{
  const inputState = createTankState(SPEC, new Vector3(), 0);
  const inputEntity = { spec: SPEC, state: inputState };
  let collisionCalls = 0;
  const inputPredictor = new LocalTankPredictor({
    entity: inputEntity,
    heightField: FIELD,
    collide: (owner, _position, _radius, outPush) => {
      collisionCalls++;
      assert.equal(owner, inputPredictor.simEntity,
        'stable collision adapter retains its prediction owner');
      outPush.set(0, 0, 0);
      return false;
    },
  });
  const stableResolver = inputPredictor.collisionResolver;
  const initialAimPoint = inputEntity.state.aimPoint.clone();
  assert.equal(inputPredictor.advancePrediction(null, 1 / 60), false,
    'null frame input cannot advance presentation');
  assert.equal(inputPredictor.advancePrediction({}, 0), true,
    'valid frame input reports that prediction presentation advanced');
  assert.equal(inputPredictor.recordInput(null, 1 / 60, 0), false,
    'null input is rejected');
  assert.equal(inputPredictor.recordInput(driving, 1 / 60, -1), false,
    'negative input sequence is rejected');
  assert.equal(inputPredictor.recordInput(driving, 1 / 60, 0.5), false,
    'fractional input sequence is rejected');
  assert.equal(inputPredictor.recordInput(driving, 1 / 60, 0), true,
    'valid input is admitted');
  assert.equal(inputPredictor.recordInput(driving, 1 / 60, 0), false,
    'duplicate input sequence is rejected');
  const articulatedInput = {
    ...driving,
    throttle: 0,
    steer: -0.4,
    brake: true,
    fire: true,
    shellSlot: 2,
    aimLocked: false,
    aimYaw: 0.35,
    aimPitch: -0.12,
  };
  assert.equal(inputPredictor.recordInput(articulatedInput, 1 / 60, 1), true,
    'articulated input is admitted');
  assert.equal(inputPredictor.collisionResolver, stableResolver,
    'fixed-step replay reuses one collision adapter');
  assert.ok(collisionCalls > 0, 'valid replay invokes collision through the adapter');
  assert.deepEqual(
    {
      pendingInputs: inputPredictor.getStats().pendingInputs,
      motionIntent: inputPredictor.motionIntent,
      throttle: inputPredictor.simEntity.input.throttle,
      steer: inputPredictor.simEntity.input.steer,
      brake: inputPredictor.simEntity.input.brake,
      fire: inputPredictor.simEntity.input.fire,
      shellSlot: inputPredictor.simEntity.input.shellSlot,
      aimLocked: inputPredictor.simEntity.input.aimLocked,
    },
    {
      pendingInputs: 2,
      motionIntent: true,
      throttle: 0,
      steer: -0.4,
      brake: true,
      fire: true,
      shellSlot: 2,
      aimLocked: false,
    },
    'admitted input updates every replay channel exactly once',
  );
  assert.ok(inputEntity.state.aimPoint.distanceTo(inputPredictor.simEntity.state.aimPoint) < 1e-12,
    'presentation copies the decoded replay aim point');
  inputPredictor.simEntity.state.aimPoint.set(11, 22, 33);
  inputEntity.state.aimPoint.copy(initialAimPoint);
  inputPredictor.present(0);
  assert.deepEqual(inputEntity.state.aimPoint.toArray(), [11, 22, 33],
    'presentation copies a changed simulation aim point');
}

// Acknowledgement validity and sequence arithmetic must be independent from
// authority-tick admission. Invalid acknowledgements retain every frame;
// valid cumulative acknowledgements discard only older-or-equal inputs.
{
  const ackState = createTankState(SPEC, new Vector3(), 0);
  const ack = new LocalTankPredictor({
    entity: { spec: SPEC, state: ackState },
    heightField: FIELD,
  });
  ack.reconcile(authority(0, null));
  ack.recordInput(driving, 0, 0);
  ack.recordInput(driving, 0, 1);
  assert.equal(ack.reconcile(authority(3, Number.NaN)), true);
  assert.equal(ack.getStats().pendingInputs, 2,
    'non-integer acknowledgement retains history');
  assert.equal(ack.reconcile(authority(6, -1)), true);
  assert.equal(ack.getStats().pendingInputs, 2,
    'negative acknowledgement retains history');
  assert.equal(ack.reconcile(authority(9, 0)), true);
  assert.equal(ack.getStats().pendingInputs, 1,
    'cumulative acknowledgement removes the exact confirmed prefix');
  assert.equal(ack.reconcile(authority(12, 1)), true);
  assert.equal(ack.getStats().pendingInputs, 0,
    'latest acknowledgement empties confirmed history');
}

// Angular correction is shortest-arc and covers every articulated channel.
// Reconciliation first preserves the displayed pose, then presentation decay
// moves toward the replayed authority without crossing the long arc.
{
  const angleState = createTankState(SPEC, new Vector3(), 0);
  const angleEntity = { spec: SPEC, state: angleState };
  const angles = new LocalTankPredictor({ entity: angleEntity, heightField: FIELD });
  angles.reconcile(authority(0, null, 0, 0, {
    y: 0,
    yaw: 3,
    pitch: 0.14,
    roll: -0.11,
    turretYaw: 3.05,
    gunPitch: 0.17,
  }));
  const before = {
    yaw: angleEntity.state.yaw,
    pitch: angleEntity.state.visualPitch,
    roll: angleEntity.state.visualRoll,
    turretYaw: angleEntity.state.turretYaw,
    gunPitch: angleEntity.state.gunPitch,
  };
  angles.reconcile(authority(3, null, 0.01, 0.01, {
    y: 0.005,
    yaw: -3,
    pitch: -0.09,
    roll: 0.08,
    turretYaw: -3.02,
    gunPitch: -0.13,
  }), 0);
  const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
  assert.deepEqual(
    { x: angles.correction.x, y: angles.correction.y, z: angles.correction.z },
    { x: -0.01, y: -0.005, z: -0.01 },
    'reconciliation records exact positional correction',
  );
  assert.ok(Math.abs(angles.correction.yaw -
    wrap(before.yaw - angles.simEntity.state.yaw)) < 1e-12,
  'reconciliation records shortest-arc hull yaw correction');
  assert.ok(Math.abs(angles.correction.pitch -
    wrap(before.pitch - angles.simEntity.state.visualPitch)) < 1e-12,
  'reconciliation records hull pitch correction');
  assert.ok(Math.abs(angles.correction.roll -
    wrap(before.roll - angles.simEntity.state.visualRoll)) < 1e-12,
  'reconciliation records hull roll correction');
  assert.ok(Math.abs(angles.correction.turretYaw -
    wrap(before.turretYaw - angles.simEntity.state.turretYaw)) < 1e-12,
  'reconciliation records shortest-arc turret correction');
  assert.ok(Math.abs(angles.correction.gunPitch -
    wrap(before.gunPitch - angles.simEntity.state.gunPitch)) < 1e-12,
  'reconciliation records gun-pitch correction');
  assert.ok(Math.abs(angleEntity.state.yaw - before.yaw) < 1e-12 &&
    Math.abs(angleEntity.state.visualPitch - before.pitch) < 1e-12 &&
    Math.abs(angleEntity.state.visualRoll - before.roll) < 1e-12 &&
    Math.abs(angleEntity.state.turretYaw - before.turretYaw) < 1e-12 &&
    Math.abs(angleEntity.state.gunPitch - before.gunPitch) < 1e-12,
  'zero-time reconciliation preserves the complete displayed articulation');
  angles.present(0.1);
  assert.ok(Math.abs(angles.correction.yaw) < Math.abs(wrap(before.yaw + 3)),
    'shortest-arc hull correction decays toward authority');
  assert.ok(Math.abs(angles.correction.turretYaw) <
    Math.abs(wrap(before.turretYaw + 3.02)),
  'shortest-arc turret correction decays toward authority');
}

// Signed authority speed uses both horizontal velocity components and hull
// bearing. Exercise forward and reverse quadrants where neither component can
// be discarded without changing the result.
{
  const speedFor = (vx, vz, yaw) => {
    const speedState = createTankState(SPEC, new Vector3(), 0);
    const speedEntity = { spec: SPEC, state: speedState };
    const speedPredictor = new LocalTankPredictor({
      entity: speedEntity,
      heightField: FIELD,
    });
    speedPredictor.reconcile(authority(0, null, 0, 0, { vx, vz, yaw }));
    return speedEntity.state.speed;
  };
  assert.ok(Math.abs(speedFor(3, 4, Math.PI / 4) - 5) < 1e-12,
    'authority velocity aligned with forward bearing is positive');
  assert.ok(Math.abs(speedFor(-3, -4, Math.PI / 4) + 5) < 1e-12,
    'authority velocity opposite forward bearing is negative');
  assert.ok(Math.abs(speedFor(3, -4, Math.PI / 4) + 5) < 1e-12,
    'mixed velocity components use multiplication and preserve reverse sign');
  assert.equal(speedFor(0, 0, 0), 0,
    'missing horizontal motion has an exact zero signed speed');
  assert.equal(speedFor(undefined, 4, 0), 4,
    'missing lateral velocity defaults to zero');
  assert.equal(speedFor(3, undefined, Math.PI / 2), 3,
    'missing longitudinal velocity defaults to zero');
}

// Optional held-input fields have explicit neutral defaults rather than
// inheriting the previous frame.
{
  const neutralState = createTankState(SPEC, new Vector3(), 0);
  const neutral = new LocalTankPredictor({
    entity: { spec: SPEC, state: neutralState },
    heightField: FIELD,
  });
  neutral.reconcile(authority(0, null));
  neutral.recordInput({
    throttle: 1,
    steer: 0.4,
    brake: true,
    fire: true,
    aimLocked: true,
    shellSlot: 2,
  }, 0, 0);
  neutral.recordInput({}, 0, 1);
  assert.deepEqual(
    {
      throttle: neutral.simEntity.input.throttle,
      steer: neutral.simEntity.input.steer,
      brake: neutral.simEntity.input.brake,
      fire: neutral.simEntity.input.fire,
      aimLocked: neutral.simEntity.input.aimLocked,
      shellSlot: neutral.simEntity.input.shellSlot,
      motionIntent: neutral.motionIntent,
    },
    {
      throttle: 0,
      steer: 0,
      brake: false,
      fire: false,
      aimLocked: false,
      shellSlot: 0,
      motionIntent: false,
    },
    'omitted input fields reset every replaceable held channel',
  );
}

// Replay duration is admitted only on [0, 100 ms]. This is both an abuse
// boundary and a fixed-step catch-up budget.
{
  const replayDistance = (elapsedS) => {
    const replayState = createTankState(SPEC, new Vector3(), 0);
    const replayEntity = { spec: SPEC, state: replayState };
    const replay = new LocalTankPredictor({ entity: replayEntity, heightField: FIELD });
    replay.reconcile(authority(0, null));
    replay.recordInput(driving, elapsedS, 0);
    return replay.simEntity.state.pos.z;
  };
  assert.equal(replayDistance(-1), 0, 'negative replay duration is clamped to zero');
  assert.equal(replayDistance(Number.NaN), 0, 'invalid replay duration is clamped to zero');
  assert.ok(replayDistance(1 / 60) > 0, 'one fixed step advances local replay');
  assert.ok(replayDistance(0.005) > 0 && replayDistance(0.005) < replayDistance(1 / 60),
    'sub-step replay uses its exact duration rather than a full fixed step');
  assert.equal(replayDistance(1e-8), 0,
    'numerical dust at the replay epsilon performs no simulation step');
  assert.equal(replayDistance(0.2), replayDistance(0.1),
    'replay duration is capped at the 100 ms catch-up budget');
}

// Network history may batch several display frames, but local presentation
// must advance only by the current render delta. Otherwise 120/60 Hz clients
// alternate held poses with oversized jumps and make the camera wobble.
{
  const decoupledState = createTankState(SPEC, new Vector3(), 0);
  const decoupled = new LocalTankPredictor({
    entity: { spec: SPEC, state: decoupledState },
    heightField: FIELD,
  });
  decoupled.reconcile(authority(0, null));
  decoupled.recordInput(driving, 1 / 30, 1, 1 / 120);

  const referenceState = createTankState(SPEC, new Vector3(), 0);
  const reference = new LocalTankPredictor({
    entity: { spec: SPEC, state: referenceState },
    heightField: FIELD,
  });
  reference.reconcile(authority(0, null));
  reference.advancePrediction(driving, 1 / 120);

  assert.ok(decoupled.simEntity.state.pos.distanceTo(reference.simEntity.state.pos) < 1e-12,
    'batched input history cannot enlarge the current presentation step');
  assert.equal(decoupled.history[0].elapsedS, 1 / 30,
    'authority replay retains the complete batched input duration');
  assert.deepEqual(
    {
      presentationAdvances: decoupled.getStats().presentationAdvances,
      maxPresentationAdvanceS: decoupled.getStats().maxPresentationAdvanceS,
      maxRecordedInputElapsedS: decoupled.getStats().maxRecordedInputElapsedS,
    },
    {
      presentationAdvances: 1,
      maxPresentationAdvanceS: 1 / 120,
      maxRecordedInputElapsedS: 1 / 30,
    },
    'prediction diagnostics expose display cadence separately from upload cadence',
  );
  Object.assign(decoupled.correction, {
    x: 0.12,
    y: -0.08,
    z: 0.09,
    yaw: -0.06,
    pitch: 0.05,
    roll: -0.04,
    turretYaw: 0.07,
    gunPitch: -0.03,
  });
  const correctionBeforeFrame = { ...decoupled.correction };
  decoupled.advancePrediction({ ...driving, throttle: 0, steer: 0 }, 1 / 120);
  for (const axis of [
    'x', 'y', 'z', 'yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch',
  ]) {
    assert.ok(Math.abs(decoupled.correction[axis]) < Math.abs(correctionBeforeFrame[axis]),
      `render-paced prediction settles ${axis} on cadence-held network frames`);
  }
}

// Resting-hull hold admits only truly idle, sub-deadzone authority noise. Each
// independent disqualifier gets a public behavior check so no condition can be
// deleted while the aggregate happy path still happens to pass.
{
  const restingHold = ({ input = null, x = 0, y = 0, yaw = 0, pitch = 0,
    roll = 0, vx = 0, vz = 0 } = {}) => {
    const restingState = createTankState(SPEC, new Vector3(), 0);
    const restingEntity = { spec: SPEC, state: restingState };
    const resting = new LocalTankPredictor({
      entity: restingEntity,
      heightField: FIELD,
    });
    resting.reconcile(authority(0, null));
    if (input) resting.recordInput(input, 0, 1);
    resting.reconcile(authority(3, null, x, 0, { y, yaw, pitch, roll, vx, vz }), 0);
    return resting.holdRestingHull;
  };
  const idle = { ...driving, throttle: 0, steer: 0 };
  assert.equal(restingHold({ input: idle, x: 0.01, y: 0.01, yaw: 0.001,
    pitch: 0.001, roll: -0.001 }), true,
  'idle unacknowledged input still permits sub-deadzone hull stabilization');
  assert.equal(restingHold({ input: { ...idle, throttle: 0.02 } }), false,
    'throttle intent disables resting hold');
  assert.equal(restingHold({ input: { ...idle, throttle: 0.01 } }), true,
    'throttle exactly at the intent deadzone remains idle');
  assert.equal(restingHold({ input: { ...idle, steer: -0.02 } }), false,
    'steer intent disables resting hold');
  assert.equal(restingHold({ input: { ...idle, steer: -0.01 } }), true,
    'steer exactly at the intent deadzone remains idle');
  assert.equal(restingHold({ x: 0.04 }), false,
    'horizontal authority error above deadzone disables resting hold');
  assert.equal(restingHold({ x: 0.03 }), true,
    'horizontal authority error exactly at deadzone remains stable');
  assert.equal(restingHold({ y: 0.03 }), false,
    'vertical authority error above deadzone disables resting hold');
  assert.equal(restingHold({ y: 0.025 }), true,
    'vertical authority error exactly at deadzone remains stable');
  assert.equal(restingHold({ yaw: 0.004 }), false,
    'hull yaw error above deadzone disables resting hold');
  assert.equal(restingHold({ yaw: 0.0035 }), true,
    'hull yaw error exactly at deadzone remains stable');
  assert.equal(restingHold({ pitch: 0.004 }), false,
    'hull pitch error above deadzone disables resting hold');
  assert.equal(restingHold({ pitch: 0.0035 }), true,
    'hull pitch error exactly at deadzone remains stable');
  assert.equal(restingHold({ roll: -0.004 }), false,
    'hull roll error above deadzone disables resting hold');
  assert.equal(restingHold({ roll: -0.0035 }), true,
    'hull roll error exactly at deadzone remains stable');
  assert.equal(restingHold({ vx: 0.09 }), false,
    'authoritative motion above rest speed disables resting hold');
  assert.equal(restingHold({ vx: 0.08 }), true,
    'authority speed exactly at the rest budget remains stable');
}

// Raw and sampled authority can intentionally describe different instants.
// Rest detection must reject motion from either source independently.
{
  const sampledHold = ({ rawVx = 0, rawVz = 0, sampledVx = 0, sampledVz = 0 }) => {
    const sampledState = createTankState(SPEC, new Vector3(), 0);
    const sampledEntity = { spec: SPEC, state: sampledState };
    const sampled = new LocalTankPredictor({
      entity: sampledEntity,
      heightField: FIELD,
    });
    sampled.reconcile(authority(0, null));
    const sample = authority(3, null, 0, 0, { vx: rawVx, vz: rawVz });
    sample.sampledEntity = { ...sample.entity, vx: sampledVx, vz: sampledVz };
    sampled.reconcile(sample, 0);
    return sampled.holdRestingHull;
  };
  assert.equal(sampledHold({ rawVx: 0, sampledVx: 0.09 }), false,
    'moving sampled prediction disables resting hold');
  assert.equal(sampledHold({ rawVx: 0.09, sampledVx: 0 }), false,
    'moving raw authority disables resting hold');
  assert.equal(sampledHold({ rawVz: 0.09, sampledVz: 0 }), false,
    'raw longitudinal authority motion disables resting hold');

  const absentVelocityState = createTankState(SPEC, new Vector3(), 0);
  const absentVelocity = new LocalTankPredictor({
    entity: { spec: SPEC, state: absentVelocityState },
    heightField: FIELD,
  });
  absentVelocity.reconcile(authority(0, null));
  const absentSample = authority(3, null, 0.01, 0, { y: 0.01 });
  delete absentSample.entity.vx;
  delete absentSample.entity.vz;
  absentVelocity.reconcile(absentSample, 0);
  assert.equal(absentVelocity.holdRestingHull, true,
    'absent raw velocity components default to rest');
}

// Non-zero world origins prove rest deadzones use differences rather than
// sums; origin-only tests cannot distinguish those operations.
{
  const offsetState = createTankState(SPEC, new Vector3(5, 2, -3), 0.5);
  const offsetEntity = { spec: SPEC, state: offsetState };
  const offset = new LocalTankPredictor({ entity: offsetEntity, heightField: FIELD });
  offset.reconcile(authority(0, null, 5, -3, { y: 2, yaw: 0.5, pitch: 0.1, roll: -0.1 }));
  offset.reconcile(authority(3, null, 5.01, -3.01, {
    y: 2.01,
    yaw: 0.501,
    pitch: 0.101,
    roll: -0.101,
  }), 0);
  assert.equal(offset.holdRestingHull, true,
    'sub-deadzone noise remains stable at a non-zero world pose');
  assert.ok(Math.abs(offset.getStats().lastPositionErrorM - Math.sqrt(0.0003)) < 1e-12,
    'position-error diagnostics subtract every axis at non-zero world coordinates');
}

// Idle input must preserve an established resting hold; actual drive intent
// releases it and updates the diagnostic count only while the hold is active.
{
  const idleState = createTankState(SPEC, new Vector3(), 0);
  const idleEntity = { spec: SPEC, state: idleState };
  const idlePredictor = new LocalTankPredictor({
    entity: idleEntity,
    heightField: FIELD,
  });
  idlePredictor.reconcile(authority(0, null));
  idlePredictor.reconcile(authority(3, null, 0.01, 0, { y: 0.01 }), 0);
  assert.equal(idlePredictor.holdRestingHull, true,
    'sub-deadzone authority establishes resting hold');
  assert.equal(idlePredictor.getStats().restingHullHolds, 1,
    'resting hold increments diagnostics exactly once');
  idlePredictor.recordInput({ ...driving, throttle: 0, steer: 0 }, 0, 1);
  assert.equal(idlePredictor.holdRestingHull, true,
    'idle input preserves established resting hold');
  idlePredictor.recordInput({ ...driving, throttle: 0.02 }, 0, 2);
  assert.equal(idlePredictor.holdRestingHull, false,
    'drive intent immediately clears established resting hold');
}

// Static collision ownership uses the same rising-edge diagnostic contract as
// dynamic contacts and must not retrigger while its cumulative count is flat.
{
  const staticState = createTankState(SPEC, new Vector3(), 0);
  const staticEntity = { spec: SPEC, state: staticState };
  const staticContact = new LocalTankPredictor({
    entity: staticEntity,
    heightField: FIELD,
    collide: (owner, _position, _radius, outPush) => {
      owner._predictionStaticContacts = (owner._predictionStaticContacts ?? 0) + 1;
      outPush.set(0, 0, 0);
      return false;
    },
  });
  staticContact.reconcile(authority(0, null));
  staticContact.recordInput(driving, 1 / 60, 1);
  staticContact.reconcile(authority(3, 1, 0.1, 0), 0);
  assert.equal(staticContact.getStats().contactReconciliations, 1,
    'rising static-contact counter selects contact smoothing');
  staticContact.reconcile(authority(6, 1, 0.11, 0), 0);
  assert.equal(staticContact.getStats().contactReconciliations, 1,
    'flat static-contact counter does not retrigger contact smoothing');
}

// Presentation decay owns its own time budget and peak diagnostics. Contact
// corrections deliberately decay more slowly than free corrections.
{
  const makeCorrection = (contactSmoothingS) => {
    const correctionState = createTankState(SPEC, new Vector3(), 0);
    const correctionEntity = { spec: SPEC, state: correctionState };
    const correction = new LocalTankPredictor({
      entity: correctionEntity,
      heightField: FIELD,
    });
    correction.reconcile(authority(0, null));
    Object.assign(correction.correction, {
      x: 0.3,
      y: 0.2,
      z: -0.4,
      yaw: 0.1,
      pitch: -0.08,
      roll: 0.06,
      turretYaw: -0.2,
      gunPitch: 0.12,
    });
    correction.contactSmoothingS = contactSmoothingS;
    return correction;
  };
  const contactCorrection = makeCorrection(0.3);
  const freeCorrection = makeCorrection(0);
  const before = { ...contactCorrection.correction };
  contactCorrection.present(0.05);
  freeCorrection.present(0.05);
  assert.ok(Math.abs(contactCorrection.correction.x) > Math.abs(freeCorrection.correction.x),
    'contact horizontal correction decays more slowly');
  assert.ok(Math.abs(contactCorrection.correction.y) > Math.abs(freeCorrection.correction.y),
    'contact vertical correction decays more slowly');
  assert.ok(Math.abs(contactCorrection.contactSmoothingS - 0.25) < 1e-12,
    'contact smoothing lifetime decreases by elapsed presentation time');
  const expectedStep = Math.hypot(
    before.x - contactCorrection.correction.x,
    before.y - contactCorrection.correction.y,
    before.z - contactCorrection.correction.z,
  );
  const correctionStats = contactCorrection.getStats();
  assert.ok(Math.abs(correctionStats.maxCorrectionStepM - expectedStep) < 1e-12,
    'peak correction diagnostic records the exact three-axis step');
  assert.ok(Math.abs(correctionStats.maxVerticalCorrectionStepM -
    Math.abs(before.y - contactCorrection.correction.y)) < 1e-12,
  'peak vertical diagnostic records the exact vertical step');
  assert.ok(contactCorrection.entity.state.aimPoint.distanceTo(
    contactCorrection.simEntity.state.aimPoint) < 1e-12,
  'presentation copies simulation aim point on correction-only frames');
}

// Exactly opposite headings exercise the signed π wrap convention. The
// canonical correction keeps +π rather than flipping to -π.
{
  const piState = createTankState(SPEC, new Vector3(), 0);
  const piEntity = { spec: SPEC, state: piState };
  const pi = new LocalTankPredictor({ entity: piEntity, heightField: FIELD });
  pi.reconcile(authority(0, null, 0, 0, { yaw: Math.PI }));
  pi.reconcile(authority(3, null, 0.04, 0, { yaw: 0 }), 0);
  assert.equal(pi.correction.yaw, Math.PI,
    'shortest-arc correction has a stable positive-π boundary');

  const negativePiState = createTankState(SPEC, new Vector3(), 0);
  const negativePiEntity = { spec: SPEC, state: negativePiState };
  const negativePi = new LocalTankPredictor({
    entity: negativePiEntity,
    heightField: FIELD,
  });
  negativePi.reconcile(authority(0, null, 0, 0, { yaw: 0 }));
  negativePi.reconcile(authority(3, null, 0.04, 0, { yaw: Math.PI }), 0);
  assert.equal(negativePi.correction.yaw, -Math.PI,
    'shortest-arc correction has a stable negative-π boundary');
}

// The hard-snap boundary is intentionally strict: an error exactly at the
// budget still uses bounded correction, while any larger error snaps.
{
  const boundaryState = createTankState(SPEC, new Vector3(), 0);
  const boundaryEntity = { spec: SPEC, state: boundaryState };
  const boundary = new LocalTankPredictor({
    entity: boundaryEntity,
    heightField: FIELD,
    hardSnapDistanceM: 7,
  });
  boundary.reconcile(authority(0, null));
  boundary.holdRestingHull = true;
  boundary.correction.y = 0.5;
  boundary.reconcile(authority(3, null, 7, 0), 0);
  assert.equal(boundary.getStats().hardSnaps, 0,
    'error exactly at hard-snap budget remains smoothed');
  assert.equal(boundary.getStats().restingHullHolds, 0,
    'non-resting bounded correction does not increment resting diagnostics');
  boundary.reconcile(authority(6, null, 7.001, 0), 0);
  assert.equal(boundary.getStats().hardSnaps, 1,
    'error above hard-snap budget snaps once');
  assert.equal(boundary.holdRestingHull, false,
    'hard snap clears an existing resting hold');
}

// A terminal lifecycle flag supplied by the caller is authoritative even when
// the snapshot's compatibility flag is false.
{
  const terminalState = createTankState(SPEC, new Vector3(), 0);
  const terminal = new LocalTankPredictor({
    entity: { spec: SPEC, state: terminalState },
    heightField: FIELD,
  });
  terminal.reconcile(authority(0, null));
  terminal.recordInput(driving, 1 / 60, 1);
  terminal.reconcile(authority(3, null, 0, 0, { destroyed: false }), 0, true);
  assert.equal(terminal.terminalDestroyed, true,
    'explicit terminal lifecycle ends local authority');
  assert.equal(terminal.getStats().terminalSyncs, 1,
    'explicit terminal lifecycle records one transition');
  assert.equal(terminal.getStats().pendingInputs, 0,
    'explicit terminal lifecycle clears replay history');
}

console.log('localTankPrediction.selftest: replay, parked stability, correction, and reconnect passed');
