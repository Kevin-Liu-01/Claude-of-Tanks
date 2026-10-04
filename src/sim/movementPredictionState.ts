import type { RuntimeValue } from '../runtimeTypes.ts';
import type { MovementContactGeometry, TankState } from './movement.ts';

// Versioned, fixed-length viewer-only integrator checkpoint. Pose/combat stay
// in their existing authority lanes; this restores the dynamic state that a
// pose alone cannot reconstruct before replaying unacknowledged movement.
const SCALARS = ['yawRate', 'turretYawRate', 'suspensionAimPitch', 'bloomF',
  '_prevSpeed', '_spool', '_fanYield', '_perch', '_gunLimitHoldS', '_swayEst',
  'landingImpactMps', '_autoTraverse'] as const;
const SPRING = ['pitch', 'roll', 'pitchV', 'rollV', 'recoilVX', 'recoilVZ'] as const;
const ROCK = ['p', 'r', 'pv', 'rv'] as const;
// version 2 (impact physics, 2026-09-25): the pure least-squares pitch the settle residuals are measured against
// version 4 (physics lane, 2026-10-03): the gravity tip of a hull overhanging its loaded contacts (_terr.tipPitch /
// tipRoll), which the attitude step reads before the support solve re-derives it
const TERRAIN = ['pitch', 'roll', 'fitPitch', 'tipPitch', 'tipRoll'] as const;
const RIDE = ['y', 'v', 'groundV', 'airTime'] as const;
const TRACK = ['l', 'r'] as const;
const SUPPORT = ['yaw', 'pitch', 'roll', 'y', 'floorY'] as const;
// version 3 (bots lane, 2026-10-02): the roof a hull rests on (`_body.restSupportY`, flag bit 10), which the client's
// replay cannot rebuild without the authority's contact pass
const VERSION_4_COUNT = SCALARS.length + SPRING.length + ROCK.length * 2 +
  TERRAIN.length + RIDE.length + TRACK.length + SUPPORT.length + 6;
// version 5 (physics lane, 2026-10-03), appended after the version-4 layout so a version-4 checkpoint still decodes
// (its landing at rest): the rebound a landing's springs still owe and the landing stroke (`_ride.rebound`,
// `_ride.stroke`), and the weight-transfer share of the suspension rock (`_susp.d`, `_susp.dv`), which the support
// solve seats the tracks without
const RIDE_V5 = ['rebound', 'stroke'] as const;
const DIVE_V5 = ['d', 'dv'] as const;
const VERSION_5_COUNT = VERSION_4_COUNT + RIDE_V5.length + DIVE_V5.length;
// version 6 (physics lane round 3, 2026-10-03), appended after the version-5 layout so a version-5 or version-4
// checkpoint still decodes (its top contact at its seat): the hull's highest track contact beside the seat
// (`_sup.top`), which the springs carry the hull under on uneven ground
const SUPPORT_V6 = ['top'] as const;
const VERSION_6_COUNT = VERSION_5_COUNT + SUPPORT_V6.length;
// version 7 (physics lane round 5, 2026-10-04), appended after the version-6 layout so an older checkpoint still decodes
// (holding no posture): the posture a hull holds over its planted tracks on a grade (`_hold`), which the support solve
// seats the tracks without, and its share seated with them off a whole-track seat (`_holdSeat`), both part of its attitude
const VERSION_7_COUNT = VERSION_6_COUNT + ROCK.length * 2;
// version 8 (physics lane round 8, 2026-10-04), appended after the version-7 layout so an older checkpoint still decodes
// (nothing in the bump stops): the share of the dive the bump stops took when the travel ran out under it (`_susp.c`,
// `_susp.cv`), stored with the dive but neither the dive the travel holds nor what joins the rock off a whole-track seat
const STOP_V8 = ['c', 'cv'] as const;
const VALUE_COUNT = VERSION_7_COUNT + STOP_V8.length;
const MAX_ABS_VALUE = 1_000_000;
const MAX_FLAGS = 2047;

interface MovementPredictionState {
  version: 8;
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

function finiteValues(values: RuntimeValue, count = VALUE_COUNT): values is number[] {
  if (!Array.isArray(values) || values.length !== count) return false;
  for (let index = 0; index < count; index++) {
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
  const restInitialized = Number.isFinite(state._body.restSupportY);
  values.push(supportInitialized ? state._ride.supportY : 0,
    state._body.landingBlendS, state._rollover.elapsedS,
    cacheInitialized ? state._sup.x : 0, cacheInitialized ? state._sup.z : 0,
    restInitialized ? state._body.restSupportY : 0);
  append(values, state._ride, RIDE_V5);
  append(values, state._susp, DIVE_V5);
  append(values, state._sup, SUPPORT_V6);
  append(values, state._hold, ROCK);
  append(values, state._holdSeat, ROCK);
  append(values, state._susp, STOP_V8);
  if (!finiteValues(values)) return null;
  const flags = Number(supportInitialized) | Number(state._ride.grounded) << 1 |
    Number(state._body.tumbling) << 2 | Number(state._body.dynamicSupport) << 3 |
    Number(state._body.autoRighting) << 4 | Number(state._rollover.expired) << 5 |
    Number(state.atGunLimit) << 6 | Number(state.gunLimitSpec) << 7 |
    Number(cacheInitialized) << 8 | Number(state._sup.rigid) << 9 | Number(restInitialized) << 10;
  return { version: 8, values, flags };
}

export function applyMovementPredictionState(
  state: TankState, value: RuntimeValue, contact: MovementContactGeometry | null = null,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, RuntimeValue>;
  const count = record.version === 8 ? VALUE_COUNT : record.version === 7 ? VERSION_7_COUNT
    : record.version === 6 ? VERSION_6_COUNT : record.version === 5 ? VERSION_5_COUNT
      : record.version === 4 ? VERSION_4_COUNT : 0;
  if (!count || !finiteValues(record.values, count) ||
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
  state._body.restSupportY = flags & 1024 ? values[offset + 5] : NaN;
  if (count >= VERSION_5_COUNT) {
    offset = restore(state._ride, RIDE_V5, values, offset + 6);
    offset = restore(state._susp, DIVE_V5, values, offset);
  } else {
    // a version-4 checkpoint predates the landing stroke and the dive: none in progress
    state._ride.rebound = 0;
    state._ride.stroke = 0;
    state._susp.d = 0;
    state._susp.dv = 0;
  }
  // a checkpoint before version 6 has the top contact at the seat
  if (count >= VERSION_6_COUNT) offset = restore(state._sup, SUPPORT_V6, values, offset);
  else state._sup.top = state._sup.y;
  // a checkpoint before version 7 holds no posture over its tracks
  if (count >= VERSION_7_COUNT) {
    offset = restore(state._hold, ROCK, values, offset);
    offset = restore(state._holdSeat, ROCK, values, offset);
  } else {
    for (const held of [state._hold, state._holdSeat]) {
      held.p = 0;
      held.r = 0;
      held.pv = 0;
      held.rv = 0;
    }
  }
  // a checkpoint before version 8 has nothing in the bump stops
  if (count === VALUE_COUNT) restore(state._susp, STOP_V8, values, offset);
  else {
    state._susp.c = 0;
    state._susp.cv = 0;
  }
  return true;
}
