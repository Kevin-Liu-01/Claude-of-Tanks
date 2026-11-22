import assert from 'node:assert/strict';
import {
  SUSPENSION_PATTERN_DEFINITIONS,
  SUSPENSION_PATTERN_IDS,
  suspensionPatternFor,
  hydraulicUnitStyleFor,
  hydraulicStationCarriesUnit,
} from './suspensionPatterns.ts';


// Profile registration expands the base spec table to the complete playable
// fleet; this test intentionally certifies that full runtime registry.
await import('./tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('./specs.ts');
const { wheelPatternFor } = await import('./wheelPatterns.ts');

const counts = new Map(SUSPENSION_PATTERN_IDS.map((id) => [id, 0]));
for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const pattern = suspensionPatternFor(spec, wheelPatternFor(spec));
  assert.ok(SUSPENSION_PATTERN_DEFINITIONS[pattern.id], `${id}: known suspension pattern`);
  assert.ok(pattern.anchorLiftRatio > 0 && pattern.armHeightRatio > 0,
    `${id}: suspension has a physical hull anchor and arm section`);
  assert.ok(pattern.armSegments >= 8 && pattern.wheelEndTaper > 0
    && pattern.wheelEndTaper < 1,
  `${id}: suspension resolves to a tapered multi-faceted forging`);
  assert.ok(pattern.jointRadiusRatio > 0 && pattern.jointWidthRatio > 0,
    `${id}: suspension resolves physical hull and axle bosses`);
  counts.set(pattern.id, counts.get(pattern.id) + 1);
}
for (const [id, count] of counts) assert.ok(count > 0, `${id}: exercised by playable fleet`);

assert.equal(suspensionPatternFor(getSpec('m1a1_abrams_hc')).id, 'abrams-torsion-arm');
assert.equal(suspensionPatternFor(getSpec('t64bv1')).id, 't64-torsion-arm');
assert.equal(suspensionPatternFor(getSpec('t64bv_donbas')).id, 't64-torsion-arm');
for (const id of ['t64bm1m', 't64bv', 't64b1v_2022', 'pt64_tur']) assert.equal(suspensionPatternFor(getSpec(id)).id, 't64-torsion-arm');
assert.equal(suspensionPatternFor(getSpec('centurion5_2')).id, 'paired-bogie');
assert.equal(suspensionPatternFor(getSpec('strv103a')).id, 'hydropneumatic-link');
assert.equal(suspensionPatternFor(getSpec('xk2_black_panther')).id, 'hydropneumatic-link');
assert.equal(suspensionPatternFor(getSpec('challenger2')).id, 'hydropneumatic-link');
assert.equal(suspensionPatternFor(getSpec('chieftain3')).id, 'paired-bogie');
// Hydro lane 274 (owner 2026-11-20): every hydropneumatic or hydrogas hull rides the pattern, and draws its family's unit.
const HYDRAULIC = {
  'external-strut': ['mbt70', 'stb1', 'type74', 'strv103a', 'strv103b', 'strv103b_net', 'strv103e', 'strv152', 'udes03', 'leclerc_s1', 'leclerc_s2',
    'leclerc_sxxi', 'leclerc_xlr', 'amx56', 'ee_t3_osorio', 'ee_t4_osorio', 'osorio_p1', 'osorio_p2'],
  'in-arm': ['xk2_black_panther', 'k2_black_panther', 'k2b', 'k1e1', 'k1a1', 'type90a', 'type90b',
    'type90', 'type10_tk_x', 'type10_dozer', 'type10b', 'type10', 'redback', 'pl01', 'pl01_105'],
  hydrogas: ['challenger1_mk1', 'challenger1_mk2', 'challenger1_mk3', 'challenger_x', 'challenger_x_sleek', 'fv4034',
    'challenger2', 'challenger2e', 'ua_challenger2', 'challenger3_td', 'challenger3_td_rws', 'challenger3_proto',
    'challenger3'],
};
let hydraulicHulls = 0;
for (const [kind, ids] of Object.entries(HYDRAULIC)) for (const id of ids) {
  if (!ALL_TANK_IDS.includes(id)) continue;
  const pattern = suspensionPatternFor(getSpec(id));
  assert.equal(pattern.id, 'hydropneumatic-link', `${id}: hydropneumatic pattern`);
  assert.equal(hydraulicUnitStyleFor(getSpec(id), pattern)?.kind, kind, `${id}: ${kind} unit`);
  hydraulicHulls++;
}
for (const id of ALL_TANK_IDS) {
  const pattern = suspensionPatternFor(getSpec(id));
  assert.equal(hydraulicUnitStyleFor(getSpec(id), pattern) !== null, pattern.id === 'hydropneumatic-link',
    `${id}: a hydraulic unit exactly on the hydropneumatic pattern`);
}
// hybrids: K1 carries units on stations 1, 2 and 6 of six, the Type 90 on 1, 2, 5 and 6
const k1 = hydraulicUnitStyleFor(getSpec('k1a1'), suspensionPatternFor(getSpec('k1a1')));
assert.deepEqual([0, 1, 2, 3, 4, 5].filter((r) => hydraulicStationCarriesUnit(k1, r, 6)), [0, 1, 5]);
const type90 = hydraulicUnitStyleFor(getSpec('type90'), suspensionPatternFor(getSpec('type90')));
assert.deepEqual([0, 1, 2, 3, 4, 5].filter((r) => hydraulicStationCarriesUnit(type90, r, 6)), [0, 1, 4, 5]);
assert.throws(() => suspensionPatternFor(getSpec('m1a1_abrams_hc'), null, 'missing'),
  /Unknown suspension pattern/);

console.log(`[suspension-patterns] PASS — ${ALL_TANK_IDS.length} tanks across `
  + `${SUSPENSION_PATTERN_IDS.length} suspension families, ${hydraulicHulls} hydraulic hulls`);
