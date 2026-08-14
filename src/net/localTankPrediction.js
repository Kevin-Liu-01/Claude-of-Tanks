import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../sim/movement.js';
import { isSequenceNewer } from './protocol.js';

const AIM_DISTANCE_M = 1000;
const DEFAULT_HARD_SNAP_M = 7;
const DEFAULT_CORRECTION_TAU_S = 0.09;
const MAX_INPUT_HISTORY = 240;

function wrapAngle(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function signedSpeed(snapshot) {
  const speed = Math.hypot(snapshot.vx || 0, snapshot.vz || 0);
  const along = (snapshot.vx || 0) * Math.sin(snapshot.yaw || 0) +
    (snapshot.vz || 0) * Math.cos(snapshot.yaw || 0);
  return along < 0 ? -speed : speed;
}

function applyAuthority(state, snapshot) {
  state.pos.set(snapshot.x, snapshot.y, snapshot.z);
  state.yaw = snapshot.yaw;
  state.speed = signedSpeed(snapshot);
  state.visualPitch = snapshot.pitch;
  state.visualRoll = snapshot.roll;
  state.turretYaw = snapshot.turretYaw;
  state.gunPitch = snapshot.gunPitch;
  state._prevSpeed = state.speed;
  state._spring.pitch = snapshot.pitch;
  state._spring.roll = snapshot.roll;
  state._ride.y = snapshot.y;
  state._ride.supportY = snapshot.y;
}

function applyInput(entity, input) {
  entity.input.throttle = input.throttle || 0;
  entity.input.steer = input.steer || 0;
  entity.input.brake = !!input.brake;
  entity.input.fire = !!input.fire;
  entity.input.shellSlot = input.shellSlot | 0;
  const pitch = Number(input.aimPitch) || 0;
  const yaw = Number(input.aimYaw) || 0;
  const cosPitch = Math.cos(pitch);
  entity.input.aimPoint.set(
    entity.state.pos.x + Math.sin(yaw) * cosPitch * AIM_DISTANCE_M,
    entity.state.pos.y + Math.sin(pitch) * AIM_DISTANCE_M,
    entity.state.pos.z + Math.cos(yaw) * cosPitch * AIM_DISTANCE_M,
  );
}

function advance(entity, input, elapsedS, heightField, collide) {
  applyInput(entity, input);
  let remaining = Math.max(0, Math.min(Number(elapsedS) || 0, 0.1));
  while (remaining > 1e-8) {
    const dt = Math.min(SIM_DT, remaining);
    updateTank(entity, heightField, dt,
      collide ? (pos, radius, out) => collide(entity, pos, radius, out) : null);
    remaining -= dt;
  }
}

function copyPresentation(target, source, correction) {
  target.pos.set(
    source.pos.x + correction.x,
    source.pos.y + correction.y,
    source.pos.z + correction.z,
  );
  target.yaw = wrapAngle(source.yaw + correction.yaw);
  target.speed = source.speed;
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
  constructor({
    entity,
    heightField,
    collide = null,
    hardSnapDistanceM = DEFAULT_HARD_SNAP_M,
    correctionTauS = DEFAULT_CORRECTION_TAU_S,
  } = {}) {
    if (!entity || !entity.spec || !entity.state) throw new TypeError('prediction entity is required');
    if (!heightField || typeof heightField.getHeightAt !== 'function') {
      throw new TypeError('prediction height field is required');
    }
    this.entity = entity;
    this.heightField = heightField;
    this.collide = collide;
    this.hardSnapDistanceM = hardSnapDistanceM;
    this.correctionTauS = correctionTauS;
    const source = entity.state;
    const state = createTankState(entity.spec, source.pos, source.yaw);
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
    this.history = [];
    this.lastRecordedSeq = null;
    this.lastAuthorityTick = -1;
    this.correction = {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
    };
    this.stats = {
      reconciliations: 0,
      hardSnaps: 0,
      replayedInputs: 0,
      droppedHistory: 0,
      maxPositionErrorM: 0,
      lastPositionErrorM: 0,
    };
  }

  recordInput(input, elapsedS, inputSeq) {
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
    this.history.push({ input: { ...input }, elapsedS, inputSeq });
    if (this.history.length > MAX_INPUT_HISTORY) {
      this.history.shift();
      this.stats.droppedHistory++;
    }
    advance(this.simEntity, input, elapsedS, this.heightField, this.collide);
    this.present(elapsedS);
    return true;
  }

  reconcile({ tick, ackInputSeq = null, entity: snapshot } = {}, elapsedS = 0) {
    if (!snapshot || !Number.isSafeInteger(tick) || tick <= this.lastAuthorityTick) return false;
    this.lastAuthorityTick = tick;
    const shown = this.entity.state;
    const old = {
      x: shown.pos.x, y: shown.pos.y, z: shown.pos.z,
      yaw: shown.yaw, pitch: shown.visualPitch, roll: shown.visualRoll,
      turretYaw: shown.turretYaw, gunPitch: shown.gunPitch,
    };
    if (Number.isSafeInteger(ackInputSeq) && ackInputSeq >= 0) {
      this.history = this.history.filter((frame) => isSequenceNewer(frame.inputSeq, ackInputSeq));
    }
    applyAuthority(this.simEntity.state, snapshot);
    for (const frame of this.history) {
      advance(this.simEntity, frame.input, frame.elapsedS, this.heightField, this.collide);
      this.stats.replayedInputs++;
    }
    const predicted = this.simEntity.state;
    const positionError = Math.hypot(
      old.x - predicted.pos.x,
      old.y - predicted.pos.y,
      old.z - predicted.pos.z,
    );
    this.stats.reconciliations++;
    this.stats.lastPositionErrorM = positionError;
    this.stats.maxPositionErrorM = Math.max(this.stats.maxPositionErrorM, positionError);
    if (positionError > this.hardSnapDistanceM || snapshot.destroyed) {
      for (const key of Object.keys(this.correction)) this.correction[key] = 0;
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
    }
    this.present(elapsedS);
    return true;
  }

  present(elapsedS = 0) {
    const dt = Math.max(0, Math.min(Number(elapsedS) || 0, 0.1));
    const decay = this.correctionTauS > 0 ? Math.exp(-dt / this.correctionTauS) : 0;
    for (const key of Object.keys(this.correction)) this.correction[key] *= decay;
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
