// 2026-10-01 (the lighting lane, the grounded light model): a battlefield's sky block may carry a `lighting` block, the
// light model's per-map levers (src/engine/lightModel.ts LightingConfig: the ground's albedo the sky sees below the
// horizon, an exposure offset, the grade). Sky authoring never feeds relief, terrain wear or palettes, so the byte
// receipts that project map sources and configs back to their historical form (badlandsRelief, playableRelief,
// villageWear, mangroveWaterPalette) take the block out here, the round-71 cloudscape pattern: the source's two
// inserted lines (the comment and the block) or the inline block of a one-line sky, and the config's `lighting` leaf.
// Any other edit to a sky line still fails the digest it always did.
import assert from 'node:assert/strict';

const BLOCK_LINES = /\n[ \t]*\/\/ 2026-10-01: the grounded light model's map levers \(lightModel\.ts LightingConfig\)\n[ \t]*lighting: \{[^{}\n]*\},(?=\n)/g;
const INLINE_BLOCK = /, lighting: \{[^{}\n]*\}(?= \},?\n)/g;

/** A map source with its lighting block projected out (at most one per file). */
export function historicalLightModelSkySource(source, file) {
  const blocks = (source.match(BLOCK_LINES)?.length ?? 0) + (source.match(INLINE_BLOCK)?.length ?? 0);
  assert.ok(blocks <= 1, `${file}: one lighting block at most (${blocks})`);
  return source.replace(BLOCK_LINES, '').replace(INLINE_BLOCK, '');
}

/** A sky block without its lighting leaf (the same object when it carries none). */
export function withoutLightingSky(sky) {
  if (!sky || !Object.hasOwn(sky, 'lighting')) return sky;
  const { lighting: _lighting, ...rest } = sky;
  return rest;
}

/** A map config whose sky block carries no lighting leaf (the same object when it carries none). */
export function withoutLightingConfig(config) {
  const sky = withoutLightingSky(config?.sky);
  return sky === config?.sky ? config : { ...config, sky };
}
