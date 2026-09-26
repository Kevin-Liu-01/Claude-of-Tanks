/**
 * Local-tank prediction and reconciliation (charter §4 "Prediction"). The
 * viewer's tank runs the shared movement module one fixed step per sampled
 * input tick, ahead of the server. On every own authority row the simulation
 * rewinds to that tick — pose, flags, the integrator checkpoint, module and
 * crew state from the viewer section — and replays the ticks the server has
 * not simulated yet. The difference between what was on screen and the
 * re-predicted pose becomes a presentation-only correction that decays with
 * v1's envelopes (hull 110 ms, attitude and support 160 ms, live aim 75 ms;
 * 180/240 ms for 300 ms after a contact; at most 0.2 m horizontal and 0.1 m
 * vertical release per frame; a hard snap only above 7 m). Combat, hits and
 * every other entity stay authoritative; nothing here feeds back into the
 * simulation or the wire.
 */
import { Vector3 } from 'three';
import { SIM_DT, createTankState, updateTank } from '../../sim/movement.ts';
import type {
  MovementCollisionResolver, MovementCombatState, MovementContactGeometry, MovementHeightField, MovementSpec,
  TankState,
} from '../../sim/movement.ts';
import type { RulesetPhysics } from '../../sim/matchRuleset.ts';
import {
  ENTITY_FLAGS, MODULE_STATE_NAMES, VIEWER_CREW, VIEWER_EQUIPMENT, VIEWER_MODULES, dequantizeAngle,
  dequantizeMultiplier, dequantizePosition, dequantizeVelocity, wrapAngle,
} from '../wire/index.ts';
import type { EntityRow, ViewerState } from '../wire/index.ts';
import { applyMovementCheckpoint } from './movementCheckpoint.ts';
import { lerpAngle } from './interpolation.ts';
import type { PredictionControl } from './inputStream.ts';

/** The world the prediction integrates against; the presentation supplies it (the soak a synthetic one). */
export interface PredictionWorld {
  heightField: MovementHeightField;
  /** Static obstacles, the playable bounds and disclosed hulls; null on an open field. */
  collide?: MovementCollisionResolver | null;
  /** Keep null: authority uses the spec-derived contact footprint, not the visual's measured one. */
  contactGeom?: MovementContactGeometry | null;
  /** The room's ruleset impact physics (landing rebound); absent = the whole-game block. */
  physics?: RulesetPhysics | null;
}

export interface PredictionAuthority {
  tick: number;
  row: EntityRow;
  viewer: ViewerState | null;
}

export interface CorrectionPolicy {
  hullTauS: number;
  contactHullTauS: number;
  verticalTauS: number;
  contactVerticalTauS: number;
  aimTauS: number;
  maxHorizontalStepM: number;
  maxVerticalStepM: number;
  hardSnapM: number;
  contactHoldS: number;
  maxReplayTicks: number;
}

export const DEFAULT_CORRECTION_POLICY: Readonly<CorrectionPolicy> = Object.freeze({
  hullTauS: 0.11,
  contactHullTauS: 0.18,
  verticalTauS: 0.16,
  contactVerticalTauS: 0.24,
  aimTauS: 0.075,
  maxHorizontalStepM: 0.2,
  maxVerticalStepM: 0.1,
  hardSnapM: 7,
  contactHoldS: 0.3,
  // 400 ms: the server's lag-compensation history; at 200 ms RTT the unacknowledged window is ~14 ticks.
  maxReplayTicks: 24,
});

export interface PredictionStats {
  reconciliations: number;
  hardSnaps: number;
  terminalSyncs: number;
  respawns: number;
  replayedTicks: number;
  skippedReplayTicks: number;
  heldTicks: number;
  checkpointsApplied: number;
  checkpointsMissing: number;
  checkpointsRejected: number;
  contactReconciliations: number;
  restingHolds: number;
  /** Misprediction at the newest tick: the pose before and after the rewind + replay (metres). */
  lastPositionErrorM: number;
  maxPositionErrorM: number;
  maxFreePositionErrorM: number;
  maxContactPositionErrorM: number;
  /** Reconciliations where the sampler had not reached the authority tick (a suspended tab): adopted, not corrected. */
  tickJumps: number;
  /** Largest presentation move a single present() released (metres). */
  maxCorrectionStepM: number;
  maxVerticalCorrectionStepM: number;
  /** Current and largest staged correction magnitude (metres). */
  correctionM: number;
  maxCorrectionM: number;
}

