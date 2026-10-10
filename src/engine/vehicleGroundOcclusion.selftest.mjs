// vehicleGroundOcclusion.selftest — the ground's sky under and beside the near hulls (2026-10-03: the skies lane's
// module; the vehicle-ground lane's exact law after wave 13's "a strip of fully-lit snow under the belly"). Pinned: a
// box's and the hull solid's sky share against closed forms and fixed quadratures, the law against a brute-force union
// of the hull and both runs (its own ray caster, sharing no code with the module), the law's shape on the measured T-90M
// (continuous across every edge, darkest under the belly, monotone in clearance), the first-order interreflection that
// replaced the ground-albedo multi-bounce, the solid measured from a built root, the in-place uniforms fed by the shadow
// router's nearest-hull selection, the tier gating, the GLSL's structure and the wiring. The GLSL itself is evaluated
// against the CPU twin by tools/vehicle-ground-occlusion.browser.selftest.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  GROUND_AO_BELLY_VIEW, GROUND_AO_CARD_AMBIENT_SHARE, GROUND_AO_CLIP_SLACK_M, GROUND_AO_CONTACT_EDGE_M, GROUND_AO_CONTACT_FULL_M,
  GROUND_AO_CONTACT_GAP_M, GROUND_AO_CONTACT_MAX, GROUND_AO_CONTACT_RISE_M, GROUND_AO_CONTACT_SPREAD_M, GROUND_AO_OCC_MAX, GROUND_AO_DEFAULT_ALBEDO, GROUND_AO_EDGE_M, GROUND_AO_FADE_M, GROUND_AO_GAP_FADE_M, GROUND_AO_HULL_ALBEDO,
  GROUND_AO_HULL_SKIN_M, GROUND_AO_MAX_HULLS, GROUND_AO_NO_RUN_M, GROUND_AO_RANGE_M, GROUND_AO_REACH, GROUND_AO_RUN_KNOTS,
  GROUND_AO_UNDER_GROUND, VEHICLE_GROUND_OCCLUSION_GLSL, boxSkyOcclusion, combineVehicleGroundOcclusion,
  createVehicleGroundOcclusionUniforms, hullBottomAt, hullProxyOf, hullSkyOcclusion, isRunShoe, measureVehicleGroundHull, trackFloorAt,
  hullSunShadow, runGapOcclusion, runTravelAt, underTrackOcclusion, updateVehicleGroundOcclusionUniforms, vehicleGroundOcclusionLocal,
  vehicleGroundStrengths,
} from './vehicleGroundOcclusion.ts';
import { T90M, T90M_RUN_TOP, UNION_POINTS } from './vehicleGroundOcclusion.test-support.mjs';
import {
  NEAR_VEHICLE_SHADOW_MAX, NEAR_VEHICLE_SHADOW_RANGE_M, createNearVehicleShadowPolicy, markVehicleShadowDetail,
} from './nearVehicleShadowDetail.ts';
import { POST_LIGHT_FX_OFF, resolvePostLightFx } from './postLightFxPolicy.ts';
import { PRESETS } from './quality.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const UP = Object.freeze({ x: 0, y: 1, z: 0 });
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const ONE = Object.freeze({ belly: 1, wall: 1 });

// ---- 0. the brute-force reference: cosine-weighted rays over a receiver's hemisphere, 64 × 64 strata jittered by a
// fixed-seed xorshift (4096 rays), each hit-tested against a union of convex solids (half-space lists: n · x ≤ d)
function bruteForceSky(q, n, solids, N = 64, seed = 0x2545f491) {
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const t = Math.abs(n.x) < 0.9 ? [1, 0, 0] : [0, 1, 0], nn = [n.x, n.y, n.z];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ul = cr(t, nn), l = Math.hypot(...ul), u = ul.map((x) => x / l), w = cr(nn, u), o = [q.x, q.y, q.z];
  let hits = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const s2 = (i + rnd()) / N, st = Math.sqrt(s2), ct = Math.sqrt(1 - s2), ph = (2 * Math.PI * (j + rnd())) / N;
    const c = Math.cos(ph) * st, sn = Math.sin(ph) * st;
    const d = [0, 1, 2].map((k) => u[k] * c + w[k] * sn + nn[k] * ct);
    for (const planes of solids) {
      let t0 = 1e-7, t1 = Infinity, hit = true;
      for (const [pn, pd] of planes) {
        const den = pn[0] * d[0] + pn[1] * d[1] + pn[2] * d[2], num = pd - (pn[0] * o[0] + pn[1] * o[1] + pn[2] * o[2]);
        if (Math.abs(den) < 1e-15) { if (num < 0) { hit = false; break; } continue; }
        if (den > 0) t1 = Math.min(t1, num / den); else t0 = Math.max(t0, num / den);
        if (t0 > t1) { hit = false; break; }
      }
      if (hit) { hits++; break; }
    }
  }
  return hits / (N * N);
}
const boxPlanes = (x0, x1, y0, y1, z0, z1) => [[[1, 0, 0], x1], [[-1, 0, 0], -x0], [[0, 1, 0], y1], [[0, -1, 0], -y0], [[0, 0, 1], z1], [[0, 0, -1], -z0]];
// the hull solid: its box cut by the two end plates (y ≥ yb + hr (pz0 − z), y ≥ yb + hf (z − pz1))
const hullPlanes = (h) => [...boxPlanes(-h.hx, h.hx, h.yb, h.yt, h.fz0, h.fz1),
  [[0, -1, -h.hr], -h.yb - h.hr * h.pz0], [[0, -1, h.hf], -h.yb + h.hf * h.pz1]];
const runPlanes = (h, top) => [boxPlanes(h.xi, h.xo, h.y0, top, h.tz0, h.tz1), boxPlanes(-h.xo, -h.xi, h.y0, top, h.tz0, h.tz1)];

// ---- 1. a box's sky share: exact against closed forms and a deterministic quadrature
// a receiver under the centre of a box's bottom face (half extents a, b at height h): the parallel-rectangle form factor
const parallel = (a, b, h) => {
  const X = a / h, Y = b / h, sx = Math.sqrt(1 + X * X), sy = Math.sqrt(1 + Y * Y);
  return (2 / Math.PI) * ((X / sx) * Math.atan(Y / sx) + (Y / sy) * Math.atan(X / sy));
};
for (const [a, b, h] of [[1.8, 3.6, 0.45], [1.1, 3.2, 0.3], [0.5, 0.5, 2], [3, 1, 0.1]]) {
  near(boxSkyOcclusion({ x: 0, y: -0.7 - h, z: 0 }, UP, { x: a, y: 0.7, z: b }), parallel(a, b, h), 1e-9, `under a ${2 * a}×${2 * b} m face at ${h} m`);
}
near(boxSkyOcclusion({ x: 1.8, y: -1.15, z: 3.6 }, UP, { x: 1.8, y: 0.7, z: 3.6 }), parallel(3.6, 7.2, 0.45) / 4, 1e-9, 'under a corner');
// beside a very long box from the receiver's height to H: the infinite wall, ½ (1 − d / √(d² + H²))
for (const [d, H] of [[0.3, 1.2], [1, 1.5], [3, 2]]) {
  near(boxSkyOcclusion({ x: -(d + 0.5), y: -H / 2, z: 0 }, UP, { x: 0.5, y: H / 2, z: 1e5 }), 0.5 * (1 - d / Math.hypot(d, H)), 2e-4, `a long wall ${H} m tall at ${d} m`);
}
for (const [q, n] of [
  [{ x: 2.3, y: -1.15, z: 0 }, UP], [{ x: -2.5, y: -1.15, z: 4.5 }, UP], [{ x: 0, y: -1.15, z: 5 }, UP],
  [{ x: 2.5, y: 0, z: 0 }, unit(-1, 0, 0)], [{ x: 2.5, y: -0.9, z: 0.3 }, unit(-0.3, 0.95, 0.1)], [{ x: -2, y: -1, z: -4 }, unit(0.2, 0.97, 0.1)],
]) {
  near(boxSkyOcclusion(q, n, { x: 1.8, y: 0.7, z: 3.6 }), bruteForceSky(q, n, [boxPlanes(-1.8, 1.8, -0.7, 0.7, -3.6, 3.6)]), 6e-3, `a box from ${JSON.stringify(q)}`);
}
assert.ok(boxSkyOcclusion({ x: 0, y: -0.9, z: 0 }, UP, { x: 1.8, y: 0.7, z: 3.6 }) > 0.95, 'under a wide box at 0.2 m');
assert.ok(boxSkyOcclusion({ x: 12, y: -1.15, z: 0 }, UP, { x: 1.8, y: 0.7, z: 3.6 }) < 0.02, 'ten metres outside its footprint');
assert.equal(boxSkyOcclusion({ x: 0, y: 2, z: 0 }, UP, { x: 1.8, y: 0.7, z: 3.6 }), 0, 'a box under the receiver\'s horizon hides nothing');

