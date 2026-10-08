// A ridge's curved axis (src/world/landformPath.ts; the map-revival lane, 2026-10-08, Skybridge round 6) and the carved
// landforms' union (terrain.ts `union: 'carve'`). This receipt holds the contract:
//   - a two-point path is exactly the straight ridge between its points (every geology term in the same frame);
//   - a meander's frame is continuous: a canyon cut along it keeps its floor along the whole curve, its walls on both
//     sides at the authored width, and no step anywhere across or along it larger than its own walls make;
//   - past the path's ends the frame runs straight on, so a nose rounds the head and a cliff end squares the other;
//   - carved landforms join as their deepest: two crossing canyons never cut deeper than either alone;
//   - the geology's rock footprint follows the curve.
import assert from 'node:assert/strict';
import { createHeightField, createLayout, sampleLandformHeight } from './terrain.ts';
import { prepareLandformPath, landformPathFrame } from './landformPath.ts';
import { geologyRockWeight } from './landformGeology.ts';
import { getMapConfig } from './maps/index.ts';

const canyon = { profile: 'canyon', wall: [0.86, 0.92], apron: 0, outline: 0.04, rough: 0 };
const prepare = (forms) => createLayout({ terrain: { landforms: forms } }).terrain.landforms;

// 1. a two-point path is the straight ridge
{
  const a = [-60, 20], b = [80, 70];
  const yawDeg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const [bar, path] = prepare([
    { kind: 'ridge', x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, length: Math.hypot(b[0] - a[0], b[1] - a[1]), width: 30, height: -18, yawDeg,
      geology: { ...canyon, cliffEnd: 'both' } },
    { kind: 'ridge', path: [a, b], width: 30, height: -18, x: 0, z: 0, geology: { ...canyon, cliffEnd: 'both' } },
  ]);
  // (the salt reads the centre: the path's centre is the bar's)
  assert.ok(Math.abs(path.x - bar.x) < 1e-9 && Math.abs(path.z - bar.z) < 1e-9, 'the path ridge stands at its centre');
  let worst = 0, n = 0;
  for (let x = -120; x <= 140; x += 3.7) for (let z = -40; z <= 130; z += 3.3) {
    const d = Math.abs(sampleLandformHeight(bar, x, z) - sampleLandformHeight(path, x, z));
    worst = Math.max(worst, d); n++;
  }
  assert.ok(worst < 1e-6, `a two-point path reproduces the straight ridge (worst ${worst} m over ${n} points)`);
}

// 2. a meander: a canyon along an S keeps its floor, its width and its continuity
const S = [[-40, -160], [10, -100], [30, -30], [-10, 40], [-40, 100], [-20, 160], [20, 210]];
const [meander] = prepare([{ kind: 'ridge', path: S, width: 30, height: -20, x: 0, z: 0, geology: { ...canyon, cliffEnd: 'nose-start' } }]);
const P = meander._path;
assert.ok(P.minRadius > 30 * 1.04 + 4, `the meander's tightest bend (${P.minRadius.toFixed(1)} m) stays wider than its reach`);
assert.ok(Math.abs(P.length - meander.length) < 1e-9 && P.length > 400, `the ridge's length is the curve's (${P.length.toFixed(1)} m)`);
{
  // along the curve, every 2 m: the axis is the floor; 0.8 of the half-width out on both sides still the floor; past the
  // rim (1.0) the plain
  const frame = { lx: 0, lz: 0 };
  let floorMiss = 0, rimMiss = 0, stations = 0;
  for (let i = 0; i + 1 < P.xs.length; i += 1) {
    const x = P.xs[i], z = P.zs[i];
    const tx = P.xs[i + 1] - x, tz = P.zs[i + 1] - z, l = Math.hypot(tx, tz);
    const nx = -tz / l, nz = tx / l;
    const s = P.s[i];
    if (s < 40 || s > P.length - 25) continue; // the nose and the cliff end are checked below
    stations++;
    assert.ok(landformPathFrame(P, x, z, frame) && Math.abs(frame.lz) < 1e-6 && Math.abs(frame.lx - (s - P.length / 2)) < 1e-6,
      `the curve's own points are its axis (station ${s.toFixed(1)})`);
    for (const side of [-1, 1]) {
      if (sampleLandformHeight(meander, x + nx * side * 30 * 0.8, z + nz * side * 30 * 0.8) > -19.5) floorMiss++;
      if (sampleLandformHeight(meander, x + nx * side * 30 * 1.1, z + nz * side * 30 * 1.1) < -0.01) rimMiss++;
    }
    if (sampleLandformHeight(meander, x, z) > -19.99) floorMiss++;
  }
  assert.ok(stations > 150, `stations checked (${stations})`);
  assert.equal(floorMiss, 0, 'the floor runs the whole curve, wall to wall');
  assert.equal(rimMiss, 0, 'the plain starts past the rim on both sides of every bend');
  // continuity: on a grid over the canyon no step between neighbours 0.5 m apart is larger than the walls' own (a
  // 20 m smoothstep wall over 0.06 of 30 m falls ~8.3 m in 0.5 m at its steepest; a fold would jump floor to plain, 20 m)
  let steps = 0, worstFlat = 0;
  for (let x = -110; x <= 110; x += 2.1) for (let z = -200; z <= 250; z += 2.3) {
    const h = sampleLandformHeight(meander, x, z), hx = sampleLandformHeight(meander, x + 0.5, z), hz = sampleLandformHeight(meander, x, z + 0.5);
    const jump = Math.max(Math.abs(hx - h), Math.abs(hz - h));
    if (jump > 10) steps++;
    // where both neighbours are floor or both are plain, nothing moves at all
    const floor = (v) => Math.abs(v + 20) < 1e-9;
    if ((floor(h) && floor(hx) && floor(hz)) || (h === 0 && hx === 0 && hz === 0)) worstFlat = Math.max(worstFlat, jump);
  }
  assert.equal(steps, 0, 'no fold: no step steeper than the walls');
  assert.ok(worstFlat < 1e-6, `the floor and the plain are flat (${worstFlat})`);
}