/** A hull/turret pose plus the suspension layers the renderer composes on top of it. */
interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
  suspP: number;
  suspR: number;
  sway: number;
  trackL: number;
  trackR: number;
}

interface Correction {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
}

// Shared movement.ts / tankFactoryCore.ts rendered-suspension contract.
const SUSPENSION_PITCH_SCALE = 2.2;
const SUSPENSION_ROLL_SCALE = 1.9;
const TURN_SWAY_SCALE = 2.4;
const REST_SPEED_MPS = 0.08;
const REST_HORIZONTAL_DEADZONE_M = 0.03;
const REST_VERTICAL_DEADZONE_M = 0.025;
const REST_ANGLE_DEADZONE_RAD = 0.0035;
const REST_YAW_RATE_RAD_S = 0.0035;
const ACTIVE_BODY_FLAGS = ENTITY_FLAGS.AIRBORNE | ENTITY_FLAGS.OVERTURNED | ENTITY_FLAGS.AUTO_RIGHTING;
/** Tick poses kept for the display blend (the replay window is 24 ticks). */
const POSE_RING = 32;

function createPose(): Pose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, suspP: 0, suspR: 0, sway: 0, trackL: 0, trackR: 0 };
}

function capturePose(state: TankState, out: Pose): Pose {
  out.x = state.pos.x; out.y = state.pos.y; out.z = state.pos.z;
  out.yaw = state.yaw; out.pitch = state.visualPitch; out.roll = state.visualRoll;
  out.turretYaw = state.turretYaw; out.gunPitch = state.gunPitch;
  out.suspP = state._susp.p; out.suspR = state._susp.r; out.sway = state._swayEst;
  out.trackL = state.trackScroll.l; out.trackR = state.trackScroll.r;
  return out;
}

function copyPose(from: Pose, to: Pose): Pose { return Object.assign(to, from); }

function blendPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
  out.yaw = lerpAngle(a.yaw, b.yaw, t);
  out.pitch = a.pitch + (b.pitch - a.pitch) * t; out.roll = a.roll + (b.roll - a.roll) * t;
  out.turretYaw = lerpAngle(a.turretYaw, b.turretYaw, t);
  out.gunPitch = a.gunPitch + (b.gunPitch - a.gunPitch) * t;
  out.suspP = a.suspP + (b.suspP - a.suspP) * t; out.suspR = a.suspR + (b.suspR - a.suspR) * t;
  out.sway = a.sway + (b.sway - a.sway) * t;
  out.trackL = a.trackL + (b.trackL - a.trackL) * t; out.trackR = a.trackR + (b.trackR - a.trackR) * t;
  return out;
}

const composedPitch = (pose: Pose): number => pose.pitch + pose.suspP * SUSPENSION_PITCH_SCALE;
const composedRoll = (pose: Pose): number => pose.roll + pose.suspR * SUSPENSION_ROLL_SCALE + pose.sway * TURN_SWAY_SCALE;

function decayFactor(elapsedS: number, tauS: number): number {
  return tauS > 0 ? Math.exp(-Math.max(0, elapsedS) / tauS) : 0;
}

function withinRestDeadzone(displayed: Pose, predicted: Pose): boolean {
  return Math.hypot(displayed.x - predicted.x, displayed.z - predicted.z) <= REST_HORIZONTAL_DEADZONE_M &&
    Math.abs(displayed.y - predicted.y) <= REST_VERTICAL_DEADZONE_M &&
    Math.abs(wrapAngle(displayed.yaw - predicted.yaw)) <= REST_ANGLE_DEADZONE_RAD &&
    Math.abs(wrapAngle(composedPitch(displayed) - composedPitch(predicted))) <= REST_ANGLE_DEADZONE_RAD &&
    Math.abs(wrapAngle(composedRoll(displayed) - composedRoll(predicted))) <= REST_ANGLE_DEADZONE_RAD;
}

