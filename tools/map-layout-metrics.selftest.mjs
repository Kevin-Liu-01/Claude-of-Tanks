// Receipt for tools/map-layout-metrics.mjs: the viewshed, cover, lane, route, choke and balance laws on synthetic
// rasters (each law driven by a scene whose answer is known), then one real battlefield through the whole pipeline.
import assert from 'node:assert/strict';
import { terrainSlopeMargin } from '../src/sim/terrainMobility.ts';
import {
  axisSlices, coverClass, distanceMap, evaluateTargets, LAYOUT_DRIVETRAIN, maximumTwoWayGrade, objectiveBalance,
  rasterSpec, seesPoint, sightHistogram, sliceLanes, spawnFrame, sweepRay, computeLayoutMetrics, SIGHT_MAX_M,
} from './map-layout-metrics.mjs';

// ---- viewshed: flat ground sees to the range; a wall breaks the line just past it; a low bump does not
{
  const spec = rasterSpec(500, 2);
  const ground = new Float32Array(spec.n * spec.n);
  const surface = Float32Array.from(ground);
  assert.equal(sweepRay(spec, ground, surface, null, 0, 0, 0, 1, 2.4, 1.9, SIGHT_MAX_M), SIGHT_MAX_M,
    'flat ground keeps the whole 445 m ray visible');
  assert.equal(sweepRay(spec, ground, surface, null, 0, 460, 0, 1, 2.4, 1.9, SIGHT_MAX_M), -1,
    'a ray that leaves the raster unoccluded measured nothing (excluded)');
  const walled = Float32Array.from(ground);
  for (let x = -20; x <= 20; x += 2) walled[spec.index(x, 100)] = 4;
  const occ = sweepRay(spec, ground, walled, null, 0, 0, 0, 1, 2.4, 1.9, SIGHT_MAX_M);
  assert.ok(occ > 100 && occ <= 106, `a 4 m wall at 100 m breaks the sightline just behind it (got ${occ})`);
  const bumped = Float32Array.from(ground);
  bumped[spec.index(0, 50)] = 2.0;
  assert.equal(sweepRay(spec, ground, bumped, null, 0, 0, 0, 1, 2.4, 1.9, SIGHT_MAX_M), SIGHT_MAX_M,
    'a 2 m hump under the eye hides 12 m behind it, less than a hull length, and never breaks the sightline');
  assert.equal(seesPoint(spec, ground, surface, 0, 0, 0, 200), true, 'open ground: line of sight');
  assert.equal(seesPoint(spec, ground, walled, 0, 0, 0, 200), false, 'the wall cuts the line of sight');
  assert.deepEqual(sightHistogram([10, 60, 150, 250, 350, 445]), [0.167, 0.167, 0.167, 0.167, 0.167, 0.167],
    'one ray per histogram bin');
}

// ---- cover toward a threat: a 3 m wall hides the tank, a 1.5 m berm leaves it hull-down, open ground is open
{
  const spec = rasterSpec(200, 2);
  const ground = new Float32Array(spec.n * spec.n);
  const wall = Float32Array.from(ground), berm = Float32Array.from(ground);
  for (let x = -12; x <= 12; x += 2) { wall[spec.index(x, 14)] = 3; berm[spec.index(x, 14)] = 1.5; }
  assert.equal(coverClass(spec, ground, wall, 0, 0, 0, 180), 2, 'a 3 m wall between the cell and the threat: full cover');
  assert.equal(coverClass(spec, ground, berm, 0, 0, 0, 180), 1, 'a 1.5 m berm: hull-down');
  assert.equal(coverClass(spec, ground, ground, 0, 0, 0, 180), 0, 'flat ground: open');
  assert.equal(coverClass(spec, ground, wall, 0, 0, 0, -180), 0, 'the wall behind the tank does not cover it from the front');
}

// ---- lanes across a slice: sight breaks and unusable points split runs; narrow runs are not lanes
{
  const points = Array.from({ length: 12 }, (_, k) => ({ x: k * 20, z: 0, lateral: k * 20, usable: k !== 6 }));
  const blockedBetween = new Set(['2-3']);
  const seesPair = (a, b) => !blockedBetween.has(`${Math.min(a.index ?? a.x / 20, b.index ?? b.x / 20)}-${Math.max(a.index ?? a.x / 20, b.index ?? b.x / 20)}`);
  const lanes = sliceLanes(points, { seesPair, everyM: 20, minWidthM: 40 });
  assert.deepEqual(lanes.map((run) => [run[0].index, run[run.length - 1].index]), [[0, 2], [3, 5], [7, 11]],
    'the sight break after point 2 and the unusable point 6 split the slice into three runs of at least 40 m');
}
{
  // the first run 0..2 is exactly 40 m wide and must count
  const points = Array.from({ length: 6 }, (_, k) => ({ x: k * 20, z: 0, lateral: k * 20, usable: true }));
  const seesPair = (a, b) => !((a.x === 40 && b.x === 60) || (a.x === 60 && b.x === 40));
  const lanes = sliceLanes(points, { seesPair, everyM: 20, minWidthM: 40 });
  assert.equal(lanes.length, 2, 'two 40 m runs either side of a sight break are two lanes');
  const narrow = sliceLanes(points.slice(0, 2), { seesPair, everyM: 20, minWidthM: 40 });
  assert.equal(narrow.length, 0, 'a 20 m run is no lane');
  const hedged = sliceLanes(points, { seesPair: () => true, concealment: (a) => (a.x === 40 ? 0.9 : 0), everyM: 20 });
  assert.equal(hedged.length, 2, 'a thick hedge between neighbours separates lanes like a wall');
}

