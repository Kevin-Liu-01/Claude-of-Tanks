// 264 (owner 2026-10-28: "fix all the issues where there is no space under hatches of cupolas on t72s and so on"): the
// T-72B obr. 1987's commander's lid stands open behind its cupola (the upright plate the NSVT's gunner stands behind),
// and until 264 the drum and race it swung off were closed discs, so the open hatch had no opening at all. The T-62MV1
// carries the same turret (t62Modernization.ts). On both, every open lid that tools/hatch-well.mjs pairs with a cupola
// ring opens into a well: the first surface down the ring's axis lies 10 cm or more under its top.
import assert from 'node:assert/strict';
import '../../../tools/tank-surface-collect.mjs';
import { openLids } from '../../../tools/hatch-well.mjs';

const { createTank } = await import('../tankFactory.ts');
for (const id of ['t72b_1987', 't62mv1']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  try {
    const lids = openLids(tank, 'turret').filter((l) => l.ring.mesh === 'turretCupola');
    assert.ok(lids.length >= 1, `${id}: the commander's open lid stands by its cupola (${JSON.stringify(lids)})`);
    for (const l of lids) {
      assert.equal(l.verdict, 'well', `${id}: the open lid at ${l.hinge} opens over a ${l.verdict} ring (drop ${l.dropM} m)`);
      assert.ok(l.dropM >= 0.10, `${id}: the hatch well is ${l.dropM} m deep under the race`);
    }
    console.log(`${id}: ${lids.length} open lid(s) over a hatch well ${lids.map((l) => `${l.dropM} m`).join(', ')} deep`);
  } finally {
    tank.dispose?.();
  }
}
console.log('t72b1987HatchWell.selftest: the open commander\'s hatch opens into its cupola on the T-72B 1987 and T-62MV1 PASS');