// ---- 2. the hull solid: a box when its ends are flat, the cut solid against the ray caster, monotone in clearance
const T = T90M;
const flat = Object.freeze({ ...T, pz0: T.fz0, pz1: T.fz1, hr: 0, hf: 0 });
const boxOf = (h, q) => boxSkyOcclusion({ x: q.x, y: q.y - 0.5 * (h.yb + h.yt), z: q.z - 0.5 * (h.fz0 + h.fz1) }, UP,
  { x: h.hx, y: 0.5 * (h.yt - h.yb), z: 0.5 * (h.fz1 - h.fz0) });
for (const q of [{ x: 0, y: 0, z: 0 }, { x: 2.1, y: 0, z: 0.5 }, { x: -1.9, y: 0, z: -4.3 }, { x: 0.4, y: 0, z: 4.6 }, { x: 3, y: 0.2, z: -1 }]) {
  near(hullSkyOcclusion(q, UP, flat, q.y), boxOf(flat, q), 1e-9, `flat ends: the box, from ${JSON.stringify(q)}`);
}
for (const [q, n] of [
  [{ x: 0, y: 0, z: -3.6 }, UP], [{ x: 0.6, y: 0, z: -4.4 }, UP], [{ x: 2.4, y: 0, z: -3.3 }, UP], [{ x: -0.8, y: 0, z: 4.2 }, UP],
  [{ x: 0, y: 0, z: -3.3 }, unit(0, 0.95, 0.31)], [{ x: 2.6, y: 0.3, z: -2.0 }, unit(-0.4, 0.9, 0.17)], [{ x: -0.3, y: 0.1, z: 3.0 }, unit(0.1, 0.97, -0.2)],
]) {
  near(hullSkyOcclusion(q, n, T, q.y), bruteForceSky(q, n, [hullPlanes(T)]), 6e-3, `the cut solid from ${JSON.stringify(q)}`);
}
// the end plates matter: under the rear plate the cut solid keeps sky the flat box would hide
assert.ok(hullSkyOcclusion({ x: 0, y: 0, z: -3.6 }, UP, T, 0) < boxOf(flat, { x: 0, y: 0, z: -3.6 }) - 0.1, 'the rear plate rises off the ground');
near(hullBottomAt(T.fz0, T), T.yb + T.hr * (T.pz0 - T.fz0), 1e-12, 'the rear end\'s foot'); near(hullBottomAt(0, T), T.yb + T.hf * (0 - T.pz1), 1e-12, 'the tilted belly');
near(hullBottomAt(-9, T), hullBottomAt(T.fz0, T), 1e-12, 'clamped past the end');
for (let c = 0.1, prev = 2; c < 4; c += 0.1) {
  const o = hullSkyOcclusion({ x: 0.4, y: T.yb - c, z: -1 }, UP, T, T.yb - c);
  assert.ok(o < prev, `falls as the clearance grows (${c.toFixed(1)} m: ${o.toFixed(4)})`);
  prev = o;
}
assert.equal(hullSkyOcclusion({ x: 0, y: 2, z: 0 }, UP, T, 2), 0, 'a solid under the receiver\'s horizon hides nothing');

// ---- 3. the law against the true union of the hull and both runs (the coordinator's ground points; 2026-10-03)
// The runs add only the side gaps between them: from beside or beyond the hull every ray through a run goes on into the
// belly. Tolerance 0.015: the law sits within 0.013 of the union at every point (the ray caster's own noise ≈ 0.002).
const union = [hullPlanes(T), ...runPlanes(T, T90M_RUN_TOP)];
const lawAt = (q) => vehicleGroundOcclusionLocal(q, UP, T, ONE);
const unionRows = [];
for (const [label, p] of UNION_POINTS) {
  const q = { x: p[0], y: p[1], z: p[2] }, bf = bruteForceSky(q, UP, union), law = lawAt(q);
  unionRows.push(`${label} ${law.toFixed(3)}/${bf.toFixed(3)}`);
  near(law, bf, 0.015, `the union, ${label}`);
}
// the numbers measured for the fix: 0.3 m beside the track the union hides 0.44 of the sky; the summed hull box and run
// box of the old law hid 0.65
const beside = { x: T.xo + 0.3, y: 0, z: 0 };
const unionBeside = bruteForceSky(beside, UP, union);
near(unionBeside, 0.442, 0.01, 'the T-90M\'s union 0.3 m beside the track');
const oldSum = boxOf(flat, beside) + boxSkyOcclusion({ x: beside.x - 0.5 * (T.xi + T.xo), y: beside.y - 0.5 * (0.02 + T.yb), z: beside.z - 0.5 * (T.tz0 + T.tz1) }, UP,
  { x: 0.5 * (T.xo - T.xi), y: 0.5 * (T.yb - 0.02), z: 0.5 * (T.tz1 - T.tz0) });
near(oldSum, 0.65, 0.02, 'the summed boxes of the old law there');
// over a grid around the hull, the law stays within 0.035 of the union (0.01 on average) — except between the runs past
// their ground run, where the reference's box runs stand on the ground and the real ramps rise off it: the law closes the
// side gaps only along the ground run, and there trails the reference by up to 0.1
let worst = 0, worstWrap = 0, sum = 0, cells = 0;
for (const x of [0, 0.5, 1.0, 2.0, 2.5, 3.0]) for (const z of [-5, -4.4, -3.6, -3, -2, 0, 2, 3, 3.6, 4.4, 5]) {
  const q = { x, y: 0, z }, d = Math.abs(lawAt(q) - bruteForceSky(q, UP, union));
  if (x >= 0.5 * T.xi && x < T.xi && (z < T.cz0 || z > T.cz1)) { worstWrap = Math.max(worstWrap, d); continue; }
  worst = Math.max(worst, d); sum += d; cells++;
}
assert.ok(worst < 0.035 && sum / cells < 0.01 && worstWrap < 0.1, `the grid: worst ${worst.toFixed(4)}, mean ${(sum / cells).toFixed(4)}, beside the wraps ${worstWrap.toFixed(4)}`);

// ---- 4. the law's shape on the T-90M: darkest under the belly, continuous across every edge, symmetric
const F = (x, z, y = 0, n = UP) => vehicleGroundOcclusionLocal({ x, y, z }, n, T, ONE);
assert.ok(F(0, 0) > 0.98 && F(0, 0) <= 1, `the belly's middle loses almost all its sky (${F(0, 0).toFixed(3)})`);
assert.ok(F(0, T.fz0) > 0.45 && F(0, T.fz0) < 0.75, `the rear end under its plate (${F(0, T.fz0).toFixed(3)})`);
assert.ok(F(0, T.fz0 - 4.9) === 0 && F(6.7, 0) === 0 && F(0, T.fz0 - 3) > 0.02, 'past its reach (three hull heights): nothing');
assert.equal(F(0, 0, 1.7), 0, 'over the deck: nothing');
// the side gaps close toward the runs; along the ground run right up to the shoes, past it fading in from the runs'
// faces (no step under a wrap)
assert.ok(runGapOcclusion({ x: 0, y: 0, z: 0 }, UP, T, 0) > 0.01 && runGapOcclusion({ x: 0.9, y: 0, z: 0 }, UP, T, 0) > runGapOcclusion({ x: 0, y: 0, z: 0 }, UP, T, 0),
  'the side gaps close toward the runs');
