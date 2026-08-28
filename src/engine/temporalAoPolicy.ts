/** Current-frame weight while temporal AO history is valid. */
export const TEMPORAL_AO_CURRENT_WEIGHT = 0.15;

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
  const boundedHistory = Math.max(
    current - TEMPORAL_AO_DARK_RELEASE_SLACK,
    Math.min(high, Math.max(low, sample.history)),
  );
  return boundedHistory + (current - boundedHistory) * TEMPORAL_AO_CURRENT_WEIGHT;
}
