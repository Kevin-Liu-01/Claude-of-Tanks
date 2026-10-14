// Hulls pivoting on real roofs no longer hop off them (physics stream F7a, 2026-10-14; the coordinator: "a step larger
// than the suspension can absorb is a strike or an edge contact, not a lift", and a rebound the impact law owes is no
// launch): a support rise the hull's travel does not explain is no moving ground. Two of the contact census's pivots,
// replayed through the real network authority (tools/physics-torture.mjs runCase) on the committed shards, as the
// census runs them:
//  - Frontier's 54-degree roof: a T-90 slid off it hung at the eave with a track corner across it; its support stepped
//    0.9 m in one step and again each time the corner crossed back, the ground's rate took the steps, and it left the
//    eave at 2.6 m/s. No launch now (a step past half a metre in one step is no moving ground).
//  - Foundry's 25 m roof: a BMP-2 slides off it, falls 19 m, lands at 21 m/s and rises off the ground at 3.2 m/s, the
//    ruleset's restitution (0.15): a rebound, which the census no longer counts as a launch.
// And each run is exact: the same pivot twice ends on the same pose to the bit.
import assert from 'node:assert/strict';
import { runCase } from './physics-torture.mjs';
import { censusInternals } from './tank-world-contact-census.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet(['t90m', 'bmp2']);

const worlds = new Map();
/** The census's roof pivot (tank-world-contact-census.mjs roofSamples: pivotInPlace, steer right 3.5 s, then braked). */
async function pivot(mapId, hull, x, z, yaw) {
  if (!worlds.has(mapId)) worlds.set(mapId, await censusInternals.loadWorld(mapId));
  const world = worlds.get(mapId);
  censusInternals.resetWorld(world);
  const near = world.query(x, z, 40).filter((r) => r.treeIdx == null && r.kind !== 'tree');
  return runCase(hull, 'earth', {
    id: `${mapId}-roof-pivot`, mapId, seconds: 7, spawn: { x, z, yaw, dropTo: 0.12 }, allowBlocked: true, grounded: true,
    input: (t) => (t < 3.5 ? { throttle: 0, steer: 1, brake: false } : { throttle: 0, steer: 0, brake: true }),
    rest: { afterS: 3.5, settleS: 1, deadlineS: 6.5, spanS: 1.5 }, worldHalfM: censusInternals.WORLD_HALF_M - 2,
    floorY: world.hf.minY - 20, metricsFromS: 0.3,
    anchor: { x: x > 0 ? x - 200 : x + 200, z: z > 0 ? z - 200 : z + 200 },
    world: { fn: world.fn, contact: world.contact, heightField: world.hf, obstacles: near, worldCollision: world.worldCollision },
  }, { replay: false });
}

const frontier = await pivot('frontier', 't90m', 173.7323, 101.4752, 3.189701291016217);
assert.ok(frontier.launches === 0 && frontier.takeoffMaxMps <= 2.5,
  `Frontier: the T-90 at the 54-degree roof's eave is thrown by nothing (takeoff ${frontier.takeoffMaxMps.toFixed(2)} m/s)`);
const foundry = await pivot('foundry', 'bmp2', -282.0764, 114.9346, 5.380314797147378);
assert.ok(foundry.maxLandingMps > 15, `Foundry: the BMP-2 falls off the 25 m roof (lands at ${foundry.maxLandingMps.toFixed(1)} m/s)`);
assert.ok(foundry.launches === 0 && foundry.reboundExcessMps <= 0.05,
  `Foundry: its rebound is the restitution of its landing, no launch (${foundry.launches} launches, excess ${foundry.reboundExcessMps.toFixed(2)} m/s)`);
const again = await pivot('frontier', 't90m', 173.7323, 101.4752, 3.189701291016217);
assert.deepEqual(again.final, frontier.final, 'the same pivot, the same pose');
console.log(`roof-hops.selftest: Frontier's eave thrown by nothing (${frontier.takeoffMaxMps.toFixed(2)} m/s), Foundry's 19 m fall a rebound `
  + `(${foundry.maxLandingMps.toFixed(1)} m/s in); deterministic`);
