// Receipt of the railway cutting (round 63, 2026-09-24) and its open line past the edge (the map-borders lane,
// 2026-10-03): a spur's cutting is resolved on its last edge with the authored parameters and defaults (an off-edge
// portal is an authoring error); the rule on a synthetic rim — nothing before the fade, the bed exact from the portal,
// a level floor feathered into the ground, batter faces that cut only ground standing above them, fill under a low
// floor, past the path's end the formation widening to the open line's right of way with its faces easing to the open
// banks, the corridor handing back to the ground over the open line's last third, no step anywhere; the open line's
// profile — station 0 the cutting's bed at the path's end, then the ground smoothed and graded to at most the open grade,
// an embankment with real banks where the ground lies below it; Tarkhan Steppe at seed 1337 — the bed graded at 2.4 %
// from the portal's own ground to the map edge through the border landform's low rim (no longer the classic plateau
// the round-67 tunnel bored: a shallow cut at the edge), the faces at the batter, the station road come down with the
// land (2026-10-03: the road grades are authored on the landform's rim), every sample outside the corridor
// byte-identical to the same map without the cutting, the outland continuing the bed across the red line without a
// step and on along the open line, the horizon ring's seated vertices exactly on the outland they seat on and none
// moved outside the corridor, the ring's ballast attribute on the line, the exclusion covering the floor, the cess and
// the faces up to the daylight line, the laid track's spans in the cutting at the rail grade and on the open line's bed
// past the edge, and no tunnel portal anywhere; Cinder Junction (2026-10-01) — the redesigned junction's two cuttings at
// the rail grade, each running on in the open; every other map resolves no cutting.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField, mulberry32 } from './terrain.ts';
import { dressMapExtras } from './maps/mapKits.ts';
import { sampleHorizonGeometry, HORIZON_SEGMENTS } from './maps/horizon.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import {
  RAIL_CUTTING_BATTER, RAIL_CUTTING_FEATHER_M, RAIL_CUTTING_GRADE, RAIL_CUTTING_HALF_FLOOR_M, RAIL_CUTTING_PORTAL_M,
  RAIL_CUTTING_SEAT_FADE_M, RAIL_CUTTING_SEED_FROM, RAIL_CUTTING_SEED_MAX, RAIL_OPEN_BANK, RAIL_OPEN_GRADE,
  RAIL_OPEN_HALF_FLOOR_M, RAIL_OPEN_KIT_M, RAIL_OPEN_RUN_M, RAIL_OPEN_STEP_M, RAIL_OPEN_WIDEN_M, RAIL_SPUR_BALLAST_M,
  RAIL_SPUR_BERTH_M, railCuttingBedY, railCuttingExcludes, railCuttingFaceSeedAt, railCuttingHeight,
  railCuttingSeatWeight, railCuttingSeedAdmits, resolveRailCuttings, resolveRailOpenLine,
} from './railSpurs.ts';
import { near } from '../../tools/receipt-kit.test-support.mjs';

const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ resolution
assert.equal(resolveRailCuttings(undefined), null); assert.equal(resolveRailCuttings([]), null);
assert.equal(resolveRailCuttings([{ path: [[0, 0], [100, 0]] }]), null, 'a spur without a cutting resolves none');
const [cut] = resolveRailCuttings([{ path: [[0, 5], [100, 5]], cutting: { from: [60, 5] } }]);
assert.deepEqual(cut, { px: 60, pz: 5, ux: 1, uz: 0, endAlong: 40, ex: 100, ez: 5,
  grade: RAIL_CUTTING_GRADE, halfFloor: RAIL_CUTTING_HALF_FLOOR_M, batter: RAIL_CUTTING_BATTER }, 'the defaults on the last edge');
