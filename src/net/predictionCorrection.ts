export const PREDICTION_CORRECTION_KEYS = Object.freeze([
  'x', 'y', 'z', 'yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch',
] as const);

export type PredictionCorrectionKey = typeof PREDICTION_CORRECTION_KEYS[number];
export type PredictionCorrection = Record<PredictionCorrectionKey, number>;

export interface PredictionCorrectionDecay {
  horizontalTauS: number;
  verticalTauS: number;
  aimTauS: number;
  holdRestingHull?: boolean;
  maxHorizontalStepM?: number;
  maxVerticalStepM?: number;
}

function decayFactor(elapsedS: number, tauS: number) {
  if (!(tauS > 0)) return 0;
  return Math.exp(-Math.max(0, elapsedS) / tauS);
}

/**
 * Decay presentation error without feeding it back into authority or shared
 * movement. Heavy hull support and tilt settle more slowly than horizontal
 * steering; turret/gun aim remains the fastest visual channel.
 */
export function decayPredictionCorrection(
  correction: PredictionCorrection,
  elapsedS: number,
  policy: PredictionCorrectionDecay,
) {
  const beforeX = correction.x;
  const beforeY = correction.y;
  const beforeZ = correction.z;
  const aimDecay = decayFactor(elapsedS, policy.aimTauS);
  correction.turretYaw *= aimDecay;
  correction.gunPitch *= aimDecay;
  if (policy.holdRestingHull) return correction;

  const horizontalDecay = decayFactor(elapsedS, policy.horizontalTauS);
  correction.x *= horizontalDecay;
  correction.z *= horizontalDecay;
  correction.yaw *= horizontalDecay;
  if (Number.isFinite(policy.maxHorizontalStepM)) {
    const releasedX = beforeX - correction.x;
    const releasedZ = beforeZ - correction.z;
    const releasedM = Math.hypot(releasedX, releasedZ);
    const limitM = Math.max(0, Number(policy.maxHorizontalStepM));
    if (releasedM > limitM && releasedM > 0) {
      const scale = limitM / releasedM;
      correction.x = beforeX - releasedX * scale;
      correction.z = beforeZ - releasedZ * scale;
    }
  }

  const verticalDecay = decayFactor(elapsedS, policy.verticalTauS);
  correction.y *= verticalDecay;
  correction.pitch *= verticalDecay;
  correction.roll *= verticalDecay;
  if (Number.isFinite(policy.maxVerticalStepM)) {
    const releasedY = beforeY - correction.y;
    const limitM = Math.max(0, Number(policy.maxVerticalStepM));
    if (Math.abs(releasedY) > limitM) {
      correction.y = beforeY - Math.sign(releasedY) * limitM;
    }
  }
  return correction;
}
