// Compatibility path for browsers without DecompressionStream. Kept behind a
// dynamic import so modern sessions never parse the legacy numeric archive.
import SOURCE_MODELS from './props-models.json';
import type { BakedPropModel, BakedPropModels } from './propsModelStore.ts';

export function loadFallbackPropModels(): BakedPropModels {
  const models: Record<string, BakedPropModel> = Object.create(null);
  for (const [name, source] of Object.entries(SOURCE_MODELS)) {
    models[name] = {
      positions: new Float32Array(source.positions),
      normals: new Float32Array(source.normals),
      colors: new Float32Array(source.colors),
      indices: new Uint16Array(source.indices),
      bbox: {
        min: [source.bbox.min[0], source.bbox.min[1], source.bbox.min[2]],
        max: [source.bbox.max[0], source.bbox.max[1], source.bbox.max[2]],
      },
      tris: source.tris,
    };
  }
  return models;
}
