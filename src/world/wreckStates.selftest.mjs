// wreckStates (wrecks-270, 2026-11-05): one real donor baked in every damage state (wreckStates.ts) through the
// production bake (wrecks.ts poseWreckState), and each state checked for what it must show: a thrown track's run gone
// from one side, a ditched nose under the ground line, a half-buried hull, a stripped hull down on its belly, a hulk on
// its side, a cut-up hulk's turret set down beside it; the collision solids posed with the geometry, and every bake
// deterministic.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreck } from './wrecks.ts';
import { WRECK_STATES } from './wreckStates.ts';

const DONOR = 'm60a3', SEED = 2264;
await ensureTankBuilder(DONOR);
const bakes = {};
for (const state of WRECK_STATES) {
  const baked = bakeTankWreck(null, DONOR, { seed: SEED, state });
  assert.ok(baked, `${state}: bakes`);
  bakes[state] = baked;
}
const digest = (b) => createHash('sha256').update(Buffer.from(b.geo.attributes.position.array.buffer))
  .update(JSON.stringify(b.solids)).digest('hex');
const again = bakeTankWreck(null, DONOR, { seed: SEED, state: 'overturned' });
assert.equal(digest(again), digest(bakes.overturned), 'a state\'s bake is a function of donor, seed and state');
again.geo.dispose(); again.shadowGeo?.dispose();

const base = bakes.burnt_out;
const bounds = (b) => { b.geo.computeBoundingBox(); return b.geo.boundingBox; };
const solidBox = (b) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const solid of b.solids) for (let i = 0; i < solid.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], solid[i + k]); max[k] = Math.max(max[k], solid[i + k]);
  }
  return { min, max };
};
for (const state of WRECK_STATES) {
  const b = bakes[state], box = bounds(b), solids = solidBox(b);
  // the solids are the posed steel's: inside the drawn hulk (its crumple moves plates a few tenths)
  for (let k = 0; k < 3; k++) {
    const axis = 'xyz'[k];
    assert.ok(solids.min[k] >= box.min[axis] - 0.45 && solids.max[k] <= box.max[axis] + 0.45,
      `${state}: the solids stand inside the drawn hulk on ${axis} (${solids.min[k].toFixed(2)}..${solids.max[k].toFixed(2)} in ${box.min[axis].toFixed(2)}..${box.max[axis].toFixed(2)})`);
  }
  assert.ok(b.contact, `${state}: a ground contact to seat on`);
}
assert.equal(base.buried ?? 0, 0, 'a burnt-out hulk stands on its tracks');
assert.ok(bakes.turret_blown_off.tris > 0 && bakes.turret_blown_off.solids.length >= 2, 'the cook-off keeps its thrown turret\'s solid');
assert.ok(Math.abs(bakes.track_thrown.thrownSide) === 1, 'a thrown track names its side');
assert.ok(bakes.track_thrown.tris < base.tris, `a thrown track's run is gone (${bakes.track_thrown.tris} < ${base.tris})`);
assert.ok(bakes.nose_down.buried > 0.5, `a ditched nose is under the ground line (${bakes.nose_down.buried?.toFixed(2)} m)`);
assert.ok(bakes.half_buried.buried > 0.8 && bakes.half_buried.h - bakes.half_buried.buried < base.h * 0.8,
  `a half-buried hull stands low (${bakes.half_buried.buried?.toFixed(2)} m under, ${(bakes.half_buried.h - bakes.half_buried.buried).toFixed(2)} of ${base.h.toFixed(2)} m showing)`);
assert.ok(bakes.stripped.tris < base.tris * 0.95, `a stripped hull lost its running gear (${bakes.stripped.tris} < ${base.tris})`);
assert.ok(bakes.stripped.h < base.h, `and stands lower, down on its belly (${bakes.stripped.h.toFixed(2)} < ${base.h.toFixed(2)})`);
assert.ok(Math.abs(bakes.overturned.hx - base.hx) > 0.3, `on its side, its plan changes (${bakes.overturned.hx.toFixed(2)} vs ${base.hx.toFixed(2)})`);
assert.ok(bakes.scrap_cut.hx > base.hx + 0.8, `a cut-up hulk's turret is set down beside it (${bakes.scrap_cut.hx.toFixed(2)} vs ${base.hx.toFixed(2)})`);
for (const b of Object.values(bakes)) { b.geo.dispose(); b.shadowGeo?.dispose(); }
console.log(`wreckStates: ${DONOR} baked in ${WRECK_STATES.length} states; ${WRECK_STATES.map((s) => `${s} ${bakes[s].tris}t`).join(', ')}`);
