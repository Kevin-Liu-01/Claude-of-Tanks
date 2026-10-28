// 261 (owner 2026-10-27 on the Leclerc S1, S2 and SXXI: "fill in the annoying gaps under all of these", clarified
// "basically they create "roofs" that imply solid areas but have no side plating or anything under and it jus tlooks
// goofy"): the shared Leclerc turret (profiles/misc.ts buildLeclercSteps) has no see-through pocket under the six panels
// the owner marked on the S1 (the field->mid riser's back faces, the sight tower's pedestal ring, the mid->high riser's
// back faces and underside) nor under the cheek corner fields beside them, on any of the three ids it builds. Measured by
// tools/roof-pocket.mjs on the turret (gun at rest, its own frame): until 261 every id read pockets on all of them.
// The other turret pockets are held shrink-only per id (REMAINING_CM2): the open gunner's sight bay and the centre rear
// notch are the real vehicle's; the slots behind the side boxes and at the rear corners were routed with the fleet
// census. Negative control: a plate laid over a 13 cm slot between two blocks is a pocket.
import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { OWNER_RULES, ownerSoups, roofPockets } from '../../../tools/roof-pocket.mjs';

// the owner's markup (turret-local boxes, condensed in owner-shots/20261027-leclerc-s1-gap-markup.json) and the corners
const MARKED = {
  'surface-2 pedestal ring': [[0.385, 0.61, 0.82], [0.715, 0.61, 1.15]],
  'surface-3 riser right': [[0.115, 0.44, 0.94], [1.02, 0.61, 1.06]],
  'surface-4 riser left': [[-1.02, 0.44, 0.94], [-0.115, 0.61, 1.06]],
  'surface-7 high riser right': [[0.34, 0.61, -0.06], [1.0, 0.752, 0.02]],
  'surface-10 high riser left': [[-1.0, 0.61, -0.06], [-0.34, 0.752, 0.02]],
  'surface-11 high riser left underside': [[-1.0, 0.61, 0.02], [-0.34, 0.61, 0.06]],
  'corner field right': [[0.98, 0.36, 1.10], [1.36, 0.44, 1.5]],
  'corner field left': [[-1.36, 0.36, 1.10], [-0.98, 0.44, 1.5]],
};
// turret pocket plan area left per id after 261 (cm2): may only shrink
const REMAINING_CM2 = { leclerc_s1: 5384, leclerc_s2: 5572, leclerc_sxxi: 7476 };
const under = (p, [lo, hi]) => p.box[0] <= hi[0] + 0.05 && p.box[3] >= lo[0] - 0.05 && p.box[2] <= hi[2] + 0.08 && p.box[5] >= lo[2] - 0.08
  && p.box[1] <= hi[1] + 0.05 && p.box[4] >= lo[1] - 0.30;

const T0 = Date.now();
for (const id of Object.keys(REMAINING_CM2)) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  try {
    const soup = ownerSoups(tank).turret, pockets = roofPockets(soup.tri, { ...OWNER_RULES.turret, body: soup.body });
    for (const [name, box] of Object.entries(MARKED)) {
      const hit = pockets.find((p) => under(p, box));
      assert.equal(hit, undefined, `${id}: a see-through pocket under the ${name} (${hit && `${(hit.areaM2 * 1e4).toFixed(0)} cm2 at ${hit.box}`})`);
    }
    const area = pockets.reduce((t, p) => t + p.areaM2 * 1e4, 0);
    assert.ok(area <= REMAINING_CM2[id] * 1.02, `${id}: turret pockets ${area.toFixed(0)} cm2 over the held ${REMAINING_CM2[id]} (only shrinks)`);
    console.log(`${id}: no pocket under the owner's marked panels; ${pockets.length} other turret pocket(s), ${area.toFixed(0)} cm2 (held ${REMAINING_CM2[id]})`);
  } finally {
    tank.dispose();
  }
}

// negative control: two 0.30 m blocks 0.13 m apart under a 4 cm plate (the old riser over its slot)
const quads = [];
const boxTris = (x0, y0, z0, x1, y1, z1) => {
  const v = (x, y, z) => [x, y, z];
  const P = [v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)];
  for (const [a, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]) {
    quads.push(...P[a], ...P[b], ...P[c], ...P[a], ...P[c], ...P[d]);
  }
};
boxTris(0, 0, -0.30, 0.6, 0.40, 0);        // front block
boxTris(0, 0, 0.13, 0.6, 0.40, 0.43);      // rear block
boxTris(0, -0.08, -0.30, 0.6, 0, 0.43);    // floor under both
boxTris(0, 0.40, -0.05, 0.6, 0.44, 0.18);  // the plate over the slot
const control = roofPockets(Float64Array.from(quads), OWNER_RULES.turret);
assert.ok(control.some((p) => p.box[2] >= -0.02 && p.box[5] <= 0.15 && p.areaM2 > 0.004),
  `negative control: a plate over a slot reads as a pocket (${JSON.stringify(control.map((p) => p.box))})`);
console.log(`leclercRoofPockets.selftest: the Leclerc turret's marked roofs are closed on all three ids; control caught (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
