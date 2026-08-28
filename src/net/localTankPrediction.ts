import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../sim/movement.ts';
import type {
  MovementCombatState,
  MovementContactGeometry,
  MovementHeightField,
  MovementSpec,
  TankState,
} from '../sim/movement.ts';
import { isSequenceNewer } from './protocol.ts';
import { decodeAimIntent } from './aimIntent.ts';
import { SNAPSHOT_FLAGS } from './snapshot.ts';
import {
  PREDICTION_CORRECTION_KEYS,
  decayPredictionCorrection,
  type PredictionCorrection,
} from './predictionCorrection.ts';

const DEFAULT_HARD_SNAP_M = 7;
const DEFAULT_CORRECTION_TAU_S = 0.11;
const DEFAULT_CONTACT_CORRECTION_TAU_S = 0.18;
const DEFAULT_VERTICAL_CORRECTION_TAU_S = 0.16;
const DEFAULT_CONTACT_VERTICAL_TAU_S = 0.24;
const DEFAULT_AIM_CORRECTION_TAU_S = 0.075;
const DEFAULT_MAX_HORIZONTAL_CORRECTION_STEP_M = 0.2;
const DEFAULT_MAX_VERTICAL_CORRECTION_STEP_M = 0.1;
const CONTACT_SMOOTH_HOLD_S = 0.3;
const REST_SPEED_MPS = 0.08;
const REST_HORIZONTAL_DEADZONE_M = 0.03;
const REST_VERTICAL_DEADZONE_M = 0.025;
const REST_HULL_ANGLE_DEADZONE_RAD = 0.0035;
const MAX_INPUT_HISTORY = 240;

export interface PredictionInput {
  throttle?: number;
  steer?: number;
  brake?: boolean;
  fire?: boolean;
  shellSlot?: number;
  aimYaw?: number;
  aimPitch?: number;
  aimDistance?: number;
  actionBits?: number;
}

export interface PredictionSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
  vx?: number;
  vy?: number;
  vz?: number;
  flags?: number;
  destroyed?: boolean;
}

export type PredictionTankState = TankState;

export interface PredictionEntity {
  spec: MovementSpec;
  state: PredictionTankState;
  combat?: MovementCombatState | null;
  contactGeom?: MovementContactGeometry | null;
  rigidGear?: boolean;
}

export interface PredictionSimEntity extends PredictionEntity {
  input: Required<Pick<PredictionInput,
    'throttle' | 'steer' | 'brake' | 'fire' | 'shellSlot'>> & {
    aimPoint: Vector3;
  };
  _predictionStaticContacts?: number;
  _predictionDynamicContacts?: number;
}

export interface PredictionHeightField extends MovementHeightField {}

export type PredictionCollision = (
  entity: PredictionSimEntity,
  position: Vector3,
  radius: number,
  outPush: Vector3,
) => unknown;

export interface LocalTankPredictorOptions {
  entity?: PredictionEntity;
  heightField?: PredictionHeightField;
  collide?: PredictionCollision | null;
  hardSnapDistanceM?: number;
  correctionTauS?: number;
  contactCorrectionTauS?: number;
  verticalCorrectionTauS?: number;
  contactVerticalCorrectionTauS?: number;
  aimCorrectionTauS?: number;
  maxHorizontalCorrectionStepM?: number;
  maxVerticalCorrectionStepM?: number;
}

interface AuthoritySample {
  tick?: number;
  ackInputSeq?: number | null;
  entity?: PredictionSnapshot;
  sampledEntity?: PredictionSnapshot | null;
}

interface InputHistoryFrame {
  input: PredictionInput;
  elapsedS: number;
  inputSeq: number;
}

export interface LocalPredictionStats {
  reconciliations: number;
  hardSnaps: number;
  terminalSyncs: number;
  replayedInputs: number;
  droppedHistory: number;
  maxPositionErrorM: number;
  maxFreePositionErrorM: number;
  maxContactPositionErrorM: number;
  contactReconciliations: number;
  lastPositionErrorM: number;
  restingHullHolds: number;
  maxCorrectionStepM: number;
  maxVerticalCorrectionStepM: number;
}

interface DisplayedPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
}

