/** Mechanical deck clearance is optional and owned by each vehicle's frame.
 * Positive pitch elevates the gun; yaw is relative to the hull's forward +Z. */
export type GunPitchByYawCurve = readonly (readonly [absoluteYawDeg: number, minimumPitchDeg: number])[];
export interface GunPitchLimitSpec {
  gunDepressionDeg?: number;
  gunPitchByYawDeg?: GunPitchByYawCurve;
}
const DEG = Math.PI / 180, TURN = Math.PI * 2;

function curveMinimum(curve: GunPitchByYawCurve, yaw: number): number {
  if (curve.length < 2 || curve[0][0] !== 0 || curve[curve.length - 1][0] !== 180)
    throw new RangeError('Gun-clearance curve must span0..180 degrees');
  let result = curve[curve.length - 1][1];
  for (let i = 0; i < curve.length; i++) {
    const [x, y] = curve[i];
    if (!Number.isFinite(x) || !Number.isFinite(y) || (i > 0 && x <= curve[i - 1][0]))
      throw new RangeError('Invalid gun-clearance curve station');
    if (i > 0 && yaw >= curve[i - 1][0] && yaw <= x) {
      const [a, b] = curve[i - 1];
      result = b + (y - b) * (yaw - a) / (x - a);
    }
  }
  return result * DEG;
}

/** Allocation-free; undeclared vehicles retain their exact old lower limit. */
export function minimumMechanicalGunPitch(spec: GunPitchLimitSpec, turretYawRadians: number): number {
  const front = -(spec.gunDepressionDeg ?? 0) * DEG;
  if (!spec.gunPitchByYawDeg) return front;
  if (!Number.isFinite(turretYawRadians)) throw new RangeError('Invalid turret yaw');
  const yaw = Math.abs(((turretYawRadians + Math.PI) % TURN + TURN) % TURN - Math.PI) / DEG;
  return Math.max(front, curveMinimum(spec.gunPitchByYawDeg, yaw));
}