assert.ok(runGapOcclusion({ x: T.xi - 0.005, y: 0, z: 0 }, UP, T, 0) > 0.05, 'next to the shoes on the ground run: closed');
assert.ok(runGapOcclusion({ x: T.xi - 0.005, y: 0, z: 2.9 }, UP, T, 0) < 0.002, 'next to a wrap: faded out');
assert.equal(runGapOcclusion({ x: T.xi, y: 0, z: 2.9 }, UP, T, 0), 0, 'nothing at the run\'s face');
assert.equal(runGapOcclusion({ x: 2.2, y: 0, z: 0 }, UP, T, 0), 0, 'nothing outside the runs');
// the hull's own surface over the belly (a marking decal blended over it reads as a card or lit ground): never a receiver
for (const [x, y, z] of [[1.9, 0.9, 0], [0.5, 1.0, 0.5], [-1.95, 0.6, -2], [0.2, 0.8, 3.95], [0.3, 0.9, -3.95]]) {
  assert.equal(F(x, z, y), 0, `the hull's skin at ${x}, ${y}, ${z}`);
  assert.equal(F(x, z, y, unit(0.3, 0.2, 0.9)), 0, 'whatever its normal');
}
// the shoes (their cloned material writes no vehicle tag and no sun state: a card to this block) over the track's lower
// edge in their lane: along their ground run, their faces at the lane's edges, up the wraps' ramp
const C = (x, z, y, n = UP) => vehicleGroundOcclusionLocal({ x, y, z }, n, T, ONE, true);
for (const [x, y, z] of [[1.4, 0.05, 0], [-1.3, 0.06, 1.5], [1.6, 0.4, T.cz0 - 0.5], [-1.4, 1.2, T.tz1 - 0.02], [1.5, 0.06, T.cz1 + 0.02],
  [T.xo + 0.01, 0.06, 0.5], [-(T.xi - 0.01), 0.07, -1]]) {
  assert.ok(isRunShoe({ x, y, z }, T, true) && C(x, z, y) === 0, `a shoe at ${x}, ${y}, ${z}`);
}
near(trackFloorAt(0, T), -0.01, 1e-12, 'the contact plane (less a centimetre) along the ground run'); near(trackFloorAt(T.cz0 - 0.5, T), T.sr * 0.5 - 0.03, 1e-12, 'the rear ramp');
near(trackFloorAt(T.cz1 + 0.5, T), T.sf * 0.5 - 0.03, 1e-12, 'the front ramp');
// a lit pixel is never a shoe: the terrain over the floor behind a pitched hull's track ends, the snow over a sunk
// track's foot (lab6's patches and line); grass under a wrap's ramp stays a receiver
assert.ok(!isRunShoe({ x: 1.5, y: 0.09, z: T.cz0 - 0.5 }, T, false) && F(1.5, T.cz0 - 0.5, 0.09) > 0.5, 'the terrain under a pitched track end');
assert.ok(!isRunShoe({ x: T.xo + 0.01, y: 0.06, z: 0 }, T, false), 'the snow over a sunk track\'s foot');
assert.ok(!isRunShoe({ x: 1.5, y: 0.1, z: T.cz0 - 0.5 }, T, true) && C(1.5, T.cz0 - 0.5, 0.1) > 0.5, 'a grass blade under the rear ramp');
// under the floor a lane pixel is ground: where the run meets it the shoes cover it (their gaps, their foot: the contact
// line); by its gap under the run's lower edge it takes its sky back. 2026-10-08 (the contact-shadow lane; the owner:
// "contact shadows for tracks on ground which are staticly on ground and look bad"): the old print kept the whole lane
// black at any depth under the run, and 0.3 m past its ends whatever the wraps' height. 2026-10-09 (round 3; the owner on
// production 207: "super super dark rectangular shadows under tracks?? fix this"): the contact hid the whole sky (near
// black, past the solid's own share there); it is a soft rim now, at most GROUND_AO_CONTACT_MAX, joined by the larger
const MAXC = GROUND_AO_CONTACT_MAX;
assert.ok(MAXC >= 0.5 && MAXC <= 0.75, `the contact hides at most ${MAXC} of the sky (the old lane: all of it)`);
assert.ok(!isRunShoe({ x: 1.5, y: 0, z: 0 }, T, false) && underTrackOcclusion({ x: 1.5, y: 0, z: 0 }, T) === MAXC, 'the ground under the ground run');
assert.ok(F(1.5, 0) >= MAXC && F(1.5, 0) < 0.9, `the lane keeps a share of its sky: ${F(1.5, 0).toFixed(3)} (the solid's or the contact's, the larger; the old lane: 1)`);
near(underTrackOcclusion({ x: 1.5, y: 0.03, z: 0 }, T), MAXC * (1 - (0.03 / GROUND_AO_CONTACT_RISE_M) ** 2 * (3 - 2 * 0.03 / GROUND_AO_CONTACT_RISE_M)), 1e-9,
  'the ground standing into the run: nearly whole');