function correctionWithinRest(c: Correction): boolean {
  return Math.hypot(c.x, c.z) <= REST_HORIZONTAL_DEADZONE_M && Math.abs(c.y) <= REST_VERTICAL_DEADZONE_M &&
    Math.abs(c.yaw) <= REST_ANGLE_DEADZONE_RAD && Math.abs(c.pitch) <= REST_ANGLE_DEADZONE_RAD &&
    Math.abs(c.roll) <= REST_ANGLE_DEADZONE_RAD;
}

function hasDriveIntent(control: PredictionControl | null): boolean {
  return !!control && (Math.abs(control.throttle) > 0.01 || Math.abs(control.steer) > 0.01);
}

function simAtRest(state: TankState): boolean {
  return state.grounded && !state.overturned && !state._body.tumbling && !state._body.autoRighting &&
    !state.suspensionAim && Math.abs(state.suspensionAimPitch) <= 1e-6 &&
    Math.abs(state.speed) <= REST_SPEED_MPS && Math.abs(state.verticalSpeed) <= REST_SPEED_MPS &&
    Math.abs(state.yawRate) <= REST_YAW_RATE_RAD_S;
}

function authorityAtRest(row: EntityRow): boolean {
  return !(row.flags & ACTIVE_BODY_FLAGS) &&
    Math.abs(dequantizeVelocity(row.speed)) <= REST_SPEED_MPS &&
    Math.abs(dequantizeVelocity(row.verticalSpeed)) <= REST_SPEED_MPS;
}

/** The authority row's pose and body flags onto the simulation state (the checkpoint refines the integrator). */
function applyAuthorityRow(state: TankState, row: EntityRow): void {
  state.pos.set(dequantizePosition(row.x), dequantizePosition(row.y), dequantizePosition(row.z));
  state.yaw = dequantizeAngle(row.yaw);
  state.speed = dequantizeVelocity(row.speed);
  state.verticalSpeed = dequantizeVelocity(row.verticalSpeed);
  state.visualPitch = dequantizeAngle(row.pitch);
  state.visualRoll = dequantizeAngle(row.roll);
  state.turretYaw = dequantizeAngle(row.turretYaw);
  state.gunPitch = dequantizeAngle(row.gunPitch);
  state.grounded = !(row.flags & ENTITY_FLAGS.AIRBORNE);
  state.overturned = !!(row.flags & ENTITY_FLAGS.OVERTURNED);
  state._body.autoRighting = !!(row.flags & ENTITY_FLAGS.AUTO_RIGHTING);
  state._body.tumbling = state.overturned || state._body.autoRighting;
  state._prevSpeed = state.speed;
  state._spring.pitch = state.visualPitch;
  state._spring.roll = state.visualRoll;
  state._ride.y = state.pos.y;
  state._ride.v = state.verticalSpeed;
  state._ride.grounded = state.grounded;
  state._ride.airTime = 0;
  // The first replay tick re-establishes terrain support at the authority pose.
  state._ride.supportY = NaN;
}