function wrapAngle(value: number) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function signedSpeed(snapshot: PredictionSnapshot) {
  const speed = Math.hypot(snapshot.vx || 0, snapshot.vz || 0);
  const along = (snapshot.vx || 0) * Math.sin(snapshot.yaw || 0) +
    (snapshot.vz || 0) * Math.cos(snapshot.yaw || 0);
  return along < 0 ? -speed : speed;
}

function hasDriveIntent(input: PredictionInput | null | undefined) {
  return Math.abs(input?.throttle || 0) > 0.01 || Math.abs(input?.steer || 0) > 0.01;
}

function canHoldRestingHull(
  old: DisplayedPose,
  predicted: PredictionTankState,
  snapshot: PredictionSnapshot,
  motionIntent: boolean,
) {
  if (motionIntent || Math.abs(predicted.speed || 0) > REST_SPEED_MPS ||
      Math.hypot(snapshot.vx || 0, snapshot.vz || 0) > REST_SPEED_MPS) return false;
  return Math.hypot(old.x - predicted.pos.x, old.z - predicted.pos.z) <=
      REST_HORIZONTAL_DEADZONE_M &&
    Math.abs(old.y - predicted.pos.y) <= REST_VERTICAL_DEADZONE_M &&
    Math.abs(wrapAngle(old.yaw - predicted.yaw)) <= REST_HULL_ANGLE_DEADZONE_RAD &&
    Math.abs(wrapAngle(old.pitch - predicted.visualPitch)) <=
      REST_HULL_ANGLE_DEADZONE_RAD &&
    Math.abs(wrapAngle(old.roll - predicted.visualRoll)) <=
      REST_HULL_ANGLE_DEADZONE_RAD;
}

function applyAuthority(state: PredictionTankState, snapshot: PredictionSnapshot) {
  state.pos.set(snapshot.x, snapshot.y, snapshot.z);
  state.yaw = snapshot.yaw;
  state.speed = signedSpeed(snapshot);
  state.visualPitch = snapshot.pitch;
  state.visualRoll = snapshot.roll;
  state.turretYaw = snapshot.turretYaw;
  state.gunPitch = snapshot.gunPitch;
  state.verticalSpeed = snapshot.vy || 0;
  state.grounded = !((snapshot.flags || 0) & SNAPSHOT_FLAGS.AIRBORNE);
  state._prevSpeed = state.speed;
  state._spring.pitch = snapshot.pitch;
  state._spring.roll = snapshot.roll;
  state._ride.y = snapshot.y;
  state._ride.v = state.verticalSpeed;
  state._ride.grounded = state.grounded;
  state._ride.airTime = 0;
  // Force the first replay tick to establish terrain support at the authority
  // pose without replacing an airborne Y/v pair.
  state._ride.supportY = NaN;
}

function applyInput(entity: PredictionSimEntity, input: PredictionInput) {
  entity.input.throttle = input.throttle || 0;
  entity.input.steer = input.steer || 0;
  entity.input.brake = !!input.brake;
  entity.input.fire = !!input.fire;
  entity.input.shellSlot = (input.shellSlot || 0) | 0;
  decodeAimIntent(input, entity.state.pos, entity.input.aimPoint);
}

function advance(
  entity: PredictionSimEntity,
  input: PredictionInput,
  elapsedS: number,
  heightField: PredictionHeightField,
  collide: PredictionCollision | null,
) {
  applyInput(entity, input);
  let remaining = Math.max(0, Math.min(Number(elapsedS) || 0, 0.1));
  while (remaining > 1e-8) {
    const dt = Math.min(SIM_DT, remaining);
    updateTank(entity, heightField, dt,
      collide
        ? (pos: Vector3, radius: number, out: Vector3) => collide(entity, pos, radius, out)
        : null);
    remaining -= dt;
  }
}

