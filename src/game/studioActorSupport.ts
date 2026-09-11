import {
  createTankState, resetTankVerticalState, updateTank, SIM_DT,
  type MovementEntity, type MovementHeightField,
} from '../sim/movement.ts';

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