// ---- routes and chokes: a wall across the map with one gap; the river slice keeps two runs
{
  const spec = rasterSpec(100, 5);
  const passable = new Uint8Array(spec.n * spec.n).fill(1), cost = new Float32Array(spec.n * spec.n).fill(1);
  for (let x = -100; x <= 100; x += 5) if (x < 60 || x > 70) passable[spec.index(x, 0)] = 0;
  const ok = () => true;
  const from = spec.index(-60, -60), to = spec.index(-60, 60);
  const dist = distanceMap(spec, passable, cost, ok, from);
  assert.ok(dist[to] > 2 * Math.hypot(125, 60) - 20, `the route detours through the gap at x = 60..70 (got ${dist[to].toFixed(0)} m)`);
  assert.equal(Number.isFinite(dist[spec.index(-100, 0)]), false, 'a cell inside the wall is unreachable');
  const frame = spawnFrame({ player: { x: 0, z: -80 }, enemies: [{ x: 0, z: 80 }] });
  const slices = axisSlices(frame, spec, passable, { half: 100, from: 0.4, to: 0.6, everyM: 8 });
  const wallSlice = slices.find((row) => Math.abs(row.along - 0.5) < 1e-6);
  assert.ok(wallSlice && wallSlice.width <= 15, `the wall slice keeps only the gap (got ${wallSlice?.width} m)`);
  assert.ok(slices.every((row) => row.along === 0.5 || row.width > 150), 'the open slices span the map');
}

// ---- objective balance, targets and exceptions
{
  assert.equal(objectiveBalance([{ fromAlpha: 200, fromBravo: 400 }, { fromAlpha: 400, fromBravo: 200 }, { fromAlpha: 300, fromBravo: 300 }]), 1,
    'mirrored zones are perfectly balanced');
  assert.equal(objectiveBalance([{ fromAlpha: 100, fromBravo: 400 }, { fromAlpha: 200, fromBravo: 300 }, { fromAlpha: 300, fromBravo: 500 }]), 3,
    'alpha nearer every zone: the nearest pair ratio is 300 / 100');
  assert.equal(objectiveBalance([{ fromAlpha: 10, fromBravo: 30 }]), 1, 'distances inside the 60 m floor tie');
  assert.equal(objectiveBalance([{ fromAlpha: null, fromBravo: 30 }]), Infinity, 'an unreachable objective is unbalanced');
  const row = { spawns: { separationM: 400, routeStretch: 1.1 }, lanes: { count: 3 }, chokes: { minM: 200, runsMin: 1 },
    sight: { medianM: 120, longShare: 0.1, closeShare: 0.4 }, cover: { midShare: 0.3, sectorMin: 0.2, hullDownTeamShare: 0.1 },
    relief: { stdM: 4 }, dressing: { orphanBuildingShare: 0, solidPropsInRoad: 0, solidPropsInWater: 0 }, objectiveSymmetry: 1.05 };
  const checks = evaluateTargets(row);
  assert.equal(checks.find((c) => c.key === 'spawnSeparationM').ok, false, '400 m between the spawns is under the brief');
  const excused = evaluateTargets(row, { spawnSeparationM: 'a skirmish map' });
  assert.equal(excused.find((c) => c.key === 'spawnSeparationM').ok, 'exception', 'an authored exception reports its reason');
  assert.ok(checks.filter((c) => c.key !== 'spawnSeparationM').every((c) => c.ok === true), 'every other value sits in its band');
}

// ---- the drivetrain's two-way grade limit comes from the shared mobility law
{
  const grade = maximumTwoWayGrade(terrainSlopeMargin, LAYOUT_DRIVETRAIN, 'medium');
  assert.ok(grade > 0.3 && grade < 1.28, `a 900 hp / 60 t hull holds a sensible two-way grade (got ${grade.toFixed(3)})`);
}

// ---- one real battlefield end to end (no objectives: the placement search is covered by its own receipts)
{
  const m = await computeLayoutMetrics('verdant', { objectives: false });
  assert.equal(m.cover.sectors.length, 9, 'nine sectors');
  assert.ok(m.sight.observers > 1000 && m.sight.rays > 20000, 'a dense observer lattice over the drivable square');
  assert.ok(m.spawns.routeStretch >= 1 && m.spawns.routeStretch < 1.5, `the route is at least the straight line (${m.spawns.routeStretch})`);
  assert.ok(m.lanes.perSlice.length === 3 && m.lanes.count >= 1, 'three lane slices');
  assert.ok(m.chokes.minM > 0 && m.chokes.medianM >= m.chokes.minM, 'slice widths are ordered');
  assert.ok(m.sight.histogram.reduce((a, b) => a + b, 0) > 0.99, 'the histogram sums to one');
  assert.ok(Array.isArray(m.checks) && m.checks.length > 10, 'every brief target is evaluated');
}

console.log('map-layout-metrics.selftest: ok');