function copyPresentation(
  target: PredictionTankState,
  source: PredictionTankState,
  correction: PredictionCorrection,
) {
  target.pos.set(
    source.pos.x + correction.x,
    source.pos.y + correction.y,
    source.pos.z + correction.z,
  );
  target.yaw = wrapAngle(source.yaw + correction.yaw);
  target.speed = source.speed;
  target.verticalSpeed = source.verticalSpeed;
  target.grounded = source.grounded;
  target.landingImpactMps = source.landingImpactMps;
  target.slopeBlocked = source.slopeBlocked;
  target.yawRate = source.yawRate;
  target.visualPitch = source.visualPitch + correction.pitch;
  target.visualRoll = source.visualRoll + correction.roll;
  target.turretYaw = wrapAngle(source.turretYaw + correction.turretYaw);
  target.gunPitch = source.gunPitch + correction.gunPitch;
  target.turretYawRate = source.turretYawRate;
  target.bloomF = source.bloomF;
  target.atGunLimit = source.atGunLimit;
  target.gunLimitSpec = source.gunLimitSpec;
  target.trackScroll.l = source.trackScroll.l;
  target.trackScroll.r = source.trackScroll.r;
  target.aimPoint.copy(source.aimPoint);
}

/**
 * Predict only the locally controlled tank's movement and gun articulation.
 * Combat, hits, props, and every other entity stay authoritative. On each
 * raw authority sample, confirmed inputs are discarded and the remaining
 * input history is replayed through the exact shared movement integrator.
 */
export class LocalTankPredictor {
  readonly entity: PredictionEntity;
  readonly heightField: PredictionHeightField;
  readonly collide: PredictionCollision | null;
  readonly hardSnapDistanceM: number;
  readonly correctionTauS: number;
  readonly contactCorrectionTauS: number;
  readonly verticalCorrectionTauS: number;
  readonly contactVerticalCorrectionTauS: number;
  readonly aimCorrectionTauS: number;
  readonly maxHorizontalCorrectionStepM: number;
  readonly maxVerticalCorrectionStepM: number;
  readonly simEntity: PredictionSimEntity;
  readonly history: InputHistoryFrame[] = [];
  readonly correction: PredictionCorrection;
  readonly stats: LocalPredictionStats;
  initialized = false;
  lastRecordedSeq: number | null = null;
  lastAuthorityTick = -1;
  terminalDestroyed = false;
  motionIntent = false;
  holdRestingHull = false;
  contactSmoothingS = 0;
  lastStaticContactCount = 0;
  lastDynamicContactCount = 0;

  constructor({
    entity,
    heightField,
    collide = null,
    hardSnapDistanceM = DEFAULT_HARD_SNAP_M,
    correctionTauS = DEFAULT_CORRECTION_TAU_S,
    contactCorrectionTauS = DEFAULT_CONTACT_CORRECTION_TAU_S,
    verticalCorrectionTauS = DEFAULT_VERTICAL_CORRECTION_TAU_S,
    contactVerticalCorrectionTauS = DEFAULT_CONTACT_VERTICAL_TAU_S,
    aimCorrectionTauS = DEFAULT_AIM_CORRECTION_TAU_S,
    maxHorizontalCorrectionStepM = DEFAULT_MAX_HORIZONTAL_CORRECTION_STEP_M,
    maxVerticalCorrectionStepM = DEFAULT_MAX_VERTICAL_CORRECTION_STEP_M,
  }: LocalTankPredictorOptions = {}) {
    if (!entity || !entity.spec || !entity.state) throw new TypeError('prediction entity is required');
    if (!heightField || typeof heightField.getHeightAt !== 'function') {
      throw new TypeError('prediction height field is required');
    }
    this.entity = entity;
    this.heightField = heightField;
    this.collide = collide;
    this.hardSnapDistanceM = hardSnapDistanceM;
    this.correctionTauS = correctionTauS;
    this.contactCorrectionTauS = contactCorrectionTauS;
    this.verticalCorrectionTauS = verticalCorrectionTauS;
    this.contactVerticalCorrectionTauS = contactVerticalCorrectionTauS;
    this.aimCorrectionTauS = aimCorrectionTauS;
    this.maxHorizontalCorrectionStepM = maxHorizontalCorrectionStepM;
    this.maxVerticalCorrectionStepM = maxVerticalCorrectionStepM;
    const source = entity.state;
    const state = createTankState(
      entity.spec,
      source.pos,
      source.yaw,
    );
    this.simEntity = {
      spec: entity.spec,
      state,
      combat: entity.combat || null,
      contactGeom: entity.contactGeom || null,
      rigidGear: !!entity.rigidGear,
      input: {
        throttle: 0,
        steer: 0,
        brake: false,
        fire: false,
        shellSlot: 0,
        aimPoint: state.aimPoint.clone(),
      },
    };
    this.correction = {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
    };
    this.stats = {
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
    };
  }

