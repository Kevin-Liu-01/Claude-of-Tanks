// Compatibility path for browsers without DecompressionStream. Kept behind a
// dynamic import so modern sessions never parse the legacy numeric archive.
import SOURCE_MODELS from './props-models.json';

export function loadFallbackPropModels() {
  const models = Object.create(null);
  for (const [name, source] of Object.entries(SOURCE_MODELS)) {
    models[name] = {
      positions: new Float32Array(source.positions),
      normals: new Float32Array(source.normals),
      colors: new Float32Array(source.colors),
      indices: new Uint16Array(source.indices),
      bbox: source.bbox,
      tris: source.tris,
    };
  }
  return models;
}