export class LocalPredictor {
  /** What the renderer reads (its `entity.state`); never fed back into the simulation. */
  readonly presented: TankState;
  readonly policy: CorrectionPolicy;
  readonly spec: MovementSpec;
  private readonly world: PredictionWorld;
  private readonly collide: MovementCollisionResolver | null;
  private readonly sim: {
    spec: MovementSpec; state: TankState; combat: MovementCombatState; contactGeom: MovementContactGeometry | null;
    modeSpeedMultiplier: number; modeGravityScale: number; modePhysics: RulesetPhysics | null; rigidGear: boolean;
    input: { throttle: number; steer: number; brake: boolean; aimLocked: boolean; aimPoint: Vector3 };
  };
  private readonly correction: Correction = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
  /** The last POSE_RING ticks' poses (re-captured by a replay) for the display blend. */
  private readonly poseRing: Pose[] = Array.from({ length: POSE_RING }, () => createPose());
  private readonly poseRingTicks = new Int32Array(POSE_RING).fill(-1);
  private readonly currentTickPose = createPose();
  private readonly displayedPose = createPose();
  private readonly heldPose = createPose();
  private readonly blendScratch = createPose();
  private readonly capturedScratch = createPose();
  private initialized = false;
  private terminal = false;
  private currentTick = -1;
  private lastAuthorityTick = -1;
  private lastControl: PredictionControl | null = null;
  private motionIntent = false;
  private holdingRest = false;
  private contactSmoothingS = 0;
  private contactHits = 0;
  private lastContactHits = 0;
  private hasDisplayed = false;
  private readonly stats: PredictionStats = {
    reconciliations: 0, hardSnaps: 0, terminalSyncs: 0, respawns: 0, replayedTicks: 0, skippedReplayTicks: 0,
    heldTicks: 0, checkpointsApplied: 0, checkpointsMissing: 0, checkpointsRejected: 0, contactReconciliations: 0,
    restingHolds: 0, lastPositionErrorM: 0, maxPositionErrorM: 0, maxFreePositionErrorM: 0,
    maxContactPositionErrorM: 0, tickJumps: 0, maxCorrectionStepM: 0, maxVerticalCorrectionStepM: 0, correctionM: 0,
    maxCorrectionM: 0,
  };

  constructor(spec: MovementSpec, world: PredictionWorld, policy: Partial<CorrectionPolicy> = {}) {
    if (!spec || !world || typeof world.heightField?.getHeightAt !== 'function') {
      throw new TypeError('prediction needs a movement spec and a height field');
    }
    this.spec = spec;
    this.world = world;
    this.policy = { ...DEFAULT_CORRECTION_POLICY, ...policy };
    const origin = new Vector3();
    this.presented = createTankState(spec, origin, 0);
    const state = createTankState(spec, origin, 0);
    this.sim = {
      spec, state, combat: { destroyed: false, modules: {}, crew: {}, equipMults: {} },
      contactGeom: world.contactGeom ?? null, modeSpeedMultiplier: 1, modeGravityScale: 1, modePhysics: world.physics ?? null, rigidGear: false,
      input: { throttle: 0, steer: 0, brake: false, aimLocked: false, aimPoint: state.aimPoint.clone() },
    };
    for (const name of VIEWER_MODULES) this.sim.combat.modules![name] = { state: 'ok' };
    // One stable adapter for the predictor's lifetime (never a closure per replayed step).
    const collide = world.collide ?? null;
    this.collide = collide ? (position, radius, outPush) => {
      const hit = collide(position, radius, outPush);
      if (hit) this.contactHits++;
      return hit;
    } : null;
    capturePose(state, this.currentTickPose);
    capturePose(state, this.displayedPose);
  }

  get isInitialized(): boolean { return this.initialized; }
  get isDestroyed(): boolean { return this.terminal; }
  get authorityTick(): number { return this.lastAuthorityTick; }
  get holdsRestingHull(): boolean { return this.holdingRest; }
  /** The simulation state at the newest sampled tick (read-only use: aim origin, diagnostics). */
  get simulationState(): TankState { return this.sim.state; }

  /** One sampled input tick: advance the simulation one fixed step. */
  recordTick(control: PredictionControl): void {
    this.lastControl = control;
    if (this.terminal || !this.initialized) return;
    this.motionIntent = hasDriveIntent(control);
    if (this.motionIntent) this.holdingRest = false;
    this.step(control);
    this.storePose(control.tick);
    if (this.holdingRest) {
      if (withinRestDeadzone(this.heldPose, this.currentTickPose)) this.stats.heldTicks++;
      else this.releaseRest();
    }
  }

  /** Record the simulation pose as tick `tick`'s (the newest). */
  private storePose(tick: number): void {
    this.currentTick = tick;
    capturePose(this.sim.state, this.currentTickPose);
    copyPose(this.currentTickPose, this.poseRing[tick & (POSE_RING - 1)]!);
    this.poseRingTicks[tick & (POSE_RING - 1)] = tick;
  }

