import type { GroundSampler } from './tankFactoryCore.ts';

/**
 * A ground sampler in a scaled authoring frame (profiles/vehicleSize.ts, profiles/arieteXFamilyScale.ts): the canonical
 * gear solver works in the source frame, so points, heights, the standable-top ceiling and the per-hull preparation
 * reach scale by `factor` on the way to the integration's sampler. The vehicle-contact lane (2026-10-09): the wrappers
 * dropped the ceiling and the preparation, which left every resized hull's wheels on the terrain alone. One record per
 * wrapper; `current` reads the sampler the latest conform was handed.
 */
export function scaledGroundSampler(factor: number, current: () => GroundSampler): GroundSampler {
  return Object.assign(
    (x: number, z: number, ceiling?: number): number =>
      current()(x * factor, z * factor, ceiling === undefined ? undefined : ceiling * factor) / factor,
    { prepareHull(x: number, z: number, reachM: number): void { current().prepareHull?.(x * factor, z * factor, reachM * factor); } },
  );
}