const [axisCut] = resolveRailCuttings([{ path: [[0, 0], [100, 0]], cutting: { from: [60, 0] } }]);
assert.deepEqual(RAIL_CUTTING_GRADE, 0.024); assert.ok(RAIL_CUTTING_GRADE <= 0.025, 'under the 2.5 % rail grade');
const [diagonal] = resolveRailCuttings([{ path: [[-40, -40], [0, 0], [30, 40]], cutting: { from: [15, 20], grade: 0.01, halfFloor: 5, batter: 1 } }]);
near(diagonal.ux, 0.6, 1e-12, 'axis x'); near(diagonal.uz, 0.8, 1e-12, 'axis z'); near(diagonal.endAlong, 25, 1e-9, 'run to the end');
assert.deepEqual([diagonal.grade, diagonal.halfFloor, diagonal.batter], [0.01, 5, 1], 'authored parameters');
assert.deepEqual([diagonal.ex, diagonal.ez], [30, 40], 'the open line starts at the path\'s last point');
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
for (let x = 60; x <= 100; x += 2.5) {
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
near(H(60 - RAIL_CUTTING_PORTAL_M / 2, 0), ground(54) + (bed(54) - ground(54)) * 0.5, 1e-12, 'half-way through the fade: half the change');
// past the path's end (x 100) the frame runs on along the axis: the floor widens to the open line's right of way over
// RAIL_OPEN_WIDEN_M and the faces ease from the cutting's batter to the open banks; without an open line the bed runs on
// the grade line
{ const x = 100 + RAIL_OPEN_WIDEN_M + 15;
  near(H(x, RAIL_OPEN_HALF_FLOOR_M - 0.1), bed(x), 1e-12, 'the open floor is level to its widened edge');
  near(H(x, RAIL_OPEN_HALF_FLOOR_M + 4), bed(x) + 4 / RAIL_OPEN_BANK, 1e-12, 'and its faces rise at the open bank');
  const xm = 100 + RAIL_OPEN_WIDEN_M / 2, halfM = (RAIL_CUTTING_HALF_FLOOR_M + RAIL_OPEN_HALF_FLOOR_M) / 2;
  const batterM = (RAIL_CUTTING_BATTER + RAIL_OPEN_BANK) / 2;
  near(H(xm, halfM - 0.1), bed(xm), 1e-12, 'half-way through the widening: half the extra floor');
  near(H(xm, halfM + 2), bed(xm) + 2 / batterM, 1e-12, 'and half the eased batter'); }
// the corridor hands back to the ground over the open line's last third, and past its run nothing changes
{ const past = RAIL_OPEN_RUN_M * 0.81, x = 100 + past;
  near(H(x, 0), ground(x) + (bed(x) - ground(x)) * (1 - smooth01(RAIL_OPEN_RUN_M * 0.62, RAIL_OPEN_RUN_M, past)), 1e-9, 'the hand-back');
  assert.equal(H(100 + RAIL_OPEN_RUN_M + 1, 0), ground(100 + RAIL_OPEN_RUN_M + 1), 'nothing past the open line\'s run'); }
let worstStep = 0;
for (let x = 44; x <= 160; x += 0.1) for (let z = -25; z <= 25; z += 0.1) {
  const h = H(x, z);
  worstStep = Math.max(worstStep, Math.abs(H(x + 0.1, z) - h), Math.abs(H(x, z + 0.1) - h));
}
assert.ok(worstStep < 0.16, `no step anywhere: the steepest 0.1 m rise is ${worstStep.toFixed(3)} m (the batter's 0.143)`);
assert.ok(railCuttingExcludes([axisCut], portalYs, 80, 6, ground, 30) && !railCuttingExcludes([axisCut], portalYs, 80, 20, ground, 30), 'the exclusion: cess in, plateau out');
assert.ok(railCuttingExcludes([axisCut], portalYs, 80, 11, ground, 30), 'a cut face is excluded');
assert.ok(!railCuttingExcludes([axisCut], portalYs, 40, 0, ground, 30), 'nothing before the fade');

// ------------------------------------------------------------------ the open line's profile
// station 0 is the cutting's bed at the path's end; each station follows the ground smoothed over ±2 stations, graded to
// at most RAIL_OPEN_GRADE from the station before; between stations the bed interpolates
const climb = RAIL_OPEN_STEP_M * RAIL_OPEN_GRADE;
const flat = resolveRailOpenLine(axisCut, 0, () => -5);
assert.equal(flat.ys.length, Math.ceil(RAIL_OPEN_RUN_M / RAIL_OPEN_STEP_M) + 1);
near(flat.ys[0], RAIL_CUTTING_GRADE * 40, 1e-12, 'station 0: the cutting\'s bed at the path\'s end');
near(flat.ys[1], flat.ys[0] - climb, 1e-12, 'it comes down at the open grade');
for (let i = 1; i < flat.ys.length; i++) assert.ok(Math.abs(flat.ys[i] - flat.ys[i - 1]) <= climb + 1e-12, `graded (station ${i})`);
assert.equal(flat.ys[flat.ys.length - 1], -5, 'and lies on the level ground once it meets it');
near(railCuttingBedY(axisCut, 0, 40, flat), RAIL_CUTTING_GRADE * 40, 1e-12, 'at the path\'s end the grade line');
near(railCuttingBedY(axisCut, 0, 40 + RAIL_OPEN_STEP_M * 1.5, flat), (flat.ys[1] + flat.ys[2]) / 2, 1e-12, 'between stations the bed interpolates');
{ const rolling = resolveRailOpenLine(axisCut, 0, (x) => 6 * Math.sin(x / 47));
  let worst = 0, outside = 0;
  for (let i = 1; i < rolling.ys.length; i++) {
    worst = Math.max(worst, Math.abs(rolling.ys[i] - rolling.ys[i - 1]));
    if (i > 4 && Math.abs(rolling.ys[i]) > 6) outside++;
  }
  assert.ok(worst <= climb + 1e-12, `a rolling ground: graded (${(worst / RAIL_OPEN_STEP_M * 100).toFixed(2)} %)`);
  assert.equal(outside, 0, 'and the bed stays within the ground\'s own range'); }
// over low ground the open line stands on an embankment with real banks (eased in over the first metres past the edge)
{ const Hopen = (x, z) => railCuttingHeight([axisCut], [0], x, z, -5, [flat]);
  const x = 160, b = railCuttingBedY(axisCut, 0, x - 60, flat), fill = b + 5;
  assert.ok(fill > 2, `a fill past the edge (${fill.toFixed(2)} m)`);
  near(Hopen(x, 0), b, 1e-12, 'the embankment\'s crest is the bed');
  near(Hopen(x, RAIL_OPEN_HALF_FLOOR_M - 0.1), b, 1e-12, 'level across the formation');
  near(Hopen(x, RAIL_OPEN_HALF_FLOOR_M + RAIL_OPEN_BANK), b - 1, 1e-12, 'the bank falls a metre per RAIL_OPEN_BANK');
  assert.equal(Hopen(x, RAIL_OPEN_HALF_FLOOR_M + RAIL_OPEN_BANK * (fill + 1)), -5, 'and meets the ground at its toe');
  const b0 = railCuttingBedY(axisCut, 0, 40, flat);
  near(Hopen(100, RAIL_CUTTING_HALF_FLOOR_M + RAIL_CUTTING_FEATHER_M / 2), -5 + (b0 + 5) * 0.5, 1e-12, 'at the path\'s end the square\'s feathered fill');
  // the horizon ring seats on the corridor out to the bank's toe, fading over RAIL_CUTTING_SEAT_FADE_M beyond
  const seat = (z) => railCuttingSeatWeight([axisCut], [0], x, z, () => -5, [flat]);
  const toe = RAIL_OPEN_HALF_FLOOR_M + fill * RAIL_OPEN_BANK;
  assert.equal(seat(0), 1); assert.equal(seat(toe - 0.1), 1, 'seated to the toe');
  near(seat(toe + RAIL_CUTTING_SEAT_FADE_M / 2), 0.5, 1e-12, 'fading beyond'); assert.equal(seat(toe + RAIL_CUTTING_SEAT_FADE_M + 0.1), 0); }

// ------------------------------------------------------------------ the faces' seeding weight (round 67)
// trees, rocks and props stay off the whole face (the exclusion above); the seeding hook gives the tuft and bush seeders
// a weight on the upper part of each face: 0 up to RAIL_CUTTING_SEED_FROM of the face's rise, rising to the ceiling at
// the daylight line, 0 on the floor, the cess and the ground above; the per-candidate hash admits the weight's share
{ const ground2 = (x) => ground(x);
  const seedAt = (z) => railCuttingFaceSeedAt([axisCut], portalYs, 80, z, ground2, 30);
  const depth = g80 - b80; // the face's rise at x 80 (11.5 m)
  assert.equal(seedAt(0), 0, 'the floor'); assert.equal(seedAt(RAIL_CUTTING_HALF_FLOOR_M + 1), 0, 'the cess');
  assert.equal(seedAt(RAIL_CUTTING_HALF_FLOOR_M + depth * RAIL_CUTTING_BATTER + 1), 0, 'above the daylight line');
  let last = 0, lower = 0, rising = 0;
  for (let lat = RAIL_CUTTING_HALF_FLOOR_M + 0.1; lat < RAIL_CUTTING_HALF_FLOOR_M + depth * RAIL_CUTTING_BATTER - 0.2; lat += 0.1) {
    const f = (lat - RAIL_CUTTING_HALF_FLOOR_M) / RAIL_CUTTING_BATTER / depth, w = seedAt(lat);
    if (f <= RAIL_CUTTING_SEED_FROM - 0.005) { assert.equal(w, 0, `bare on the lower third (f ${f.toFixed(3)})`); lower++; }
    else if (f > RAIL_CUTTING_SEED_FROM + 0.005) { assert.ok(w > 0 && w <= RAIL_CUTTING_SEED_MAX + 1e-9 && w >= last - 1e-9, `seeded and climbing (${w.toFixed(2)} at f ${f.toFixed(2)})`); rising++; }
    last = Math.max(last, w);
  }
  assert.ok(lower > 10 && rising > 20, `both bands sampled (${lower} bare, ${rising} seeded)`);
  assert.ok(last > RAIL_CUTTING_SEED_MAX * 0.9, `the weight reaches the ceiling under the daylight line (${last.toFixed(2)})`);
  let n = 0, admitted = 0, weight = 0; const rng = mulberry32(67);
  for (let i = 0; i < 20000; i++) { const z = 4 + rng() * 9; const w = seedAt(z); if (w <= 0) continue; n++; weight += w; if (railCuttingSeedAdmits(w, 80 + rng(), z)) admitted++; }
  assert.ok(n > 8000, `candidates on the face (${n})`);
  near(admitted / n, weight / n, 0.03, 'the hash admits the weight\'s share of candidates');
  assert.equal(railCuttingSeedAdmits(0, 500, -190), false); assert.equal(railCuttingSeedAdmits(1, 500, -190), true);
  assert.equal(railCuttingSeedAdmits(0.3, 500.25, -190.5), railCuttingSeedAdmits(0.3, 500.25, -190.5), 'deterministic per position'); }

// ------------------------------------------------------------------ Tarkhan Steppe at seed 1337
const cfg = getMapConfig('steppe');
const spur = cfg.terrain.railSpurs[0];
assert.deepEqual(spur.cutting, { from: [440, -181] }, 'the portal at the round-57 stop, defaults otherwise');
const [tarkhan] = resolveRailCuttings(cfg.terrain.railSpurs);
assert.deepEqual([tarkhan.ux, tarkhan.uz, tarkhan.endAlong, tarkhan.ex, tarkhan.ez], [1, 0, 72, 512, -181], 'east along the siding, 72 m to the edge');
const field = createHeightField(1337, cfg);
const uncut = createHeightField(1337, { ...cfg, terrain: { ...cfg.terrain, railSpurs: [{ path: spur.path, bufferStop: spur.bufferStop }] } });
const portalY = field.getHeightAt(440, -181);
near(portalY, uncut.getHeightAt(440, -181), 1e-12, 'the portal stands at the ground it had');
near(portalY, -1.28, 0.02, 'the station level (2026-10-03 measurement)');
for (let x = 440; x <= 512; x += 1) for (const dz of [0, -3.9, 3.9]) {
  near(field.getHeightAt(x, -181 + dz), portalY + RAIL_CUTTING_GRADE * (x - 440), 1e-9, `the bed at 2.4 % (x ${x})`);
}
near(field.getHeightAt(512, -181), portalY + RAIL_CUTTING_GRADE * 72, 1e-9, 'the bed at the edge');
// 2026-10-03: the line leaves through the border landform's low rim (the classic plateau and its tunnel are retired)
const edgeCut = uncut.getHeightAt(511.9, -181) - field.getHeightAt(511.9, -181);
near(edgeCut, 1.13, 0.05, 'a shallow cut at the edge (18 m through the old plateau)');
for (const lat of [4.7, 5.2, 5.6]) {
  near(field.getHeightAt(500, -181 - lat), portalY + RAIL_CUTTING_GRADE * 60 + (lat - 4) / RAIL_CUTTING_BATTER, 1e-9, `the south face at the batter (lateral ${lat})`);
}
assert.equal(field.getHeightAt(500, -191), uncut.getHeightAt(500, -191), 'beyond the daylight line the ground it was');
near(field.getHeightAt(410, -226), -0.01, 0.02, 'the station road node before the rim');
near(field.getHeightAt(512, -232), 3.44, 0.02, 'and at the edge: authored on the landform\'s rim, it comes down with the land (20.4 m on the old plateau)');
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
assert.equal(outside, 0, 'the change is confined to the corridor'); assert.ok(moved > 40 && moved < 120, `the corridor moved (${moved} samples)`);
assert.ok(west <= 6, `the fade before the portal touches a few floor samples only (${west})`);
for (const road of cfg.terrain.roads.paths) for (const [x, z] of road) assert.equal(field.getHeightAt(x, z), uncut.getHeightAt(x, z), `road node ${x},${z} to the bit`);
for (let z = -512; z <= 512; z += 4) for (let x = -512; x <= 512; x += 4) {
  assert.equal(field.getWaterMaskAt(x, z), uncut.getWaterMaskAt(x, z)); assert.equal(field.getGroundType(x, z), uncut.getGroundType(x, z));
}
assert.equal(field.minY, uncut.minY); assert.equal(field.maxY, uncut.maxY);
// the outland: the bed continues past the red line without a step, and on along the open line — its profile resolved
// from the ground the corridor is dug into (the same map's outland without the cutting: the landform, valley and held
// ranges follow the spur that leaves the square, not its cutting)
near(field.getOutlandHeightAt(512, -181), field.getHeightAt(512, -181), 1e-9, 'no step across the red line on the axis');
near(field.getOutlandHeightAt(512, -184.5), field.getHeightAt(512, -184.5), 1e-9, 'nor across the floor');
const open = resolveRailOpenLine(tarkhan, portalY, (x, z) => uncut.getOutlandHeightAt(x, z));
for (let past = 0; past <= RAIL_OPEN_RUN_M * 0.6; past += 8) {
  near(field.getOutlandHeightAt(512 + past, -181), railCuttingBedY(tarkhan, portalY, 72 + past, open), 1e-9, `the open line's bed on the axis (${past} m out)`);
}
let openGrade = 0;
for (let i = 1; i < open.ys.length; i++) openGrade = Math.max(openGrade, Math.abs(open.ys[i] - open.ys[i - 1]) / RAIL_OPEN_STEP_M);
assert.ok(openGrade <= RAIL_OPEN_GRADE + 1e-12, `graded at most ${RAIL_OPEN_GRADE * 100} % (${(openGrade * 100).toFixed(2)} %)`);
for (const past of [100, 200, 300]) for (const side of [-1, 1]) {
  near(field.getOutlandHeightAt(512 + past, -181 + side * (RAIL_OPEN_HALF_FLOOR_M - 0.5)), field.getOutlandHeightAt(512 + past, -181), 1e-9, `the right of way level across (${past} m out)`);
}
assert.equal(field.getOutlandHeightAt(512 + RAIL_OPEN_RUN_M + 10, -181), uncut.getOutlandHeightAt(512 + RAIL_OPEN_RUN_M + 10, -181), 'past the open line\'s run the ground it was');
assert.equal(field.getOutlandHeightAt(300, -181), uncut.getOutlandHeightAt(300, -181), 'the outland sampler is the composition it was elsewhere');
assert.equal(field.getOutlandHeightAt(600, 200), uncut.getOutlandHeightAt(600, 200));
// the ring follows the corridor and nothing else: every vertex that moved stands where the corridor seats it, and every
// seated vertex inside the landform's hand-over lies exactly on the outland it seats on
const ring = sampleHorizonGeometry(cfg, 1337, field), ringUncut = sampleHorizonGeometry(cfg, 1337, uncut);
const n = HORIZON_SEGMENTS;
assert.equal(ring.heights.length, ringUncut.heights.length);
let ringMoved = 0, ringOutside = 0, seated = 0;
for (let i = 0; i < ring.heights.length; i++) {
  const row = Math.floor(i / n), x = ring.positions[i * 3], z = ring.positions[i * 3 + 2];
  if (ring.heights[i] !== ringUncut.heights[i]) {
    ringMoved++;
    if (row === 0) assert.ok(ring.heights[i] <= -64 && ringUncut.heights[i] <= -64, 'both closing rows remain buried');
    else if (field.getOutlandSeatWeightAt(x, z) === 0) ringOutside++;
  }
  if (row > 0 && Math.max(Math.abs(x), Math.abs(z)) > 512 && field.getOutlandSeatWeightAt(x, z) === 1 && field.getBorderHandOverAt(x, z) === 1) {
    seated++;
    near(ring.heights[i], field.getOutlandHeightAt(x, z), 1e-3, `ring vertex ${i} lies on the outland it seats on`);
  }
}
assert.equal(ringOutside, 0, 'the cutting only changes ground inside its corridor');
assert.ok(ringMoved >= 60, `the ring carries the open line (${ringMoved} vertices)`); assert.ok(seated >= 40, `seated vertices (${seated})`);
// the ring's ballast attribute: the signed offset from the line and the presence, kept 40 m either side for the
// interpolation, faded past 0.55-0.9 of the run and where the ring's own height leaves the bed
{ const re = [0, 0];
  assert.deepEqual(field._railExitAt(612, -179.5, re), [1.5, 1], 'on the line 100 m out');
  assert.deepEqual(field._railExitAt(612, -182, re), [-1, 1], 'the offset is signed');
  assert.deepEqual(field._railExitAt(612, -179.5, re, field.getOutlandHeightAt(612, -179.5)), [1.5, 1], 'on the bed');
  assert.equal(field._railExitAt(612, -179.5, re, field.getOutlandHeightAt(612, -179.5) + 3)[1], 0, 'a ring 3 m off the bed draws none');
  assert.deepEqual(field._railExitAt(512 + RAIL_OPEN_RUN_M * 0.92, -179, re), [2, 0], 'past the fade the offset alone');
  assert.deepEqual(field._railExitAt(612, -181 + 45, re), [0, 0], 'beyond 40 m nothing');
  assert.equal(uncut._railExitAt, undefined, 'a map without a cutting publishes no ballast'); }
// the exclusion: floor, cess and faces, not the ground beside the notch nor the plain before the fade
assert.equal(field._noVeg(500, -181), true); assert.equal(field._noVeg(500, -186.5), true, 'the cess');
assert.equal(field._noVeg(500, -187.4), true, 'the face'); assert.equal(field._noVeg(500, -195), false, 'beyond the daylight line');
assert.equal(field._noVeg(480, -150), false, 'the ground beside'); assert.equal(field._noVeg(430, -181), true, 'the spur berth before the portal');
assert.equal(field._noVeg(430, -188), false, 'off the berth before the portal'); assert.equal(uncut._noVeg(500, -187.4), false, 'the same face grew before');
assert.equal(field._noVeg(511.5, -181 - RAIL_SPUR_BERTH_M - 1), true, 'the floor at the edge past the berth');
// the faces' seeding hook is published with a cutting and bare on the floor, the cess and the ground beside
assert.equal(typeof field._batterSeedAt, 'function'); assert.equal(uncut._batterSeedAt, undefined, 'a map without a cutting publishes no seeding hook');
assert.equal(typeof createHeightField(1337, getMapConfig('verdant'))._batterSeedAt, 'undefined');
assert.equal(field._batterSeedAt(500, -181), 0, 'the floor'); assert.equal(field._batterSeedAt(500, -186.5), 0, 'the cess');
assert.equal(field._batterSeedAt(480, -150), 0, 'the ground beside'); assert.equal(field._batterSeedAt(424, -190), 0, 'before the fade');
// the laid track: the spans in the cutting at the rail grade; past the edge the first RAIL_OPEN_KIT_M of the open line
// on its bed; no portal and no stone anywhere on the map
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
const openSleepers = allSleepers.filter((c) => c.x > 512).sort((a, b) => a.x - b.x);
assert.ok(openSleepers.length > RAIL_OPEN_KIT_M / 1.6 && openSleepers.length < RAIL_OPEN_KIT_M / 1.2, `sleepers on the open line (${openSleepers.length})`);
let worstOpen = 0, worstOpenGrade = 0;
for (let i = 0; i < openSleepers.length; i++) {
  const c = openSleepers[i];
  assert.ok(Math.abs(c.z + 181) < 0.5 && c.x - 512 <= RAIL_OPEN_KIT_M, 'along the line\'s own heading, the kit\'s run');
  worstOpen = Math.max(worstOpen, Math.abs(c.y - 0.17 - field.getOutlandHeightAt(c.x, c.z)));
  if (i > 0) worstOpenGrade = Math.max(worstOpenGrade, Math.abs(c.y - openSleepers[i - 1].y) / (c.x - openSleepers[i - 1].x));
}
assert.ok(worstOpen < 0.08, `every open-line sleeper on the bed (worst ${worstOpen.toFixed(3)} m)`);
assert.ok(worstOpenGrade <= RAIL_OPEN_GRADE + 0.004, `and at the open grade (worst ${(worstOpenGrade * 100).toFixed(2)} %)`);
assert.equal(buckets.stone.length, 0, 'no stone: the round-67 tunnel portal is retired');
assert.equal(obstacles.filter((r) => r.kind === 'tunnel-portal').length + colliders.filter((r) => r.kind === 'tunnel-portal').length, 0, 'no portal record');
for (const list of Object.values(buckets)) for (const g of list) g.dispose();

// ------------------------------------------------------------------ Cinder Junction (2026-10-01): the main line's two cuttings
// The redesigned junction's through line leaves the square at each end through a cutting (rotationally symmetric about
// the station square): each bed at the rail grade from its portal's own ground to the edge, no step onto the outland,
// and on in the open along its heading (2026-10-03: the tunnels at each end are retired), its track laid on the bed.
let junctionOpen = 0;
{
  const ry = getMapConfig('railyard');
  const cuts = resolveRailCuttings(ry.terrain.railSpurs);
  assert.equal(cuts?.length, 2, 'Cinder Junction: the through line leaves the square through a cutting at each end');
  const rf = createHeightField(1337, ry);
  const plain = createHeightField(1337, { ...ry, terrain: { ...ry.terrain,
    railSpurs: ry.terrain.railSpurs.map(({ cutting: _cutting, ...rest }) => rest) } });
  assert.deepEqual(cuts.map((c) => Math.sign(c.ex)).sort(), [-1, 1], 'one cutting through each of the west and east rims');
  for (const c of cuts) {
    near(Math.abs(c.ex), 512, 1e-9, 'each cutting runs out through the edge');
    const py = rf.getHeightAt(c.px, c.pz);
    near(py, plain.getHeightAt(c.px, c.pz), 1e-9, 'each portal stands at the ground it had');
    for (let along = 0; along <= c.endAlong - 0.5; along += 2) {
      const x = c.px + c.ux * along, z = c.pz + c.uz * along;
      near(rf.getHeightAt(x, z), py + RAIL_CUTTING_GRADE * along, 1e-9, `Cinder Junction: the bed at the rail grade (${along} m past the portal)`);
    }
    const ex = c.ex - c.ux * 0.1, ez = c.ez - c.uz * 0.1;
    assert.ok(Math.abs(plain.getHeightAt(ex, ez) - rf.getHeightAt(ex, ez)) < 5, 'at the edge the bed lies within a few metres of the land');
    near(rf.getOutlandHeightAt(c.ex, c.ez), rf.getHeightAt(c.ex, c.ez), 1e-9, 'no step across the red line on the axis');
    const line = resolveRailOpenLine(c, py, (x, z) => plain.getOutlandHeightAt(x, z));
    for (let past = 0; past <= RAIL_OPEN_RUN_M * 0.6; past += 20) {
      const x = c.ex + c.ux * past, z = c.ez + c.uz * past;
      near(rf.getOutlandHeightAt(x, z), railCuttingBedY(c, py, c.endAlong + past, line), 1e-9, `Cinder Junction: the open line's bed (${past} m out)`);
    }
  }
  const buckets = Object.fromEntries(names.map((name) => [name, []])), obstacles = [], colliders = [];
  dressMapExtras({ mapId: 'railyard', extraKits: ry.props?.extraKits, riverLandings: ry.props?.riverLandings, L: rf._layout,
    heightField: rf, rng: mulberry32(1337), buckets, obstacles, colliders });
  const outside = buckets.wood.filter((g) => g.parameters?.width === RAIL_SPUR_BALLAST_M - 0.9 && g.parameters.height === 0.09)
    .map(centre).filter((c) => Math.abs(c.x) > 512);
  junctionOpen = outside.length;
  for (const side of [-1, 1]) assert.ok(outside.filter((c) => Math.sign(c.x) === side).length > RAIL_OPEN_KIT_M / 1.6, `Cinder Junction: the open line's track past each edge (${side})`);
  assert.equal(obstacles.filter((record) => record.kind === 'tunnel-portal').length, 0, 'Cinder Junction: no tunnel portal');
  for (const list of Object.values(buckets)) for (const geometry of list) geometry.dispose();
}

// ------------------------------------------------------------------ every other map resolves no cutting
for (const mapId of MAP_IDS) {
  if (mapId === 'steppe' || mapId === 'railyard') continue;
  assert.equal(resolveRailCuttings(getMapConfig(mapId).terrain?.railSpurs), null, `${mapId}: no cutting`);
}
console.log(`railCutting.selftest: resolution and the synthetic rim rule with the widening right of way and its hand-back; the open line's graded profile and embanked fill; the faces' seeding law; Tarkhan's cutting — bed at 2.4 % from ${portalY.toFixed(2)} m to the edge, ${edgeCut.toFixed(2)} m deep there, ${moved} corridor samples moved and none outside, roads/water/ground types to the bit, the open line on at ≤ ${(openGrade * 100).toFixed(2)} %, ${ringMoved} ring vertices moved (${seated} seated exactly on the outland) and none outside the corridor, ${sleepers.length} sleepers in the cutting at ≤ ${(worstGrade * 100).toFixed(2)} % and ${openSleepers.length} on the open line's bed (worst ${worstOpen.toFixed(3)} m), no portal; Cinder Junction's two cuttings at the rail grade running on in the open (${junctionOpen} sleepers past the edges); ${MAP_IDS.length - 2} other maps resolve none`);