  private poseAt(tick: number): Pose | null {
    const slot = tick & (POSE_RING - 1);
    return this.poseRingTicks[slot] === tick ? this.poseRing[slot]! : null;
  }

  private step(control: PredictionControl): void {
    const input = this.sim.input;
    input.throttle = control.throttle;
    input.steer = control.steer;
    input.brake = control.brake;
    input.aimLocked = control.aimLocked;
    const origin = this.sim.state.pos;
    const cosPitch = Math.cos(control.aimPitch);
    input.aimPoint.set(
      origin.x + Math.sin(control.aimYaw) * cosPitch * control.aimDistance,
      origin.y + Math.sin(control.aimPitch) * control.aimDistance,
      origin.z + Math.cos(control.aimYaw) * cosPitch * control.aimDistance,
    );
    updateTank(this.sim, this.world.heightField, SIM_DT, this.collide);
  }

  /**
   * The viewer's own authority row for `authority.tick`: rewind, replay the
   * ticks up to `latestSampledTick` with `controls`, stage the correction.
   */
  reconcile(
    authority: PredictionAuthority,
    controls: (tick: number) => PredictionControl | null,
    latestSampledTick: number,
  ): boolean {
    if (authority.tick <= this.lastAuthorityTick) return false;
    this.lastAuthorityTick = authority.tick;
    const destroyed = (authority.row.flags & ENTITY_FLAGS.DESTROYED) !== 0;
    this.applyViewerState(authority.viewer, destroyed);
    const respawning = this.terminal && !destroyed;
    if (!this.initialized || respawning) {
      if (respawning) this.stats.respawns++;
      this.initialize(authority);
      // The sampler may already be ahead: bring the ring up to the newest sampled tick.
      if (!destroyed) this.replay(authority.tick, controls, latestSampledTick);
      this.finishTerminal(destroyed);
      return true;
    }
    // The prediction at the newest tick before the rewind: the correction is
    // the shift the re-prediction applies to it, accumulated onto whatever is
    // still decaying, so a perfect prediction stages nothing at all.
    const oldTick = this.currentTick;
    const old = copyPose(this.currentTickPose, this.capturedScratch);
    this.rewind(authority);
    let replayed = false;
    if (!destroyed) replayed = this.replay(authority.tick, controls, latestSampledTick);
    else this.stats.terminalSyncs += this.terminal ? 0 : 1;
    if (!replayed) this.storePose(authority.tick);
    const predicted = this.currentTickPose;
    this.stats.reconciliations++;
    if (oldTick !== this.currentTick && !destroyed) {
      // The sampler had not reached this tick (a suspended tab): there is no same-tick prediction to correct.
      this.stats.tickJumps++;
      this.clearCorrection();
      this.holdingRest = false;
      this.finishTerminal(destroyed);
      return true;
    }
    const errorM = Math.hypot(old.x - predicted.x, old.y - predicted.y, old.z - predicted.z);
    this.recordError(errorM);
    this.accumulateCorrection(old, predicted);
    const c = this.correction;
    const correctionM = Math.hypot(c.x, c.y, c.z);
    this.stats.correctionM = correctionM;
    this.stats.maxCorrectionM = Math.max(this.stats.maxCorrectionM, correctionM);
    if (correctionM > this.policy.hardSnapM) {
      this.clearCorrection();
      this.holdingRest = false;
      this.contactSmoothingS = 0;
      this.stats.hardSnaps++;
    } else {
      const atRest = !destroyed && !this.motionIntent && !this.pendingDriveIntent(controls, authority.tick, latestSampledTick) &&
        simAtRest(this.sim.state) && authorityAtRest(authority.row);
      if (this.holdingRest) {
        // Keep holding only while the re-prediction stays inside the rest budget of the held hull.
        this.holdingRest = atRest && withinRestDeadzone(this.heldPose, predicted);
        if (!this.holdingRest) this.stageHullCorrection(this.heldPose, predicted);
      } else if (atRest && this.hasDisplayed && correctionWithinRest(c)) {
        this.holdingRest = true;
        copyPose(this.displayedPose, this.heldPose);
        this.stats.restingHolds++;
      }
    }
    this.finishTerminal(destroyed);
    return true;
  }