  recordInput(input: PredictionInput | null, elapsedS: number, inputSeq: number) {
    if (!input || !Number.isSafeInteger(inputSeq) || inputSeq < 0) return false;
    if (this.lastRecordedSeq != null) {
      if (inputSeq === this.lastRecordedSeq) return false;
      if (!isSequenceNewer(inputSeq, this.lastRecordedSeq)) {
        // A reconnect starts a fresh MatchClientRuntime sequence. Old inputs
        // belong to the dead transport and must not be replayed into the new
        // authority stream.
        this.history.length = 0;
      }
    }
    this.lastRecordedSeq = inputSeq;
    this.motionIntent = hasDriveIntent(input);
    if (this.motionIntent) this.holdRestingHull = false;
    this.history.push({ input: { ...input }, elapsedS, inputSeq });
    if (this.history.length > MAX_INPUT_HISTORY) {
      this.history.shift();
      this.stats.droppedHistory++;
    }
    advance(this.simEntity, input, elapsedS, this.heightField, this.collide);
    this.present(elapsedS);
    return true;
  }

  reconcile(
    { tick, ackInputSeq = null, entity: snapshot, sampledEntity = null }: AuthoritySample = {},
    elapsedS = 0,
    destroyed = false,
  ) {
    if (!snapshot || typeof tick !== 'number' || !Number.isSafeInteger(tick) ||
        tick <= this.lastAuthorityTick) return false;
    this.lastAuthorityTick = tick;
    // Roster visuals are created at a harmless staging origin while the load
    // screen is up. The first authority pose is initialization, not a network
    // correction: seed both simulation and presentation directly so latency
    // cannot turn the origin-to-spawn distance into a hard snap/correction.
    if (!this.initialized) {
      this.initialized = true;
      this.holdRestingHull = false;
      applyAuthority(this.simEntity.state, snapshot);
      for (const key of PREDICTION_CORRECTION_KEYS) this.correction[key] = 0;
      copyPresentation(this.entity.state, this.simEntity.state, this.correction);
      return true;
    }
    const shown = this.entity.state;
    const old = {
      x: shown.pos.x, y: shown.pos.y, z: shown.pos.z,
      yaw: shown.yaw, pitch: shown.visualPitch, roll: shown.visualRoll,
      turretYaw: shown.turretYaw, gunPitch: shown.gunPitch,
    };
    if (typeof ackInputSeq === 'number' && Number.isSafeInteger(ackInputSeq) && ackInputSeq >= 0) {
      let writeIndex = 0;
      for (const frame of this.history) {
        if (isSequenceNewer(frame.inputSeq, ackInputSeq)) this.history[writeIndex++] = frame;
      }
      this.history.length = writeIndex;
    }
    const authorityTarget = sampledEntity || snapshot;
    applyAuthority(this.simEntity.state, authorityTarget);
    // Browser inputs are replaceable held states. Authority acknowledges the
    // newest state it received, not a list of commands with owned durations,
    // so replaying each unacknowledged render-frame dt double-counts network
    // transit time. SnapshotBuffer already supplies a clock-corrected,
    // bounded-extrapolated own-entity sample for that path. Deterministic
    // callers without such a sample retain exact input replay.
    if (!sampledEntity) {
      for (const frame of this.history) {
        advance(this.simEntity, frame.input, frame.elapsedS, this.heightField, this.collide);
        this.stats.replayedInputs++;
      }
    }
    const predicted = this.simEntity.state;
    const positionError = Math.hypot(
      old.x - predicted.pos.x,
      old.y - predicted.pos.y,
      old.z - predicted.pos.z,
    );
    const staticContactCount = this.simEntity._predictionStaticContacts || 0;
    const dynamicContactCount = this.simEntity._predictionDynamicContacts || 0;
    const contactSinceAuthority = staticContactCount > this.lastStaticContactCount ||
      dynamicContactCount > this.lastDynamicContactCount;
    this.lastStaticContactCount = staticContactCount;
    this.lastDynamicContactCount = dynamicContactCount;
    this.stats.reconciliations++;
    this.stats.lastPositionErrorM = positionError;
    if (contactSinceAuthority) {
      this.contactSmoothingS = CONTACT_SMOOTH_HOLD_S;
      this.stats.contactReconciliations++;
      this.stats.maxContactPositionErrorM = Math.max(
        this.stats.maxContactPositionErrorM,
        positionError,
      );
    } else {
      this.stats.maxFreePositionErrorM = Math.max(
        this.stats.maxFreePositionErrorM,
        positionError,
      );
    }
    this.stats.maxPositionErrorM = Math.max(this.stats.maxPositionErrorM, positionError);
    const terminalDestroyed = !!(destroyed || snapshot.destroyed);
    const distanceSnap = positionError > this.hardSnapDistanceM;
    if (distanceSnap) {
      for (const key of PREDICTION_CORRECTION_KEYS) this.correction[key] = 0;
      this.holdRestingHull = false;
      this.contactSmoothingS = 0;
      this.stats.hardSnaps++;
    } else {
      this.correction.x = old.x - predicted.pos.x;
      this.correction.y = old.y - predicted.pos.y;
      this.correction.z = old.z - predicted.pos.z;
      this.correction.yaw = wrapAngle(old.yaw - predicted.yaw);
      this.correction.pitch = wrapAngle(old.pitch - predicted.visualPitch);
      this.correction.roll = wrapAngle(old.roll - predicted.visualRoll);
      this.correction.turretYaw = wrapAngle(old.turretYaw - predicted.turretYaw);
      this.correction.gunPitch = wrapAngle(old.gunPitch - predicted.gunPitch);
      this.holdRestingHull = !terminalDestroyed && canHoldRestingHull(
        old,
        predicted,
        snapshot,
        this.motionIntent || this.history.some((frame) => hasDriveIntent(frame.input)),
      );
      if (this.holdRestingHull) this.stats.restingHullHolds++;
      if (terminalDestroyed && !this.terminalDestroyed) this.stats.terminalSyncs++;
    }
    if (terminalDestroyed) {
      // Death ends local input authority, but it must not teleport the hull to
      // the terminal server pose. Preserve the already displayed pose as a
      // bounded presentation correction and let the wreck settle over the
      // following frames. Combat state is still authoritative immediately.
      this.history.length = 0;
      this.motionIntent = false;
      this.contactSmoothingS = 0;
    }
    this.terminalDestroyed = terminalDestroyed;
    this.present(elapsedS);
    return true;
  }

