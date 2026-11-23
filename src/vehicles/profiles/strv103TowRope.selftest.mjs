// 274: the Strv 103 family's recovery rope (profiles/strv103Equipment.ts hullFittings): three short longitudinal runs on the
// right fender plate between the bins and the lip, strapped at both ends, on the 103B and the 103A alike (the concept carries none: its
// composite modules stand there). The 103A's own copy of this receipt is strv103ATowRope.selftest.mjs.
import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { assertStrv103Rope } from './strv103TowRope.test-support.mjs';
if (import.meta.url === `file://${process.argv[1]}`) {
  assertStrv103Rope('strv103b');
  const concept = createTank('strv103e', null, { proceduralOnly: true, quality: 'high', geometryReceipt: true });
  assert.equal(!!concept.root.getObjectByName('strv103_side_tow_rope'), false,
    'the concept carries composite modules where the bins and their rope stand');
  console.log('strv103TowRope.selftest: the 103B rope is seated on its fender, the concept carries none');
}
