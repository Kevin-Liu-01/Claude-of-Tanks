/** Current-frame weight while temporal AO history is valid. */
export const TEMPORAL_AO_CURRENT_WEIGHT = 0.15;

/** Consecutive identical camera frames required before history is retired. */
export const TEMPORAL_AO_STABLE_FRAMES_BEFORE_SETTLE = 4;

/**
 * Keep isolated repeated presentation frames temporal at high refresh rates,
 * but make a genuinely stopped view converge to a byte-stable current frame.
 */
export function resolveTemporalAoCurrentWeight(stableCameraFrames: number): number {
  return stableCameraFrames >= TEMPORAL_AO_STABLE_FRAMES_BEFORE_SETTLE
    ? 1
    : TEMPORAL_AO_CURRENT_WEIGHT;
}

/** Maximum brighter AO history retained over the current sample. */
export const TEMPORAL_AO_BRIGHT_RETENTION_SLACK = 0.03;

/**
 * Maximum stale-dark AO retained after a surface becomes brighter.
 *
 * Occlusion is allowed to converge into darkness over several frames, which
 * rejects single-frame foliage/card aliasing. Disocclusion is intentionally
 * asymmetric: an exposed surface never drags darkness from the previous
 * camera pose. Keeping this named zero makes the visual invariant explicit
 * in both the TypeScript reference and generated shader source.
 */
export const TEMPORAL_AO_DARK_RELEASE_SLACK = 0;

export interface TemporalAoSample {
  current: number;
  history: number;
  neighborhoodMin: number;
  neighborhoodMax: number;
  historyValid?: boolean;
}

/** Scalar reference for the GLSL temporal-AO resolver in post.ts. */
export function resolveTemporalAoSample(sample: TemporalAoSample): number {
  const current = Number.isFinite(sample.current) ? sample.current : 1;
  const low = Number.isFinite(sample.neighborhoodMin)
    ? Math.min(current, sample.neighborhoodMin)
    : current;
  const high = Number.isFinite(sample.neighborhoodMax)
    ? Math.max(current, sample.neighborhoodMax)
    : current;
  if (sample.historyValid === false || !Number.isFinite(sample.history)) return current;
  const boundedHistory = Math.min(
    current + TEMPORAL_AO_BRIGHT_RETENTION_SLACK,
    Math.max(
      current - TEMPORAL_AO_DARK_RELEASE_SLACK,
      Math.min(high, Math.max(low, sample.history)),
    ),
  );
  return boundedHistory + (current - boundedHistory) * TEMPORAL_AO_CURRENT_WEIGHT;
}
