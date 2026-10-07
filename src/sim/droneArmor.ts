import { Vector3 } from 'three';
import { traceTank, tankPoseFromState, type ArmorIntersection } from './armor.ts';
import type { DamageShell, DamageTarget } from './damage.ts';

const direction = new Vector3(), end = new Vector3();

/** Only after airframe contact: a shaped-charge jet can cross the air gap and
 * reach armor beyond the drone's short movement sweep. Never extends flight. */
export function droneImpactTrace(shell: DamageShell, target: DamageTarget, hits: ArmorIntersection[]): ArmorIntersection[] {
  if (shell.spec.tracer !== 'DRONE' || !hits.length) return hits;
  direction.copy(shell.vel).normalize();
  if (direction.lengthSq() === 0) return hits;
  end.copy(hits[0]!.point).addScaledVector(direction, 2 * (target.spec.armor.boundingRadiusM ?? 5));
  return traceTank(shell.prevPos, end, tankPoseFromState(target.state), target.spec.armor,
    target.combat.eraSpent, true);
}
