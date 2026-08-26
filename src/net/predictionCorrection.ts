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
  const aimDecay = decayFactor(elapsedS, policy.aimTauS);
  correction.turretYaw *= aimDecay;
  correction.gunPitch *= aimDecay;
  if (policy.holdRestingHull) return correction;

  const horizontalDecay = decayFactor(elapsedS, policy.horizontalTauS);
  correction.x *= horizontalDecay;
  correction.z *= horizontalDecay;
  correction.yaw *= horizontalDecay;

  const verticalDecay = decayFactor(elapsedS, policy.verticalTauS);
  correction.y *= verticalDecay;
  correction.pitch *= verticalDecay;
  correction.roll *= verticalDecay;
  return correction;
}
