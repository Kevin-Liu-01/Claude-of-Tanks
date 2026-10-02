import assert from 'node:assert/strict';
import {smoothRoadGradesByDistance,blendRoadNetworkGrades} from './roadGradeSmoothing.ts';
import {alignPoldersNorthernRoadGrades} from './roadBorderCorridor.ts';
import { getMapConfig } from './index.ts';
import { createLayout, createHeightField } from '../terrain.ts';
import { roadNetworkComponentCount } from './roadEndpoints.ts';
import { LAYOUT_BRIEF_MAPS } from './layoutBriefMaps.ts';
const road=Array.from({length:12},(_,i)=>[i*32,0]), values=road.map((_,i)=>Math.sin(i)*12), expected=values.slice();
for(let pass=0;pass<4;pass++) {const prev=expected.slice();for(let i=1;i<prev.length-1;i++)expected[i]=prev[i-1]*.25+prev[i]*.5+prev[i+1]*.25;}
const actual=[values.slice()];smoothRoadGradesByDistance([road],actual);assert.ok(actual[0].every((x,i)=>Math.abs(x-expected[i])<1e-12),'regular road keeps established32m smoothing');
const flat=[road.map(()=>7)];smoothRoadGradesByDistance([road],flat);assert.ok(flat[0].every(x=>x===7));
// Two intersections of a loop and spine: both must grade to shared levels.
const loop=[[-100,0],[0,0],[100,0],[100,100],[0,100],[-100,100]];
const spine=[[0,-100],[0,0],[0,50],[0,100],[0,200]];
const e=[loop.map(()=>10),spine.map(()=>2)];
blendRoadNetworkGrades([loop,spine],e);
assert.ok(Math.abs(e[0][1]-e[1][1])<1e-8,'firstloop crossing shares height');
assert.ok(Math.abs(e[0][4]-e[1][3])<1e-8,'secondloop crossing shares height');
const parallel=[[[-100,0],[100,0]],[[-100,10],[100,10]]],original=[[0,0],[20,20]],kept=structuredClone(original);
blendRoadNetworkGrades(parallel,kept);assert.deepEqual(kept,original,'nearbyparallel roads are notjunctions');
// Independently enumerate the actual seven road networks. Solve the two
// segment parameters, then interpolate each final elevation at that crossing;
// checking only nearby vertices would miss a step inside a painted junction.
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1]];
function exactCrossings(roads) {
  const crossings = [];
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    for (let i = 1; i < roads[a].length; i++) for (let j = 1; j < roads[b].length; j++) {
      const p = roads[a][i - 1], q = roads[a][i], r = roads[b][j - 1], s = roads[b][j];
      const forward = minus(q, p), other = minus(s, r), between = minus(r, p);
      const determinant = cross2(forward, other);
      if (Math.abs(determinant) < 1e-8) continue;
      const t = cross2(between, other) / determinant, u = cross2(between, forward) / determinant;
      if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) continue;
      const point = [p[0] + t * forward[0], p[1] + t * forward[1]];
      // Shared segment endpoints produce multiple identical hits. Deduplicate
      // at numerical precision, independently of the producer's metre radius.
      if (crossings.some(hit => hit.a === a && hit.b === b
        && Math.hypot(hit.point[0] - point[0], hit.point[1] - point[1]) < 1e-6)) continue;
      crossings.push({ a, b, i, j, t, u, point });
    }
  }
  return crossings;
}
const crossingCounts = { polders: 6, copper_mesa: 4, oasis: 6, whiteout: 6, orchard: 6, longleaf: 7, saltwind: 6 };
let checked = 0;
for (const [mapId, expectedCount] of Object.entries(crossingCounts)) {
  const roads = createLayout(getMapConfig(mapId)).roads;
  const crossings = exactCrossings(roads);
  assert.equal(crossings.length, expectedCount, `${mapId}: every authored crossing remains in the audit`);
  const levels = roads.map((nodes, route) => nodes.map(([x, z]) =>
    route * 4 + Math.sin(x * .01) * 8 + Math.cos(z * .008) * 4));
  const interpolated = (row, end, t) => row[end - 1] * (1 - t) + row[end] * t;
  assert.ok(crossings.some(hit => Math.abs(interpolated(levels[hit.a], hit.i, hit.t)
    - interpolated(levels[hit.b], hit.j, hit.u)) > 1), `${mapId}: fixture starts with unequal road levels`);
  blendRoadNetworkGrades(roads, levels);
  for (const hit of crossings) {
    assert.ok(Math.abs(interpolated(levels[hit.a], hit.i, hit.t)
      - interpolated(levels[hit.b], hit.j, hit.u)) < 1e-7,
    `${mapId}: roads ${hit.a}/${hit.b} share height at ${hit.point}`);
    checked++;
  }
}
assert.equal(checked, 41);
console.log('roadGradeSmoothing: physical smoothing and all 41 actual map crossings');

