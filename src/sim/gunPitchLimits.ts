/** Mechanical deck clearance is optional and owned by each vehicle's frame.
 * Positive pitch elevates the gun; yaw is relative to the hull's forward +Z. */
export type GunPitchByYawCurve = readonly (readonly [absoluteYawDeg: number, minimumPitchDeg: number])[];
interface GunPitchLimitSpec {
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

/**
 * minimumMechanicalGunPitch for one spec, its curve validated once (an invalid curve throws here, where the per-call
 * form throws on its first call): the same value to the bit for every yaw (gunPitchLimits.selftest). For a builder that
 * asks it millions of times (the leafy net's working clearance, ghillieSuit.ts): the per-call form spends most of its
 * time on its two floating modulos and its re-validation. Each fast path below is the modulo's exact value on its range
 * (a remainder under one turn is the dividend; between one and two turns it is the dividend less one turn, exact by
 * Sterbenz's lemma), and the segment search keeps the per-call form's choice of the later segment at a shared station.
 */
export function mechanicalGunPitchFloor(spec: GunPitchLimitSpec): (turretYawRadians: number) => number {
  const front = -(spec.gunDepressionDeg ?? 0) * DEG;
  const curve = spec.gunPitchByYawDeg;
  if (!curve) return () => front;
  curveMinimum(curve, 0);
  const n = curve.length, xs = Float64Array.from(curve, (row) => row[0]), ys = Float64Array.from(curve, (row) => row[1]);
  return (turretYawRadians) => {
    if (!Number.isFinite(turretYawRadians)) throw new RangeError('Invalid turret yaw');
    const a = turretYawRadians + Math.PI, once = a > -TURN && a < TURN ? a : a % TURN;
    const b = once + TURN, wrapped = b < TURN ? b : b < 2 * TURN ? b - TURN : b % TURN;
    const yaw = Math.abs(wrapped - Math.PI) / DEG;
    for (let i = n - 1; i > 0; i--) {
      const x0 = xs[i - 1];
      if (yaw >= x0 && yaw <= xs[i]) return Math.max(front, (ys[i - 1] + (ys[i] - ys[i - 1]) * (yaw - x0) / (xs[i] - x0)) * DEG);
    }
    return Math.max(front, ys[n - 1] * DEG);
  };
}
