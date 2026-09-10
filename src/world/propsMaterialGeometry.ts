import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PROPS_CONVERSION_BATCH_LIMIT = 64;
export const PROPS_CONVERSION_BUDGET_MS = 2;
const propsConversionNow = (): number => performance.now();

export interface PropsMaterialGeometrySlice {
  fine: true;
  progress: false;
  stage: string;
}

function disposeConvertedGeometries(owned: Set<BufferGeometry>): void {
  for (const geometry of owned) {
    owned.delete(geometry);
    try { geometry.dispose(); } catch (_) { /* drain every private owner */ }
  }
}

/**
 * Preserve native conversion, attribute bits and source order; only schedule
 * the per-source calls. Originals are borrowed, including non-indexed inputs.
 * Converted geometries stay private until the native merge has copied them.
 * IteratorClose releases them on cancellation; a returned merged geometry is
 * transferred to the caller. No scene object is published at a checkpoint.
 *
 * Individual toNonIndexed calls and the final merge/allocation remain native
 * synchronous work. The count/deadline bounds the batch, not those calls.
 */
export function* mergePropsMaterialGeometrySteps(
  sources: readonly BufferGeometry[],
  materialName: string,
  now: () => number = propsConversionNow,
): Generator<PropsMaterialGeometrySlice, BufferGeometry, void> {
  const borrowed = new Set(sources);
  const owned = new Set<BufferGeometry>();
  const converted: BufferGeometry[] = [];
  let batchCount = 0;
  let batchStartedAt = now();
  try {
    for (const geometry of sources) {
      const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
      if (!borrowed.has(prepared)) owned.add(prepared);
      converted.push(prepared);
      batchCount++;
      const elapsed = now() - batchStartedAt;
      if (batchCount >= PROPS_CONVERSION_BATCH_LIMIT
        || !Number.isFinite(elapsed) || elapsed < 0
        || elapsed >= PROPS_CONVERSION_BUDGET_MS
        || converted.length === sources.length) {
        // The last checkpoint also keeps the final merge out of the last
        // conversion batch. Internal work must not advance placement progress.
        yield { fine: true, progress: false, stage: `material-convert:${materialName}` };
        batchCount = 0;
        batchStartedAt = now();
      }
    }
    return mergeGeometries(converted, false);
  } finally {
    disposeConvertedGeometries(owned);
  }
}