  private pendingDriveIntent(controls: (tick: number) => PredictionControl | null, fromTick: number, toTick: number): boolean {
    for (let tick = fromTick + 1; tick <= toTick; tick++) if (hasDriveIntent(controls(tick))) return true;
    return false;
  }

  private initialize(authority: PredictionAuthority): void {
    const state = createTankState(this.spec, this.sim.state.pos, dequantizeAngle(authority.row.yaw));
    this.sim.state = state;
    applyAuthorityRow(state, authority.row);
    this.restoreCheckpoint(authority.viewer);
    this.clearCorrection();
    this.holdingRest = false;
    this.contactSmoothingS = 0;
    this.motionIntent = false;
    this.initialized = true;
    this.poseRingTicks.fill(-1);
    this.storePose(authority.tick);
    copyPose(this.currentTickPose, this.displayedPose);
    this.writePresentation(this.currentTickPose, this.currentTickPose);
    this.hasDisplayed = true;
  }

  private rewind(authority: PredictionAuthority): void {
    applyAuthorityRow(this.sim.state, authority.row);
    this.restoreCheckpoint(authority.viewer);
  }

  /** Replay the unacknowledged ticks; true when the newest tick was stepped (its predecessor pose captured). */
  private replay(authorityTick: number, controls: (tick: number) => PredictionControl | null, latestSampledTick: number): boolean {
    const wanted = latestSampledTick - authorityTick;
    if (wanted <= 0) return false;
    const skipped = Math.max(0, wanted - this.policy.maxReplayTicks);
    this.stats.skippedReplayTicks += skipped;
    let control: PredictionControl | null = null;
    let steppedLatest = false;
    for (let tick = authorityTick + 1 + skipped; tick <= latestSampledTick; tick++) {
      control = controls(tick) ?? control ?? this.lastControl;
      if (!control) continue;
      this.step(control);
      this.storePose(tick);
      this.stats.replayedTicks++;
      steppedLatest = tick === latestSampledTick;
    }
    return steppedLatest;
  }

  private restoreCheckpoint(viewer: ViewerState | null): void {
    if (!viewer || viewer.movementVersion === 0) { this.stats.checkpointsMissing++; return; }
    const applied = applyMovementCheckpoint(this.sim.state, {
      version: viewer.movementVersion, values: viewer.movementValues, flags: viewer.movementFlags,
    }, this.sim.contactGeom);
    if (applied) this.stats.checkpointsApplied++;
    else this.stats.checkpointsRejected++;
  }

  private applyViewerState(viewer: ViewerState | null, destroyed: boolean): void {
    const combat = this.sim.combat;
    combat.destroyed = destroyed;
    if (!viewer) return;
    VIEWER_MODULES.forEach((name, index) => {
      const module = combat.modules![name];
      if (module) module.state = MODULE_STATE_NAMES[viewer.modules[index] ?? 0] ?? 'ok';
    });
    VIEWER_CREW.forEach((name, index) => { combat.crew![name] = (viewer.crewBits & (1 << index)) !== 0; });
    VIEWER_EQUIPMENT.forEach((name, index) => {
      combat.equipMults![name] = dequantizeMultiplier(viewer.equipment[index] ?? 1000);
    });
    this.sim.modeSpeedMultiplier = dequantizeMultiplier(viewer.modeSpeedMultiplier);
    this.sim.modeGravityScale = dequantizeMultiplier(viewer.modeGravityScale);
  }

  private recordError(errorM: number): void {
    const contacted = this.contactHits > this.lastContactHits;
    this.lastContactHits = this.contactHits;
    this.stats.lastPositionErrorM = errorM;
    this.stats.maxPositionErrorM = Math.max(this.stats.maxPositionErrorM, errorM);
    if (contacted) {
      this.contactSmoothingS = this.policy.contactHoldS;
      this.stats.contactReconciliations++;
      this.stats.maxContactPositionErrorM = Math.max(this.stats.maxContactPositionErrorM, errorM);
    } else this.stats.maxFreePositionErrorM = Math.max(this.stats.maxFreePositionErrorM, errorM);
  }

