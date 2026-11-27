// 279 (slab-mirror): no twisted slab quad draws the other diagonal from its mirror twin (slabDiagonalSettle.ts). A fleet
// audit (fleetPass.test-support.mjs) on the unbatched seed-4242 HIGH build of fleetPassHigh.selftest. It reads what is
// drawn: each mesh's slab-tagged quads at their finished corners, in the vehicle root's frame, and their split as drawn.
// The control is the settle switched off (createTank's slabDiagonalSettle: false; slabMirrorDiagonal.selftest builds it
// per id): the census then finds the pairs the settle turns.
import assert from 'node:assert/strict';
import { slabMirrorCensus } from './slabDiagonalSettle.ts';

export function createSlabMirrorDiagonalAudit() {
  const totals = { ids: 0, twisted: 0, agreeingPairs: 0, noTwin: 0, nonConvex: 0, settledPairs: 0, settledIds: 0 };
  const failures = [];
  return {
    check(id, visual) {
      const census = slabMirrorCensus(visual.root);
      totals.ids++;
      totals.twisted += census.twisted;
      totals.agreeingPairs += census.agreeingPairs;
      totals.noTwin += census.noTwin;
      totals.nonConvex += census.nonConvex;
      const settled = visual.root.userData.slabDiagonalSettle;
      if (settled?.pairs) { totals.settledPairs += settled.pairs; totals.settledIds++; }
      if (census.pairs.length) {
        const worst = census.pairs.reduce((a, b) => (b.gapMm > a.gapMm ? b : a));
        failures.push(`${id}: ${census.pairs.length} pairs, worst ${worst.gapMm} mm on ${worst.mesh} at ${worst.corner.join(',')}`);
      }
    },
    finish() {
      console.log(`slabMirrorDiagonal: ${JSON.stringify(totals)}`);
      assert.deepEqual(failures, [], `twisted slab quads drawn along the other diagonal from their mirror twin:\n${failures.join('\n')}`);
    },
  };
}
