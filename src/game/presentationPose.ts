import type { RuntimeValue } from '../runtimeTypes.ts';
/**
 * Allocation-free render interpolation for fixed-step solo tank states.
 *
 * Authority remains at 60 Hz. The renderer consumes the pose between the two
 * most recently completed simulation ticks, which trades one fixed step of
 * presentation latency for uniform motion at every display refresh rate.
 */
import { Vector3 } from 'three';

const POSITION_SNAP_M_SQ = 2.5 * 2.5;
const ANGLE_SNAP_RAD = Math.PI * 0.75;

interface PoseVector {
  x?: number;
  y?: number;
  z?: number;
}

interface PoseTrackScroll {
  l?: number;
  r?: number;
}

interface PoseSpring {
  p?: number;
  r?: number;
  pv?: number;
  rv?: number;
}

export interface TankPoseSource {
  pos?: PoseVector;
  yaw?: number;
  speed?: number;
  verticalSpeed?: number;
  grounded?: boolean;
  yawRate?: number;
  visualPitch?: number;
  visualRoll?: number;
  turretYaw?: number;
  gunPitch?: number;
  trackScroll?: PoseTrackScroll;
  _swayEst?: number;
  _susp?: PoseSpring;
  _flinch?: PoseSpring;
}

interface MutableTrackScroll {
  l: number;
  r: number;
}

interface MutableSpring {
  p: number;
  r: number;
  pv: number;
  rv: number;
}

export interface TankPresentationSample {
  pos: Vector3;
  yaw: number;
  speed: number;
  verticalSpeed: number;
  grounded: boolean;
  yawRate: number;
  visualPitch: number;
  visualRoll: number;
  turretYaw: number;
  gunPitch: number;
  trackScroll: MutableTrackScroll;
  _swayEst: number;
  _susp: MutableSpring;
  _flinch: MutableSpring;
}

export interface TankPresentationTracker {
  initialized: boolean;
  previous: TankPresentationSample;
  current: TankPresentationSample;
  pose: TankPresentationSample;
}

