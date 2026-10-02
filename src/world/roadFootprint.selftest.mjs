// Receipt for src/world/roadFootprint.ts (maps-and-layouts lane, 2026-10-02). The rubble, boulder, field-work, wreck
// and well passes keep a solid's whole footprint out of the road core, where they used to clear only its centre.
// Part one checks the three helpers on a straight synthetic road. Part two reads every map's committed collision
// shard: no solid from those passes reaches into a road's 3.5 m core, measured by exact distance to the road
// polylines. Planned and street-row buildings (kind 'structure') and bridges are outside these passes, and the deliberate
// roadblocks are reported, never counted (tools/map-layout-metrics.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boxClearOfRoadCore, discClearOfRoadCore, ROAD_FOOTPRINT_CLEAR_M, shiftClearOfRoadCore } from './roadFootprint.ts';
import { createLayout } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { collisionFootprintContainsPoint } from './collision.ts';
import { createHeadlessCollisionWorld } from './headlessCollisionWorld.ts';
import { decodeCollisionManifest } from '../../server/collisionManifestCodec.ts';
import { isSolidRecord, roadPolylineDistance, ROAD_CORE_M, ROADBLOCK_KINDS } from '../../tools/map-layout-metrics.mjs';

// ---- part one: a straight road along x (the distance is |z|)
const road = { _roadDist: (_x, z) => Math.abs(z) };
assert.equal(ROAD_FOOTPRINT_CLEAR_M, ROAD_CORE_M + 0.5, 'the clearance is the brief\'s road core plus the grid margin');
assert.ok(discClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + 2, 2), 'a disc whose edge meets the clearance is clear');
assert.ok(!discClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + 1.99, 2), 'a disc reaching 1 cm further is not');
// a 4 x 10 m box: its long axis across the road at yaw 0 (forward +z), along it at yaw pi/2
assert.ok(boxClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + 5, 2, 5, 0), 'the box across the road clears by its half length');
assert.ok(!boxClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + 4.9, 2, 5, 0), 'and fails 10 cm closer');
assert.ok(boxClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + 2 + 1e-9, 2, 5, Math.PI / 2), 'the box along the road clears by its half width');
assert.ok(!boxClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + 1.9, 2, 5, Math.PI / 2), 'and fails 10 cm closer');
assert.ok(!boxClearOfRoadCore(road, 30, 0, 2, 5, 0.3), 'a box the road crosses is never clear');
// a yawed box reaches the road with a corner: half width 2 and half length 5 at 30 degrees reach 5 cos 30 + 2 sin 30
const corner = 5 * Math.cos(Math.PI / 6) + 2 * Math.sin(Math.PI / 6);
assert.ok(boxClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + corner + 0.01, 2, 5, Math.PI / 6), 'a yawed box clears past its corner');
assert.ok(!boxClearOfRoadCore(road, 0, ROAD_FOOTPRINT_CLEAR_M + corner - 0.05, 2, 5, Math.PI / 6), 'and fails inside it');
// the shift moves straight off the road in whole metres, keeps a clear seat, and gives up past its limit
const alongRoad = (x, z) => boxClearOfRoadCore(road, x, z, 2, 5, Math.PI / 2);
assert.deepEqual(shiftClearOfRoadCore(road, 7, 6.5, alongRoad), [7, 6.5], 'a clear seat stays where it is');
const north = shiftClearOfRoadCore(road, 7, 4.5, alongRoad);
assert.ok(north && north[0] === 7 && Math.abs(north[1] - 6.5) < 1e-9, `a seat 1.5 m short moves 2 m north (${north})`);
const south = shiftClearOfRoadCore(road, 7, -4.5, alongRoad);
assert.ok(south && south[0] === 7 && Math.abs(south[1] + 6.5) < 1e-9, `and its mirror 2 m south (${south})`);
assert.equal(shiftClearOfRoadCore(road, 7, 0.5, (x, z) => discClearOfRoadCore(road, x, z, 6)), null,
  'a seat needing more than 8 m stays unplaced');

// ---- part two: every committed shard
const summary = [];
for (const mapId of MAP_IDS) {
  const manifest = decodeCollisionManifest(JSON.parse(readFileSync(new URL(`../../server/world-collision-manifests/${mapId}.json`, import.meta.url), 'utf8')));
  const world = createHeadlessCollisionWorld({ mapId, heightField: { getHeightAt: () => 0 }, manifest });
  const distance = roadPolylineDistance(createLayout(getMapConfig(mapId)).roads);
  const inCore = [];
  let buildings = 0;
  for (const record of world.getObstacles()) {
    if (!isSolidRecord(record) || record.kind === 'bridge' || ROADBLOCK_KINDS.has(record.kind)) continue;
    const cx = (record.min[0] + record.max[0]) / 2, cz = (record.min[2] + record.max[2]) / 2;
    const halfDiagonal = Math.hypot(record.max[0] - record.min[0], record.max[2] - record.min[2]) / 2;
    if (distance(cx, cz) - halfDiagonal >= ROAD_CORE_M) continue;
    let nearest = Infinity;
    for (let z = record.min[2]; z <= record.max[2]; z += 0.5) {
      for (let x = record.min[0]; x <= record.max[0]; x += 0.5) {
        if (collisionFootprintContainsPoint(record, x, z, 0)) nearest = Math.min(nearest, distance(x, z));
      }
    }
    if (nearest >= ROAD_CORE_M) continue;
    if (record.kind === 'structure') buildings++;
    else inCore.push(`${record.kind ?? 'rock-or-wall'} at (${cx.toFixed(1)}, ${cz.toFixed(1)}) ${nearest.toFixed(2)} m from a road`);
  }
  assert.deepEqual(inCore, [], `${mapId}: the rubble, boulder, field-work, wreck and well passes keep their footprints out of the road core`);
  if (buildings) summary.push(`${mapId} ${buildings}`);
}
console.log(`roadFootprint.selftest: helpers on a straight road; ${MAP_IDS.length} shards keep every pass's footprint out of the road core` +
  ` (buildings still reaching a carriageway, outside these passes: ${summary.join(', ') || 'none'})`);
