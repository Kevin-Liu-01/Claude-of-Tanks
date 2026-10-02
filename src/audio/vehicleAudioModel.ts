/**
 * Per-vehicle audio state machine: turns the simulated hull (speed, yaw rate,
 * throttle, brake, ground contact, damage) into the quantities the vehicle
 * rig plays — engine RPM and load, the simulated gearbox, track speed, pivot
 * scrub, brake and skid — plus the discrete events (gear shifts, brake
 * squeals, landings, bumps, stalls, restarts).
 *
 * Pure and allocation-free per tick: `stepVehicleAudio` mutates the state it
 * is given and writes events into a caller-owned, reused buffer.
 */

import { clamp, smoothingAlpha } from './audioMath.ts';
import type { EngineFamilyProfile } from './vehicleAudioProfiles.ts';

export type SurfaceId = 'earth' | 'hard' | 'sand' | 'snow' | 'mud' | 'water';

export type ModuleHealth = 'ok' | 'yellow' | 'red';

/** One tick of simulated hull state, read straight off the entity. */
export interface VehicleAudioInput {
  dtS: number;
  /** Signed hull speed, m/s (negative = reversing). */
  speedMps: number;
  topSpeedMps: number;
  reverseTopMps: number;
  throttle: number;
  brake: boolean;
  yawRate: number;
  grounded: boolean;
  verticalSpeedMps: number;
  landingImpactMps: number;
  gripLost: boolean;
  engine: ModuleHealth;
  /** A red track: the hull cannot drive, the run lies on the ground. */
  immobilized: boolean;
}

type VehicleAudioEventType =
  | 'shiftUp' | 'shiftDown' | 'brakeSqueal' | 'land' | 'bump'
  | 'stall' | 'restart' | 'skidStart';

interface VehicleAudioEvent {
  type: VehicleAudioEventType;
  /** 0..1 */
  strength: number;
}

interface VehicleAudioEvents {
  readonly items: VehicleAudioEvent[];
  count: number;
}

export function createVehicleAudioEvents(capacity = 8): VehicleAudioEvents {
  const items: VehicleAudioEvent[] = [];
  for (let i = 0; i < capacity; i++) items.push({ type: 'bump', strength: 0 });
  return { items, count: 0 };
}

function pushEvent(events: VehicleAudioEvents, type: VehicleAudioEventType, strength: number): void {
  if (events.count >= events.items.length) return;
  const slot = events.items[events.count++];
  slot.type = type;
  slot.strength = clamp(strength, 0, 1);
}

export interface VehicleAudioState {
  /** Normalised engine speed: idleRpm..1. */
  rpm: number;
  /** Engine load 0..1 (drives brightness and level). */
  load: number;
  /** 0 neutral, 1..n forward, -1 reverse. */
  gear: number;
  /** Seconds left in the current shift dip. */
  shiftS: number;
  /** Seconds before the gearbox may shift again (no hunting between two gears). */
  gearHoldS: number;
  /** Mean track surface speed, m/s (absolute). */
  trackMps: number;
  /** Pivot / turning scrub 0..1. */
  scrub: number;
  /** Braking intensity 0..1. */
  brake: number;
  /** Sliding (locked tracks or lost grip) 0..1. */
  skid: number;
  running: boolean;
  /** Misfire roughness 0..1 from a damaged engine. */
  rough: number;
  airborne: boolean;
  lastVerticalMps: number;
  lastSpeedMps: number;
  brakeCooldownS: number;
  bumpCooldownS: number;
  skidActive: boolean;
}

export function createVehicleAudioState(profile: EngineFamilyProfile): VehicleAudioState {
  return {
    rpm: profile.idleRpm, load: 0.1, gear: 0, shiftS: 0, gearHoldS: 0, trackMps: 0, scrub: 0,
    brake: 0, skid: 0, running: true, rough: 0, airborne: false,
    lastVerticalMps: 0, lastSpeedMps: 0, brakeCooldownS: 0, bumpCooldownS: 0, skidActive: false,
  };
}

/** Track arm used by the simulation's differential: v ± yawRate × 1.5 m. */
const TRACK_ARM_M = 1.5;

/** Upper speed fraction of each simulated forward gear (top gear ends at 1). */
function gearTop(gear: number, gears: number): number {
  return Math.pow(gear / gears, 1.18);
}

