/** Resolved-event identity shared by medals and readouts; no fleet or UI imports. */
export interface WeaponHitIdentity {
  readonly caliberMm?: number;
  readonly guided?: boolean;
  readonly shellName?: string;
  readonly shellType?: string;
}
export type WeaponHitKind = 'machineGun' | 'missile' | 'cannon';
export function weaponHitKind(hit: WeaponHitIdentity): WeaponHitKind {
  if (hit.guided === true || hit.shellType === 'ATGM') return 'missile';
  // 20 mm and larger are cannons, including IFV primary autocannons.
  if (Number.isFinite(hit.caliberMm) && hit.caliberMm! > 0 && hit.caliberMm! < 20) return 'machineGun';
  return 'cannon';
}

/** Small-calibre automatic weapons share burst feedback. Keep this separate
 * from medal identity: autocannons still count as cannons, not machine guns. */
export function isRapidFireHit(hit: WeaponHitIdentity): boolean {
  return weaponHitKind(hit) !== 'missile' && Number.isFinite(hit.caliberMm)
    && hit.caliberMm! > 0 && hit.caliberMm! < 60;
}