  /** Add the shift between the old and the new prediction of the same tick to the decaying correction. */
  private accumulateCorrection(old: Pose, predicted: Pose): void {
    const c = this.correction;
    c.x += old.x - predicted.x;
    c.y += old.y - predicted.y;
    c.z += old.z - predicted.z;
    c.yaw = wrapAngle(c.yaw + wrapAngle(old.yaw - predicted.yaw));
    c.pitch = wrapAngle(c.pitch + wrapAngle(composedPitch(old) - composedPitch(predicted)));
    c.roll = wrapAngle(c.roll + wrapAngle(composedRoll(old) - composedRoll(predicted)));
    c.turretYaw = wrapAngle(c.turretYaw + wrapAngle(old.turretYaw - predicted.turretYaw));
    c.gunPitch = wrapAngle(c.gunPitch + wrapAngle(old.gunPitch - predicted.gunPitch));
  }

  private stageHullCorrection(old: Pose, predicted: Pose): void {
    const c = this.correction;
    c.x = old.x - predicted.x;
    c.y = old.y - predicted.y;
    c.z = old.z - predicted.z;
    c.yaw = wrapAngle(old.yaw - predicted.yaw);
    c.pitch = wrapAngle(composedPitch(old) - composedPitch(predicted));
    c.roll = wrapAngle(composedRoll(old) - composedRoll(predicted));
  }

  private clearCorrection(): void {
    const c = this.correction;
    c.x = c.y = c.z = c.yaw = c.pitch = c.roll = c.turretYaw = c.gunPitch = 0;
  }

  private releaseRest(): void {
    if (!this.holdingRest) return;
    this.holdingRest = false;
    // Leave the held hull through the ordinary bounded decay instead of a step; the aim was never held.
    this.stageHullCorrection(this.heldPose, this.currentTickPose);
  }

  private finishTerminal(destroyed: boolean): void {
    if (destroyed && !this.terminal) {
      this.motionIntent = false;
      this.holdingRest = false;
      this.contactSmoothingS = 0;
    }
    this.terminal = destroyed;
  }

  /**
   * Once per display frame: decay the correction on the display clock and
   * write the presented state as the blend of the ring poses around
   * `displayTick` (a fractional tick at or below the newest sampled one)
   * plus the correction.
   */
  present(elapsedS: number, displayTick: number): void {
    if (!this.initialized) return;
    const c = this.correction;
    const beforeX = c.x, beforeY = c.y, beforeZ = c.z;
    const dt = Math.max(0, Math.min(0.1, elapsedS));
    const aimDecay = decayFactor(dt, this.policy.aimTauS);
    c.turretYaw *= aimDecay;
    c.gunPitch *= aimDecay;
    if (!this.holdingRest) {
      const contact = this.contactSmoothingS > 0;
      const hullDecay = decayFactor(dt, contact ? this.policy.contactHullTauS : this.policy.hullTauS);
      c.x *= hullDecay; c.z *= hullDecay; c.yaw *= hullDecay;
      const releasedM = Math.hypot(beforeX - c.x, beforeZ - c.z);
      if (releasedM > this.policy.maxHorizontalStepM) {
        const scale = this.policy.maxHorizontalStepM / releasedM;
        c.x = beforeX - (beforeX - c.x) * scale;
        c.z = beforeZ - (beforeZ - c.z) * scale;
      }
      const verticalDecay = decayFactor(dt, contact ? this.policy.contactVerticalTauS : this.policy.verticalTauS);
      c.y *= verticalDecay; c.pitch *= verticalDecay; c.roll *= verticalDecay;
      const releasedY = beforeY - c.y;
      if (Math.abs(releasedY) > this.policy.maxVerticalStepM) c.y = beforeY - Math.sign(releasedY) * this.policy.maxVerticalStepM;
    }
    this.contactSmoothingS = Math.max(0, this.contactSmoothingS - dt);
    const stepM = Math.hypot(beforeX - c.x, beforeY - c.y, beforeZ - c.z);
    this.stats.maxCorrectionStepM = Math.max(this.stats.maxCorrectionStepM, stepM);
    this.stats.maxVerticalCorrectionStepM = Math.max(this.stats.maxVerticalCorrectionStepM, Math.abs(beforeY - c.y));
    const blended = this.blendAt(this.terminal ? this.currentTick : displayTick);
    this.writePresentation(this.holdingRest ? this.heldPose : blended, blended);
    this.hasDisplayed = true;
  }

