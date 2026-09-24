// Receipt of the railway cutting (round 63, 2026-09-24): a spur's cutting is resolved on its last edge with the
// authored parameters and defaults (an off-edge portal is an authoring error); the rule on a synthetic rim — nothing
// before the fade, the bed exact from the portal, a level floor feathered into the ground, batter faces that cut only
// ground standing above them, fill under a low floor, the fan past the path's end, no step anywhere; Tarkhan Steppe at
// seed 1337 — the bed graded at 2.4 % from the portal's own ground to the map edge (18 m deep there), the faces at
// the batter, the plateau beside the notch and the station road the ground they were, every sample outside the
// corridor byte-identical to the same map without the cutting, the outland continuing the bed and the fan across the
// red line without a step, the horizon ring's near rows seated in the notch while every authored ridge row keeps its
// height to the bit, the exclusion covering the floor, the cess and the faces up to the daylight line, and the laid
// track's spans in the cutting at the rail grade; every other map resolves no cutting.
// Round 67 (2026-09-24): the tunnel portal that ends the valley — resolved from the cutting (the headwall
// RAIL_TUNNEL_RUN_M past the path's end on the radial, the approach curving from the line's heading onto the radial
// and running into the bore), the ring's seated rows lying exactly on the bed to its first authored ridge (which
// stands on the RAIL_TUNNEL_RIDGE_RUN_M line the gallery reaches, held equal to horizon.ts's margin), the approach's
// sleepers on the valley floor at the rail grade, the masonry in the stone bucket and the dark bore, and one
// compound 'tunnel-portal' record closing the floor at the headwall's plane; every other map dresses no portal.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField, mulberry32 } from './terrain.ts';
import { dressMapExtras } from './maps/mapKits.ts';
import { sampleHorizonGeometry, HORIZON_FIRST_RIDGE_MARGIN_M, HORIZON_SEGMENTS } from './maps/horizon.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import {
  RAIL_CUTTING_BATTER, RAIL_CUTTING_FAN, RAIL_CUTTING_FEATHER_M, RAIL_CUTTING_GRADE, RAIL_CUTTING_HALF_FLOOR_M,
  RAIL_CUTTING_PORTAL_M, RAIL_SPUR_BALLAST_M, RAIL_SPUR_BERTH_M, RAIL_TUNNEL_BORE_DEPTH_M, RAIL_TUNNEL_BORE_HALF_M,
  RAIL_TUNNEL_CURVE_RADIUS_M, RAIL_TUNNEL_GALLERY_M, RAIL_TUNNEL_HEADWALL_HALF_M, RAIL_TUNNEL_HEADWALL_HEIGHT_M,
  RAIL_TUNNEL_RIDGE_RUN_M, RAIL_TUNNEL_RUN_M, RAIL_TUNNEL_WALL_M, railCuttingBedY, railCuttingExcludes, railCuttingHeight,
  railCuttingTunnel, resolveRailCuttings,
} from './railSpurs.ts';

const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

// ------------------------------------------------------------------ resolution
assert.equal(resolveRailCuttings(undefined), null); assert.equal(resolveRailCuttings([]), null);
assert.equal(resolveRailCuttings([{ path: [[0, 0], [100, 0]] }]), null, 'a spur without a cutting resolves none');
const [cut] = resolveRailCuttings([{ path: [[0, 5], [100, 5]], cutting: { from: [60, 5] } }]);
assert.deepEqual(cut, { px: 60, pz: 5, ux: 1, uz: 0, endAlong: 40, ex: 100, ez: 5, fx: 100 / Math.hypot(100, 5), fz: 5 / Math.hypot(100, 5),
  grade: RAIL_CUTTING_GRADE, halfFloor: RAIL_CUTTING_HALF_FLOOR_M, batter: RAIL_CUTTING_BATTER, fan: RAIL_CUTTING_FAN }, 'the defaults on the last edge, the valley along the radial through the end');
