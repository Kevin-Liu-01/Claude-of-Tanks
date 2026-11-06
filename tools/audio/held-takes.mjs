// The take each asset is held on in a browser receipt (world-sfx-269, 2026-11-04): a measured asset's loudest by
// momentary loudness (tools/audio/sfx-loudness.json, the files as they ship), any other its first, so no gate rides on
// the take the engine's seeded stream drew. tools/audio-mix-balance.mjs and tools/sfx-smoke.mjs pass it to
// window.__COT_AUDIO.holdVariants.
import { readFileSync } from 'node:fs';

export function loudestTakes() {
  const record = JSON.parse(readFileSync(new URL('./sfx-loudness.json', import.meta.url), 'utf8'));
  const shipped = JSON.parse(readFileSync(new URL('./.sfx-manifest.json', import.meta.url), 'utf8'));
  return Object.fromEntries(Object.keys(shipped).map((id) => [id, (record[id]?.variants ?? [])
    .reduce((best, v, i, all) => ((v.mMax ?? -Infinity) > (all[best].mMax ?? -Infinity) ? i : best), 0)]));
}
