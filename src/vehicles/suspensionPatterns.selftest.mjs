import assert from 'node:assert/strict';
import './profiles/k2RunningGearSeat.selftest.mjs';
import './profiles/abramsRoadWheelSpacing.selftest.mjs';
import './profiles/japaneseHydropneumaticSuspension.selftest.mjs';
import {
  SUSPENSION_PATTERN_DEFINITIONS,
  SUSPENSION_PATTERN_IDS,
  suspensionPatternFor,
} from './suspensionPatterns.ts';

await import('./profiles/k1a1Geometry.selftest.mjs');

// Profile registration expands the base spec table to the complete playable
// fleet; this test intentionally certifies that full runtime registry.
await import('./tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('./specs.js');
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

assert.equal(suspensionPatternFor(getSpec('m1a2')).id, 'abrams-torsion-arm');
assert.equal(suspensionPatternFor(getSpec('t64bv1')).id, 't64-torsion-arm');
assert.equal(suspensionPatternFor(getSpec('ua_t64bv')).id, 't64-torsion-arm');
assert.equal(suspensionPatternFor(getSpec('centurion5')).id, 'paired-bogie');
assert.equal(suspensionPatternFor(getSpec('strv103a')).id, 'hydropneumatic-link');
assert.equal(suspensionPatternFor(getSpec('k2')).id, 'hydropneumatic-link');
assert.equal(suspensionPatternFor(getSpec('challenger2')).id, 'hydropneumatic-link');
assert.equal(suspensionPatternFor(getSpec('chieftain5')).id, 'paired-bogie');
assert.throws(() => suspensionPatternFor(getSpec('m1a2'), null, 'missing'),
  /Unknown suspension pattern/);

console.log(`[suspension-patterns] PASS — ${ALL_TANK_IDS.length} tanks across `
  + `${SUSPENSION_PATTERN_IDS.length} suspension families`);