  present(elapsedS = 0) {
    const dt = Math.max(0, Math.min(Number(elapsedS) || 0, 0.1));
    const beforeX = this.correction.x;
    const beforeY = this.correction.y;
    const beforeZ = this.correction.z;
    const contactSmoothing = this.contactSmoothingS > 0;
    decayPredictionCorrection(this.correction, dt, {
      horizontalTauS: contactSmoothing
        ? this.contactCorrectionTauS : this.correctionTauS,
      verticalTauS: contactSmoothing
        ? this.contactVerticalCorrectionTauS : this.verticalCorrectionTauS,
      aimTauS: this.aimCorrectionTauS,
      holdRestingHull: this.holdRestingHull,
      maxHorizontalStepM: this.maxHorizontalCorrectionStepM,
      maxVerticalStepM: this.maxVerticalCorrectionStepM,
    });
    this.contactSmoothingS = Math.max(0, this.contactSmoothingS - dt);
    const correctionStepM = Math.hypot(
      beforeX - this.correction.x,
      beforeY - this.correction.y,
      beforeZ - this.correction.z,
    );
    this.stats.maxCorrectionStepM = Math.max(
      this.stats.maxCorrectionStepM,
      correctionStepM,
    );
    this.stats.maxVerticalCorrectionStepM = Math.max(
      this.stats.maxVerticalCorrectionStepM,
      Math.abs(beforeY - this.correction.y),
    );
    copyPresentation(this.entity.state, this.simEntity.state, this.correction);
  }

  getStats() {
    return {
      ...this.stats,
      pendingInputs: this.history.length,
      correctionM: Math.hypot(this.correction.x, this.correction.y, this.correction.z),
    };
  }
}
