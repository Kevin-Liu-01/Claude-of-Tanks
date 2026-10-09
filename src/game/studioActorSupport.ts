import {
  createTankState, resetTankVerticalState, updateTank, SIM_DT,
  type MovementEntity, type MovementHeightField,
} from '../sim/movement.ts';
import { structureTopAt } from '../sim/structureSupport.ts';
import type { CollisionRecord } from '../world/collision.ts';

/** Discard prior suspension history at replay start, retaining only explicit
 * authored hydraulic staging rather than the previous dynamic state. */
export function resetStudioActorSupport(actor: MovementEntity, hydraulicPitch: number | null): void {
  actor.state = createTankState(actor.spec, actor.state.pos, actor.state.yaw);
  if (hydraulicPitch !== null) {
    actor.state.suspensionAim = true;
    actor.state.suspensionAimPitch = hydraulicPitch;
  }
}

/** Timeline owns horizontal motion; the ordinary support solver owns height
 * and attitude. Center-height plus four corner samples cannot seat a chassis
 * on a crest or account for its authored contact geometry. */
export function conformStudioActor(
  actor: MovementEntity,
  terrain: MovementHeightField,
  dt: number,
  rigidGear = false,
): void {
  const state = actor.state, input = actor.input;
  const x = state.pos.x, z = state.pos.z, yaw = state.yaw;
  const speed = state.speed, yawRate = state.yawRate;
  const left = state.trackScroll.l, right = state.trackScroll.r;
  const turret = state.turretYaw, gun = state.gunPitch;
  const throttle = input.throttle, steer = input.steer, brake = input.brake;
  const aimLocked = input.aimLocked, priorRigid = actor.rigidGear;
  input.throttle = 0; input.steer = 0; input.brake = true; input.aimLocked = true;
  actor.rigidGear = rigidGear;
  if (!(dt > 0)) resetTankVerticalState(state, terrain.getHeightAt(x, z));
  try {
    const steps = dt > 0 ? 1 : 48;
    for (let step = 0; step < steps; step++) {
      state.pos.x = x; state.pos.z = z; state.yaw = yaw;
      state.speed = 0; state.yawRate = 0; state._prevSpeed = 0;
      updateTank(actor, terrain, dt > 0 ? dt : SIM_DT);
    }
  } finally {
    state.pos.x = x; state.pos.z = z; state.yaw = yaw;
    state.speed = speed; state.yawRate = yawRate; state._prevSpeed = 0;
    state.trackScroll.l = left; state.trackScroll.r = right;
    state.turretYaw = turret; state.gunPitch = gun;
    input.throttle = throttle; input.steer = steer; input.brake = brake;
    input.aimLocked = aimLocked; actor.rigidGear = priorRigid;
  }
}

/** Ride the deck, not the bed: a Studio hull staged over a bridge seats on the deck's standable top, while every
 * other primitive keeps the battle rule (only tops below the belly + step-up are stood on). Returns the belly line
 * to hand to the structure support field's beginHull. `records` may hold any primitives near (x, z). */
export function studioSupportBelly(
  records: readonly CollisionRecord[], x: number, z: number, bellyY: number,
  scratch: CollisionRecord[] = [],
): number {
  scratch.length = 0;
  for (const record of records) if (record.kind === 'bridge') scratch.push(record);
  if (!scratch.length) return bellyY;
  const deckTop = structureTopAt(scratch, scratch.length, x, z, Infinity);
  return deckTop === -Infinity ? bellyY : Math.max(bellyY, deckTop + STUDIO_DECK_BELLY_CLEARANCE_M);
}

/** Belly clearance above a deck top for the seating solve (the hull settles onto the deck from just above it). */
const STUDIO_DECK_BELLY_CLEARANCE_M = 0.25;