function finite(value: RuntimeValue, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  else if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function createSample(): TankPresentationSample {
  return {
    pos: new Vector3(),
    yaw: 0,
    speed: 0,
    verticalSpeed: 0,
    grounded: true,
    yawRate: 0,
    visualPitch: 0,
    visualRoll: 0,
    turretYaw: 0,
    gunPitch: 0,
    trackScroll: { l: 0, r: 0 },
    _swayEst: 0,
    _susp: { p: 0, r: 0, pv: 0, rv: 0 },
    _flinch: { p: 0, r: 0, pv: 0, rv: 0 },
  };
}

function readSample(
  out: TankPresentationSample,
  state: TankPoseSource | null | undefined,
): TankPresentationSample {
  out.pos.x = finite(state?.pos?.x);
  out.pos.y = finite(state?.pos?.y);
  out.pos.z = finite(state?.pos?.z);
  out.yaw = finite(state?.yaw);
  out.speed = finite(state?.speed);
  out.verticalSpeed = finite(state?.verticalSpeed);
  out.grounded = state?.grounded !== false;
  out.yawRate = finite(state?.yawRate);
  out.visualPitch = finite(state?.visualPitch);
  out.visualRoll = finite(state?.visualRoll);
  out.turretYaw = finite(state?.turretYaw);
  out.gunPitch = finite(state?.gunPitch);
  out.trackScroll.l = finite(state?.trackScroll?.l);
  out.trackScroll.r = finite(state?.trackScroll?.r);
  out._swayEst = finite(state?._swayEst);
  out._susp.p = finite(state?._susp?.p);
  out._susp.r = finite(state?._susp?.r);
  out._susp.pv = finite(state?._susp?.pv);
  out._susp.rv = finite(state?._susp?.rv);
  out._flinch.p = finite(state?._flinch?.p);
  out._flinch.r = finite(state?._flinch?.r);
  out._flinch.pv = finite(state?._flinch?.pv);
  out._flinch.rv = finite(state?._flinch?.rv);
  return out;
}

function copySample(
  out: TankPresentationSample,
  source: TankPresentationSample,
): TankPresentationSample {
  out.pos.x = source.pos.x;
  out.pos.y = source.pos.y;
  out.pos.z = source.pos.z;
  out.yaw = source.yaw;
  out.speed = source.speed;
  out.verticalSpeed = source.verticalSpeed;
  out.grounded = source.grounded;
  out.yawRate = source.yawRate;
  out.visualPitch = source.visualPitch;
  out.visualRoll = source.visualRoll;
  out.turretYaw = source.turretYaw;
  out.gunPitch = source.gunPitch;
  out.trackScroll.l = source.trackScroll.l;
  out.trackScroll.r = source.trackScroll.r;
  out._swayEst = source._swayEst;
  out._susp.p = source._susp.p;
  out._susp.r = source._susp.r;
  out._susp.pv = source._susp.pv;
  out._susp.rv = source._susp.rv;
  out._flinch.p = source._flinch.p;
  out._flinch.r = source._flinch.r;
  out._flinch.pv = source._flinch.pv;
  out._flinch.rv = source._flinch.rv;
  return out;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpSample(
  out: TankPresentationSample,
  previous: TankPresentationSample,
  current: TankPresentationSample,
  alpha: number,
): TankPresentationSample {
  const t = Math.max(0, Math.min(1, finite(alpha, 1)));
  out.pos.x = lerp(previous.pos.x, current.pos.x, t);
  out.pos.y = lerp(previous.pos.y, current.pos.y, t);
  out.pos.z = lerp(previous.pos.z, current.pos.z, t);
  out.yaw = previous.yaw + angleDelta(previous.yaw, current.yaw) * t;
  out.speed = lerp(previous.speed, current.speed, t);
  out.verticalSpeed = lerp(previous.verticalSpeed, current.verticalSpeed, t);
  out.grounded = t < 0.5 ? previous.grounded : current.grounded;
  out.yawRate = lerp(previous.yawRate, current.yawRate, t);
  out.visualPitch = lerp(previous.visualPitch, current.visualPitch, t);
  out.visualRoll = lerp(previous.visualRoll, current.visualRoll, t);
  out.turretYaw = previous.turretYaw + angleDelta(previous.turretYaw, current.turretYaw) * t;
  out.gunPitch = lerp(previous.gunPitch, current.gunPitch, t);
  out.trackScroll.l = lerp(previous.trackScroll.l, current.trackScroll.l, t);
  out.trackScroll.r = lerp(previous.trackScroll.r, current.trackScroll.r, t);
  out._swayEst = lerp(previous._swayEst, current._swayEst, t);
  out._susp.p = lerp(previous._susp.p, current._susp.p, t);
  out._susp.r = lerp(previous._susp.r, current._susp.r, t);
  out._susp.pv = lerp(previous._susp.pv, current._susp.pv, t);
  out._susp.rv = lerp(previous._susp.rv, current._susp.rv, t);
  out._flinch.p = lerp(previous._flinch.p, current._flinch.p, t);
  out._flinch.r = lerp(previous._flinch.r, current._flinch.r, t);
  out._flinch.pv = lerp(previous._flinch.pv, current._flinch.pv, t);
  out._flinch.rv = lerp(previous._flinch.rv, current._flinch.rv, t);
  return out;
}

export function createTankPresentationPose(
  state: TankPoseSource | null = null,
): TankPresentationTracker {
  const tracker = {
    initialized: false,
    previous: createSample(),
    current: createSample(),
    pose: createSample(),
  };
  if (state) resetTankPresentationPose(tracker, state);
  return tracker;
}

export function resetTankPresentationPose(
  tracker: TankPresentationTracker | null | undefined,
  state: TankPoseSource | null | undefined,
): TankPresentationSample | null {
  if (!tracker || !state) return null;
  readSample(tracker.current, state);
  copySample(tracker.previous, tracker.current);
  copySample(tracker.pose, tracker.current);
  tracker.initialized = true;
  return tracker.pose;
}

/** Capture one newly completed authority tick. */
export function advanceTankPresentationPose(
  tracker: TankPresentationTracker,
  state: TankPoseSource,
): TankPresentationSample | null {
  if (!tracker?.initialized) return resetTankPresentationPose(tracker, state);
  copySample(tracker.previous, tracker.current);
  readSample(tracker.current, state);
  const dx = tracker.current.pos.x - tracker.previous.pos.x;
  const dy = tracker.current.pos.y - tracker.previous.pos.y;
  const dz = tracker.current.pos.z - tracker.previous.pos.z;
  const teleported = dx * dx + dy * dy + dz * dz > POSITION_SNAP_M_SQ
    || Math.abs(angleDelta(tracker.previous.yaw, tracker.current.yaw)) > ANGLE_SNAP_RAD;
  if (teleported) copySample(tracker.previous, tracker.current);
  return tracker.current;
}

/** Return the stable, reused pose object for the current render fraction. */
export function sampleTankPresentationPose(
  tracker: TankPresentationTracker,
  state: TankPoseSource,
  alpha: number,
): TankPresentationSample {
  if (!tracker?.initialized) resetTankPresentationPose(tracker, state);
  return lerpSample(tracker.pose, tracker.previous, tracker.current, alpha);
}
