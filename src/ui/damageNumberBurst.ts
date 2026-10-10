import { isRapidFireHit, type WeaponHitIdentity } from '../game/weaponHitKind.ts';
export interface DamageNumberHit extends WeaponHitIdentity {
  targetId?: string | null;
  attackerId?: string | null;
  damage: number;
  modulesHit?: readonly { newState?: string }[];
  crewHit?: readonly string[];
}
export interface DamageNumberBurst {
  latest: DamageNumberHit;
  damage: number;
  critical: boolean;
  at: number;
}
export const DAMAGE_BURST_GAP_MS = 900;
export function canAccumulateDamage(burst: DamageNumberBurst, hit: DamageNumberHit, now: number): boolean {
  const previous = burst.latest;
  return isRapidFireHit(hit) && isRapidFireHit(previous) && !!hit.targetId
    && hit.targetId === previous.targetId && hit.attackerId === previous.attackerId
    && hit.caliberMm === previous.caliberMm && hit.shellName === previous.shellName
    && hit.shellType === previous.shellType && now >= burst.at && now - burst.at <= DAMAGE_BURST_GAP_MS;
}
export function accumulateDamage(
  previous: DamageNumberBurst | undefined, hit: DamageNumberHit, now: number,
): DamageNumberBurst | null {
  if (!Number.isFinite(hit.damage) || hit.damage <= 0) return null;
  const burst = previous && canAccumulateDamage(previous, hit, now)
    ? previous : { latest: hit, damage: 0, critical: false, at: now };
  burst.latest = hit;
  burst.damage += hit.damage;
  burst.critical ||= !!(hit.modulesHit?.length || hit.crewHit?.length);
  burst.at = now;
  return burst;
}
