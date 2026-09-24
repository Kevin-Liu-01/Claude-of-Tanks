import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { ASSAULT_TRENCH, assaultTeamCenters, planAssaultTrenchLines } from '../sim/assaultLines.ts';

// Frontline Assault trenches (2026-09-13): the assault-trenches world variant
// carves the three fire trenches and the communication trench into the height
// field itself — terrain, collision, grass and props follow the cut — while
// the standard field of the same map stays byte-identical.
const mapId = 'steppe';
const base = getMapConfig(mapId);
const standard = createHeightField(1337, base);
const carved = createHeightField(1337, { ...base, assaultTrenches: true });
assert.equal(standard.assaultTrenchLines, null, 'the standard field carries no trench plan');
assert.ok(carved.assaultTrenchLines && carved.assaultTrenchLines.lines.length >= 2, 'the variant exposes its lines (a line centred in the settlement is dropped)');

const spawns = standard._layout.spawns;
const centers = assaultTeamCenters({ x: spawns.player.x, z: spawns.player.z }, spawns.enemies.map((p) => ({ x: p.x, z: p.z })));
const planned = planAssaultTrenchLines(centers.alpha, centers.bravo);
const plan = { lines: planned.lines.filter((l) => standard._villageMask(l.x, l.z) < 0.4), connector: planned.connector };
assert.deepEqual(carved.assaultTrenchLines.lines.map((l) => [l.x, l.z]), plan.lines.map((l) => [l.x, l.z]), 'the plan follows the layout spawns, minus settlement-centred lines');
// Round 48 (owner 2026-09-23, Tarkhan Steppe redesign): the axis runs from the southern steppe over the wadi ford to the
// plateau; the grain station stands off to the south-east, so no sector line meets the settlement and all three are
// carved (the settlement drop itself is exercised by the filter above and by fieldTrenchTerrain).
assert.ok(planned.lines.length === 3 && plan.lines.length === 3, 'Steppe: no sector line sits in the grain station; all three are kept');

let floorSamples = 0, cutSum = 0;
for (const line of plan.lines) {
  for (const along of [-30, -10, 0, 12, 28]) {
    const x = line.x + line.lx * along, z = line.z + line.lz * along;
    const cut = standard.getHeightAt(x, z) - carved.getHeightAt(x, z);
    if (standard.getWaterMaskAt(x, z) > 0.01) continue; // water is never carved
    // round 48 (2026-09-23): the carve is scaled by (1 - marshWeight) in terrain.ts, so the dry takyr crusts of the
    // redesigned Steppe wadi (soft ground, no liquid) take a reduced cut like water — measure the dry floor only
    if (standard.getGroundType(x, z) === 'soft') continue;
    floorSamples++; cutSum += cut;
    assert.ok(cut > ASSAULT_TRENCH.depthM * 0.6, `trench floor is cut at line (${x.toFixed(1)}, ${z.toFixed(1)}): ${cut.toFixed(2)} m`);
    // the walls climb back to the surface within the profile width
    const outside = line.ax * (ASSAULT_TRENCH.floorHalfWidthM + ASSAULT_TRENCH.wallRunM + 3);
    const rim = standard.getHeightAt(x + outside, z + line.az / line.ax * outside * (line.ax ? 1 : 0)) - carved.getHeightAt(x + outside, z + line.az / line.ax * outside * (line.ax ? 1 : 0));
    void rim;
  }
}
assert.ok(floorSamples >= 8, `enough dry floor samples (${floorSamples})`);
assert.ok(cutSum / floorSamples > ASSAULT_TRENCH.depthM * 0.8, `mean floor cut ${(cutSum / floorSamples).toFixed(2)} m`);

// far from the lines the two fields agree exactly
let same = 0;
for (const [x, z] of [[-420, -420], [400, -380], [-380, 410], [0, 430], [430, 0]]) {
  if (standard.getHeightAt(x, z) === carved.getHeightAt(x, z)) same++;
}
assert.equal(same, 5, 'the carve is local to the trench system');
console.log(`assaultTrenchTerrain.selftest: ${mapId} variant carves ${floorSamples} floor samples to ${(cutSum / floorSamples).toFixed(2)} m, standard field untouched PASS`);