  /** The ring pose at a fractional tick (clamped to what the ring holds; the newest pose past its end). */
  private blendAt(displayTick: number): Pose {
    const clamped = Math.max(this.currentTick - (POSE_RING - 8), Math.min(this.currentTick, displayTick));
    const base = Math.floor(clamped);
    const a = this.poseAt(base);
    // A gap in the ring (ticks sampled before initialization): fall back to the newest pose.
    if (!a) return blendPose(this.currentTickPose, this.currentTickPose, 0, this.blendScratch);
    const b = this.poseAt(base + 1) ?? a;
    return blendPose(a, b, clamped - base, this.blendScratch);
  }

  /** `hull` is frozen at the held pose while resting; the aim (`live`) always follows the newest prediction. */
  private writePresentation(hull: Pose, live: Pose): void {
    const target = this.presented;
    const source = this.sim.state;
    const c = this.correction;
    const holding = this.holdingRest;
    target.pos.set(hull.x + (holding ? 0 : c.x), hull.y + (holding ? 0 : c.y), hull.z + (holding ? 0 : c.z));
    target.yaw = wrapAngle(hull.yaw + (holding ? 0 : c.yaw));
    target.visualPitch = hull.pitch + (holding ? 0 : c.pitch);
    target.visualRoll = hull.roll + (holding ? 0 : c.roll);
    target._susp.p = hull.suspP;
    target._susp.r = hull.suspR;
    target._swayEst = hull.sway;
    target.turretYaw = wrapAngle(live.turretYaw + c.turretYaw);
    target.gunPitch = live.gunPitch + c.gunPitch;
    target.trackScroll.l = live.trackL;
    target.trackScroll.r = live.trackR;
    target.speed = source.speed;
    target.verticalSpeed = source.verticalSpeed;
    target.grounded = source.grounded;
    target.overturned = source.overturned;
    target._body.tumbling = source._body.tumbling;
    target._body.autoRighting = source._body.autoRighting;
    target.landingImpactMps = source.landingImpactMps;
    target.slopeBlocked = source.slopeBlocked;
    target.yawRate = source.yawRate;
    target.turretYawRate = source.turretYawRate;
    target.bloomF = source.bloomF;
    target.atGunLimit = source.atGunLimit;
    target.gunLimitSpec = source.gunLimitSpec;
    target.suspensionAim = source.suspensionAim;
    target.suspensionAimPitch = source.suspensionAimPitch;
    target.aimPoint.copy(source.aimPoint);
    // Remember what is on screen: the next reconcile measures its error against this.
    capturePose(target, this.displayedPose);
    // The displayed layers are the ones just written; the composition above used the same values.
    this.stats.correctionM = holding ? 0 : Math.hypot(c.x, c.y, c.z);
  }

  /** Diagnostics snapshot (no allocation beyond the copy). */
  getStats(): PredictionStats { return { ...this.stats }; }

  /** A new socket or round: the next authority row seeds everything again. */
  reset(): void {
    this.initialized = false;
    this.terminal = false;
    this.currentTick = -1;
    this.poseRingTicks.fill(-1);
    this.lastAuthorityTick = -1;
    this.lastControl = null;
    this.motionIntent = false;
    this.holdingRest = false;
    this.contactSmoothingS = 0;
    this.hasDisplayed = false;
    this.clearCorrection();
  }
}
