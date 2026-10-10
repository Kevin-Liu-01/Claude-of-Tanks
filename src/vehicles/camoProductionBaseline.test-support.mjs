// The camouflage system as production (deploy 206) resolves it, reduced to comparable rows (fix/camo-defaults,
// 2026-10-09). The owner on launch day: "why did you break camos? they only show generic camos now instead of the cool
// camos we had before", then "yeah our entire camo system before was better" (R113: "the default camos of our tanks to
// be what they were before"). camoProductionBaseline.json was written by this function on afc5018e9 (deploy 206's
// tree e502c7670 plus generated receipts); camoCatalogProductionIndices.selftest.mjs runs it on the current tree and
// compares row for row.
import { createHash } from 'node:crypto';

/** Hulls a saved selection is resolved on: US, Russian, German, British, Chinese, Korean, IDF, X-series and brand. */
export const BASELINE_REFERENCE_TANKS = Object.freeze([
  'm1a2', 't90m', 'leo2a6', 'challenger_3', 'type99a', 'k2', 'sabra_mk2_x', 'abramsx', 't90m_x', 'm6_linebacker',
]);
/** Production's AUTO biomes (materials.ts BIOME_PATTERN) and two maps without a row of their own (they read Verdant). */
export const BASELINE_AUTO_MAPS = Object.freeze([
  'verdant', 'desert', 'winter', 'urban', 'autumn', 'coastal', 'steppe', 'railyard', 'moon', 'cliffbridge', 'oasis', 'whiteout',
]);

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

/** Rows for one tree: `specs`, `policy` and `materials` are that tree's specs.ts, camoPolicy.ts and materials.ts. */
export function camoBaselineRows({ specs, policy, materials }) {
  const ids = [...policy.CAMO_PATTERN_IDS];
  const reference = BASELINE_REFERENCE_TANKS.map((id) => specs.getSpec(id));
  materials.setCamoBiome('verdant');
  const selections = {};
  for (const id of ids) {
    // a saved selection (localStorage cot.camo.<tank> = id) as each reference hull paints it, and its catalog label
    selections[id] = digest([policy.CAMO_PATTERN_LABEL[id] ?? null, policy.sharedCamoPreset(id)?.visual ?? null,
      reference.map((spec) => materials.resolveCamoVisual(spec, id))]);
  }
  const tanks = {};
  for (const id of specs.ALL_TANK_IDS) {
    const spec = specs.getSpec(id);
    tanks[id] = {
      selection: materials.getCamoSelection(id),
      stock: policy.stockCamoPatternIdFor(id, spec.nation, spec.era),
      factory: digest(materials.resolveCamoVisual(spec, 'factory')),
      auto: BASELINE_AUTO_MAPS.map((mapId) => materials.resolveMultiplayerCamoPattern(id, 'auto', mapId)).join(' '),
    };
  }
  return { ids, catalog: [...policy.CAMO_CATALOG_PATTERN_IDS], selections, tanks };
}