function gearRpm(speedFrac: number, gear: number, gears: number, idle: number): number {
  const hi = gearTop(gear, gears);
  const lo = gear > 1 ? gearTop(gear - 1, gears) * 0.92 : 0;
  const t = clamp((speedFrac - lo) / Math.max(0.02, hi - lo), 0, 1);
  return idle + (1 - idle) * (0.38 + 0.62 * t);
}

/**
 * Advance one vehicle by one presentation tick. `events.count` is reset; read
 * `events.items[0 .. count)` afterwards.
 */
export function stepVehicleAudio(
  state: VehicleAudioState,
  profile: EngineFamilyProfile,
  input: VehicleAudioInput,
  events: VehicleAudioEvents,
): VehicleAudioState {
  events.count = 0;
  const dt = clamp(input.dtS, 0, 0.1);
  const speed = input.speedMps;
  const absSpeed = Math.abs(speed);
  const top = Math.max(1, speed >= 0 ? input.topSpeedMps : input.reverseTopMps || input.topSpeedMps * 0.4);
  const speedFrac = clamp(absSpeed / top, 0, 1);
  const demand = clamp(Math.abs(input.throttle), 0, 1);
  state.brakeCooldownS = Math.max(0, state.brakeCooldownS - dt);
  state.bumpCooldownS = Math.max(0, state.bumpCooldownS - dt);
  state.gearHoldS = Math.max(0, state.gearHoldS - dt);

  // ---- engine running state: a red engine stalls, a repair restarts it.
  const shouldRun = input.engine !== 'red';
  if (state.running && !shouldRun) {
    state.running = false;
    pushEvent(events, 'stall', 1);
  } else if (!state.running && shouldRun) {
    state.running = true;
    pushEvent(events, 'restart', 1);
  }
  const roughTarget = input.engine === 'yellow' ? 0.65 : input.engine === 'red' ? 1 : 0;
  state.rough += (roughTarget - state.rough) * smoothingAlpha(dt, 0.6);

  // ---- RPM and gearbox.
  let targetRpm: number;
  if (!state.running) {
    targetRpm = 0;
  } else if (profile.turbine) {
    // N2 follows demand far more than road speed; the turbine is never lugged.
    targetRpm = profile.idleRpm + (1 - profile.idleRpm) * Math.max(demand * 0.94, speedFrac * 0.72);
  } else if (profile.gears <= 0) {
    targetRpm = profile.idleRpm + (1 - profile.idleRpm) * Math.max(demand * 0.7, speedFrac * 0.9);
  } else {
    const gears = profile.gears;
    if (speed < -0.3) {
      state.gear = -1;
    } else if (state.gear <= 0) {
      state.gear = absSpeed > 0.4 || demand > 0.05 ? 1 : 0;
    }
    if (state.gear >= 1) {
      const manual = profile.shift === 'manual';
      const rpmNow = gearRpm(speedFrac, state.gear, gears, profile.idleRpm);
      // Upshift near the governor; downshift well below the lower gear's top
      // (a wide band plus a hold time, so a tank crawling at a shift point
      // never hunts), except a kick-down when the hull nearly stops.
      const lowerTop = state.gear > 1 ? gearTop(state.gear - 1, gears) : 0;
      if (state.gear < gears && rpmNow > 0.95 && demand > 0.15 && state.shiftS <= 0 && state.gearHoldS <= 0) {
        state.gear++;
        state.shiftS = manual ? 0.24 : 0.13;
        state.gearHoldS = manual ? 1.1 : 0.8;
        pushEvent(events, 'shiftUp', manual ? 0.9 : 0.45);
      } else if (state.gear > 1 && speedFrac < lowerTop * 0.72 && state.shiftS <= 0
        && (state.gearHoldS <= 0 || speedFrac < lowerTop * 0.4)) {
        state.gear--;
        state.shiftS = manual ? 0.2 : 0.11;
        state.gearHoldS = manual ? 0.8 : 0.6;
        pushEvent(events, 'shiftDown', manual ? 0.7 : 0.3);
      }
    }
    if (state.gear === 0) {
      targetRpm = profile.idleRpm + (1 - profile.idleRpm) * demand * 0.45;
    } else if (state.gear < 0) {
      targetRpm = profile.idleRpm + (1 - profile.idleRpm) * (0.3 + 0.55 * speedFrac) * Math.max(demand, 0.4);
    } else {
      const inGear = gearRpm(speedFrac, state.gear, gears, profile.idleRpm);
      // Clutch slip from a standstill: the engine leads the hull.
      const launch = state.gear === 1 && speedFrac < 0.12 ? demand * 0.35 : 0;
      targetRpm = demand > 0.05 ? Math.max(inGear, profile.idleRpm + launch)
        : Math.max(profile.idleRpm, inGear * 0.86);
    }
    if (state.shiftS > 0) {
      state.shiftS = Math.max(0, state.shiftS - dt);
      targetRpm *= 0.86;
    }
  }
  const tau = targetRpm > state.rpm ? profile.spoolUpS : profile.spoolDownS;
  state.rpm += (targetRpm - state.rpm) * smoothingAlpha(dt, tau);

  // ---- load: throttle against the hull, more on a climb, none on the brake.
  const climbing = input.grounded && input.verticalSpeedMps > 0.35 && absSpeed > 1 ? 0.22 : 0;
  const loadTarget = !state.running ? 0
    : input.brake ? 0.08
      : demand > 0.05 ? clamp(0.5 + 0.42 * demand * (1 - 0.35 * speedFrac) + climbing, 0, 1)
        : 0.12;
  state.load += (loadTarget - state.load) * smoothingAlpha(dt, 0.12);

  // ---- running gear.
  const left = speed + input.yawRate * TRACK_ARM_M;
  const right = speed - input.yawRate * TRACK_ARM_M;
  state.trackMps = input.immobilized ? 0 : (Math.abs(left) + Math.abs(right)) * 0.5;
  const differential = Math.abs(left - right);
  const pivot = absSpeed < 2.5 ? 1 : 0.55;
  const scrubTarget = input.immobilized || !input.grounded ? 0 : clamp((differential - 0.45) / 2.6, 0, 1) * pivot;
  state.scrub += (scrubTarget - state.scrub) * smoothingAlpha(dt, 0.1);

  // ---- brake and skid.
  const decel = dt > 0 ? (Math.abs(state.lastSpeedMps) - absSpeed) / dt : 0;
  const braking = absSpeed > 1.2 && (input.brake || decel > 3.2 || (input.throttle * speed < -0.5 && decel > 1.5));
  const brakeTarget = braking ? clamp(0.35 + decel / 9, 0.35, 1) : 0;
  if (brakeTarget > 0.4 && state.brake < 0.2 && state.brakeCooldownS <= 0 && absSpeed > 2.8) {
    pushEvent(events, 'brakeSqueal', clamp(absSpeed / 12, 0.3, 1));
    state.brakeCooldownS = 1.6;
  }
  state.brake += (brakeTarget - state.brake) * smoothingAlpha(dt, brakeTarget > state.brake ? 0.05 : 0.22);
  const skidTarget = input.grounded && absSpeed > 1.5 ? Math.max(input.gripLost ? 0.9 : 0, state.brake > 0.6 ? (state.brake - 0.6) * 2 : 0) : 0;
  state.skid += (skidTarget - state.skid) * smoothingAlpha(dt, 0.08);
  if (state.skid > 0.35 && !state.skidActive) {
    state.skidActive = true;
    pushEvent(events, 'skidStart', state.skid);
  } else if (state.skid < 0.15) {
    state.skidActive = false;
  }

  // ---- ground contact: landings and bumps.
  if (!input.grounded) {
    state.airborne = true;
  } else if (state.airborne) {
    state.airborne = false;
    const impact = Math.max(input.landingImpactMps, -state.lastVerticalMps);
    if (impact > 2.2) pushEvent(events, 'land', (impact - 2.2) / 8);
  } else if (state.bumpCooldownS <= 0 && absSpeed > 2) {
    const jolt = Math.abs(input.verticalSpeedMps - state.lastVerticalMps);
    if (jolt > 1.1) {
      pushEvent(events, 'bump', (jolt - 1.1) / 3);
      state.bumpCooldownS = 0.35;
    }
  }
  state.lastVerticalMps = input.verticalSpeedMps;
  state.lastSpeedMps = speed;
  return state;
}