// Overlapping northeast causeways are not a geometric junction: their support
// nevertheless needs one continuous height plane in the shared boundary bank.
const poldersRoads = createLayout(getMapConfig('polders')).roads;
const poldersLevels = poldersRoads.map((nodes, route) => nodes.map(([x,z]) => route * 8 + z * .025));
const beforePolders = structuredClone(poldersLevels);
alignPoldersNorthernRoadGrades('polders', poldersRoads, poldersLevels);
assert.deepEqual(poldersLevels.slice(0,2), beforePolders.slice(0,2), 'unrelated routes remain exact');
for (const route of [2,3]) for (let i=0;i<poldersRoads[route].length;i++) {
  const z=poldersRoads[route][i][1];
  if(z<=398) assert.equal(poldersLevels[route][i],beforePolders[route][i], 'interior grades remain exact');
  if(z>=430) assert.ok(Math.abs(poldersLevels[route][i]-(20+z*.025))<1e-9, 'both banks use one shared z-plane');
}
const otherLevels=structuredClone(beforePolders);
alignPoldersNorthernRoadGrades('verdant',poldersRoads,otherLevels);
assert.deepEqual(otherLevels,beforePolders,'other maps are unchanged');
console.log('Polders shared boundary grade: unequal levels converge, interior and other routes stay exact');

// Every road of a layout-brief map (2026-10-01, docs/MAP-LAYOUT-BRIEF.md) stays drivable on the actual collision
// surface — not only its authored control heights — at three terrain seeds: no sampled grade over 18 %, and the
// network is one connected graph. (This section replaces the Sirocco Wadi earthwork laws, which left with its old
// country roads.)
for (const mapId of LAYOUT_BRIEF_MAPS) {
  const config = getMapConfig(mapId);
  const roads = createLayout(config).roads;
  assert.equal(roadNetworkComponentCount(roads), 1, `${mapId}: one connected road network`);
  for (const seed of [1337, 2025, 7719]) {
    const field = createHeightField(seed, { ...config, fieldTrenches: false });
    let worst = 0, at = null;
    for (const road of roads) for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length, steps = Math.ceil(length / 2);
      for (let j = 0; j < steps; j++) {
        const t = (j + 0.5) / steps, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        if (Math.max(Math.abs(x), Math.abs(z)) > 470) continue; // the border portals grade through the rim
        const grade = Math.abs(field.getHeightAt(x + 2 * dx, z + 2 * dz) - field.getHeightAt(x - 2 * dx, z - 2 * dz)) / 4;
        if (grade > worst) { worst = grade; at = [Math.round(x), Math.round(z)]; }
      }
    }
    assert.ok(worst <= 0.18, `${mapId} seed ${seed}: road grade ${worst.toFixed(3)} at ${at} <= 18 %`);
    console.log(JSON.stringify({ test: 'layoutBriefRoadGrades', mapId, seed, worstGrade: Number(worst.toFixed(4)), at }));
  }
}
