// Hulls going off a roof's edge are no longer pushed out of the building sideways (physics stream F8, 2026-10-14; the
// coordinator: "the edge-fall pop model ... body-edge-on-roof-edge strike/pivot"; the owner: "if they land on top of
// buildings or other weird objects! all physics engine stuff i want to account for"). The contact census's worst roof
// falls, replayed exactly as the census runs them (tools/tank-world-contact-census.mjs censusMap: the real network
// authority over the committed shards):
//  - a hull driven off a roof at an angle, or dropped across its edge, turned nose-down about its track stations a metre
//    and more behind the edge, its underside sank half a metre into the roof between them and the edge, and the standing
//    rule then found it inside the building and pushed it out sideways a metre a step (Cliffbridge, Airfield, Frontier's
//    edges): the roof's edge under the box is a contact now (structureSupport.ts topEdgeStationsIn);
//  - a part with no height range of its own in a record with a drawn top was never passed: a T-90 dropped on Copper
//    Mesa's 22 m tower was pushed off it 4.8 m from 0.47 m over its top, and fell to the ground.
// Each run: no pop, no overlap left with a collider, never stood into a top or inside a solid; and each is exact.
import assert from 'node:assert/strict';
import { censusMap } from './tank-world-contact-census.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';

await ensureAuthorityFleet(['t90m', 'bmp2', 'jpz_e100_x', 'm1a2']);

const CASES = [
  ['copper_mesa', 'copper_mesa/roofs/edge/5/edge-drop', "a T-90 dropped across the edge of Copper Mesa's 22 m tower"],
  ['cliffbridge', 'cliffbridge/roofs/flat/0/drive-off', 'an E-100 driven off a Cliffbridge roof at an angle'],
  ['airfield', 'airfield/roofs/flat/3/drive-off', 'an E-100 driven off an Airfield roof at an angle'],
  ['frontier', 'frontier/roofs/edge/11/edge-stand', "a BMP-2 set down on a Frontier roof's edge"],
];
const fmt = (m) => `pop ${m.popXZMaxM.toFixed(2)} m, overlap ${m.obstaclePenMaxM.toFixed(2)} m, into the roof ${m.roofSinkMaxM.toFixed(2)} m, `
  + `inside a solid ${m.insideSolidM.toFixed(2)} m, takeoff ${m.takeoffMaxMps.toFixed(2)} m/s`;
const runs = [];
for (const [map, id, what] of CASES) {
  const [row] = await censusMap(map, { classes: ['roofs'], only: id });
  assert.ok(row, `${id}: the census still samples this run`);
  const m = row.m;
  assert.ok(m.popXZMaxM <= 0.12 && m.obstaclePenMaxM <= 0.1, `${what} is pushed out of nothing (${fmt(m)})`);
  assert.ok(m.roofSinkMaxM <= 0.25 && m.insideSolidM <= 0.3, `${what} never stands into the roof (${fmt(m)})`);
  assert.ok(m.takeoffMaxMps <= 2.5, `${what} is thrown by nothing (${fmt(m)})`);
  runs.push([id, row]);
}
// exact: the same fall twice ends on the same pose to the bit
const [again] = await censusMap('cliffbridge', { classes: ['roofs'], only: 'cliffbridge/roofs/flat/0/drive-off' });
assert.deepEqual(again.m.final, runs[1][1].m.final, 'the same fall, the same pose');
console.log(`roof-falls.selftest: ${runs.length} roof falls from the census (${runs.map(([id]) => id.split('/')[0]).join(', ')}) leave no pop, `
  + 'no overlap and no hull in a roof; deterministic');