assert.equal(underTrackOcclusion({ x: 1.5, y: GROUND_AO_CONTACT_RISE_M, z: 0 }, T), 0, 'a blade a rise over the run\'s edge: none');
assert.equal(underTrackOcclusion({ x: 1.5, y: -GROUND_AO_CONTACT_FULL_M, z: 0 }, T), MAXC, 'whole within the shoes\' grousers and the facets');
near(underTrackOcclusion({ x: 1.5, y: -0.5 * (GROUND_AO_CONTACT_FULL_M + GROUND_AO_CONTACT_GAP_M), z: 0 }, T), 0.5 * MAXC, 1e-9, 'half midway');
assert.equal(underTrackOcclusion({ x: 1.5, y: -GROUND_AO_CONTACT_GAP_M, z: 0 }, T), 0, 'none a gap under the run');
assert.ok(GROUND_AO_CONTACT_FULL_M <= 0.02 && GROUND_AO_CONTACT_GAP_M <= 0.1, 'gone within a few centimetres');
const liftedRun = F(1.5, 0, -0.13);
assert.ok(liftedRun > 0.6 && liftedRun < 0.8, `under a run 13 cm over the ground, only the solid's share (${liftedRun.toFixed(3)}; the old print: 1)`);
const halfPast = 0.5 * (GROUND_AO_CONTACT_FULL_M + GROUND_AO_CONTACT_GAP_M);
near(underTrackOcclusion({ x: 1.5, y: 0, z: T.cz1 + halfPast / T.sf }, T), 0.5 * MAXC, 1e-9, 'half where the front wrap stands midway over the ground');
near(underTrackOcclusion({ x: 1.5, y: 0, z: T.cz0 - halfPast / T.sr }, T), 0.5 * MAXC, 1e-9, 'and the rear');
assert.equal(underTrackOcclusion({ x: 1.5, y: 0, z: T.cz1 + GROUND_AO_CONTACT_GAP_M / T.sf }, T), 0, 'lifted off (the old print: 0.3 m past the run)');
assert.equal(underTrackOcclusion({ x: 1.5, y: T.sr * 1.2, z: T.cz0 - 1.2 }, T), MAXC, 'the ground rising into the rear wrap');
assert.equal(underTrackOcclusion({ x: 1.5, y: 3, z: T.fz1 + 0.01 }, T), 0, 'nothing past the hull\'s ends');
// the rim hugs the run: whole inside the shoes' lane, gone a spread outside its faces, squared (the old 5 mm edge ruled a
// line; the crease at the track's foot, never a band)
assert.equal(underTrackOcclusion({ x: T.xo, y: 0, z: 0 }, T), MAXC, 'whole at the outer face');
assert.equal(underTrackOcclusion({ x: T.xi, y: 0, z: 0 }, T), MAXC, 'and the inner');
near(underTrackOcclusion({ x: T.xo + 0.5 * GROUND_AO_CONTACT_SPREAD_M, y: 0, z: 0 }, T), 0.25 * MAXC, 1e-9, 'a quarter halfway out');
assert.equal(underTrackOcclusion({ x: T.xo + GROUND_AO_CONTACT_SPREAD_M, y: 0, z: 0 }, T), 0, 'none a spread past the face');
assert.ok(GROUND_AO_CONTACT_SPREAD_M <= 0.15, 'no spill past the track\'s foot');
{
  let worstEdge = 0;
  for (let x = T.xo - 0.1, prev = null; x <= T.xo + 0.2; x += 0.001) {
    const v = underTrackOcclusion({ x, y: 0, z: 0 }, T);
    if (prev !== null) worstEdge = Math.max(worstEdge, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(worstEdge < 0.01, `the rim is soft: worst 1 mm change ${worstEdge.toFixed(4)} (the old 5 mm edge: 0.15)`);
}
// lab4's two strips (2026-10-03): the ground under a rear wrap and the ground just past the shoes are receivers
assert.ok(!isRunShoe({ x: 1.5, y: 0, z: T.cz0 - 0.5 }, T, false) && F(1.5, T.cz0 - 0.5) > 0.6, `the ground under the rear wrap (${F(1.5, T.cz0 - 0.5).toFixed(3)})`);
assert.ok(!isRunShoe({ x: T.xo + 0.01, y: 0, z: 0 }, T, false) && F(T.xo + 0.01, 0) > 0.5 && F(T.xo + 0.01, 0) < 0.9, 'the ground just past the shoes');
// continuous across every edge: the footprint's sides and ends, the shoes' lanes under the wraps, a corner, the plates'
// knees (1 mm steps; a step function would keep its jump at any step, a steep gradient shrinks with it)
for (const [line, label] of [[(t) => [0, T.fz0 - 0.9 + t], 'the rear end'], [(t) => [0, T.fz1 + 0.9 - t], 'the front end'],
  [(t) => [-2.6 + t, 0], 'a side'], [(t) => [-2.6 + t, 4.6 - t], 'a corner'], [(t) => [-1.7 + t, T.cz0 - 0.5], 'across a wrap'],
  [(t) => [0.4, T.pz0 - 0.8 + t], 'the rear plate\'s knee'], [(t) => [1.1 + t * 0.2, -3.0], 'a run\'s inner face past its ground run'],
  [(t) => [T.xo + 1.0 - t, 0.3], 'into a run\'s outer face on its ground run'], [(t) => [T.xo + 0.03, T.cz1 - 0.6 + t], 'along a run\'s foot off its front end']]) {
  let prev = null, worstStep = 0;
  for (let t = 0; t <= 1.7; t += 0.001) {
    const [x, z] = line(t);
    // the ground the shoes cover on their ground run (seen only through their gaps; the run's inner face closes the side
    // gap there, a step under the hull). 2026-10-09, round 3: no longer the lane's soft edges as well — the rim outside the
    // shoes' faces, the visible crease at the track's foot, joins the solid's share by the larger with no step
    if (Math.abs(Math.abs(x) - 0.5 * (T.xi + T.xo)) < 0.5 * (T.xo - T.xi) && z > T.cz0 - 0.3 && z < T.cz1 + 0.3) { prev = null; continue; }
    const v = F(x, z);
    if (prev !== null) worstStep = Math.max(worstStep, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(worstStep < 0.01, `${label}: no step (worst 1 mm change ${worstStep.toFixed(4)})`);
}
for (const [x, z] of [[2.4, 0.3], [0.5, -4.3], [1.9, 4.1], [3.1, -1], [0.7, 2]]) near(F(x, z), F(-x, z), 1e-9, `mirror at ${x}, ${z}`);
assert.ok(vehicleGroundOcclusionLocal({ x: -2.3, y: 0.6, z: 0.3 }, unit(1, 0, 0), T, ONE) > 0.3, 'a wall facing the hull is shaded by it');
// monotone in clearance: the same hull on longer legs (its belly and deck raised together)
for (let lift = 0, prev = 2; lift < 1.5; lift += 0.1) {
  const raised = { ...T, yb: T.yb + lift, yt: T.yt + lift };
  const o = vehicleGroundOcclusionLocal({ x: 0.3, y: 0, z: -0.5 }, UP, raised, ONE);
  assert.ok(o < prev, `the belly's middle falls as the hull rises (${lift.toFixed(1)} m: ${o.toFixed(4)})`);
  prev = o;
}

// ---- 4b. the runs as they are drawn this frame (2026-10-08, the contact-shadow lane): each side's lower edge over the
// contact plane at GROUND_AO_RUN_KNOTS knots evenly over the ground run (the road wheels' travel the band follows),
// linear between, held past the ends; the contact, the shoes and the side gaps all stand on it
const K = GROUND_AO_RUN_KNOTS, REST = Object.freeze(Array(K).fill(0));
const knotZ = (i) => T.cz0 + (i / (K - 1)) * (T.cz1 - T.cz0);
const FR = (x, z, y, runs, card = false) => vehicleGroundOcclusionLocal({ x, y, z }, UP, T, ONE, card, runs);
{
  const ramp = { left: REST, right: Array.from({ length: K }, (_, i) => 0.01 * i) };
  for (let i = 0; i < K; i++) near(runTravelAt(1, knotZ(i), T, ramp), 0.01 * i, 1e-12, `knot ${i}`);
  near(runTravelAt(1, 0.5 * (knotZ(2) + knotZ(3)), T, ramp), 0.025, 1e-12, 'linear between knots');
  near(runTravelAt(1, T.cz0 - 1, T, ramp), 0, 1e-12, 'held past the rear'); near(runTravelAt(1, T.cz1 + 1, T, ramp), 0.07, 1e-12, 'and the front');
  assert.equal(runTravelAt(-1, 0, T, ramp), 0, 'each side its own'); assert.equal(runTravelAt(1, 0, T, null), 0, 'none at rest');
  for (const [x, z, y, card] of [[1.5, 0, 0, false], [1.5, 0, -0.05, false], [T.xo + 0.02, 1, 0, false], [0.4, 0.5, 0, false], [1.6, 0.4, T.cz0 - 0.5, true]]) {
    near(FR(x, z, y, { left: REST, right: REST }, card), FR(x, z, y, null, card), 1e-12, `zero travel is the rest pose at ${x}, ${y}, ${z}`);
  }
}
{
  // a crest under the right run: its front half lifted 10 cm (the wheels drooping off the crest's far side), the rear on
  // the ground — the old print stayed whole under the lifted half
  const crest = { left: REST, right: Array.from({ length: K }, (_, i) => (i >= K / 2 ? 0.1 : 0)) };
  assert.equal(underTrackOcclusion({ x: 1.5, y: 0, z: knotZ(K - 1) }, T, crest), 0, 'the lifted front half: no contact');
  assert.equal(underTrackOcclusion({ x: 1.5, y: 0, z: knotZ(1) }, T, crest), MAXC, 'the rear half on the ground: contact');
  assert.equal(underTrackOcclusion({ x: -1.5, y: 0, z: knotZ(K - 1) }, T, crest), MAXC, 'the other run on the ground');
  const under = FR(1.5, knotZ(K - 1), 0, crest);
  assert.ok(under > 0.6 && under < 0.85, `the ground under the lifted half keeps the solid's share (${under.toFixed(3)})`);
  // a hollow under the left run: its middle drooped 6 cm onto ground 6 cm under the contact plane — the contact follows
  // it down (at rest that ground would read as lifted off)
  const hollow = { left: Array.from({ length: K }, (_, i) => (i >= 2 && i <= 5 ? -0.06 : 0)), right: REST };
  assert.equal(underTrackOcclusion({ x: -1.5, y: -0.06, z: knotZ(3) }, T, hollow), MAXC, 'the run drooped into the hollow: contact');
  assert.ok(underTrackOcclusion({ x: -1.5, y: -0.06, z: knotZ(3) }, T) < 0.51 * MAXC, 'the rest pose would have half lifted it off');
  // continuous along a run over the crest's knee (the knots are linear, the gap law smooth)
  let worstRun = 0;
  for (let z = T.cz0, prev = null; z <= T.cz1; z += 0.001) {
    const v = FR(1.5, z, 0, crest);
    if (prev !== null) worstRun = Math.max(worstRun, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(worstRun < 0.01, `along the run over the crest's knee: no step (worst 1 mm change ${worstRun.toFixed(4)})`);
  // the shoes follow the drawn run: a shoe of the drooped run under the rest floor is still a shoe, and grass under a
  // lifted run is a receiver, not a shoe
  assert.ok(isRunShoe({ x: -1.5, y: -0.05, z: knotZ(3) }, T, true, hollow) && !isRunShoe({ x: -1.5, y: -0.05, z: knotZ(3) }, T, true),
    'a shoe of the drooped run under the rest floor');
  assert.ok(!isRunShoe({ x: 1.5, y: 0.05, z: knotZ(K - 1) }, T, true, crest) && isRunShoe({ x: 1.5, y: 0.05, z: knotZ(K - 1) }, T, true),
    'a grass blade under the lifted run is a receiver');
  near(trackFloorAt(0, T, 0.1), 0.1 - 0.01, 1e-12, 'the floor rides the run\'s travel');
  // the side gaps stand each run on its drawn lower edge: a lifted run lets the gap's sky through
  const q = { x: T.xi - 0.05, y: 0, z: knotZ(K - 1) };
  assert.ok(runGapOcclusion(q, UP, T, 0, crest) < 0.5 * runGapOcclusion(q, UP, T, 0),
    `a lifted run closes less of its side gap (${runGapOcclusion(q, UP, T, 0, crest).toFixed(4)} against ${runGapOcclusion(q, UP, T, 0).toFixed(4)} at rest)`);
  near(runGapOcclusion({ x: -0.9, y: 0, z: knotZ(K - 1) }, UP, T, 0, crest), runGapOcclusion({ x: -0.9, y: 0, z: knotZ(K - 1) }, UP, T, 0), 0.002,
    'the far side barely changes (its own run rests; only the lifted run\'s share)');
  // a thrown track (its band hidden): no run meets the ground on that side — no contact, no shoe, its side gap open
  const thrown = { left: REST, right: Array(K).fill(GROUND_AO_NO_RUN_M) };
  assert.equal(underTrackOcclusion({ x: 1.5, y: 0, z: 0 }, T, thrown), 0, 'no contact under a thrown track');
  assert.ok(!isRunShoe({ x: 1.5, y: 0.06, z: 0 }, T, true, thrown), 'no shoes there');
  assert.ok(runGapOcclusion({ x: 0.9, y: 0, z: 0 }, UP, T, 0, thrown) < 0.5 * runGapOcclusion({ x: 0.9, y: 0, z: 0 }, UP, T, 0), 'its side gap open');
  assert.equal(underTrackOcclusion({ x: -1.5, y: 0, z: 0 }, T, thrown), MAXC, 'the other run still on the ground');
}

// ---- 5. the interreflection: what a blocked direction keeps (the belly enclosure, the walls), first order
const snow = vehicleGroundStrengths(0.8, 0.65), sand = vehicleGroundStrengths(0.34, 6.5), dark = vehicleGroundStrengths(0.1, 4);
assert.equal(GROUND_AO_HULL_ALBEDO, 0.25); assert.equal(GROUND_AO_BELLY_VIEW, 0.3); assert.equal(GROUND_AO_UNDER_GROUND, 0.15);
near(snow.belly, 1 - 0.25 * 0.8 * (0.3 * 1.65 + 0.7 * 0.15), 1e-12, 'r_belly = ρ_hull ρ_ground (v (1 + k) + (1 − v) u)');
near(snow.wall, 1 - 0.25 * (0.5 + 0.5 * 0.8 * (1 + 0.5 * 0.65)), 1e-12, 'r_wall = ρ_hull (½ + ½ ρ_ground (1 + ½ k))');
for (const s of [snow, sand, dark]) assert.ok(s.belly > s.wall && s.wall > 0.5 && s.belly < 1, 'the dark belly hides more than a lit wall');
near(vehicleGroundStrengths(0, 3).belly, 1, 1e-12, 'a black ground returns nothing under the belly');
near(vehicleGroundStrengths(0, 3).wall, 1 - GROUND_AO_HULL_ALBEDO / 2, 1e-12, 'a wall still returns its half sky');
assert.ok(vehicleGroundStrengths(0.5, 4).belly < vehicleGroundStrengths(0.3, 4).belly && vehicleGroundStrengths(0.3, 8).wall < vehicleGroundStrengths(0.3, 2).wall,
  'a brighter ground or sun returns more');
// the defect pinned: wave 13's snow strip. The ground-albedo multi-bounce (Jimenez on ρ 0.8) kept 0.37 of the sky at the
// belly's middle and 0.81 at the rear edge; the belly here keeps an eighth
const jimenez = (v, rho) => { const a = 2.0404 * rho - 0.3324, b = -4.7951 * rho + 0.6417, c = 2.7552 * rho + 0.6903; return Math.max(v, ((a * v + b) * v + c) * v); };
near(jimenez(0.15, 0.8), 0.367, 0.002, 'the old middle on snow'); near(jimenez(0.5, 0.8), 0.81, 0.005, 'the old rear edge on snow');
const visSnow = (x, z) => 1 - vehicleGroundOcclusionLocal({ x, y: 0, z }, UP, T, snow);
assert.ok(visSnow(0, 0) < 0.16, `snow under the belly keeps ${visSnow(0, 0).toFixed(3)} of its sky`);
assert.ok(visSnow(0, T.pz0) < 0.3 && visSnow(0, T.fz0) < 0.62, `the rear strip: ${visSnow(0, T.pz0).toFixed(3)} at the plate's knee, ${visSnow(0, T.fz0).toFixed(3)} at the end`);
// photographs of hulls on sand: the belly at 0.07–0.16 of the sunlit ground in display light ≈ 0.18–0.32 of its sky
// (through AgX on the lane's measured Sirocco frames); sunny sand's belly middle lands inside
const visSand = 1 - vehicleGroundOcclusionLocal({ x: 0, y: 0, z: 0 }, UP, T, sand);
assert.ok(visSand > 0.15 && visSand < 0.32, `sunny sand's belly keeps ${visSand.toFixed(3)}`);
// several hulls as independent occluders, the range fade over the selection's last stretch
near(combineVehicleGroundOcclusion([0.3, 0.4], 10), 0.58, 1e-12, 'two as independent occluders');
near(combineVehicleGroundOcclusion([0.8], GROUND_AO_RANGE_M), 0, 1e-12, 'gone at the range');
near(combineVehicleGroundOcclusion([0.6], GROUND_AO_RANGE_M - GROUND_AO_FADE_M), 0.6, 1e-12, 'whole inside the fade');
// (2026-10-10, round 3; the owner on production 207: "super super dark rectangular shadows under tracks") the hulls' joint
// share is capped: the ground under a belly keeps a part of its sky (the 207 frames: 0.03–0.08 of the shaded ground)
assert.ok(GROUND_AO_OCC_MAX >= 0.6 && GROUND_AO_OCC_MAX <= 0.75, `the darkening never passes ${GROUND_AO_OCC_MAX} of the sky`);
near(combineVehicleGroundOcclusion([0.99], 10), GROUND_AO_OCC_MAX, 1e-12, 'a belly\'s middle: capped');
near(combineVehicleGroundOcclusion([0.6, 0.6], 10), GROUND_AO_OCC_MAX, 1e-12, 'two hulls never stack past the cap');
assert.ok(combineVehicleGroundOcclusion([vehicleGroundOcclusionLocal({ x: 0, y: 0, z: 0 }, UP, T, snow)], 10) <= GROUND_AO_OCC_MAX,
  'snow under the belly keeps at least the cap\'s share of its sky');

// ---- 5b. (2026-10-10, round 3) a card's sun: all ambient only in the hull's own shadow — the ray toward the sun meets its
// box (the footprint from the contact plane to the deck). Inside the footprint below the belly a card took the whole
// ambient share sunlit too: the sunlit grass under a skirt went near black under a hard edge at the belly's height
{
  const up = unit(0, 1, 0), lowSunRight = unit(1, 0.35, 0), lowSunLeft = unit(-1, 0.35, 0);
  assert.equal(hullSunShadow({ x: 0, y: 0.1, z: 0 }, T, up), 1, 'under the belly, a high sun: shaded');
  assert.equal(hullSunShadow({ x: T.hx - 0.05, y: 0.2, z: 0 }, T, lowSunRight), 0, 'under the right overhang, the sun low on the right: sunlit');
  assert.equal(hullSunShadow({ x: T.hx - 0.05, y: 0.2, z: 0 }, T, lowSunLeft), 1, 'the same blade, the sun on the left: in the hull\'s shadow');
  assert.equal(hullSunShadow({ x: T.hx + 1.0, y: 0.1, z: 0 }, T, lowSunLeft), 1, 'a metre out on the shadow side, a low sun: in its cast shadow');
  assert.equal(hullSunShadow({ x: T.hx + 1.0, y: 0.1, z: 0 }, T, lowSunRight), 0, 'on the sunny side: sunlit');
  assert.equal(hullSunShadow({ x: 0, y: 0.1, z: T.fz1 + 3 }, T, up), 0, 'ahead of the hull, a high sun: sunlit');
  assert.equal(hullSunShadow({ x: 0, y: 2.0, z: 0 }, T, up), 0, 'over the deck: sunlit');
  assert.equal(hullSunShadow({ x: 0, y: 0.1, z: 0 }, T, unit(1, 0.12, 0)), 1, 'under the belly, a grazing sun from the side: the run shades it');
  assert.equal(hullSunShadow({ x: 0, y: 0.1, z: T.fz1 + 0.05 }, T, unit(0, 0.3, -1)), 1, 'just ahead of the glacis, a low sun from behind the hull: in its shadow');
  assert.equal(hullSunShadow({ x: 0, y: 0.1, z: T.fz1 + 0.05 }, T, unit(0, 0.3, 1)), 0, 'the sun ahead: sunlit');

}

// ---- 6. the solid from a built root: contact geometry, the hull proxy's underside, the shoes (then the bands)
function builtHull(name, { z = 0, bands = true, contact = true, shoes = true, slope = 0 } = {}) {
  const root = new THREE.Group(); root.name = name; root.position.set(0, 0, z);
  const hullG = new THREE.Group(); root.add(hullG);
  const geometry = new THREE.BoxGeometry(3.58, 1.01, 7.1, 4, 1, 14).translate(0, 0.865, 0.13);
  if (slope) { // a rear plate rising off the ground behind z = −2.4 (the M1A2's: 0.41 m to 1.0 m over its last metre)
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.4 && p.getZ(i) < -2.4) p.setY(i, p.getY(i) + (-2.4 - p.getZ(i)) * slope);
    geometry.computeBoundingBox();
  }
  const proxy = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false }));
  proxy.name = 'procShadow_hull'; hullG.add(proxy);
  if (bands) {
    for (const [nameSide, x] of [['gearTrackBandL', -1.415], ['gearTrackBandR', 1.415]]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.61, 1.02, 6.32), new THREE.MeshStandardMaterial());
      band.name = nameSide; band.position.set(x, 0.55, 0.27); hullG.add(band);
    }
  }
  if (shoes) { // the ground run (z −2.3..2.3 at 0.15 m), a ramp at each end, one collapsed shoe far out
    const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), new THREE.MeshStandardMaterial(), 80);
    pads.name = 'gearTrackPads';
    const m = new THREE.Matrix4();
    let i = 0;
    for (const x of [-1.45, 1.45]) {
      for (let k = -15; k <= 15; k++) pads.setMatrixAt(i++, m.makeTranslation(x, 0.04, k * 0.15 + 0.1));
      for (let k = 1; k <= 4; k++) { pads.setMatrixAt(i++, m.makeTranslation(x, 0.04 + 0.12 * k, -2.25 - 0.18 * k)); pads.setMatrixAt(i++, m.makeTranslation(x, 0.04 + 0.12 * k, 2.45 + 0.18 * k)); }
    }
    pads.setMatrixAt(i++, m.makeScale(0, 0, 0).setPosition(9, 0, 9));
    pads.count = i;
    hullG.add(pads);
  }
  if (contact) root.userData.contactGeom = { bottomYM: 0, panYM: 0.31, halfWidM: 1.72, halfLenM: 2.35, zCenterM: 0.36 };
  markVehicleShadowDetail(root, { detail: [new THREE.Object3D()], proxies: [proxy] });
  return { root, proxy };
}
{
  const { root, proxy } = builtHull('t90');
  assert.equal(hullProxyOf(root), proxy, 'the hull proxy');
  const h = measureVehicleGroundHull(root);
  for (const [key, want] of Object.entries({ hx: 1.79, yb: 0.31, yt: 1.37, fz0: -3.42, fz1: 3.68, hr: 0, hf: 0, pz0: -3.42, pz1: 3.68,
    y0: 0, xi: 1.2, xo: 1.7, tz0: -2.25 - 0.72 - 0.07, tz1: 2.45 + 0.72 + 0.07, cz0: -2.15 - 0.07, cz1: 2.35 + 0.07,
    // the ramp's shoes climb 0.12 m a 0.18 m step from 0.21 m past the run: the lowest line under them all
    sr: 0.12 / 0.21, sf: 0.12 / 0.21 })) {
    near(h[key], want, 1e-6, `measured ${key}`);
  }
  assert.equal(measureVehicleGroundHull(root), h, 'measured once, cached on the root');
  const banded = measureVehicleGroundHull(builtHull('banded', { shoes: false }).root);
  near(banded.xi, 1.11, 1e-6, 'without shoes: the bands\' lane'); near(banded.xo, 1.72, 1e-6, 'and the contact half width');
  near(banded.cz0, 0.36 - 2.35, 1e-6, 'the contact run');
  const hero = builtHull('bare', { bands: false, contact: false, shoes: false }).root;
  const bare = measureVehicleGroundHull(hero);
  assert.ok(bare && bare.xo - bare.xi > 0.5 && bare.yb > bare.y0 && bare.tz1 > bare.tz0, 'without bands, shoes or contact geometry: the fallbacks');
  hero.userData.contactGeom = { bottomYM: 0.05, panYM: 0.5, halfWidM: 1.7, halfLenM: 2.4, zCenterM: 0 };
  const lent = measureVehicleGroundHull(hero);
  assert.ok(lent !== bare && Math.abs(lent.yb - 0.5) < 1e-9 && Math.abs(lent.y0 - 0.05) < 1e-9,
    'a showroom hero lent to a battle is measured again from its contact geometry');
  assert.equal(measureVehicleGroundHull(new THREE.Group()), null, 'no proxy, no solid');
  // a rear plate rising 0.6 per metre behind z = −2.4: the hinge finds its knee and its rise; the front stays flat
  const sloped = measureVehicleGroundHull(builtHull('sloped', { slope: 0.6 }).root);
  near(sloped.hr, 0.6, 0.05, 'the rear plate\'s rise'); near(sloped.pz0, -2.4, 0.16, 'its knee'); near(sloped.hf, 0, 1e-9, 'a flat front');
}