// 3. the ends: a nose at the head (its half-disc stands inside the first point, as a butte's nose stands inside its
// length), a cliff end at the last point
{
  const head = S[0], dir = [S[1][0] - S[0][0], S[1][1] - S[0][1]], l = Math.hypot(...dir);
  const inn = [dir[0] / l, dir[1] / l], side = [-inn[1], inn[0]];
  const at = (along, across) => sampleLandformHeight(meander, head[0] + inn[0] * along + side[0] * across, head[1] + inn[1] * along + side[1] * across);
  assert.ok(at(10, 0) < -19.5, 'the nose keeps its floor 10 m inside the head point');
  assert.equal(at(-2, 0), 0, 'past the head point, the plain');
  assert.equal(at(10, 25), 0, 'the nose is round: the corner a square end would floor is plain');
  assert.ok(at(45, 18) < -19.5 && at(45, -18) < -19.5, 'past the nose the canyon runs full width');
  const end = S[S.length - 1], dirE = [S[S.length - 1][0] - S[S.length - 2][0], S[S.length - 1][1] - S[S.length - 2][1]], lE = Math.hypot(...dirE);
  const outE = [dirE[0] / lE, dirE[1] / lE];
  assert.ok(sampleLandformHeight(meander, end[0] - outE[0] * 30, end[1] - outE[1] * 30) < -19.5, 'the cliff end keeps its floor to 6 % of the length');
  assert.equal(sampleLandformHeight(meander, end[0] + outE[0] * 2, end[1] + outE[1] * 2), 0, 'and stops square at the last point');
}

// 4. the union: two crossing carved canyons cut no deeper than either alone; added, they would
{
  const base = getMapConfig('verdant');
  const one = { kind: 'ridge', x: 200, z: -300, length: 220, width: 26, height: -16, yawDeg: 0, corridorScale: 1, settlementScale: 1, wetScale: 1,
    union: 'carve', geology: { ...canyon, cliffEnd: 'both' } };
  const two = { ...one, yawDeg: 90 };
  const cfg = (landforms) => ({ ...base, id: undefined, terrain: { ...base.terrain, landforms: [...(base.terrain?.landforms ?? []), ...landforms] } });
  const both = createHeightField(1337, cfg([one, two])), a = createHeightField(1337, cfg([one])), b = createHeightField(1337, cfg([two]));
  const none = createHeightField(1337, cfg([]));
  let deeper = 0, crossing = 0;
  for (let x = 120; x <= 280; x += 4) for (let z = -380; z <= -220; z += 4) {
    const hb = both.getHeightAt(x, z), ha = a.getHeightAt(x, z), h2 = b.getHeightAt(x, z), h0 = none.getHeightAt(x, z);
    if (hb < Math.min(ha, h2) - 0.05) deeper++;
    if (Math.abs(x - 200) < 10 && Math.abs(z + 300) < 10) { crossing++; assert.ok(hb > h0 - 16.5, `the crossing cuts once (${(hb - h0).toFixed(2)} m)`); }
  }
  assert.ok(crossing > 0);
  assert.equal(deeper, 0, 'the union is the deeper of the two everywhere');
}

// 5. the rock footprint follows the curve: on the walls at every station, nothing a half-width past the rim
{
  let missing = 0, stray = 0;
  for (let i = 30; i + 30 < P.xs.length; i += 7) {
    const x = P.xs[i], z = P.zs[i], tx = P.xs[i + 1] - x, tz = P.zs[i + 1] - z, l = Math.hypot(tx, tz);
    for (const side of [-1, 1]) {
      if (geologyRockWeight(meander, x - tz / l * side * 28, z + tx / l * side * 28) < 0.99) missing++;
      if (geologyRockWeight(meander, x - tz / l * side * 60, z + tx / l * side * 60) > 0) stray++;
    }
  }
  assert.equal(missing, 0, 'the walls are rock along the whole curve');
  assert.equal(stray, 0, 'the plain past the rim is not');
}

// 6. the path's own checks
assert.throws(() => prepareLandformPath([[0, 0]], 10), /two control points/);
assert.throws(() => createLayout({ terrain: { landforms: [{ kind: 'knoll', path: S, x: 0, z: 0, height: -3 }] } }), /for ridges/);

console.log(`landformPath.selftest: a two-point path is the bar; a ${P.length.toFixed(0)} m meander (tightest bend ${P.minRadius.toFixed(0)} m) keeps its floor, walls and continuity, a nose at its head and a square end; carved landforms join as their deepest; the rock follows the curve`);
