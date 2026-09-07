import type { RuntimeValue } from '../runtimeTypes.ts';
import type { MovementContactGeometry, TankState } from '../sim/movement.ts';

// Versioned, fixed-length viewer-only integrator checkpoint. Pose/combat stay
// in their existing authority lanes; this restores the dynamic state that a
// pose alone cannot reconstruct before replaying unacknowledged movement.
const SCALARS = ['yawRate', 'turretYawRate', 'suspensionAimPitch', 'bloomF',
  '_prevSpeed', '_spool', '_fanYield', '_perch', '_gunLimitHoldS', '_swayEst',
  'landingImpactMps'] as const;
const SPRING = ['pitch', 'roll', 'pitchV', 'rollV', 'recoilVX', 'recoilVZ'] as const;
const ROCK = ['p', 'r', 'pv', 'rv'] as const;
const TERRAIN = ['pitch', 'roll'] as const;
const RIDE = ['y', 'v', 'groundV', 'airTime'] as const;
const TRACK = ['l', 'r'] as const;
const SUPPORT = ['yaw', 'pitch', 'roll', 'y', 'floorY'] as const;
const VALUE_COUNT = SCALARS.length + SPRING.length + ROCK.length * 2 +
  TERRAIN.length + RIDE.length + TRACK.length + SUPPORT.length + 5;
const MAX_ABS_VALUE = 1_000_000;
const MAX_FLAGS = 1023;

export interface MovementPredictionState {
  version: 1;
  values: number[];
  flags: number;
}

function append<T, K extends keyof T>(out: number[], source: T, keys: readonly K[]): void {
  for (const key of keys) out.push(source[key] as number);
}

function restore<T, K extends keyof T>(
  target: T, keys: readonly K[], values: readonly number[], offset: number,
): number {
  for (const key of keys) target[key] = values[offset++] as T[K];
  return offset;
}

function finiteValues(values: RuntimeValue): values is number[] {
  if (!Array.isArray(values) || values.length !== VALUE_COUNT) return false;
  for (let index = 0; index < VALUE_COUNT; index++) {
    const value = values[index];
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        Math.abs(value) > MAX_ABS_VALUE) return false;
  }
  return true;
}

export function captureMovementPredictionState(state: TankState): MovementPredictionState | null {
  const values: number[] = [];
  append(values, state, SCALARS);
  append(values, state._spring, SPRING);
  append(values, state._terr, TERRAIN);
  append(values, state._susp, ROCK);
  append(values, state._flinch, ROCK);
  append(values, state._ride, RIDE);
  append(values, state.trackScroll, TRACK);
  append(values, state._sup, SUPPORT);
  const supportInitialized = Number.isFinite(state._ride.supportY);
  const cacheInitialized = Number.isFinite(state._sup.x) && Number.isFinite(state._sup.z);
  values.push(supportInitialized ? state._ride.supportY : 0,
    state._body.landingBlendS, state._rollover.elapsedS,
    cacheInitialized ? state._sup.x : 0, cacheInitialized ? state._sup.z : 0);
  if (!finiteValues(values)) return null;
  const flags = Number(supportInitialized) | Number(state._ride.grounded) << 1 |
    Number(state._body.tumbling) << 2 | Number(state._body.dynamicSupport) << 3 |
    Number(state._body.autoRighting) << 4 | Number(state._rollover.expired) << 5 |
    Number(state.atGunLimit) << 6 | Number(state.gunLimitSpec) << 7 |
    Number(cacheInitialized) << 8 | Number(state._sup.rigid) << 9;
  return { version: 1, values, flags };
}

export function applyMovementPredictionState(
  state: TankState, value: RuntimeValue, contact: MovementContactGeometry | null = null,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, RuntimeValue>;
  if (record.version !== 1 || !finiteValues(record.values) ||
      typeof record.flags !== 'number' || !Number.isInteger(record.flags) ||
      record.flags < 0 || record.flags > MAX_FLAGS) return false;
  const values = record.values;
  const flags = record.flags;
  let offset = restore(state, SCALARS, values, 0);
  offset = restore(state._spring, SPRING, values, offset);
  offset = restore(state._terr, TERRAIN, values, offset);
  offset = restore(state._susp, ROCK, values, offset);
  offset = restore(state._flinch, ROCK, values, offset);
  offset = restore(state._ride, RIDE, values, offset);
  offset = restore(state.trackScroll, TRACK, values, offset);
  offset = restore(state._sup, SUPPORT, values, offset);
  state._ride.supportY = flags & 1 ? values[offset] : NaN;
  state._body.landingBlendS = values[offset + 1];
  state._rollover.elapsedS = values[offset + 2];
  state._ride.grounded = !!(flags & 2);
  state._body.tumbling = !!(flags & 4);
  state._body.dynamicSupport = !!(flags & 8);
  state._body.autoRighting = !!(flags & 16);
  state._rollover.expired = !!(flags & 32);
  state.atGunLimit = !!(flags & 64);
  state.gunLimitSpec = !!(flags & 128);
  // The support solver deliberately reuses samples within a small pose
  // tolerance. That retained support is integrator state, not just a speed
  // optimization: resampling every snapshot changes the suspension forcing.
  // Transfer only its own numeric anchor; geometry remains a local reference.
  state._sup.x = flags & 256 ? values[offset + 3] : NaN;
  state._sup.z = flags & 256 ? values[offset + 4] : NaN;
  state._sup.rigid = !!(flags & 512);
  state._sup.cg = contact;
  return true;
}