// ---- 7. the uniforms: the router's nearest hulls, each frame from its pose, written in place
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 2000);
camera.position.set(0, 5, 0); camera.lookAt(0, 0, -100); camera.updateMatrixWorld();
const hulls = [-12, -40, -68, -150, 30, -50, -60].map((z, i) => { const h = builtHull(`h${i}`, { z }); scene.add(h.root); h.root.updateMatrixWorld(true); return h; });
const ranges = [{ near: 0.5, far: 70 }, { near: 70, far: 210 }, { near: 210, far: 420 }, { near: 420, far: 700 }];
const policy = createNearVehicleShadowPolicy({ camera, scene, cascadeRanges: () => ranges, enabled: () => true });
policy.update();
assert.equal(GROUND_AO_MAX_HULLS, NEAR_VEHICLE_SHADOW_MAX, 'one hull per router selection');
assert.equal(GROUND_AO_RANGE_M, NEAR_VEHICLE_SHADOW_RANGE_M, 'over the router\'s range');
const u = createVehicleGroundOcclusionUniforms();
const firstRow = u.uVehGroundM.value[0], firstBox = u.uVehGroundB.value[0], light = u.uVehGroundLight.value;
updateVehicleGroundOcclusionUniforms(u, policy.selected, true, 0.8);
assert.equal(u.uVehGround.value, 4, 'the four nearest hulls in front of the camera');
assert.equal(u.uVehGroundM.value[0], firstRow, 'rows reused'); assert.equal(u.uVehGroundB.value[0], firstBox, 'solids reused');
assert.equal(u.uVehGroundLight.value, light, 'light reused');
near(u.uVehGroundLight.value.x, 0.8, 1e-9, 'the ground albedo'); near(u.uVehGroundLight.value.y, GROUND_AO_HULL_ALBEDO, 1e-9, 'the hull albedo');
const nearRoot = hulls[0].root, packed = measureVehicleGroundHull(nearRoot);
const row = (i, p) => u.uVehGroundM.value[i].x * p.x + u.uVehGroundM.value[i].y * p.y + u.uVehGroundM.value[i].z * p.z + u.uVehGroundM.value[i].w;
near(row(2, nearRoot.position), 0, 1e-9, 'the nearest hull first');
assert.deepEqual(u.uVehGroundB.value.slice(0, 4).map((v) => v.toArray()), [
  [packed.hx, packed.yb, packed.yt, packed.y0], [packed.fz0, packed.fz1, packed.pz0, packed.pz1],
  [packed.hr, packed.hf, packed.xi, packed.xo], [packed.sr, packed.sf, packed.cz0, packed.cz1]], 'the packing');
