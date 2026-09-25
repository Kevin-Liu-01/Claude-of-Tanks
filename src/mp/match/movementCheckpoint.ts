/**
 * The versioned movement-integrator checkpoint the snapshot's viewer section
 * carries (`movementVersion`, `movementFlags`, `movementValues`). It restores
 * the dynamic state a pose alone cannot reconstruct — springs, ride, spool,
 * retained support — before the unacknowledged ticks are replayed, so the
 * replay forces the suspension exactly as the authority did. The layout is
 * version 1 of the checkpoint `src/net/movementPredictionState.ts`
 * established (the server captures with either; the receipt proves parity),
 * with the same field order so a sim change moves both sides together.
 */
import type { MovementContactGeometry, TankState } from '../../sim/movement.ts';

export const MOVEMENT_CHECKPOINT_VERSION = 1;

const SCALARS = ['yawRate', 'turretYawRate', 'suspensionAimPitch', 'bloomF',
  '_prevSpeed', '_spool', '_fanYield', '_perch', '_gunLimitHoldS', '_swayEst',
  'landingImpactMps', '_autoTraverse'] as const;
const SPRING = ['pitch', 'roll', 'pitchV', 'rollV', 'recoilVX', 'recoilVZ'] as const;
const ROCK = ['p', 'r', 'pv', 'rv'] as const;
const TERRAIN = ['pitch', 'roll'] as const;
const RIDE = ['y', 'v', 'groundV', 'airTime'] as const;
const TRACK = ['l', 'r'] as const;
const SUPPORT = ['yaw', 'pitch', 'roll', 'y', 'floorY'] as const;
const EXTRA_VALUES = 5;
export const MOVEMENT_CHECKPOINT_VALUES = SCALARS.length + SPRING.length + TERRAIN.length + ROCK.length * 2 +
  RIDE.length + TRACK.length + SUPPORT.length + EXTRA_VALUES;
const MAX_ABS_VALUE = 1_000_000;
const MAX_FLAGS = 1023;

export interface MovementCheckpoint {
  version: number;
  values: number[];
  flags: number;
}

function append<T, K extends keyof T>(out: number[], source: T, keys: readonly K[]): void {
  for (const key of keys) out.push(source[key] as number);
}

function restore<T, K extends keyof T>(target: T, keys: readonly K[], values: readonly number[], offset: number): number {
  for (const key of keys) target[key] = values[offset++] as T[K];
  return offset;
}

export function validMovementValues(values: readonly number[]): boolean {
  if (values.length !== MOVEMENT_CHECKPOINT_VALUES) return false;
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_ABS_VALUE) return false;
  }
  return true;
}

/** Capture the checkpoint (the scripted server fixture and the receipts use it; the real server captures the same layout). */
export function captureMovementCheckpoint(state: TankState): MovementCheckpoint | null {
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
  if (!validMovementValues(values)) return null;
  const flags = Number(supportInitialized) | Number(state._ride.grounded) << 1 |
    Number(state._body.tumbling) << 2 | Number(state._body.dynamicSupport) << 3 |
    Number(state._body.autoRighting) << 4 | Number(state._rollover.expired) << 5 |
    Number(state.atGunLimit) << 6 | Number(state.gunLimitSpec) << 7 |
    Number(cacheInitialized) << 8 | Number(state._sup.rigid) << 9;
  return { version: MOVEMENT_CHECKPOINT_VERSION, values, flags };
}

/** Restore a checkpoint onto a state; false (and no change) when the layout is not version 1 or a value is unsafe. */
export function applyMovementCheckpoint(
  state: TankState, checkpoint: MovementCheckpoint, contact: MovementContactGeometry | null = null,
): boolean {
  if (checkpoint.version !== MOVEMENT_CHECKPOINT_VERSION || !validMovementValues(checkpoint.values) ||
      !Number.isInteger(checkpoint.flags) || checkpoint.flags < 0 || checkpoint.flags > MAX_FLAGS) return false;
  const { values, flags } = checkpoint;
  let offset = restore(state, SCALARS, values, 0);
  offset = restore(state._spring, SPRING, values, offset);
  offset = restore(state._terr, TERRAIN, values, offset);
  offset = restore(state._susp, ROCK, values, offset);
  offset = restore(state._flinch, ROCK, values, offset);
  offset = restore(state._ride, RIDE, values, offset);
  offset = restore(state.trackScroll, TRACK, values, offset);
  offset = restore(state._sup, SUPPORT, values, offset);
  state._ride.supportY = flags & 1 ? values[offset]! : NaN;
  state._body.landingBlendS = values[offset + 1]!;
  state._rollover.elapsedS = values[offset + 2]!;
  state._ride.grounded = !!(flags & 2);
  state._body.tumbling = !!(flags & 4);
  state._body.dynamicSupport = !!(flags & 8);
  state._body.autoRighting = !!(flags & 16);
  state._rollover.expired = !!(flags & 32);
  state.atGunLimit = !!(flags & 64);
  state.gunLimitSpec = !!(flags & 128);
  // The retained support anchor is integrator state (resampling every snapshot
  // changes the suspension forcing); the geometry stays a local reference.
  state._sup.x = flags & 256 ? values[offset + 3]! : NaN;
  state._sup.z = flags & 256 ? values[offset + 4]! : NaN;
  state._sup.rigid = !!(flags & 512);
  state._sup.cg = contact;
  return true;
}
