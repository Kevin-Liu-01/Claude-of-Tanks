/**
 * The versioned movement-integrator checkpoint the snapshot's viewer section
 * carries (`movementVersion`, `movementFlags`, `movementValues`). It restores
 * the dynamic state a pose alone cannot reconstruct — springs, ride, spool,
 * retained support — before the unacknowledged ticks are replayed, so the
 * replay forces the suspension exactly as the authority did. The layout is
 * version 2 of the checkpoint `src/sim/movementPredictionState.ts`
 * established (the server captures with either; the receipt proves parity),
 * with the same field order so a sim change moves both sides together.
 * Version 2 (impact physics, 2026-09-25) adds the terrain fit's pure
 * least-squares pitch, which the two-point settle now measures against.
 * Version 3 (bots lane, 2026-10-02) adds the roof a hull rests on
 * (`_body.restSupportY`, flag bit 10): the authority's contact pass seats a
 * hull that settled on another hull's roof every tick, and the client's replay
 * has no contact pass, so without it a hull resting on a wreck sank toward the
 * terrain in every replay and was pulled back up by every snapshot.
 * Version 4 (physics lane, 2026-10-03) adds the gravity tip of a hull whose centre of mass overhangs its loaded
 * track samples (`_terr.tipPitch`, `_terr.tipRoll`, 48 values): the attitude step reads it before the support solve
 * re-derives it, so a replay starting on an edge tipped like the authority only with it.
 * Version 5 (physics lane, 2026-10-03) appends, after the version-4 layout, the rebound a landing's springs still owe and
 * the landing stroke (`_ride.rebound`, `_ride.stroke`) and the weight-transfer share of the suspension rock (`_susp.d`,
 * `_susp.dv`), 52 values: the springs now take a landing at the stroke's damping and return its rebound as they extend,
 * and the tracks are seated without the dive, so a replay mid-landing or mid-stop needs them. A version-4 checkpoint (an
 * older authority) still decodes, as a hull with no landing or dive in progress.
 * Version 6 (physics lane round 3, 2026-10-03) appends the hull's highest track contact beside the seat (`_sup.top`,
 * 53 values): the springs carry a hull on uneven ground under its highest contact, and the ride reads both, so a replay
 * needs the pair. A version-5 or version-4 checkpoint (an older authority) still decodes, its top contact at its seat.
 * Version 7 (physics lane round 5, 2026-10-04) appends the posture a hull holds over its planted tracks on a grade and
 * its share seated with them off a whole-track seat (`_hold`, `_holdSeat`: pitch, roll and their rates, 61 values):
 * they are part of the hull's attitude beside the attitude spring, so a replay on a grade needs them. An older checkpoint
 * still decodes, holding none.
 * Version 8 (physics lane round 8, 2026-10-04) appends the share of the dive the bump stops took when the travel ran out
 * under it (`_susp.c`, `_susp.cv`, 63 values): it is part of the dive's stored value but no part of the dive the travel
 * holds, nor of what joins the rock off a whole-track seat, so a replay needs it to split the two as the authority does.
 * An older checkpoint still decodes, the stops holding nothing.
 */
import type { MovementContactGeometry, TankState } from '../../sim/movement.ts';

export const MOVEMENT_CHECKPOINT_VERSION = 8;

const SCALARS = ['yawRate', 'turretYawRate', 'suspensionAimPitch', 'bloomF',
  '_prevSpeed', '_spool', '_fanYield', '_perch', '_gunLimitHoldS', '_swayEst',
  'landingImpactMps', '_autoTraverse'] as const;
const SPRING = ['pitch', 'roll', 'pitchV', 'rollV', 'recoilVX', 'recoilVZ'] as const;
const ROCK = ['p', 'r', 'pv', 'rv'] as const;
const TERRAIN = ['pitch', 'roll', 'fitPitch', 'tipPitch', 'tipRoll'] as const;
const RIDE = ['y', 'v', 'groundV', 'airTime'] as const;
const TRACK = ['l', 'r'] as const;
const SUPPORT = ['yaw', 'pitch', 'roll', 'y', 'floorY'] as const;
const EXTRA_VALUES = 6;
const VERSION_4_VALUES = SCALARS.length + SPRING.length + TERRAIN.length + ROCK.length * 2 +
  RIDE.length + TRACK.length + SUPPORT.length + EXTRA_VALUES;
