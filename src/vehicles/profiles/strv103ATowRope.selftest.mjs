// 274: the 103A's recovery rope on the family casemate (strv103TowRope.test-support.mjs holds the shared checks); garage
// dressing must not add a second rope the Gallery does not show.
import assert from 'node:assert/strict';
import { decorManifestFor } from '../decorations.ts';
import { getSpec } from '../specs.ts';
import { assertStrv103Rope } from './strv103TowRope.test-support.mjs';

assertStrv103Rope('strv103a');
assert.equal(decorManifestFor(getSpec('strv103a'), () => 0.5).some((row) => row.kit === 'cable' && (row.p ?? 1) > 0), false,
  'garage dressing cannot add a second rope that is absent from the Gallery');
console.log('strv103ATowRope.selftest: the 103A rope is seated on its fender');
