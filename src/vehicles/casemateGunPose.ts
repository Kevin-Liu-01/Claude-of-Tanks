/** A fixed fighting compartment has a finite internal traverse bearing.
 * Cosmetic chassis stabilization must not rotate that bearing through its
 * walls. This limits presentation only; authoritative aiming is unchanged. */
export interface CasemateGunSpec {
  armor: { turretless?: boolean };
  gunArcDeg?: number;
  hydropneumaticAim?: unknown;
}
export function casemateGunYawLimit(spec: CasemateGunSpec): number {
  if (!spec.armor.turretless) return Infinity;
  if (spec.hydropneumaticAim) return 0;
  return (spec.gunArcDeg ?? 11) * Math.PI / 180;
}
export function casemateGunYaw(spec: CasemateGunSpec, visualYaw: number): number {
  const limit = casemateGunYawLimit(spec);
  return Math.max(-limit, Math.min(limit, visualYaw));
}
