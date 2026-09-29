import assert from 'node:assert/strict';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { createLayout } from './terrain.ts';
import {
  authoredRoadStationCount, authoredRoadStationIndex, buildingRoadStationIndices,
  buildPhysicalRoadStationOrigins, buildRoadStationOrigins, usesPhysicalRoadStations,
} from './maps/roadStations.ts';

const dense = Array.from({ length: 101 }, (_, i) => [i, 0]);
const completed = [[[-32, 0], ...dense, [132, 0]]];
const origins = buildPhysicalRoadStationOrigins('orchard', [dense], completed, undefined);
const layout = { roads: completed, roadStations: origins };
assert.deepEqual(origins[0].indices, [1, 25, 49, 73, 97, 101],
  'a hundred short geometry edges yield physical parcels, not a hundred poles');
assert.equal(authoredRoadStationCount(layout, 0), 6);
assert.equal(authoredRoadStationIndex(layout, 0, 0), 1);
assert.equal(authoredRoadStationIndex(layout, 0, 4), 97);
assert.equal(authoredRoadStationIndex(layout, 0, 5), -1, 'terminal has no following station');
assert.equal(authoredRoadStationIndex(layout, 0, 5, 0, 0), 101, 'terminal is still a valid fence endpoint');
assert.deepEqual(buildingRoadStationIndices(layout, 0), [25, 49, 73, 97]);
assert.equal(authoredRoadStationIndex(layout, 0, 1, 2, 0), -1, 'before refers to physical stations');
assert.equal(authoredRoadStationIndex(layout, 0, 4, 0, 2), -1, 'after refers to physical stations');
assert.equal(authoredRoadStationIndex(layout, 0, 1.5), -1);

const trimmed = [dense.slice(30, 80)];
const trimmedLayout = { roads: trimmed,
  roadStations: buildPhysicalRoadStationOrigins('orchard', [dense], trimmed, undefined) };
assert.deepEqual(trimmedLayout.roadStations[0].indices, [-1, -1, 18, 42, -1, -1]);
assert.equal(authoredRoadStationIndex(trimmedLayout, 0, 1), -1, 'trimmed ordinal cannot move to a new endpoint');
assert.equal(authoredRoadStationIndex(trimmedLayout, 0, 2), 18);
assert.equal(authoredRoadStationIndex(trimmedLayout, 0, 2, 1, 0), -1, 'missing predecessor fails closed');
assert.equal(authoredRoadStationIndex(trimmedLayout, 0, 3), -1, 'missing successor fails closed');
assert.equal(authoredRoadStationIndex(trimmedLayout, 0, 3, 0, 0), 42);
assert.deepEqual(buildingRoadStationIndices(trimmedLayout, 0), [], 'no candidates without both surviving neighbors');

const unchanged = { roads: [dense] };
assert.deepEqual(buildingRoadStationIndices(unchanged, 0), Array.from({ length: 99 }, (_, i) => i + 1),
  'legacy building candidates keep every original index in order');
const legacyOrigin = buildRoadStationOrigins([dense], completed);
assert.equal(buildPhysicalRoadStationOrigins('verdant', [dense], completed, legacyOrigin), legacyOrigin,
  'Verdant preserves the exact legacy origin object');

let roundedMaps = 0;
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  const raw = createLayout(config, false);
  const final = createLayout(config);
  if (!usesPhysicalRoadStations(id)) {
    assert.ok(!final.roadStations?.some(origin => origin?.indices), `${id}: legacy station policy`);
    continue;
  }
  roundedMaps++;
  for (let road = 0; road < final.roads.length; road++) {
    const indices = final.roadStations[road].indices;
    const sourceIndices = raw.roadStations[road].indices;
    const source = raw.roads[road];
    const originalBytes = JSON.stringify(source);
    let pathLength = 0;
    for (let i = 1; i < source.length; i++) pathLength += Math.hypot(
      source[i][0] - source[i - 1][0], source[i][1] - source[i - 1][1]);
    assert.ok(sourceIndices.length <= Math.floor((pathLength + 1e-7) / 24) + 2,
      `${id}/${road}: station budget tracks physical road length`);
    for (let i = 1; i < sourceIndices.length - 1; i++) {
      let spacing = 0;
      for (let at = sourceIndices[i - 1] + 1; at <= sourceIndices[i]; at++) {
        spacing += Math.hypot(source[at][0] - source[at - 1][0], source[at][1] - source[at - 1][1]);
      }
      assert.ok(spacing >= 24 - 1e-7, `${id}/${road}: no adjacent arc-chord poles (${spacing}m)`);
    }
    let previous = -1;
    for (const index of indices) {
      if (index < 0) continue;
      assert.ok(index > previous, `${id}/${road}: station indices remain ordered and unique`);
      previous = index;
    }
    for (const index of buildingRoadStationIndices(final, road)) {
      assert.ok(index > 0 && index < final.roads[road].length - 1, `${id}/${road}: candidate has geometric neighbors`);
      assert.ok(indices.includes(index), `${id}/${road}: building proposals use sparse parcels`);
    }
    assert.equal(JSON.stringify(source), originalBytes, `${id}/${road}: selection cannot rewrite curve geometry`);
  }
}
assert.equal(roundedMaps, 7);
console.log('roadPhysicalStations: sparse physical spacing, trimmed-neighbor semantics and all 31 map policies pass');