assert.equal(u.uVehGroundB.value.length, GROUND_AO_MAX_HULLS * 4, 'four vec4 a hull');
nearRoot.position.set(7, 2, -9); nearRoot.rotation.set(0.05, 0.9, -0.03, 'YXZ'); nearRoot.scale.setScalar(1.15);
const local = new THREE.Vector3(1.2, 0.4, -2.5), world = local.clone().applyMatrix4(new THREE.Matrix4().compose(nearRoot.position, nearRoot.quaternion, nearRoot.scale));
updateVehicleGroundOcclusionUniforms(u, policy.selected, true, 0.8);
near(row(0, world), local.x, 1e-6, 'x in the root frame (read from its pose this frame)'); near(row(1, world), local.y, 1e-6, 'y'); near(row(2, world), local.z, 1e-6, 'z');
nearRoot.visible = false; updateVehicleGroundOcclusionUniforms(u, policy.selected, true);
assert.equal(u.uVehGround.value, 3, 'a hidden hull casts nothing'); nearRoot.visible = true;
updateVehicleGroundOcclusionUniforms(u, policy.selected, false);
assert.equal(u.uVehGround.value, 0, 'the lever off: no hulls');

{
  // the drawn runs: the gear publishes them on its hull group (tankFactoryCore.ts runningGearGroundRun: (z, travel) pairs
  // a side, hull-local), read each frame into eight knots a side through the hull group's own frame in the root's (a
  // re-seated donor hull, a shortened one); without the reader the rest pose, a side with no pairs no run at all
  const { root } = builtHull('runs');
  const hullG = root.children[0];
  hullG.position.set(0, 0.05, 0.2); hullG.scale.set(1, 1.1, 0.94);
  const wheels = { [-1]: [[-2, 0], [-1, 0.02], [0, 0.04], [1, 0.06], [2, 0.08]], [1]: [[-2, 0.1], [2, -0.1]] };
  let thrownRight = false;
  hullG.userData.runningGearGroundRun = (side, out) => {
    if (side === 1 && thrownRight) return 0;
    wheels[side].forEach(([z, t], i) => { out[i * 2] = z; out[i * 2 + 1] = t; });
    return wheels[side].length;
  };
  const h = measureVehicleGroundHull(root);
  assert.equal(root.userData.groundAoRunOwner, hullG, 'the hull group publishes the runs');
  const ur = createVehicleGroundOcclusionUniforms();
  const runRow = ur.uVehGroundR.value[0];
  assert.equal(ur.uVehGroundR.value.length, GROUND_AO_MAX_HULLS * 4, 'four vec4 a hull (eight knots a side)');
  const interp = (pairs, z) => {
    if (z <= pairs[0][0]) return pairs[0][1];
    if (z >= pairs[pairs.length - 1][0]) return pairs[pairs.length - 1][1];
    let i = 1; while (pairs[i][0] < z) i++;
    const [z0, t0] = pairs[i - 1], [z1, t1] = pairs[i];
    return t0 + (t1 - t0) * (z - z0) / (z1 - z0);
  };
  const knotsOf = (u2, side) => [...u2.uVehGroundR.value[side < 0 ? 0 : 2].toArray(), ...u2.uVehGroundR.value[side < 0 ? 1 : 3].toArray()];
  updateVehicleGroundOcclusionUniforms(ur, [{ root }], true);
  assert.equal(ur.uVehGroundR.value[0], runRow, 'knot rows reused');
  for (const side of [-1, 1]) {
    const knots = knotsOf(ur, side);
    for (let k = 0; k < K; k++) {
      const zRoot = h.cz0 + (k / (K - 1)) * (h.cz1 - h.cz0);
      near(knots[k], 1.1 * interp(wheels[side], (zRoot - 0.2) / 0.94), 1e-6, `side ${side} knot ${k}: the wheels' travel at its z, in the root's metres`);
    }
  }
  wheels[-1][2][1] = 0.12; // a wheel rides up a stone: the next frame reads it
  updateVehicleGroundOcclusionUniforms(ur, [{ root }], true);
  assert.ok(Math.max(...knotsOf(ur, -1)) > 1.1 * 0.07, 'read each frame');
  thrownRight = true;
  updateVehicleGroundOcclusionUniforms(ur, [{ root }], true);
  assert.deepEqual(knotsOf(ur, 1), Array(K).fill(GROUND_AO_NO_RUN_M), 'a thrown track\'s side: no run');
  assert.ok(knotsOf(ur, -1).some((v) => v !== 0 && v !== GROUND_AO_NO_RUN_M), 'the other side still drawn');
  delete hullG.userData.runningGearGroundRun;
  updateVehicleGroundOcclusionUniforms(ur, [{ root }], true);
  assert.deepEqual([...knotsOf(ur, -1), ...knotsOf(ur, 1)], Array(2 * K).fill(0), 'no reader: the rest pose');
  const bare = builtHull('no-gear').root;
  measureVehicleGroundHull(bare);
  assert.equal(bare.userData.groundAoRunOwner, null, 'a hull without the reader');
}

