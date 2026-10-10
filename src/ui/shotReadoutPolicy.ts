import { isRapidFireHit, weaponHitKind, type WeaponHitIdentity } from '../game/weaponHitKind.ts';
export interface ReadoutHit extends WeaponHitIdentity {
  readonly shellId?: number;
  readonly targetId: string;
  readonly attackerId?: string | null;
  readonly damage: number;
  readonly kind: string;
}
/** Automatic fire only replaces the main panel for a resolved penetration.
 * Module damage can have zero hull damage; use the event, not its UI label. */
export function shouldShowShotReadout(hit: WeaponHitIdentity & { kind?: string }): boolean {
  return !isRapidFireHit(hit) || hit.kind === 'pen' || hit.kind === 'he_pen';
}
/** One missile may report a direct hit plus many splash victims in the same tick. */
export function keepMissileDirectHit(current: ReadoutHit | null, next: ReadoutHit): boolean {
  return !!current && weaponHitKind(current) === 'missile' && weaponHitKind(next) === 'missile'
    && typeof current.shellId === 'number' && current.shellId === next.shellId
    && current.attackerId === next.attackerId && current.kind !== 'he_splash' && next.kind === 'he_splash';
}

/** Bounded missile blast receipts; damage remains distinct from the direct impact. */
export class MissileBlastLedger {
  private groups = new Map<string, { targets: Set<string>; damage: number }>();
  private key(hit: ReadoutHit): string | null {
    return weaponHitKind(hit) === 'missile' && typeof hit.shellId === 'number'
      ? `${hit.attackerId || ''}:${hit.shellId}` : null;
  }
  record(hit: ReadoutHit): void {
    const key = this.key(hit);
    if (!key || hit.kind !== 'he_splash') return;
    let group = this.groups.get(key);
    if (!group) {
      group = { targets: new Set(), damage: 0 }; this.groups.set(key, group);
      if (this.groups.size > 8) this.groups.delete(this.groups.keys().next().value!);
    }
    group.targets.add(hit.targetId); group.damage += Math.max(0, hit.damage);
  }
  get(hit: ReadoutHit): { targets: number; damage: number } | null {
    const key = this.key(hit), group = key ? this.groups.get(key) : null;
    return group ? { targets: group.targets.size, damage: group.damage } : null;
  }
  clear(): void { this.groups.clear(); }
}