const RIDE_V5 = ['rebound', 'stroke'] as const;
const DIVE_V5 = ['d', 'dv'] as const;
const VERSION_5_VALUES = VERSION_4_VALUES + RIDE_V5.length + DIVE_V5.length;
const SUPPORT_V6 = ['top'] as const;
const VERSION_6_VALUES = VERSION_5_VALUES + SUPPORT_V6.length;
const VERSION_7_VALUES = VERSION_6_VALUES + ROCK.length * 2;
const STOP_V8 = ['c', 'cv'] as const;
export const MOVEMENT_CHECKPOINT_VALUES = VERSION_7_VALUES + STOP_V8.length;
const MAX_ABS_VALUE = 1_000_000;
const MAX_FLAGS = 2047;

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

export function validMovementValues(values: readonly number[], count = MOVEMENT_CHECKPOINT_VALUES): boolean {
  if (values.length !== count) return false;
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
  if (!validMovementValues(values)) return null;
  const flags = Number(supportInitialized) | Number(state._ride.grounded) << 1 |
    Number(state._body.tumbling) << 2 | Number(state._body.dynamicSupport) << 3 |
    Number(state._body.autoRighting) << 4 | Number(state._rollover.expired) << 5 |
    Number(state.atGunLimit) << 6 | Number(state.gunLimitSpec) << 7 |
    Number(cacheInitialized) << 8 | Number(state._sup.rigid) << 9 | Number(restInitialized) << 10;
  return { version: MOVEMENT_CHECKPOINT_VERSION, values, flags };
}

/**
 * Restore a checkpoint onto a state; false (and no change) when the layout is not the current version, version 7 (decoded
 * with nothing in the bump stops), version 6 (also holding no posture over its tracks), version 5 (also with its top
 * contact at its seat) or version 4 (also with no landing stroke or dive in progress), or a value is unsafe.
 */
export function applyMovementCheckpoint(
  state: TankState, checkpoint: MovementCheckpoint, contact: MovementContactGeometry | null = null,
): boolean {
  const count = checkpoint.version === MOVEMENT_CHECKPOINT_VERSION ? MOVEMENT_CHECKPOINT_VALUES
    : checkpoint.version === 7 ? VERSION_7_VALUES : checkpoint.version === 6 ? VERSION_6_VALUES
      : checkpoint.version === 5 ? VERSION_5_VALUES : checkpoint.version === 4 ? VERSION_4_VALUES : 0;
  if (!count || !validMovementValues(checkpoint.values, count) ||
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
  // the roof the hull rests on: no contact pass runs in the replay, so it holds until the next checkpoint clears it
  state._body.restSupportY = flags & 1024 ? values[offset + 5]! : NaN;
  if (count >= VERSION_5_VALUES) {
    offset = restore(state._ride, RIDE_V5, values, offset + 6);
    offset = restore(state._susp, DIVE_V5, values, offset);
  } else {
    state._ride.rebound = 0;
    state._ride.stroke = 0;
    state._susp.d = 0;
    state._susp.dv = 0;
  }
  // a checkpoint before version 6 has the top contact at the seat (the springs did not seat a hull under it)
  if (count >= VERSION_6_VALUES) offset = restore(state._sup, SUPPORT_V6, values, offset);
  else state._sup.top = state._sup.y;
  // a checkpoint before version 7 holds no posture over its tracks
  if (count >= VERSION_7_VALUES) {
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
  // a checkpoint before version 8 has nothing in the bump stops: its dive is the dive the travel holds
  if (count === MOVEMENT_CHECKPOINT_VALUES) restore(state._susp, STOP_V8, values, offset);
  else {
    state._susp.c = 0;
    state._susp.cv = 0;
  }
  return true;
}
