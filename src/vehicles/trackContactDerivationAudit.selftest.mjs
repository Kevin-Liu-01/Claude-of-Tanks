// The track contact audit's tolerance rules (trackContactDerivationAudit.test-support.mjs; physics lane, 2026-10-05), on
// a fake build of a boot-fleet tank. Every run field holds its published receipt within 5 mm either way. The belly pan
// may be drawn up to 1 cm ABOVE its published line, which leaves a gap (the K2's LOW running gear sits 5.1 mm above),
// and no more than 5 mm below it, where the ground would reach the drawn hull. The fleet passes run the audit on every
// real build; this receipt pins the rules with seeded negatives.
import assert from 'node:assert/strict';
import { Group } from 'three';
import { ensureAuthorityFleet } from './authorityFleet.ts';
import { TANK_SPECS } from './specs.ts';
import { createTrackContactDerivationAudit } from './trackContactDerivationAudit.test-support.mjs';

await ensureAuthorityFleet(['m1a2']);
const published = TANK_SPECS.m1a2?.armor?.trackContact;
assert.ok(published?.panYM > 0 && published.halfLenM > 0, 'm1a2 publishes a track contact with a belly pan');

function verdict(patch) {
  const audit = createTrackContactDerivationAudit('LOW');
  try {
    audit.check('m1a2', { contactGeom: { ...published, ...patch }, root: new Group() });
    return 'pass';
  } catch (error) {
    if (error instanceof assert.AssertionError) return 'fail';
    throw error;
  }
}

const mm = 0.001;
const cases = [
  ['the published contact itself', {}, 'pass'],
  ['the pan drawn 5.1 mm above its line, as on the K2 LOW build', { panYM: published.panYM + 5.1 * mm }, 'pass'],
  ['the pan drawn 9 mm above its line', { panYM: published.panYM + 9 * mm }, 'pass'],
  ['the pan drawn 11 mm above its line', { panYM: published.panYM + 11 * mm }, 'fail'],
  ['the pan drawn 4 mm below its line', { panYM: published.panYM - 4 * mm }, 'pass'],
  ['the pan drawn 6 mm below its line (the ground in the drawn hull)', { panYM: published.panYM - 6 * mm }, 'fail'],
  ['the run 6 mm longer', { halfLenM: published.halfLenM + 6 * mm }, 'fail'],
  ['the run 6 mm shorter', { halfLenM: published.halfLenM - 6 * mm }, 'fail'],
  ['the bottom 4 mm up', { bottomYM: published.bottomYM + 4 * mm }, 'pass'],
  ['the bottom 6 mm up', { bottomYM: published.bottomYM + 6 * mm }, 'fail'],
];
for (const [label, patch, expected] of cases) assert.equal(verdict(patch), expected, label);
console.log(`trackContactDerivationAudit.selftest: ${cases.length} cases (the run within 5 mm; the pan from 5 mm below `
  + 'to 10 mm above its published line)');