// ---- 8. tier gating: the block rides the vehicle-occlusion lever, never on the phones or under ?fx=off
for (const name of ['ultra', 'high']) assert.equal(resolvePostLightFx(PRESETS[name], 'desktop', null).vehicleOcclusion, true, `${name} runs it`);
for (const name of ['low', 'mobile-low', 'mobile', 'mobile-high']) assert.equal(!!resolvePostLightFx(PRESETS[name], 'desktop', null).vehicleOcclusion, false, `${name} never does`);
assert.deepEqual(resolvePostLightFx(PRESETS.ultra, 'mobile', null), POST_LIGHT_FX_OFF, 'the mobile tier never enters the block');
assert.deepEqual(resolvePostLightFx(PRESETS.ultra, 'desktop', 'off'), POST_LIGHT_FX_OFF, '?fx=off never enters it');

// ---- 9. the GLSL's structure (its values: tools/vehicle-ground-occlusion.browser.selftest.mjs)
const g = VEHICLE_GROUND_OCCLUSION_GLSL;
const f4 = (x) => x.toFixed(4);
assert.match(g, new RegExp(`uniform vec4 uVehGroundM\\[ ${GROUND_AO_MAX_HULLS * 3} \\];`)); assert.match(g, new RegExp(`uniform vec4 uVehGroundB\\[ ${GROUND_AO_MAX_HULLS * 4} \\];`));
assert.match(g, /return s > 1e-9 \? atan\( s, dot\( a, b \) \) \* dot\( n, c \) \/ s : 0\.0;/, 'Lambert\'s edge term');
assert.equal((g.match(/if \( f(\w+) != f(\w+) \) k \+= \( f\1 - f\2 \) \* cotVgEdge\( [TEP][01][RL], [TEP][01][RL], n \);/g) ?? []).length, 18, 'the solid\'s 18 edges');
for (const e of ['if ( fTop != fRend ) k += ( fTop - fRend ) * cotVgEdge( T0R, T0L, n );', 'if ( fBot != fRpl ) k += ( fBot - fRpl ) * cotVgEdge( P0L, P0R, n );',
  'if ( fFpl != fFend ) k += ( fFpl - fFend ) * cotVgEdge( E1R, E1L, n );', 'if ( fFend != fRight ) k += ( fFend - fRight ) * cotVgEdge( E1R, T1R, n );']) assert.ok(g.includes(e), e);
assert.ok(g.includes(`return clamp( -k * ${(1 / (2 * Math.PI)).toFixed(7)}, 0.0, 1.0 );`) && g.includes(`k * sg.x * sg.y * sg.z * ${(1 / (2 * Math.PI)).toFixed(7)}`), 'over 2π');
assert.ok(g.includes(`float c = q.y - ${f4(GROUND_AO_CLIP_SLACK_M)} * ( 1.0 - n.y );`), 'the horizon clip');
assert.ok(g.includes(`ho *= 1.0 - smoothstep( H * ${f4(GROUND_AO_REACH[0])}, H * ${f4(GROUND_AO_REACH[1])}, dOut );`), 'the hull\'s reach');
assert.ok(g.includes(`ho += gap * mix( 1.0, smoothstep( 0.0, ${f4(GROUND_AO_GAP_FADE_M)}, b2.z - abs( q.x ) ), wrap );`)
  && g.includes('q.z - 0.5 * ( b3.z + b3.w )'), 'the side gaps along the ground run, faded in from the runs past it');
assert.ok(g.includes(`float inside = 1.0 - smoothstep( ${f4(-GROUND_AO_EDGE_M)}, ${f4(GROUND_AO_EDGE_M)}, sd );`)
  && g.includes('mix( sWall, sBelly, inside )'), 'the strengths across the edge');
assert.match(g, /float sBelly = clamp\( 1\.0 - lt\.y \* lt\.x \* \( lt\.z \* \( 1\.0 \+ kSun \) \+ \( 1\.0 - lt\.z \) \* lt\.w \), 0\.0, 1\.0 \);/, 'the belly\'s interreflection');
assert.match(g, /float sWall = clamp\( 1\.0 - lt\.y \* \( 0\.5 \+ 0\.5 \* lt\.x \* \( 1\.0 \+ 0\.5 \* kSun \) \), 0\.0, 1\.0 \);/, 'the walls\'');
assert.match(g, /vis \*= 1\.0 - min\( ho, 1\.0 \) \*/, 'hulls combine as independent occluders');
assert.ok(g.includes(`smoothstep( ${f4(GROUND_AO_RANGE_M - GROUND_AO_FADE_M)}, ${f4(GROUND_AO_RANGE_M)}, dist )`), 'the range fade');
assert.ok(g.includes(`float ambShare = mix( ${f4(GROUND_AO_CARD_AMBIENT_SHARE)}, 1.0, under );`), 'a card\'s ambient share: fixed in the open, whole under a belly');
assert.match(g, /ambShare = A \/ max\( T \+ A, 1e-4 \);/, 'only the ambient share darkens');
assert.match(g, /return 1\.0 - occ \* ambShare;/);
assert.ok(g.includes(`float occ = min( 1.0 - vis, ${f4(GROUND_AO_OCC_MAX)} ) * fade;`), 'the hulls\' joint share capped once');
assert.ok(g.includes('float cotVgSunShadow( vec3 q, vec3 s, vec4 b0, vec4 b1, vec4 b2 ) {')
  && g.includes('? cotVgSunShadow( q, vec3( dot( m0.xyz, uSunDir ), dot( m1.xyz, uSunDir ), dot( m2.xyz, uSunDir ) ), b0, b1, b2 )')
  && !g.includes('under = max( under, inside * step( q.y, b0.y ) );'), 'a card all ambient only in the hull\'s own shadow');