assert.deepEqual(RAIL_CUTTING_FAN, 0.35);
// the synthetic rim below runs on the x axis, where the radial through the end point IS the axis
const [axisCut] = resolveRailCuttings([{ path: [[0, 0], [100, 0]], cutting: { from: [60, 0] } }]);
assert.deepEqual([axisCut.fx, axisCut.fz], [1, 0]);
assert.deepEqual(RAIL_CUTTING_GRADE, 0.024); assert.ok(RAIL_CUTTING_GRADE <= 0.025, 'under the 2.5 % rail grade');
const [diagonal] = resolveRailCuttings([{ path: [[-40, -40], [0, 0], [30, 40]], cutting: { from: [15, 20], grade: 0.01, halfFloor: 5, batter: 1, fan: 0 } }]);
near(diagonal.ux, 0.6, 1e-12, 'axis x'); near(diagonal.uz, 0.8, 1e-12, 'axis z'); near(diagonal.endAlong, 25, 1e-9, 'run to the end');
assert.deepEqual([diagonal.grade, diagonal.halfFloor, diagonal.batter, diagonal.fan], [0.01, 5, 1, 0], 'authored parameters');
assert.throws(() => resolveRailCuttings([{ path: [[0, 5], [100, 5]], cutting: { from: [60, 8] } }]), /not on the spur's last edge/, 'a portal off the edge');
assert.throws(() => resolveRailCuttings([{ path: [[0, 5], [100, 5]], cutting: { from: [110, 5] } }]), /not on the spur's last edge/, 'a portal past the end');
assert.throws(() => resolveRailCuttings([{ path: [[0, 5], [100, 5]], cutting: { from: [-5, 5] } }]), /not on the spur's last edge/, 'a portal before the edge');
assert.throws(() => resolveRailCuttings([{ path: [[7, 7]], cutting: { from: [7, 7] } }]), /two or more points/);

// ------------------------------------------------------------------ the rule on a synthetic rim (a 60 % rise from the portal at x 60)
const ground = (x) => (x < 60 ? 0 : (x - 60) * 0.6);
const portalYs = [ground(60)];
const H = (x, z) => railCuttingHeight([axisCut], portalYs, x, z, ground(x));
const bed = (x) => railCuttingBedY(axisCut, portalYs[0], x - 60);
assert.equal(H(40, 0), ground(40), 'untouched before the fade');
assert.equal(H(60 - RAIL_CUTTING_PORTAL_M - 0.01, 0), ground(47.99), 'untouched at the fade start');
near(H(60, 0), bed(60), 1e-12, 'the bed exact at the portal (the ground there is the portal height by construction)');
for (let x = 60; x <= 120; x += 2.5) {
  near(H(x, 0), bed(x), 1e-12, `the bed at 2.4 % on the axis (x ${x})`);
  near(H(x, 3.9), bed(x), 1e-12, 'the floor is level to its edge'); near(H(x, -3.9), bed(x), 1e-12, 'both sides');
}
const x80 = 80, g80 = ground(x80), b80 = bed(x80);
near(H(x80, 8), b80 + 4 / RAIL_CUTTING_BATTER, 1e-12, 'the face rises at the batter from the floor edge');
near(H(x80, 12), b80 + 8 / RAIL_CUTTING_BATTER, 1e-12, 'still on the face');
assert.equal(H(x80, 13), g80, 'the ground above the daylight line is untouched');
near(H(x80, 5), b80 + 1 / RAIL_CUTTING_BATTER, 1e-12, 'in cut the face governs from the floor edge (no feather toe)');
near(railCuttingHeight([axisCut], portalYs, x80, 0, -1), b80, 1e-12, 'ground under the bed is filled to it');
near(railCuttingHeight([axisCut], portalYs, x80, RAIL_CUTTING_HALF_FLOOR_M + RAIL_CUTTING_FEATHER_M / 2, -1), -1 + (b80 + 1) * 0.5, 1e-12, 'the fill feathers out');
assert.equal(railCuttingHeight([axisCut], portalYs, x80, 20, -1), -1, 'low ground beyond the floor is not filled');
const fanX = 60 + 40 + 60; // 60 m past the path's end
near(H(fanX, RAIL_CUTTING_HALF_FLOOR_M + 60 * RAIL_CUTTING_FAN - 0.1), bed(fanX), 1e-12, 'the floor widens by the fan past the end');
near(H(fanX, RAIL_CUTTING_HALF_FLOOR_M + 60 * RAIL_CUTTING_FAN + 4), bed(fanX) + 4 / RAIL_CUTTING_BATTER, 1e-12, 'and the face rises from the widened edge');
near(H(60 - RAIL_CUTTING_PORTAL_M / 2, 0), ground(54) + (bed(54) - ground(54)) * 0.5, 1e-12, 'half-way through the fade: half the change');
let worstStep = 0;
for (let x = 44; x <= 130; x += 0.1) for (let z = -25; z <= 25; z += 0.1) {
  const h = H(x, z);
  worstStep = Math.max(worstStep, Math.abs(H(x + 0.1, z) - h), Math.abs(H(x, z + 0.1) - h));
}
assert.ok(worstStep < 0.16, `no step anywhere: the steepest 0.1 m rise is ${worstStep.toFixed(3)} m (the batter's 0.143)`);
assert.ok(railCuttingExcludes([axisCut], portalYs, 80, 6, ground, 30) && !railCuttingExcludes([axisCut], portalYs, 80, 20, ground, 30), 'the exclusion: cess in, plateau out');
assert.ok(railCuttingExcludes([axisCut], portalYs, 80, 11, ground, 30), 'a cut face is excluded');
assert.ok(!railCuttingExcludes([axisCut], portalYs, 40, 0, ground, 30), 'nothing before the fade');

// ------------------------------------------------------------------ Tarkhan Steppe at seed 1337
const cfg = getMapConfig('steppe');
const spur = cfg.terrain.railSpurs[0];
assert.deepEqual(spur.cutting, { from: [440, -181] }, 'the portal at the round-57 stop, defaults otherwise');
const [tarkhan] = resolveRailCuttings(cfg.terrain.railSpurs);
assert.deepEqual([tarkhan.ux, tarkhan.uz, tarkhan.endAlong, tarkhan.ex, tarkhan.ez], [1, 0, 72, 512, -181], 'east along the siding, 72 m to the edge');
near(Math.atan2(tarkhan.fz, tarkhan.fx), Math.atan2(-181, 512), 1e-12, 'the valley runs along the radial through the mouth (19.5° off the line)');
const field = createHeightField(1337, cfg);
const uncut = createHeightField(1337, { ...cfg, terrain: { ...cfg.terrain, railSpurs: [{ path: spur.path, bufferStop: spur.bufferStop }] } });
const portalY = field.getHeightAt(440, -181);
near(portalY, uncut.getHeightAt(440, -181), 1e-12, 'the portal stands at the ground it had');
near(portalY, -1.26, 0.02, 'the station level (2026-09-24 measurement)');
for (let x = 440; x <= 512; x += 1) for (const dz of [0, -3.9, 3.9]) {
  near(field.getHeightAt(x, -181 + dz), portalY + RAIL_CUTTING_GRADE * (x - 440), 1e-9, `the bed at 2.4 % (x ${x})`);
}
near(field.getHeightAt(512, -181), portalY + RAIL_CUTTING_GRADE * 72, 1e-9, 'the bed at the edge');
assert.ok(uncut.getHeightAt(511.9, -181) - field.getHeightAt(511.9, -181) > 17.5, 'the cutting is ~18 m deep at the edge');
near(field.getHeightAt(500, -191), portalY + RAIL_CUTTING_GRADE * 60 + 6 / RAIL_CUTTING_BATTER, 1e-9, 'the south face at the batter');
near(field.getHeightAt(500, -171), portalY + RAIL_CUTTING_GRADE * 60 + 6 / RAIL_CUTTING_BATTER, 1e-9, 'the north face at the batter');
near(field.getHeightAt(511.9, -201), 20.88, 0.02, 'the plateau beside the notch is the ground it was (2026-09-24 base measurement)');
near(field.getHeightAt(410, -226), 0.53, 0.02, 'the station road node before the rim'); near(field.getHeightAt(512, -232), 20.37, 0.02, 'and at the edge');
near(field.getHeightAt(424, -181), -1.55, 0.02, 'the plain before the fade');
// every sample outside the corridor is byte-identical to the map without the cutting; the road nodes to the bit
let moved = 0, outside = 0, west = 0;
for (let z = -512; z <= 512; z += 4) for (let x = -512; x <= 512; x += 4) {
  const a = uncut.getHeightAt(x, z), b = field.getHeightAt(x, z);
  if (a === b) continue;
  moved++;
  if (x < 440 - RAIL_CUTTING_PORTAL_M || Math.abs(z + 181) > 24) outside++;
  if (x < 440) west++;
}
assert.equal(outside, 0, 'the change is confined to the corridor'); assert.ok(moved > 60 && moved < 160, `the corridor moved (${moved} samples)`);
assert.ok(west <= 6, `the fade before the portal touches a few floor samples only (${west})`);
for (const road of cfg.terrain.roads.paths) for (const [x, z] of road) assert.equal(field.getHeightAt(x, z), uncut.getHeightAt(x, z), `road node ${x},${z} to the bit`);
for (let z = -512; z <= 512; z += 4) for (let x = -512; x <= 512; x += 4) {
  assert.equal(field.getWaterMaskAt(x, z), uncut.getWaterMaskAt(x, z)); assert.equal(field.getGroundType(x, z), uncut.getGroundType(x, z));
}
assert.equal(field.minY, uncut.minY); assert.equal(field.maxY, uncut.maxY);
// the outland: the bed and the fan continue past the red line without a step
near(field.getOutlandHeightAt(512, -181), field.getHeightAt(512, -181), 1e-9, 'no step across the red line on the axis');
near(field.getOutlandHeightAt(512, -184.5), field.getHeightAt(512, -184.5), 1e-9, 'nor across the floor');
const radial = (run, side = 0) => [512 + tarkhan.fx * run - tarkhan.fz * side, -181 + tarkhan.fz * run + tarkhan.fx * side];
for (let run = 0; run <= 300; run += 16) near(field.getOutlandHeightAt(...radial(run)), portalY + RAIL_CUTTING_GRADE * (72 + run), 1e-9, `the bed continues at grade along the radial (${run} m out)`);
const fanHalf = RAIL_CUTTING_HALF_FLOOR_M + 108 * RAIL_CUTTING_FAN;
near(field.getOutlandHeightAt(...radial(108, fanHalf - 0.5)), portalY + RAIL_CUTTING_GRADE * 180, 1e-9, 'the valley floor 108 m out, at its edge');
near(field.getOutlandHeightAt(...radial(108, -fanHalf + 0.5)), portalY + RAIL_CUTTING_GRADE * 180, 1e-9, 'both sides');
assert.ok(field.getOutlandHeightAt(...radial(108, fanHalf + 40)) > 14, 'the plateau beyond the valley');
for (let x = 520; x <= 690; x += 10) near(field.getOutlandHeightAt(x, -181), portalY + RAIL_CUTTING_GRADE * (72 + (x - 512) * tarkhan.fx), 1e-9, `the straight-ahead line from the mouth lies on the valley floor (x ${x})`);
assert.equal(field.getOutlandHeightAt(300, -181), uncut.getOutlandHeightAt(300, -181), 'the outland sampler is the composition it was elsewhere');
assert.equal(field.getOutlandHeightAt(600, 200), uncut.getOutlandHeightAt(600, 200));
// the ring: near rows seat in the notch, every authored ridge row keeps its height to the bit, no other column moves
const ring = sampleHorizonGeometry(cfg, 1337, field), ringUncut = sampleHorizonGeometry(cfg, 1337, uncut);
const n = HORIZON_SEGMENTS, ridgeRow = ring.rows.findIndex((row) => !row.skirt && !row.interpolated);
assert.equal(ring.heights.length, ringUncut.heights.length);
let ringMoved = 0, ringOutside = 0;
const axisAngle = Math.atan2(-181, 512);
for (let i = 0; i < ring.heights.length; i++) {
  if (ring.heights[i] === ringUncut.heights[i]) continue;
  ringMoved++;
  const row = Math.floor(i / n), k = i % n;
  let a = (k / n) * Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2;
  if (row >= ridgeRow || Math.abs(a - axisAngle) > 0.15) ringOutside++; // the buried anchors and the seated rows inside the mouth
}
assert.equal(ringOutside, 0, 'only the seated rows inside the notch move; the authored ridges never');
assert.ok(ringMoved >= 8, `the ring carries the notch (${ringMoved} vertices)`);
const axisColumn = [...Array(n).keys()].sort((p, q) => Math.abs(((p / n) * Math.PI * 2 - Math.PI * 2) - axisAngle) - Math.abs(((q / n) * Math.PI * 2 - Math.PI * 2) - axisAngle))[0];
// round 67: every seated row before the first authored ridge lies ON the bed (the hand-over share stands down with
// the seat weight); the ridge row keeps its authored height and stands on the line the gallery reaches
const runOf = (x, z) => (x - tarkhan.ex) * tarkhan.fx + (z - tarkhan.ez) * tarkhan.fz;
for (let row = 1; row < ridgeRow; row++) for (const column of [axisColumn - 1, axisColumn, axisColumn + 1]) {
  const i = row * n + column, x = ring.positions[i * 3], z = ring.positions[i * 3 + 2], run = runOf(x, z);
  near(ring.heights[i], field.getOutlandHeightAt(x, z), 1e-3, `ring row ${row} (${run.toFixed(0)} m out) lies on the outland it seats on`);
  if (column === axisColumn) near(ring.heights[i], portalY + RAIL_CUTTING_GRADE * (72 + run), 1e-3, `on the axis that is the bed (row ${row})`);
  assert.ok(ringUncut.heights[i] > 14, 'where the plateau stood');
}
{ const i = ridgeRow * n + axisColumn, run = runOf(ring.positions[i * 3], ring.positions[i * 3 + 2]);
  assert.ok(run > RAIL_TUNNEL_RUN_M + 20 && run < RAIL_TUNNEL_RUN_M + RAIL_TUNNEL_GALLERY_M + 30, `the first authored ridge stands within the gallery's reach (${run.toFixed(0)} m out)`);
  assert.ok(ring.heights[i] > 25, `the ridge keeps its authored height (${ring.heights[i].toFixed(1)} m)`); }
assert.equal(RAIL_TUNNEL_RIDGE_RUN_M, HORIZON_FIRST_RIDGE_MARGIN_M, 'the gallery ends on the line the ring puts its first ridge on');
assert.equal(RAIL_TUNNEL_GALLERY_M, RAIL_TUNNEL_RIDGE_RUN_M - RAIL_TUNNEL_RUN_M);
// the exclusion: floor, cess and faces, not the plateau beside the notch nor the plain before the fade
assert.equal(field._noVeg(500, -181), true); assert.equal(field._noVeg(500, -186.5), true, 'the cess');
assert.equal(field._noVeg(500, -192), true, 'the face'); assert.equal(field._noVeg(500, -202), false, 'beyond the daylight line');
assert.equal(field._noVeg(480, -150), false, 'the plateau'); assert.equal(field._noVeg(430, -181), true, 'the spur berth before the portal');
assert.equal(field._noVeg(430, -188), false, 'off the berth before the portal'); assert.equal(uncut._noVeg(500, -192), false, 'the same face grew before');
assert.equal(field._noVeg(511.5, -181 - RAIL_SPUR_BERTH_M - 1), true, 'the floor at the edge past the berth');
// the laid track: the spans in the cutting run at the rail grade
const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
const buckets = Object.fromEntries(names.map((name) => [name, []]));
const obstacles = [], colliders = [];
dressMapExtras({ mapId: 'steppe', extraKits: cfg.props?.extraKits, riverLandings: cfg.props?.riverLandings, L: field._layout,
  heightField: field, rng: mulberry32(1337 ^ 0x5a17), buckets, obstacles, colliders });
const centre = (g) => { g.computeBoundingBox(); return g.boundingBox.getCenter(new THREE.Vector3()); };
const allSleepers = buckets.wood.filter((g) => g.parameters?.width === RAIL_SPUR_BALLAST_M - 0.9 && g.parameters.height === 0.09).map(centre);
const sleepers = allSleepers.filter((c) => c.x > 441 && c.x <= 512).sort((a, b) => a.x - b.x);
assert.ok(sleepers.length > 45, `sleepers in the cutting (${sleepers.length})`);
let worstGrade = 0;
for (let i = 1; i < sleepers.length; i++) worstGrade = Math.max(worstGrade, Math.abs(sleepers[i].y - sleepers[i - 1].y) / (sleepers[i].x - sleepers[i - 1].x));
assert.ok(worstGrade <= 0.025, `every span in the cutting at the rail grade (worst ${(worstGrade * 100).toFixed(2)} %)`);
assert.ok(sleepers[sleepers.length - 1].x <= 512 && sleepers[sleepers.length - 1].x > 509, 'the last sleeper in the square lies at the map edge');
// ------------------------------------------------------------------ round 67: the tunnel portal that ends the valley
const tunnel = railCuttingTunnel(tarkhan);
assert.equal(tunnel.run, RAIL_TUNNEL_RUN_M); assert.equal(tunnel.along, 72 + RAIL_TUNNEL_RUN_M);
near(tunnel.ux, tarkhan.fx, 1e-12, 'the bore runs along the valley radial'); near(tunnel.uz, tarkhan.fz, 1e-12, 'bore axis z');
near(runOf(tunnel.x, tunnel.z), RAIL_TUNNEL_RUN_M, 1e-9, 'the headwall stands RAIL_TUNNEL_RUN_M past the path\'s end');
near(tunnel.offset, RAIL_TUNNEL_CURVE_RADIUS_M * (1 - Math.cos(Math.atan2(-181, 512))), 1e-9, 'the approach leaves the line by the curve\'s offset');
assert.ok(Math.abs(tunnel.offset) < RAIL_CUTTING_HALF_FLOOR_M + 30 * RAIL_CUTTING_FAN, 'and stays on the fan floor');
assert.deepEqual(tunnel.approach[0], [512, -181], 'the approach starts at the path\'s end');
{ const a = tunnel.approach, last = a[a.length - 1], before = a[a.length - 2];
  near(Math.hypot(last[0] - before[0], last[1] - before[1]), RAIL_TUNNEL_WALL_M + 2, 1e-9, 'the last leg runs through the headwall into the bore');
  near(before[0], tunnel.x, 1e-9, 'the straight ends at the headwall'); near(before[1], tunnel.z, 1e-9, 'headwall z');
  let heading = 0;
  for (let i = 1; i < a.length; i++) {
    const h = Math.atan2(a[i][1] - a[i - 1][1], a[i][0] - a[i - 1][0]);
    if (i > 1) assert.ok(h <= heading + 1e-9 && heading - h < 0.05, `the curve turns the same way a few degrees a span (${((heading - h) * 180 / Math.PI).toFixed(2)}°)`);
    heading = h;
  }
  near(heading, Math.atan2(tarkhan.fz, tarkhan.fx), 1e-9, 'and arrives on the radial'); }
// the approach's sleepers past the edge lie on the valley floor at the rail grade (the run measured along the radial)
const outlandSleepers = allSleepers.filter((c) => c.x > 512).sort((a, b) => runOf(a.x, a.z) - runOf(b.x, b.z));
assert.ok(outlandSleepers.length > 80 && outlandSleepers.length < 120, `sleepers down the valley (${outlandSleepers.length})`);
let worstOutland = 0;
for (const c of outlandSleepers) worstOutland = Math.max(worstOutland, Math.abs(c.y - 0.17 - (portalY + RAIL_CUTTING_GRADE * (72 + runOf(c.x, c.z)))));
assert.ok(worstOutland < 0.08, `every approach sleeper on the bed at grade (worst ${worstOutland.toFixed(3)} m)`);
assert.ok(runOf(outlandSleepers[outlandSleepers.length - 1].x, outlandSleepers[outlandSleepers.length - 1].z) > RAIL_TUNNEL_RUN_M, 'the last sleeper lies inside the bore');
for (const c of outlandSleepers) near(c.y - 0.17, field.getOutlandHeightAt(c.x, c.z), 0.08, 'on the outland the ring seats on');
// the masonry: the headwall (an extrusion), two gallery walls, the roof, the rear plate and four wing leaves in stone; the bore in dark
const stoneBefore = buckets.stone.length;
assert.equal(stoneBefore, 9, 'nine stone pieces: the portal is the only stone dressing of the map');
const boreBoxes = buckets.dark.filter((g) => g.parameters && g.parameters.depth === RAIL_TUNNEL_BORE_DEPTH_M && g.parameters.width === 2 * RAIL_TUNNEL_BORE_HALF_M);
assert.equal(boreBoxes.length, 1, 'the bore ceiling'); // the walls are 0.2 m wide, the ramp is the diagonal
assert.equal(buckets.dark.filter((g) => g.parameters && g.parameters.depth === RAIL_TUNNEL_BORE_DEPTH_M && g.parameters.width === 0.2).length, 2, 'two bore walls');
assert.equal(buckets.dark.filter((g) => g.parameters && Math.abs(g.parameters.depth - RAIL_TUNNEL_BORE_DEPTH_M * Math.SQRT2) < 1e-9).length, 1, 'the dark floor rising into the bore');
for (const g of buckets.stone) { g.computeBoundingBox(); assert.ok(g.boundingBox.min.y > field.getOutlandHeightAt(tunnel.x, tunnel.z) - 0.6 && g.boundingBox.max.y < field.getOutlandHeightAt(tunnel.x, tunnel.z) + RAIL_TUNNEL_HEADWALL_HEIGHT_M + 0.01, 'every stone piece stands from the bed to the headwall\'s top'); }
// the record: the gallery block and two flank walls across the floor at the headwall's plane, footed under the bed
const records = obstacles.filter((r) => r.kind === 'tunnel-portal');
assert.equal(records.length, 1); assert.equal(colliders.filter((r) => r.kind === 'tunnel-portal').length, 1);
{ const [record] = records, parts = record.shape2.parts, bedY = field.getOutlandHeightAt(tunnel.x, tunnel.z);
  assert.equal(parts.length, 3);
  const [block, flankA, flankB] = parts;
  near(block.hw, RAIL_TUNNEL_BORE_HALF_M + RAIL_TUNNEL_WALL_M, 1e-9, 'the block is the bore and its walls'); near(block.hl, (RAIL_TUNNEL_WALL_M + RAIL_TUNNEL_GALLERY_M) / 2, 1e-9, 'from the headwall to the ridge line');
  near(block.y0, bedY - 0.5, 1e-9, 'footed under the bed'); near(block.y1, bedY + RAIL_TUNNEL_HEADWALL_HEIGHT_M, 1e-9, 'to the headwall top');
  near(runOf(block.cx, block.cz), RAIL_TUNNEL_RUN_M + (RAIL_TUNNEL_WALL_M + RAIL_TUNNEL_GALLERY_M) / 2, 1e-9, 'the block centred down the gallery');
  const floorHalf = RAIL_CUTTING_HALF_FLOOR_M + RAIL_TUNNEL_RUN_M * RAIL_CUTTING_FAN + 2;
  for (const flank of [flankA, flankB]) {
    near(flank.hl, 1.5, 1e-9, 'a 3 m flank wall'); near(runOf(flank.cx, flank.cz), RAIL_TUNNEL_RUN_M, 1e-9, 'at the headwall\'s plane');
    near(flank.hw * 2 + RAIL_TUNNEL_BORE_HALF_M + RAIL_TUNNEL_WALL_M, floorHalf, 1e-9, 'to the floor\'s edge');
    assert.ok(flank.y1 - flank.y0 > RAIL_TUNNEL_HEADWALL_HEIGHT_M, 'taller than a hull can mount');
  }
  const lateral = (p) => (p.cx - tunnel.x) * -tarkhan.fz + (p.cz - tunnel.z) * tarkhan.fx;
  assert.ok(lateral(flankA) * lateral(flankB) < 0, 'one flank each side of the bore');
  assert.ok(record.min[0] > 512, 'the record lies past the red line'); }
for (const list of Object.values(buckets)) for (const g of list) g.dispose();

// ------------------------------------------------------------------ every other map resolves no cutting
for (const mapId of MAP_IDS) {
  if (mapId === 'steppe') continue;
  assert.equal(resolveRailCuttings(getMapConfig(mapId).terrain?.railSpurs), null, `${mapId}: no cutting`);
}
console.log(`railCutting.selftest: resolution and the synthetic rim rule; Tarkhan's cutting — bed at 2.4 % from ${portalY.toFixed(2)} m to the edge, ${(uncut.getHeightAt(511.9, -181) - field.getHeightAt(511.9, -181)).toFixed(1)} m deep, ${moved} corridor samples moved and none outside, roads/water/ground types to the bit, the outland bed and fan continuous across the red line, ${ringMoved} ring vertices seated in the notch and no ridge row moved, exclusion on floor/cess/faces, ${sleepers.length} sleepers in the cutting at ≤ ${(worstGrade * 100).toFixed(2)} %; the tunnel portal ${RAIL_TUNNEL_RUN_M} m down the valley with ${outlandSleepers.length} approach sleepers on the bed (worst ${worstOutland.toFixed(3)} m), ${RAIL_TUNNEL_HEADWALL_HALF_M * 2} m headwall, a ${RAIL_TUNNEL_GALLERY_M} m gallery and a 3-part record; 30 other maps resolve none`);
