import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../sim/movement.ts';
import type {
  MovementCombatState,
  MovementCollisionResolver,
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
const REST_HULL_YAW_RATE_RAD_S = 0.0035;
const MAX_INPUT_HISTORY = 240;
// Match the snapshot extrapolation horizon. A live state stream with lost
// control uploads cannot replay seconds of unacknowledged driving ahead.
const MAX_INPUT_REPLAY_S = 0.25;

export interface PredictionInput {
  throttle?: number;
  steer?: number;
  brake?: boolean;
  fire?: boolean;
  shellSlot?: number;
  aimYaw?: number;
  aimPitch?: number;
  aimDistance?: number;
  aimLocked?: boolean;
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
  modeSpeedMultiplier?: number;
}

export interface PredictionSimEntity extends PredictionEntity {
  input: Required<Pick<PredictionInput,
    'throttle' | 'steer' | 'brake' | 'fire' | 'shellSlot' | 'aimLocked'>> & {
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
) => boolean;

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
  presentationAdvances: number;
  maxPresentationAdvanceS: number;
  maxRecordedInputElapsedS: number;
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

function captureDisplayedPose(state: PredictionTankState, out: DisplayedPose): DisplayedPose {
  out.x = state.pos.x;
  out.y = state.pos.y;
  out.z = state.pos.z;
  out.yaw = state.yaw;
  out.pitch = state.visualPitch;
  out.roll = state.visualRoll;
  out.turretYaw = state.turretYaw;
  out.gunPitch = state.gunPitch;
  return out;
}

function clearCorrection(correction: PredictionCorrection): void {
  for (const key of PREDICTION_CORRECTION_KEYS) correction[key] = 0;
}

function acknowledgeInputs(history: InputHistoryFrame[], ackInputSeq: number | null): void {
  // Stryker disable next-line ConditionalExpression: invalid acknowledgements are ignored here and by sequence arithmetic, so forcing either defensive clause false is behaviorally equivalent.
  if (ackInputSeq == null || !Number.isSafeInteger(ackInputSeq) || ackInputSeq < 0) return;
  let writeIndex = 0;
  for (const frame of history) {
    if (isSequenceNewer(frame.inputSeq, ackInputSeq)) history[writeIndex++] = frame;
  }
  history.length = writeIndex;
}

function historyHasDriveIntent(history: readonly InputHistoryFrame[]): boolean {
  for (const frame of history) {
    if (hasDriveIntent(frame.input)) return true;
  }
  return false;
}

function writePresentationCorrection(
  correction: PredictionCorrection,
  old: DisplayedPose,
  predicted: PredictionTankState,
): void {
  writeHullPresentationCorrection(correction, old, predicted);
  correction.turretYaw = wrapAngle(old.turretYaw - predicted.turretYaw);
  correction.gunPitch = wrapAngle(old.gunPitch - predicted.gunPitch);
}

function writeHullPresentationCorrection(
  correction: PredictionCorrection,
  old: DisplayedPose,
  predicted: PredictionTankState,
): void {
  correction.x = old.x - predicted.pos.x;
  correction.y = old.y - predicted.pos.y;
  correction.z = old.z - predicted.pos.z;
  correction.yaw = wrapAngle(old.yaw - predicted.yaw);
  correction.pitch = wrapAngle(old.pitch - predicted.visualPitch);
  correction.roll = wrapAngle(old.roll - predicted.visualRoll);
}

function wrapAngle(value: number) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function signedSpeed(snapshot: PredictionSnapshot) {
  const vx = snapshot.vx ?? 0;
  const vz = snapshot.vz ?? 0;
  const speed = Math.hypot(vx, vz);
  const along = vx * Math.sin(snapshot.yaw) + vz * Math.cos(snapshot.yaw);
  return along < 0 ? -speed : speed;
}

function hasDriveIntent(input: PredictionInput) {
  return Math.abs(input.throttle ?? 0) > 0.01 || Math.abs(input.steer ?? 0) > 0.01;
}

function hasActiveHullMotion(state: PredictionTankState): boolean {
  return !state.grounded || state.overturned ||
    state._body.tumbling || state._body.autoRighting ||
    state.suspensionAim || Math.abs(state.suspensionAimPitch) > 1e-6 ||
    Math.abs(state.speed) > REST_SPEED_MPS ||
    Math.abs(state.yawRate) > REST_HULL_YAW_RATE_RAD_S;
}

function canHoldRestingHull(
  old: DisplayedPose,
  predicted: PredictionTankState,
  snapshot: PredictionSnapshot | null,
  motionIntent: boolean,
) {
  const activeBodyFlags = SNAPSHOT_FLAGS.AIRBORNE | SNAPSHOT_FLAGS.OVERTURNED |
    SNAPSHOT_FLAGS.AUTO_RIGHTING;
  if (motionIntent || hasActiveHullMotion(predicted)) return false;
  // Grounded contact replay may produce a transient support velocity from
  // quantized height. Its displacement remains bounded below; authoritative
  // vertical motion, unlike that replay-only noise, always releases the hold.
  if (snapshot && (Math.abs(predicted.verticalSpeed) > REST_SPEED_MPS ||
      !!((snapshot.flags ?? 0) & activeBodyFlags) ||
      Math.abs(snapshot.vy ?? 0) > REST_SPEED_MPS ||
      Math.hypot(snapshot.vx ?? 0, snapshot.vz ?? 0) > REST_SPEED_MPS)) return false;
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
  state.overturned = !!((snapshot.flags || 0) & SNAPSHOT_FLAGS.OVERTURNED);
  state._body.tumbling = state.overturned ||
    !!((snapshot.flags || 0) & SNAPSHOT_FLAGS.AUTO_RIGHTING);
  state._body.autoRighting = !!((snapshot.flags || 0) & SNAPSHOT_FLAGS.AUTO_RIGHTING);
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
  entity.input.throttle = input.throttle ?? 0;
  entity.input.steer = input.steer ?? 0;
  entity.input.brake = !!input.brake;
  entity.input.fire = !!input.fire;
  entity.input.aimLocked = !!input.aimLocked;
  entity.input.shellSlot = (input.shellSlot ?? 0) | 0;
  decodeAimIntent(input, entity.state.pos, entity.input.aimPoint);
}

function advance(
  entity: PredictionSimEntity,
  input: PredictionInput,
  elapsedS: number,
  heightField: PredictionHeightField,
  collide: MovementCollisionResolver | null,
) {
  applyInput(entity, input);
  let remaining = Math.max(0, Math.min(Number(elapsedS) || 0, 0.1));
  while (remaining > 1e-8) {
    const dt = Math.min(SIM_DT, remaining);
    updateTank(entity, heightField, dt, collide);
    remaining -= dt;
  }
}

function inputElapsedS(elapsedS: number): number {
  return Math.max(0, Math.min(Number(elapsedS) || 0, 0.1));
}

function createCollisionResolver(
  entity: PredictionSimEntity,
  collide: PredictionCollision | null,
): MovementCollisionResolver | null {
  if (!collide) return null;
  return (position, radius, outPush) => collide(entity, position, radius, outPush);
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
  target.overturned = source.overturned;
  target._body.tumbling = source._body.tumbling;
  target._body.autoRighting = source._body.autoRighting;
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
  target.suspensionAimPitch = source.suspensionAimPitch;
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
  readonly collisionResolver: MovementCollisionResolver | null;
  readonly displayedPose: DisplayedPose;
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
  private pendingPresentationInput: PredictionInput | null = null;
  private pendingPresentationElapsedS = 0;

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
      modeSpeedMultiplier: entity.modeSpeedMultiplier,
      input: {
        throttle: 0,
        steer: 0,
        brake: false,
        fire: false,
        aimLocked: false,
        shellSlot: 0,
        aimPoint: state.aimPoint.clone(),
      },
    };
    this.collisionResolver = createCollisionResolver(this.simEntity, collide);
    this.correction = {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
    };
    this.displayedPose = {
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
      presentationAdvances: 0,
      maxPresentationAdvanceS: 0,
      maxRecordedInputElapsedS: 0,
    };
  }

  advancePrediction(input: PredictionInput | null, elapsedS: number): boolean {
    if (this.terminalDestroyed) {
      // Death disables simulation/input authority, not display-clock settling.
      // Keep the terminal pose fixed while its bounded correction decays even
      // between snapshots or when the input pump supplies no controls.
      this.present(elapsedS);
      return false;
    }
    if (!input) {
      this.present(elapsedS);
      return false;
    }
    this.pendingPresentationInput = input;
    this.pendingPresentationElapsedS = Math.min(0.1,
      this.pendingPresentationElapsedS + inputElapsedS(elapsedS));
    this.syncMovementPolicy();
    this.motionIntent = hasDriveIntent(input);
    if (this.motionIntent) this.holdRestingHull = false;
    const heldPose = this.holdRestingHull
      ? captureDisplayedPose(this.entity.state, this.displayedPose) : null;
    advance(this.simEntity, input, elapsedS, this.heightField, this.collisionResolver);
    if (heldPose) {
      // Idle contact integration still runs on every display frame. Holding a
      // fixed correction alone follows its tiny support/spring changes and
      // reintroduces the snapshot chatter. Hold the displayed hull instead,
      // only while the actual prediction remains inside the rest budget.
      this.holdRestingHull = canHoldRestingHull(
        heldPose, this.simEntity.state, null, this.motionIntent,
      );
      if (this.holdRestingHull) {
        writeHullPresentationCorrection(this.correction, heldPose, this.simEntity.state);
      }
    }
    this.present(elapsedS);
    this.stats.presentationAdvances++;
    this.stats.maxPresentationAdvanceS = Math.max(
      this.stats.maxPresentationAdvanceS,
      Math.max(0, Math.min(Number(elapsedS) || 0, 0.1)),
    );
    return true;
  }

  recordInput(
    input: PredictionInput | null,
    elapsedS: number,
    inputSeq: number,
    presentationElapsedS = elapsedS,
  ) {
    if (!input || this.terminalDestroyed || !Number.isSafeInteger(inputSeq) || inputSeq < 0) {
      return false;
    }
    // Stryker disable next-line ConditionalExpression: on the first input the guarded body can only clear an already-empty history, making a forced-true guard equivalent.
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
    this.history.push({ input: { ...input }, elapsedS, inputSeq });
    this.stats.maxRecordedInputElapsedS = Math.max(
      this.stats.maxRecordedInputElapsedS,
      Math.max(0, Math.min(Number(elapsedS) || 0, 0.1)),
    );
    if (this.history.length > MAX_INPUT_HISTORY) {
      this.history.shift();
      this.stats.droppedHistory++;
    }
    this.advancePrediction(input, presentationElapsedS);
    // The accepted upload interval includes every display frame through this
    // one. Only subsequent unsent frames need a separate replay tail.
    this.pendingPresentationInput = null;
    this.pendingPresentationElapsedS = 0;
    return true;
  }

  initializeAuthority(snapshot: PredictionSnapshot): void {
    this.initialized = true;
    this.holdRestingHull = false;
    this.pendingPresentationInput = null;
    this.pendingPresentationElapsedS = 0;
    applyAuthority(this.simEntity.state, snapshot);
    clearCorrection(this.correction);
    copyPresentation(this.entity.state, this.simEntity.state, this.correction);
  }

  resetForPresentationResume(): void {
    // No visible pose continuity exists while the window was asleep. A life
    // may have ended and respawned without presentation observing either edge.
    this.simEntity.state = createTankState(
      this.entity.spec, this.entity.state.pos, this.entity.state.yaw,
    );
    this.history.length = 0;
    this.lastRecordedSeq = null;
    this.lastAuthorityTick = -1;
    this.initialized = false;
    this.terminalDestroyed = false;
    this.motionIntent = false;
    this.holdRestingHull = false;
    this.contactSmoothingS = 0;
    this.pendingPresentationInput = null;
    this.pendingPresentationElapsedS = 0;
    clearCorrection(this.correction);
  }

  replayAuthority(
    snapshot: PredictionSnapshot,
    sampledEntity: PredictionSnapshot | null,
    terminalDestroyed = false,
  ): void {
    this.syncMovementPolicy();
    applyAuthority(this.simEntity.state, sampledEntity || snapshot);
    // A supplied presentation sample has already advanced its own timeline.
    // Browser prediction uses raw authority instead: replaying on top of an
    // extrapolated/smoothed sample would account for network transit twice.
    if (sampledEntity || terminalDestroyed) return;
    let durationS = this.pendingPresentationElapsedS;
    for (const frame of this.history) durationS += inputElapsedS(frame.elapsedS);
    let skipS = Math.max(0, durationS - MAX_INPUT_REPLAY_S);
    for (const frame of this.history) {
      const frameS = inputElapsedS(frame.elapsedS);
      const replayS = Math.max(0, frameS - skipS);
      skipS = Math.max(0, skipS - frameS);
      if (replayS <= 1e-8) continue;
      advance(
        this.simEntity,
        frame.input,
        replayS,
        this.heightField,
        this.collisionResolver,
      );
      this.stats.replayedInputs++;
    }
    if (this.pendingPresentationInput && this.pendingPresentationElapsedS > 0) {
      advance(this.simEntity, this.pendingPresentationInput, this.pendingPresentationElapsedS,
        this.heightField, this.collisionResolver);
    }
  }

  syncMovementPolicy(): void {
    // These values have already been admitted by the authoritative snapshot
    // bridge. Do not infer special-action activation from local action bits.
    this.simEntity.modeSpeedMultiplier = this.entity.modeSpeedMultiplier;
    this.simEntity.state.suspensionAim = this.entity.state.suspensionAim;
  }

  recordPredictionError(positionError: number): void {
    const staticContacts = this.simEntity._predictionStaticContacts ?? 0;
    const dynamicContacts = this.simEntity._predictionDynamicContacts ?? 0;
    const contacted = staticContacts > this.lastStaticContactCount ||
      dynamicContacts > this.lastDynamicContactCount;
    this.lastStaticContactCount = staticContacts;
    this.lastDynamicContactCount = dynamicContacts;
    this.stats.reconciliations++;
    this.stats.lastPositionErrorM = positionError;
    if (contacted) {
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
  }

  stagePresentationError(
    old: DisplayedPose,
    snapshot: PredictionSnapshot,
    positionError: number,
    terminalDestroyed: boolean,
  ): void {
    if (positionError > this.hardSnapDistanceM) {
      clearCorrection(this.correction);
      this.holdRestingHull = false;
      this.contactSmoothingS = 0;
      this.pendingPresentationInput = null;
      this.pendingPresentationElapsedS = 0;
      this.stats.hardSnaps++;
      return;
    }

    const predicted = this.simEntity.state;
    writePresentationCorrection(this.correction, old, predicted);
    this.holdRestingHull = !terminalDestroyed && canHoldRestingHull(
      old,
      predicted,
      snapshot,
      this.motionIntent || historyHasDriveIntent(this.history),
    );
    if (this.holdRestingHull) this.stats.restingHullHolds++;
  }

  finishTerminalAuthority(terminalDestroyed: boolean): void {
    if (terminalDestroyed) {
      if (!this.terminalDestroyed) this.stats.terminalSyncs++;
      // Death ends local input authority without teleporting presentation to
      // the terminal server pose. The bounded correction settles the wreck.
      this.history.length = 0;
      this.motionIntent = false;
      this.contactSmoothingS = 0;
      this.pendingPresentationInput = null;
      this.pendingPresentationElapsedS = 0;
    }
    this.terminalDestroyed = terminalDestroyed;
  }

  reconcile(
    { tick, ackInputSeq = null, entity: snapshot, sampledEntity = null }: AuthoritySample = {},
    elapsedS = 0,
    destroyed = false,
  ) {
    if (!snapshot || !Number.isSafeInteger(tick)) return false;
    const authorityTick = tick as number;
    if (authorityTick <= this.lastAuthorityTick) return false;
    this.lastAuthorityTick = authorityTick;
    const terminalDestroyed = !!(destroyed || snapshot.destroyed ||
      ((snapshot.flags ?? 0) & SNAPSHOT_FLAGS.DESTROYED));
    acknowledgeInputs(this.history, ackInputSeq);
    // Roster visuals are created at a harmless staging origin while the load
    // screen is up. The first authority pose is initialization, not a network
    // correction: seed both simulation and presentation directly so latency
    // cannot turn the origin-to-spawn distance into a hard snap/correction.
    const respawning = this.terminalDestroyed && !terminalDestroyed;
    if (!this.initialized || respawning) {
      if (respawning) {
        // A new life owns a new drivetrain/contact history, even when its
        // spawn is inside the normal reconciliation distance budget.
        this.simEntity.state = createTankState(
          this.entity.spec, this.entity.state.pos, snapshot.yaw,
        );
        this.history.length = 0;
        this.motionIntent = false;
        this.contactSmoothingS = 0;
      }
      this.initializeAuthority(snapshot);
      this.finishTerminalAuthority(terminalDestroyed);
      return true;
    }
    const old = captureDisplayedPose(this.entity.state, this.displayedPose);
    this.replayAuthority(snapshot, sampledEntity, terminalDestroyed);
    const predicted = this.simEntity.state;
    const positionError = Math.hypot(
      old.x - predicted.pos.x,
      old.y - predicted.pos.y,
      old.z - predicted.pos.z,
    );
    this.recordPredictionError(positionError);
    this.stagePresentationError(old, snapshot, positionError, terminalDestroyed);
    this.finishTerminalAuthority(terminalDestroyed);
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