assert.ok(!/2\.0404|Jimenez|fract\( sin/.test(g), 'no ground-albedo multi-bounce, no per-pixel noise');
assert.ok(g.indexOf('if ( !haveN )') > g.lastIndexOf('continue;'), 'the depth normal only for a pixel some hull reaches');
assert.ok(g.includes(`if ( q.y > b0.y + 0.02 && dOut < ${f4(GROUND_AO_HULL_SKIN_M)} ) continue;`), 'the hull\'s own skin is skipped');
assert.ok(g.includes('float laneD = 0.5 * ( b2.w - b2.z ) - abs( abs( q.x ) - 0.5 * ( b2.z + b2.w ) );')
  && g.includes('if ( sunVis < 0.0 && laneD > -0.0200 && q.y < b0.z + 0.0400 && q.z > b1.x && q.z < b1.y ) {')
  && g.includes('if ( q.y >= b0.w + run + max( -0.0100, ramp - 0.0300 ) ) continue;'),
  'and the shoes: no sun state, in their lane, over the track\'s lower edge as drawn');
// (2026-10-08) the runs as drawn: eight knots a side, the hat weights runTravelAt mirrors, the contact by the gap under
// the run's lower edge with soft lane edges, each side gap standing on its own run
assert.match(g, new RegExp(`uniform vec4 uVehGroundR\\[ ${GROUND_AO_MAX_HULLS * 4} \\];`));
assert.ok(g.includes(`float t = clamp( ( z - b3.z ) / max( b3.w - b3.z, 1e-4 ), 0.0, 1.0 ) * ${(K - 1).toFixed(1)};`)
  && g.includes('return dot( k0, max( 1.0 - abs( t - vec4( 0.0, 1.0, 2.0, 3.0 ) ), 0.0 ) )')
  && g.includes('+ dot( k1, max( 1.0 - abs( t - vec4( 4.0, 5.0, 6.0, 7.0 ) ), 0.0 ) );'), 'the knots, linear between');
assert.ok(g.includes('int rk = i * 4 + ( q.x < 0.0 ? 0 : 2 );') && g.includes('float run = cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], q.z, b3 );'),
  'the run on the pixel\'s side');
assert.ok(g.includes(`float lane = 1.0 - smoothstep( 0.0, ${f4(GROUND_AO_CONTACT_SPREAD_M)}, -laneD );`)
  && g.includes(`lane *= lane * smoothstep( 0.0, ${f4(GROUND_AO_CONTACT_EDGE_M)}, min( q.z - b1.x, b1.y - q.z ) );`)
  && g.includes('float dv = q.y - ( b0.w + run + ramp );')
  && g.includes(`float vert = dv >= 0.0 ? 1.0 - smoothstep( 0.0, ${f4(GROUND_AO_CONTACT_RISE_M)}, dv )`)
  && g.includes(`: 1.0 - smoothstep( ${f4(GROUND_AO_CONTACT_FULL_M)}, ${f4(GROUND_AO_CONTACT_GAP_M)}, -dv );`)
  && g.includes(`ho = max( ho, ${f4(GROUND_AO_CONTACT_MAX)} * lane * vert );`),
  'the track\'s contact: a soft capped rim by the receiver\'s place against the drawn run, joined by the larger');
// (2026-10-09, the cost lane) the knots are read only in a track's lane: the shoe test's branch and the contact's, never
// for every pixel the hull reaches
assert.equal((g.match(/float run = cotVgRun\( uVehGroundR\[ rk \], uVehGroundR\[ rk \+ 1 \], q\.z, b3 \);/g) ?? []).length, 2, 'two lazy run reads');
assert.ok(g.indexOf('float run = cotVgRun( uVehGroundR[ rk ]') > g.indexOf('if ( sunVis < 0.0 && laneD >')
  && g.lastIndexOf('float run = cotVgRun( uVehGroundR[ rk ]') > g.indexOf('if ( lane > 0.0 ) {'), 'each read inside its lane branch');
assert.ok(!g.includes('smoothstep( -0.005, 0.005, laneD )') && !g.includes('0.3000, max( max( b3.z - q.z'), 'the rigid print is gone');
assert.ok(!/ho = max\( ho, lane \* \( 1\.0 - smoothstep/.test(g), 'and the whole-sky contact with it');
assert.ok(g.includes('float loR = max( b0.w + cotVgRun( uVehGroundR[ i * 4 + 2 ], uVehGroundR[ i * 4 + 3 ], q.z, b3 ), c );')
  && g.includes('float loL = max( b0.w + cotVgRun( uVehGroundR[ i * 4 ], uVehGroundR[ i * 4 + 1 ], q.z, b3 ), c );'),
  'each side gap from its own run\'s drawn lower edge');

// ---- 10. the wiring: the router's selection, the aerial pass's order, the lever, the ground's albedo
const post = here('./post.ts'), lighting = here('./lighting.ts');
assert.match(lighting, /scene\.userData\.nearVehicles = nearVehiclePolicy\.selected;/, 'the shadow router\'s near selection, updated in place');
assert.match(post, /if \( uVehGround > 0\.5 && texel\.a < \$\{VEHICLE_ALPHA_MIN\.toFixed\(1\)\} && -viewZ < \$\{GROUND_AO_RANGE_M\.toFixed\(1\)\} \) \{\s*texel\.rgb \*= cotVehicleGroundShade\( vUv, uCamPos \+ ray \* rayT, texel\.a, -viewZ \);/,
  'the ground (never a vehicle pixel) within the range');
const vehAt = post.indexOf('texel.rgb *= cotVehicleOcclusionShade(');
const groundAt = post.indexOf('texel.rgb *= cotVehicleGroundShade(');
const hazeAt = post.indexOf('float wy = uCamPos.y + ray.y * rayT;');
assert.ok(vehAt > 0 && groundAt > vehAt && hazeAt > groundAt, 'after the vehicle cavities, before the haze');
assert.ok(post.indexOf('${VEHICLE_GROUND_OCCLUSION_GLSL}') > post.indexOf('${CONTACT_SHADOW_GLSL}'), 'after the contact block it calls');
assert.match(post, /updateVehicleGroundOcclusionUniforms\(aerial\.uniforms as unknown as VehicleGroundOcclusionUniforms,\s*scene\.userData\.nearVehicles as readonly \{ root: THREE\.Object3D \}\[\] \| undefined, lightFx\.vehicleOcclusion && lightTune\('VEHICLE_GROUND_AO', 1\) > 0,/,
  'every frame, on the vehicle-occlusion lever');
assert.match(post, /const groundRho = groundModel\?\.mode === 'physical'\s*\? 0\.2126 \* groundModel\.groundAlbedo\[0\] \+ 0\.7152 \* groundModel\.groundAlbedo\[1\] \+ 0\.0722 \* groundModel\.groundAlbedo\[2\]\s*: GROUND_AO_DEFAULT_ALBEDO;/,
  'the grounded model\'s ground albedo (luminance), the default on the legacy rig');
assert.equal(GROUND_AO_DEFAULT_ALBEDO, 0.25);

console.log(`vehicleGroundOcclusion.selftest: box and hull-solid sky shares (closed forms, ray caster), the law against the union of the hull and both runs (${unionRows.join('; ')}; 0.3 m beside: union ${unionBeside.toFixed(3)}, old sum ${oldSum.toFixed(3)}; grid worst ${worst.toFixed(3)}, beside the wraps ${worstWrap.toFixed(3)}), the T-90M's shape (belly ${F(0, 0).toFixed(3)}), the contact as a soft rim capped at ${MAXC} (the lane keeps ${(1 - F(1.5, 0)).toFixed(3)} of its sky; a run 13 cm up keeps the solid's ${liftedRun.toFixed(3)}; crest, hollow, thrown track), the interreflection (snow belly keeps ${visSnow(0, 0).toFixed(3)}, sand ${visSand.toFixed(3)}), the measured solid, the router-fed in-place uniforms, the gating, the GLSL's structure and the wiring PASS`);
