/**
 * An authority row onto a hull's simulation state: the client's predictor rewinds its own hull with it
 * (prediction.ts LocalPredictor.reconcile), a migrated host restores every hull from its keyframe or newest row with it
 * (migrationState.ts applyResumeState, round 2 U2), and the new host's resume hint seats a newer pose with its second half
 * (matchActor.ts receiveResumeHint, whole since round 3 A14). One copy, so every copy of a hull takes a row the same way.
 *
 * Its own module (round-two merge review, 2026-11-05): the two functions lived in prediction.ts, and the two authority
 * imports put the client predictor, its interpolator and the wire barrel (about 81 KB) into the host Worker's static
 * closure (src/mp/host/hostFleet.selftest.mjs). They need only the wire's dequantizers and the row's body bits.
 *
 * Pure state writes, Node-runnable, no allocation.
 */
import type { TankState } from '../../sim/movement.ts';
import type { EntityRow } from '../wire/messages.ts';
import { dequantizeAngle, dequantizePosition, dequantizeVelocity } from '../wire/quantize.ts';
import { applyHullBodyRowFlags } from './hullBodyRow.ts';

/**
 * What a hull's authority row and a migrated host's resume hint both carry (round 3 A14: the hint carries the row's body
 * bits too, ResumeHintMessage.flags; absent: 0, a hull on the ground, upright).
 */
export type AuthorityPose = Pick<EntityRow, 'x' | 'y' | 'z' | 'yaw' | 'speed' | 'verticalSpeed' | 'pitch' | 'roll' | 'turretYaw' | 'gunPitch'>
  & { flags?: number };

/**
 * The authority row's pose and body flags onto the simulation state (the predictor's checkpoint refines the integrator).
 * The pose alone left a migrated host's ground contact, body mode, spring and ride under it, so an airborne hull fell from
 * its old ride height or snapped to the ground on the first step, and one on its side or roof came back supported.
 */
export function applyAuthorityRow(state: TankState, row: AuthorityPose): void {
  state.pos.set(dequantizePosition(row.x), dequantizePosition(row.y), dequantizePosition(row.z));
  state.yaw = dequantizeAngle(row.yaw);
  state.speed = dequantizeVelocity(row.speed);
  state.verticalSpeed = dequantizeVelocity(row.verticalSpeed);
  state.visualPitch = dequantizeAngle(row.pitch);
  state.visualRoll = dequantizeAngle(row.roll);
  state.turretYaw = dequantizeAngle(row.turretYaw);
  state.gunPitch = dequantizeAngle(row.gunPitch);
  // ground contact and the body mode, the rigid phase itself included (wire 10, hullBodyRow.ts); the viewer checkpoint
  // restores them again right after (prediction.ts restoreCheckpoint)
  applyHullBodyRowFlags(state, row.flags ?? 0);
  reseatAuthorityBody(state);
}

/**
 * The integrator's own copies seated on the pose and speeds just written (applyAuthorityRow; a migrated host's resume
 * hint, matchActor.ts receiveResumeHint, round 2 U2 review round 1: the hint wrote a newer pose over the restored row and
 * left this row's spring and ride under it, so a hull the hint had landed flew back up to the row's height).
 */
export function reseatAuthorityBody(state: TankState): void {
  state._prevSpeed = state.speed;
  // the row's attitude is the spring's plus the posture held over the tracks (movement.ts state._hold, _holdSeat), which
  // the checkpoint restores with the spring; without one, the posture the replay holds now stands in for the authority's
  state._spring.pitch = state.visualPitch - (state._hold?.p ?? 0) - (state._holdSeat?.p ?? 0);
  state._spring.roll = state.visualRoll - (state._hold?.r ?? 0) - (state._holdSeat?.r ?? 0);
  state._ride.y = state.pos.y;
  state._ride.v = state.verticalSpeed;
  state._ride.airTime = 0;
  // The first replay tick re-establishes terrain support at the authority pose.
  state._ride.supportY = NaN;
}
