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
  vehicleGroundStrengths, GROUND_AO_OCC_MAX_SNOW, GROUND_AO_KEY_FADE, GROUND_AO_KEY_LIGHTS, GROUND_AO_KEY_INSIDE_M,
  groundShadeWithKeyLights, hullBlocksKeyLight, keyLightIrradiance, GROUND_AO_KEY_SOFT_M, GROUND_AO_CORE_FULL_SNOW_M, GROUND_AO_CORE_W_SNOW_M,
  GROUND_AO_BAND_H_M, GROUND_AO_BAND_PEN_M, GROUND_AO_BAND_PEN_PER_M, GROUND_AO_BAND_REACH_M, GROUND_AO_BERM_H_M, GROUND_AO_BERM_W_M,
  GROUND_AO_CORE_FLAT, GROUND_AO_CORE_GAP_M, GROUND_AO_CORE_MAX, GROUND_AO_CORE_W_M, GROUND_AO_GRIME_H_M, GROUND_AO_GRIME_LANE_M, GROUND_AO_GRIME_MAX,
  GROUND_AO_SNOW_ALBEDO, GROUND_AO_WALL_SOFT, contactCoreOcclusion, shoeBandSunShadow, snowBermGain, mapSnowWeight, vehicleGrime,
  groundOcclusionCap, groundWallSoft,
  GROUND_AO_BLEND_H_M, GROUND_AO_BLEND_H_SNOW_M, GROUND_AO_BLEND_MAX, GROUND_AO_BLEND_MAX_SNOW, GROUND_AO_GEAR_CAP, GROUND_AO_SNOW_COOL,
  contactBlendWeight, gearCap, gearWeight, GROUND_AO_BLEND_SNOW_SOLID, GROUND_AO_BLEND_SNOW_VARY, snowBlendNoise,
} from './vehicleGroundOcclusion.ts';
import { CONTACT_NORMAL_BREAK_PX, CONTACT_SHADOW_GLSL, contactNormalBroken } from './contactShadows.ts';
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
// (round 4) the geometry: the broad share's softening outside the footprint off (GROUND_AO_WALL_SOFT, section 10)
const lawAt = (q) => vehicleGroundOcclusionLocal(q, UP, T, ONE, false, null, 1);
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
const F = (x, z, y = 0, n = UP) => vehicleGroundOcclusionLocal({ x, y, z }, n, T, ONE, false, null, 1);
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
// (round 5) these pins hold the old law on its lever (shoeSkip): since 2026-10-04 the shoes carry the vehicle tag (section 12)
const C = (x, z, y, n = UP) => vehicleGroundOcclusionLocal({ x, y, z }, n, T, ONE, true, null, 1, true);
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
assert.ok(MAXC >= 0.5 && MAXC <= 0.7, `the contact hides at most ${MAXC} of the sky (the old lane: all of it)`);
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
assert.ok(vehicleGroundOcclusionLocal({ x: -2.3, y: 0.6, z: 0.3 }, unit(1, 0, 0), T, ONE, false, null, 1) > 0.3, 'a wall facing the hull is shaded by it');
// monotone in clearance: the same hull on longer legs (its belly and deck raised together)
for (let lift = 0, prev = 2; lift < 1.5; lift += 0.1) {
  const raised = { ...T, yb: T.yb + lift, yt: T.yt + lift };
  const o = vehicleGroundOcclusionLocal({ x: 0.3, y: 0, z: -0.5 }, UP, raised, ONE, false, null, 1);
  assert.ok(o < prev, `the belly's middle falls as the hull rises (${lift.toFixed(1)} m: ${o.toFixed(4)})`);
  prev = o;
}

// ---- 4b. the runs as they are drawn this frame (2026-10-08, the contact-shadow lane): each side's lower edge over the
// contact plane at GROUND_AO_RUN_KNOTS knots evenly over the ground run (the road wheels' travel the band follows),
// linear between, held past the ends; the contact, the shoes and the side gaps all stand on it
const K = GROUND_AO_RUN_KNOTS, REST = Object.freeze(Array(K).fill(0));
const knotZ = (i) => T.cz0 + (i / (K - 1)) * (T.cz1 - T.cz0);
const FR = (x, z, y, runs, card = false) => vehicleGroundOcclusionLocal({ x, y, z }, UP, T, ONE, card, runs, 1, true);
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
near(combineVehicleGroundOcclusion([0.1, 0.2], 10), 0.28, 1e-12, 'two as independent occluders');
near(combineVehicleGroundOcclusion([0.8], GROUND_AO_RANGE_M), 0, 1e-12, 'gone at the range');
near(combineVehicleGroundOcclusion([0.3], GROUND_AO_RANGE_M - GROUND_AO_FADE_M), 0.3, 1e-12, 'whole inside the fade');
// (2026-10-10, round 3; the owner on production 207: "super super dark rectangular shadows under tracks") the hulls' joint
// share is capped: the ground under a belly keeps a part of its sky (the 207 frames: 0.03–0.08 of the shaded ground)
// (round 4, the owner's recovered screenshot: the slab under a rear overhang seen from an elevated rear quarter) 0.35
assert.ok(GROUND_AO_OCC_MAX >= 0.3 && GROUND_AO_OCC_MAX <= 0.4, `the darkening never passes ${GROUND_AO_OCC_MAX} of the sky`);
near(combineVehicleGroundOcclusion([0.99], 10), GROUND_AO_OCC_MAX, 1e-12, 'a belly\'s middle: capped');
near(combineVehicleGroundOcclusion([0.45, 0.45], 10), GROUND_AO_OCC_MAX, 1e-12, 'two hulls never stack past the cap');
assert.ok(combineVehicleGroundOcclusion([vehicleGroundOcclusionLocal({ x: 0, y: 0, z: 0 }, UP, T, snow)], 10) <= GROUND_AO_OCC_MAX,
  'snow under the belly keeps at least the cap\'s share of its sky');

let snowReport = '';
// ---- 5c. (2026-10-14, the engine-cs lane; media wave f1: 27 of 63 "hull hovers: no contact shadow" notes on the snow maps,
// "bright snow beneath the track runs"; the Studio support seats every drawn run within ±3 cm of the rendered ground,
// tools/studio-contact-gap.mjs) on snow the cap keeps the light ordinary ground keeps under its own, and the run's foot
// stands in a groove: round 4's core, wider and over the rim's vertical reach. Ordinary ground keeps round 4/5's law to the bit.
{
  // (contact r2, 2026-10-14) the snow weight is each receiver's own snow cover, which the terrain writes into the scene
  // alpha (sceneAlpha.ts, terrain.ts cotSnowCover; pinned by sceneAlpha.selftest): the block weighs the law by it, so a
  // snowfield on any map takes it and bare ground — or any pixel that is not snowy terrain — keeps the ordinary law
  assert.ok(VEHICLE_GROUND_OCCLUSION_GLSL.includes('float snowW = uVehGroundSnow * cotSnowOf( alpha );'), 'the receiver\'s own snow cover');
  assert.ok(!/uVehGroundSnow \* vert|, uVehGroundSnow \) \)|uVehGroundR6\.x, 0\.0, 1\.0/.test(VEHICLE_GROUND_OCCLUSION_GLSL), 'no map-wide weight left in the law');
  // the cap by the weight; the absolute floor: snow under its cap keeps the light ordinary ground keeps under its own
  near(groundOcclusionCap(0), GROUND_AO_OCC_MAX, 1e-15, 'ordinary ground: round 4\'s cap');
  near(groundOcclusionCap(1), GROUND_AO_OCC_MAX_SNOW, 1e-15, 'snow');
  const floorOrdinary = (1 - GROUND_AO_OCC_MAX) * GROUND_AO_DEFAULT_ALBEDO, floorSnow = (1 - GROUND_AO_OCC_MAX_SNOW) * 0.8;
  assert.ok(Math.abs(floorSnow / floorOrdinary - 1) < 0.1, `the same light kept in absolute terms (${floorSnow.toFixed(3)} vs ${floorOrdinary.toFixed(3)})`);
  const bellyLaw = vehicleGroundOcclusionLocal({ x: 0, y: 0, z: 0 }, UP, T, snow, false, null, groundWallSoft(1));
  assert.ok(bellyLaw > GROUND_AO_OCC_MAX_SNOW && bellyLaw - GROUND_AO_OCC_MAX_SNOW < 0.1,
    `a snowy belly's own share (${bellyLaw.toFixed(3)}) a little over the snow cap: the cap a guard near the geometry's own share`);
  near(combineVehicleGroundOcclusion([bellyLaw], 10, 0, groundOcclusionCap(1)), GROUND_AO_OCC_MAX_SNOW, 1e-12, 'on snow the snow cap');
  near(combineVehicleGroundOcclusion([bellyLaw], 10, 0, groundOcclusionCap(0)), GROUND_AO_OCC_MAX, 1e-12, 'off snow round 4\'s');
  // ordinary ground to the bit: weight 0 is round 4's cap, its core, its softening
  for (const per of [[0.2], [0.99], [0.45, 0.45], [0.3, 0.1, 0.8], []]) for (const d of [0, 10, 55, 70]) {
    assert.equal(combineVehicleGroundOcclusion(per, d, 0.2, groundOcclusionCap(0)), combineVehicleGroundOcclusion(per, d, 0.2), `round 4's combine at ${per} ${d} m`);
  }
  for (const [, p] of UNION_POINTS) {
    const q = { x: p[0], y: p[1], z: p[2] };
    assert.equal(contactCoreOcclusion(q, T, null, 1, 0), contactCoreOcclusion(q, T), 'round 4\'s core off snow');
  }
  for (let x = T.xi - 0.1; x <= T.xo + 0.1; x += 0.007) for (const y of [-0.05, 0, 0.02, 0.06]) {
    assert.equal(contactCoreOcclusion({ x, y, z: 0.3 }, T, null, 1, 0), contactCoreOcclusion({ x, y, z: 0.3 }, T), 'to the bit');
  }
  assert.equal(groundWallSoft(0), GROUND_AO_WALL_SOFT);
  // the groove: round 4's core on the snow's own cover — whole within a face's few centimetres, gone by GROUND_AO_CORE_W_SNOW_M,
  // a line not a band
  const K = (x, z = 0, y = 0, runs = null) => contactCoreOcclusion({ x, y, z }, T, runs, 1, 1);
  near(K(T.xo + 0.005), GROUND_AO_CORE_MAX, 1e-12, 'whole at the outer face');
  near(K(T.xi - 0.005), GROUND_AO_CORE_MAX, 1e-12, 'and the inner');
  near(K(T.xo + GROUND_AO_CORE_FULL_SNOW_M), GROUND_AO_CORE_MAX, 1e-12, 'whole over the groove\'s width');
  near(K(T.xo + 0.5 * (GROUND_AO_CORE_FULL_SNOW_M + GROUND_AO_CORE_W_SNOW_M)), 0.5 * GROUND_AO_CORE_MAX, 1e-12, 'half midway');
  assert.equal(K(T.xo + GROUND_AO_CORE_W_SNOW_M), 0, 'gone a few centimetres out');
  assert.ok(GROUND_AO_CORE_W_SNOW_M <= 0.1 && GROUND_AO_CORE_W_SNOW_M < GROUND_AO_CONTACT_SPREAD_M && GROUND_AO_CORE_MAX < 0.8,
    'a line, never black, inside the rim\'s branch');
  {
    let worst = 0;
    for (let x = T.xo - 0.05, prev = null; x <= T.xo + 0.15; x += 0.001) { const v = K(x); if (prev !== null) worst = Math.max(worst, Math.abs(v - prev)); prev = v; }
    assert.ok(worst < 0.03, `the groove is soft: worst 1 mm change ${worst.toFixed(4)}`);
  }
  assert.ok(K(T.xo + 0.005, T.fz1 + 0.01) === 0 && K(T.xo + 0.005, T.fz1 - 0.01) < GROUND_AO_CORE_MAX, 'its ends at the hull\'s');
  // over the rim's vertical reach: snow standing 5 cm up a sunk run's face is still in the groove (round 4's core: none)
  assert.ok(K(T.xo + 0.005, 0, 0.05) > 0.85 * GROUND_AO_CORE_MAX && contactCoreOcclusion({ x: T.xo + 0.005, y: 0.05, z: 0 }, T) === 0,
    'the groove up a sunk run\'s face');
  // by the run's drawn lower edge: a lifted run leaves no groove under it, a foot over the wrap's ramp none either
  const lifted = { left: Array(GROUND_AO_RUN_KNOTS).fill(0.13), right: Array(GROUND_AO_RUN_KNOTS).fill(0.13) };
  assert.equal(K(T.xo + 0.005, 0, 0, lifted), 0, 'no groove under a run 13 cm over the ground');
  assert.equal(K(T.xo + 0.005, T.cz1 + GROUND_AO_CONTACT_GAP_M / T.sf), 0, 'none where the front wrap has lifted off');
  // past the cap by the larger: a few centimetres out the groove, 0.3 m out the law alone (the rim's spread is untouched)
  const local = (x, z, w) => vehicleGroundOcclusionLocal({ x, y: 0, z }, UP, T, snow, false, null, groundWallSoft(w));
  const at = (x, z = 0, w = 1) => combineVehicleGroundOcclusion([local(x, z, w)], 10, contactCoreOcclusion({ x, y: 0, z }, T, null, 1, w),
    groundOcclusionCap(w));
  near(at(T.xo + 0.05), Math.max(Math.min(local(T.xo + 0.05, 0, 1), GROUND_AO_OCC_MAX_SNOW), K(T.xo + 0.05)), 1e-12, '5 cm out');
  near(at(T.xo + 0.3), Math.min(local(T.xo + 0.3, 0, 1), GROUND_AO_OCC_MAX_SNOW), 1e-12, 'the law 0.3 m out');
  assert.ok(at(T.xo + 0.05) > at(T.xo + 0.05, 0, 0) + 0.1,
    `the snow's groove keeps ${(1 - at(T.xo + 0.05)).toFixed(3)} of its sky 5 cm out (ordinary ground: ${(1 - at(T.xo + 0.05, 0, 0)).toFixed(3)})`);
  snowReport = `the snow law on each receiver's own cover (a snowy belly keeps ${(1 - GROUND_AO_OCC_MAX_SNOW).toFixed(2)} of its sky, ordinary `
    + `ground ${(1 - GROUND_AO_OCC_MAX).toFixed(2)}; the groove 5 cm out ${(1 - at(T.xo + 0.05)).toFixed(3)}, ordinary ${(1 - at(T.xo + 0.05, 0, 0)).toFixed(3)}; `
    + `round 4's law to the bit off snow)`;
}

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
assert.ok(g.includes('float D = max( T + A + E0 + E1, 1e-4 );') && g.includes('ambShare = A / D;') && g.includes('sunShare = T / D;'),
  'only the ambient share darkens by the occlusion (over the light the pixel takes, the FX lamps\' with it: contact r2)');
// (round 4) the ambient share darkens by the occlusion, the sun share by the band's shadow and the berm's slopes; (contact r2)
// the blocked lamps' shares leave
assert.ok(g.includes('return 1.0 - occ * ambShare - sunShare * sunCut - keyCut;') && g.includes('keyCut = ( keyB0 * E0 + keyB1 * E1 ) * fade / D;')
  && g.includes('float sunShare = 1.0 - ambShare;'), 'the shade: ambient by the occlusion, sun by the cut, the blocked lamps');
// (contact r2) with no lamp the law is round 5's to the bit: E0 = E1 = 0 adds nothing to the total, keyCut stays 0, T / D = 1 − A / D
assert.ok(g.includes('float E0 = 0.0, E1 = 0.0;\n        if ( uVehKeyLight > 0.5 ) {')
  && g.includes('if ( occ <= 0.003 && abs( sunCut ) <= 0.003 && max( keyB0, keyB1 ) <= 0.0 ) return 1.0;'), 'the lamps only where some are written');
assert.ok(g.includes(`if ( uVehKeyLight > 0.5 && sunVis >= 0.0 ) {`) && g.includes(`float kw = 1.0 - smoothstep( H * ${f4(GROUND_AO_KEY_FADE[0])}, H * ${f4(GROUND_AO_KEY_FADE[1])}, dOut );`)
  && (g.match(/cotVgKeyBlock\( q, vec3\( dot\( m0\.xyz, L[01] \) \+ m0\.w, dot\( m1\.xyz, L[01] \) \+ m1\.w, dot\( m2\.xyz, L[01] \) \+ m2\.w \), b0, b1, b2 \)/g) ?? []).length === 2,
  'each hull tests the lamps in its own frame on a lit receiver within its reach, faded over the reach\'s end');
assert.match(g, new RegExp(`uniform vec4 uVehKeyLightP\\[ ${GROUND_AO_KEY_LIGHTS} \\];`));
assert.ok(g.includes(`float cap = mix( uVehGroundR5.z, ${f4(GROUND_AO_OCC_MAX_SNOW)}, snowW );`)
  && g.includes('float occ = max( min( 1.0 - vis, mix( cap, max( cap, uVehGroundR6.z ), gearW ) ), occCore ) * fade;'),
  'the hulls\' joint share capped once (the cap a lever, GROUND_AO_OCC_MAX shipped; on the receiver\'s own snow the snow\'s — contact r2; round 5: a card in the running gear up to its cap); the core past it');
assert.ok(g.includes('float cotVgSunShadow( vec3 q, vec3 s, vec4 b0, vec4 b1, vec4 b2 ) {')
  && g.includes('? cotVgSunShadow( q, vec3( dot( m0.xyz, uSunDir ), dot( m1.xyz, uSunDir ), dot( m2.xyz, uSunDir ) ), b0, b1, b2 )')
  && !g.includes('under = max( under, inside * step( q.y, b0.y ) );'), 'a card all ambient only in the hull\'s own shadow');
assert.ok(!/2\.0404|Jimenez|fract\( sin/.test(g), 'no ground-albedo multi-bounce, no per-pixel noise');
const shadeFn = g.slice(g.indexOf('float cotVehicleGroundShade('), g.indexOf('float cotVehicleGrime('));
assert.ok(shadeFn.indexOf('if ( !haveN )') > shadeFn.lastIndexOf('continue;'), 'the depth normal only for a pixel some hull reaches');
assert.ok(g.includes(`if ( q.y > b0.y + 0.02 && dOut < ${f4(GROUND_AO_HULL_SKIN_M)} ) continue;`), 'the hull\'s own skin is skipped');
assert.ok(g.includes('float laneD = 0.5 * ( b2.w - b2.z ) - abs( abs( q.x ) - 0.5 * ( b2.z + b2.w ) );')
  && g.includes('if ( uVehGroundR6.y > 0.5 && sunVis < 0.0 && laneD > -0.0200 && q.y < b0.z + 0.0400 && q.z > b1.x && q.z < b1.y ) {')
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
assert.ok(g.indexOf('float run = cotVgRun( uVehGroundR[ rk ]') > g.indexOf('if ( uVehGroundR6.y > 0.5 && sunVis < 0.0 && laneD >')
  && g.lastIndexOf('float run = cotVgRun( uVehGroundR[ rk ]') > g.indexOf('if ( lane > 0.0 ) {'), 'each read inside its lane branch');
assert.ok(!g.includes('smoothstep( -0.005, 0.005, laneD )') && !g.includes('0.3000, max( max( b3.z - q.z'), 'the rigid print is gone');
assert.ok(!/ho = max\( ho, lane \* \( 1\.0 - smoothstep/.test(g), 'and the whole-sky contact with it');
assert.ok(g.includes('float loR = max( b0.w + cotVgRun( uVehGroundR[ i * 4 + 2 ], uVehGroundR[ i * 4 + 3 ], q.z, b3 ), c );')
  && g.includes('float loL = max( b0.w + cotVgRun( uVehGroundR[ i * 4 ], uVehGroundR[ i * 4 + 1 ], q.z, b3 ), c );'),
  'each side gap from its own run\'s drawn lower edge');

// ---- 9b. (contact r2, 2026-10-14; the coordinator: "near hulls block unshadowed FX point lights on the ground beneath them";
// s170's flare) the FX lamps: the hull's solid over its belly and its runs between a ground pixel and a lamp cuts the lamp's
// share of the pixel's light; the gap under the belly between the runs lets a low lamp through; a lamp inside a solid is
// never shadowed by it; the irradiance is three's punctual light's; the ambient's occlusion takes its share of the same total
{
  // a flare high over the hull's front left: the ground under the belly is in its shadow, the open ground beside is not
  const flare = { x: -3, y: 40, z: 6 };
  assert.equal(hullBlocksKeyLight({ x: 0, y: 0, z: 0 }, flare, T), 1, 'under the belly: the flare is behind the hull');
  assert.equal(hullBlocksKeyLight({ x: T.hx + 2.5, y: 0, z: 0 }, flare, T), 0, 'beside the hull on the far side from it: lit');
  assert.equal(hullBlocksKeyLight({ x: T.xo + 0.05, y: 0, z: 0 }, flare, T), 1, 'at the right run\'s foot, under the overhang: shadowed');
  // a low lamp beside the right run: through the gap under the belly the ground between the runs sees it only under the belly
  const low = { x: 6, y: 0.2, z: 0 };
  assert.equal(hullBlocksKeyLight({ x: 0, y: 0, z: 0 }, low, T), 1, 'the right run stands between a low lamp and the belly\'s ground');
  assert.equal(hullBlocksKeyLight({ x: -T.hx - 1, y: 0, z: 0 }, { x: 6, y: 0.05, z: 0.1 }, T), 1, 'and the whole hull beyond');
  assert.equal(hullBlocksKeyLight({ x: 0, y: 0, z: T.fz1 + 2 }, low, T), 0, 'a receiver off the front sees it');
  // the shadow's edge is a soft fringe (the chord through a box, whole from GROUND_AO_KEY_SOFT_M), never a ruled line: walk
  // a receiver out from under the hull across the flare's shadow edge in 1 cm steps
  {
    let worst = 0, prev = null, partial = 0;
    for (let x = 0; x <= T.hx + 3; x += 0.01) {
      const v = hullBlocksKeyLight({ x, y: 0, z: 0 }, { x: -3, y: 6, z: 0 }, T);
      if (prev !== null) worst = Math.max(worst, Math.abs(v - prev));
      if (v > 0.02 && v < 0.98) partial++;
      prev = v;
    }
    assert.ok(worst < 0.1 && partial >= 8, `a soft fringe, no step (worst 1 cm change ${worst.toFixed(3)}, ${partial} cm partial)`);
    assert.ok(GROUND_AO_KEY_SOFT_M >= 0.3 && GROUND_AO_KEY_SOFT_M <= 0.6);
  }
  // under a steep lamp (the flare 70° up) the fringe still spans decimetres on the ground: the first night capture's bare
  // 0.35 m chord left a 7 cm edge
  {
    const steep = { x: -12, y: 33, z: 0 };
    let partial = 0;
    for (let x = T.hx - 1; x <= T.hx + 1.5; x += 0.01) {
      const v = hullBlocksKeyLight({ x, y: 0, z: 0 }, steep, T);
      if (v > 0.05 && v < 0.95) partial++;
    }
    assert.ok(partial >= 12, `a steep lamp's fringe spans ${partial} cm`);
  }
  // a muzzle against the mantlet (inside the solid's slack) shadows nothing
  assert.equal(hullBlocksKeyLight({ x: 0, y: 0, z: 0 }, { x: 0, y: T.yt + GROUND_AO_KEY_INSIDE_M * 0.5, z: T.fz1 - 0.2 }, T), 0, 'a lamp inside: none');
  // three's punctual falloff: 1/d², the cutoff window, N·l
  near(keyLightIrradiance({ x: 0, y: 0, z: 0 }, UP, { x: 0, y: 2, z: 0 }, 8, 0), 2, 1e-12, 'lum / d² straight overhead');
  near(keyLightIrradiance({ x: 0, y: 0, z: 0 }, UP, { x: 0, y: 2, z: 0 }, 8, 4), 2 * (1 - (2 / 4) ** 4) ** 2, 1e-12, 'the range window');
  assert.equal(keyLightIrradiance({ x: 0, y: 0, z: 0 }, UP, { x: 0, y: -1, z: 0 }, 8, 0), 0, 'a lamp under the receiver');
  // the shade: with no lamp the round-3 law to the bit; a blocked dominant lamp takes the pixel down to its other light
  for (const [occ, T0, A] of [[0.4, 0, 1], [0.55, 2, 0.5], [0.1, 0.3, 0.2]]) {
    assert.equal(groundShadeWithKeyLights(occ, T0, A, [0, 0], [1, 1]), 1 - occ * (A / Math.max(T0 + A, 1e-4)), 'no lamp: as before');
  }
  near(groundShadeWithKeyLights(0.55, 0, 0.05, [2.0, 0], [1, 0]), 1 - 0.55 * 0.05 / 2.05 - 2 / 2.05, 1e-12, 'the flare-lit belly keeps its sky\'s light');
  assert.ok(groundShadeWithKeyLights(0.55, 0, 0.05, [2.0, 0], [0, 0]) > 0.98, 'beside the hull, flare-lit and unblocked, nearly untouched');
  assert.ok(GROUND_AO_KEY_LIGHTS === 2 && GROUND_AO_KEY_FADE[1] === GROUND_AO_REACH[1], 'two lamps; the cut fades out where the reach ends');
}
// the packing: the strongest lit lamps near the packed hulls, none when the lever drops them
{
  const L = (x, y, z, intensity, distance = 0) => {
    const parent = new THREE.Group(); const light = new THREE.PointLight(0xffffff, intensity, distance, 2);
    light.position.set(x, y, z); parent.add(light); return light;
  };
  const root = new THREE.Group(); root.updateMatrixWorld(true);
  root.userData.groundAoShape = T; root.userData.groundAoShapeFor = null;
  const u = createVehicleGroundOcclusionUniforms();
  const lamps = [L(0, 40, 0, 50000), L(5, 1, 0, 200, 13), L(400, 1, 0, 9e6, 13), L(2, 2, 0, 0)];
  updateVehicleGroundOcclusionUniforms(u, [{ root }], true, 0.25, undefined, undefined, 1, lamps);
  assert.equal(u.uVehKeyLight.value, 2, 'two lit lamps in range (the far blast and the dark lamp skipped)');
  const packed = u.uVehKeyLightP.value.slice(0, 2).map((v) => v.toArray());
  assert.deepEqual(packed.map((p) => p[0]).sort((a, b) => a - b), [0, 5], 'the flare and the near blast');
  globalThis.__LIGHT_TUNE = { GROUND_AO_KEY_LIGHTS: 0 };
  updateVehicleGroundOcclusionUniforms(u, [{ root }], true, 0.25, undefined, undefined, 1, lamps);
  assert.equal(u.uVehKeyLight.value, 0, 'the lever drops them (A/B frames)');
  delete globalThis.__LIGHT_TUNE;
  updateVehicleGroundOcclusionUniforms(u, [], true, 0.25, undefined, undefined, 1, lamps);
  assert.equal(u.uVehKeyLight.value, 0, 'no hull, no lamp');
}

// ---- 10. the wiring: the router's selection, the aerial pass's order, the lever, the ground's albedo
const post = here('./post.ts'), lighting = here('./lighting.ts');
assert.match(lighting, /scene\.userData\.nearVehicles = nearVehiclePolicy\.selected;/, 'the shadow router\'s near selection, updated in place');
// (2026-10-14, the r5 port's cost cut) one branch for the near hulls' reach: a ground pixel shaded at its own point, a
// vehicle pixel's grime and its foot's borrowed ground — shaded by the same one call, so the shade is compiled in once
const vgBranch = post.slice(post.indexOf('if ( uVehGround > 0.5 && -viewZ < ${GROUND_AO_RANGE_M.toFixed(1)} ) {'));
assert.ok(vgBranch.length > 0 && vgBranch.includes('bool vgVehicle = texel.a >= ${VEHICLE_ALPHA_MIN.toFixed(1)};')
  && vgBranch.includes('vec4 vgAt = vec4( vUv, -viewZ, texel.a );')
  && vgBranch.includes('vec3 vgShade = cotVehicleGroundShadeRgb( vgAt.xy, vgQ, vgAt.w, vgAt.z );')
  && vgBranch.includes('texel.rgb = vgVehicle ? mix( texel.rgb, vgRgb * vgShade, vgW ) : texel.rgb * vgShade;'),
  'the ground (at its own point) and a vehicle foot (the ground it borrows) within the range, one shade call');
assert.equal(post.split('cotVehicleGroundShadeRgb(').length - 1, 1, 'one call site in the pass');
assert.equal(VEHICLE_GROUND_OCCLUSION_GLSL.split('cotVehicleGroundShadeRgb(').length - 1, 1, 'and none inside the block but its definition');
const vehAt = post.indexOf('texel.rgb *= cotVehicleOcclusionShade(');
const groundAt = post.indexOf('vec3 vgShade = cotVehicleGroundShadeRgb(');
const hazeAt = post.indexOf('float wy = uCamPos.y + ray.y * rayT;');
assert.ok(vehAt > 0 && groundAt > vehAt && hazeAt > groundAt, 'after the vehicle cavities, before the haze');
assert.ok(post.indexOf('${VEHICLE_GROUND_OCCLUSION_GLSL}') > post.indexOf('${CONTACT_SHADOW_GLSL}'), 'after the contact block it calls');
assert.match(post, /updateVehicleGroundOcclusionUniforms\(aerial\.uniforms as unknown as VehicleGroundOcclusionUniforms,\s*scene\.userData\.nearVehicles as readonly \{ root: THREE\.Object3D \}\[\] \| undefined, lightFx\.vehicleOcclusion && lightTune\('VEHICLE_GROUND_AO', 1\) > 0,/,
  'every frame, on the vehicle-occlusion lever');
assert.match(post, /const groundRho = groundModel\?\.mode === 'physical'\s*\? 0\.2126 \* groundModel\.groundAlbedo\[0\] \+ 0\.7152 \* groundModel\.groundAlbedo\[1\] \+ 0\.0722 \* groundModel\.groundAlbedo\[2\]\s*: GROUND_AO_DEFAULT_ALBEDO;/,
  'the grounded model\'s ground albedo (luminance), the default on the legacy rig');
assert.equal(GROUND_AO_DEFAULT_ALBEDO, 0.25);
assert.ok(post.includes("groundRho * lightTune('GROUND_AO_MULTIBOUNCE', 1));") && !post.includes('groundAoSnowWeight'),
  '(contact r2) no map-wide snow weight: each receiver carries its own');
{
  const u = createVehicleGroundOcclusionUniforms();
  assert.equal(u.uVehGroundSnow.value, 0, 'no snow law until a frame says so');
  updateVehicleGroundOcclusionUniforms(u, [], true, 0.25);
  assert.equal(u.uVehGroundSnow.value, 1, 'the snow law on, on any ground (each receiver weighs it by its own cover)');
  globalThis.__LIGHT_TUNE = { GROUND_AO_SNOW: 0 };
  updateVehicleGroundOcclusionUniforms(u, [], true, 0.8);
  assert.equal(u.uVehGroundSnow.value, 0, 'the lever restores the ordinary law (A/B frames)');
  delete globalThis.__LIGHT_TUNE;
}

// ---- 11. contact round 4 (2026-10-10; both critics on wave 340: "no thin dark contact line", "a uniformly dark carpet",
// "no rut, berm or packed snow", "the track lit lighter than the turf", "the gaps between the road wheels drop to near-black")
// (a) the crease's core: whole at the shoes' faces and a flat share of its width out, gone GROUND_AO_CORE_W_M outside, by the
// gap to the drawn run
assert.ok(GROUND_AO_CORE_MAX > GROUND_AO_CONTACT_MAX && GROUND_AO_CORE_MAX <= 0.8 && GROUND_AO_CORE_W_M <= 0.05,
  'the core is darker than the rim, never black, a few centimetres wide');
const K4 = (x, z = 0, y = 0, runs = null) => contactCoreOcclusion({ x, y, z }, T, runs);
near(K4(T.xo), GROUND_AO_CORE_MAX, 1e-12, 'whole at the outer face'); near(K4(T.xi), GROUND_AO_CORE_MAX, 1e-12, 'and the inner');
near(K4(1.5), GROUND_AO_CORE_MAX, 1e-12, 'and under the shoes (seen through their gaps)');
assert.equal(K4(T.xo + GROUND_AO_CORE_W_M), 0, 'gone a core width out'); assert.equal(K4(T.xi - GROUND_AO_CORE_W_M), 0, 'and in');
near(K4(T.xo + GROUND_AO_CORE_FLAT * GROUND_AO_CORE_W_M), GROUND_AO_CORE_MAX, 1e-9, 'whole over its flat share');
near(K4(T.xo + (0.5 + 0.5 * GROUND_AO_CORE_FLAT) * GROUND_AO_CORE_W_M), 0.5 * GROUND_AO_CORE_MAX, 1e-9, 'half way down its fall');
// beside the T-90M's track on grass in shade the core is what the eye reads: darker than the broad share a centimetre out
const grass4 = vehicleGroundStrengths(0.25, 2);
const shadeBeside = (b) => 1 - combineVehicleGroundOcclusion([vehicleGroundOcclusionLocal({ x: T.xo + b, y: 0, z: 0 }, UP, T, grass4)], 0, K4(T.xo + b));
assert.ok(shadeBeside(0.01) < 0.3 && shadeBeside(0.06) > 0.45, `a line: ${shadeBeside(0.01).toFixed(3)} at 1 cm, ${shadeBeside(0.06).toFixed(3)} at 6 cm`);
assert.equal(K4(T.xo, 0, GROUND_AO_CORE_GAP_M), 0, 'a blade standing a core gap up takes none');
assert.equal(K4(T.xo, 0, -GROUND_AO_CORE_GAP_M), 0, 'nor the ground a core gap under the run');
assert.equal(K4(T.xo, T.fz0), 0, 'its ends at the hull\'s');
const liftedRuns = { left: new Array(8).fill(0), right: new Array(8).fill(0.13) };
assert.equal(K4(T.xo, 0, 0, liftedRuns), 0, 'a run lifted 13 cm leaves no crease');
near(K4(T.xo, 0, 0.13, liftedRuns), GROUND_AO_CORE_MAX, 1e-9, 'the crease follows the drawn run');
for (let x = T.xo - 0.01; x <= T.xo + 0.05; x += 0.001) {
  assert.ok(Math.abs(K4(x + 0.001) - K4(x)) < 0.07, `the core is soft per millimetre at ${x.toFixed(3)}`);
}
// past the joint cap, and only the core: a belly's middle stays capped, the core joins by the larger
near(combineVehicleGroundOcclusion([0.99], 10, GROUND_AO_CORE_MAX), GROUND_AO_CORE_MAX, 1e-12, 'the core passes the cap');
near(combineVehicleGroundOcclusion([0.99], 10, 0.2), GROUND_AO_OCC_MAX, 1e-12, 'a weaker core leaves the capped share');
near(combineVehicleGroundOcclusion([0.99], GROUND_AO_RANGE_M, GROUND_AO_CORE_MAX), 0, 1e-12, 'the range fade takes the core too');
// (b) the shoe band's sun shadow: beyond the outer face on the side away from the sun, under the band's top
const s45L = unit(-1, 1, 0), s45R = unit(1, 1, 0);
const B4 = (x, s, z = 0, y = 0, runs = null) => shoeBandSunShadow({ x, y, z }, T, s, runs);
assert.ok(B4(T.xo + 0.02, s45L) > 0.99, 'beside the face, the sun beyond the track: shaded');
assert.ok(B4(T.xo + GROUND_AO_BAND_H_M - 0.03, s45L) > 0.9 && B4(T.xo + GROUND_AO_BAND_H_M + 0.03, s45L) < 0.1,
  'the line ends where the band\'s top meets the sun (45°: one band height out)');
assert.equal(B4(T.xo + 0.02, s45R), 0, 'the sun on its own side: lit'); assert.equal(B4(T.xo + 0.02, UP), 0, 'a noon sun: lit');
assert.equal(B4(-T.xo - 0.02, s45R) > 0.99, true, 'mirrored on the left run');
assert.equal(B4(T.xo + GROUND_AO_BAND_REACH_M + 0.01, unit(-1, 0.05, 0)), 0, 'never past its reach');
assert.equal(B4(T.xo + 0.02, s45L, T.fz1 - 0.2), 0, 'only along the ground run');
assert.ok(B4(T.xo + 0.15, unit(-1, 0.6, 0), 0, 0, liftedRuns) > B4(T.xo + 0.15, unit(-1, 0.6, 0)), 'a lifted run lifts the band');
const pen = (b) => GROUND_AO_BAND_PEN_M + GROUND_AO_BAND_PEN_PER_M * b;
assert.ok(pen(0.1) < 0.012, 'a crisp penumbra near the face');
// (c) the softer broad term: outside the footprint the solid's share keeps GROUND_AO_WALL_SOFT, whole at the edge and under
assert.ok(GROUND_AO_WALL_SOFT >= 0.6 && GROUND_AO_WALL_SOFT < 1, `the broad share outside keeps ${GROUND_AO_WALL_SOFT}`);
const geo = (q) => vehicleGroundOcclusionLocal(q, UP, T, ONE, false, null, 1), soft = (q) => vehicleGroundOcclusionLocal(q, UP, T, ONE);
near(soft({ x: T.hx + 1, y: 0, z: 0 }), GROUND_AO_WALL_SOFT * geo({ x: T.hx + 1, y: 0, z: 0 }), 1e-9, 'a metre beside the hull');
near(soft({ x: 0, y: 0, z: T.fz1 + 1 }), GROUND_AO_WALL_SOFT * geo({ x: 0, y: 0, z: T.fz1 + 1 }), 1e-9, 'a metre ahead');
near(soft({ x: 0, y: 0, z: 0 }), geo({ x: 0, y: 0, z: 0 }), 1e-12, 'whole under the belly');
near(soft({ x: 0, y: 0, z: T.fz0 }), geo({ x: 0, y: 0, z: T.fz0 }), 1e-12, 'whole at the footprint\'s edge (wave 13\'s rear strip)');
near(soft({ x: T.xo + 0.01, y: 0, z: 0 }), geo({ x: T.xo + 0.01, y: 0, z: 0 }), 1e-12, 'the contact beside the shoes untouched');
for (let x = T.hx - 0.1; x < T.hx + 0.7; x += 0.01) {
  assert.ok(Math.abs(soft({ x: x + 0.01, y: 0, z: 0.3 }) - soft({ x, y: 0, z: 0.3 })) < 0.02, `the softening is continuous at ${x.toFixed(2)}`);
}
// (d) snow: the berm's slopes turn the sun share along the ground run, at the run's foot; nothing off snow
// (contact r2) the map's lever weighs only the runs' grime now; the berm, the cap, the softening and the cast take each
// receiver's own snow cover (section 5c)
near(mapSnowWeight(GROUND_AO_DEFAULT_ALBEDO), 0, 1e-12, 'no snow on the default ground'); near(mapSnowWeight(0.8), 1, 1e-12, 'snow (0.8)');
near(mapSnowWeight(GROUND_AO_SNOW_ALBEDO + 0.075), 0.5, 1e-9, 'half way');
const G4 = (x, s, snow = 1, y = 0, z = 0) => snowBermGain({ x, y, z }, UP, T, s, snow);
assert.equal(G4(T.xo + 0.03, UP, 0), 1, 'off snow: flat');
assert.ok(G4(T.xo + 0.03, UP) < 0.95 && Math.abs(G4(T.xo + 0.5 * GROUND_AO_BERM_W_M, UP) - 1) < 1e-9, 'a noon sun: the slopes dim, the crest is flat');
assert.ok(G4(T.xo + 0.03, s45R) < G4(T.xo + 0.03, s45L) && G4(T.xo + 0.03, s45L) > 1.2, 'the inner slope faces the track: lit by a sun beyond it');
assert.ok(G4(T.xo + 0.19, s45R) > 1.2 && G4(T.xo + 0.19, s45L) < 0.85, 'the outer slope faces out: lit by a sun on its side');
assert.equal(G4(T.xo + GROUND_AO_BERM_W_M + 0.01, s45R), 1, 'flat past the berm'); assert.equal(G4(T.xo - 0.01, s45R), 1, 'and under the shoes');
assert.equal(G4(T.xo + 0.03, s45R, 1, 0, T.fz1 + 0.2), 1, 'only along the ground run');
assert.equal(G4(T.xo + 0.03, s45R, 1, 0.2), 1, 'at the run\'s foot only (a blade is no berm)');
assert.ok(GROUND_AO_BERM_H_M / GROUND_AO_BERM_W_M < 0.25, 'a low berm: its steepest slope under 45°');
// (e) the run's grime on the hulls' own pixels: toward the foot in its lane, none on snow (the lever's scale)
near(vehicleGrime({ x: 1.5, y: 0, z: 0 }, T), 1 - GROUND_AO_GRIME_MAX, 1e-12, 'darkest at the foot');
near(vehicleGrime({ x: 1.5, y: GROUND_AO_GRIME_H_M, z: 0 }, T), 1, 1e-12, 'clean a grime height up');
near(vehicleGrime({ x: 1.5, y: 0.5 * GROUND_AO_GRIME_H_M, z: 0 }, T), 1 - GROUND_AO_GRIME_MAX * 0.25, 1e-9, 'squared');
assert.equal(vehicleGrime({ x: T.xi - GROUND_AO_GRIME_LANE_M - 0.01, y: 0, z: 0 }, T), 1, 'outside the lane: clean');
assert.equal(vehicleGrime({ x: 1.5, y: 0, z: 0 }, T, null, 0), 1, 'none on snow');
near(vehicleGrime({ x: 1.5, y: 0.13, z: 0 }, T, liftedRuns), 1 - GROUND_AO_GRIME_MAX, 1e-9, 'the grime rides the drawn run');
assert.ok(vehicleGrime({ x: 1.5, y: 0.3, z: T.cz0 - 0.5 }, T) < 1, 'and climbs the wraps\' foot');
// (f) the gap normal's guard (contactShadows.ts): a neighbour a metre nearer through a gap breaks the axis, a ground step does not
const px1 = 2 * Math.tan((50 * Math.PI) / 360) / 900;
assert.ok(contactNormalBroken(1.0, 5, 0.12, px1), 'a wheel a metre nearer, 5 m out over grazing ground: broken');
assert.ok(!contactNormalBroken(0.005 / 0.12, 5, 0.12, px1), 'the ground\'s own step at that grazing: kept');
assert.ok(!contactNormalBroken(0.006, 5, 1, px1), 'a level step seen from above: kept');
assert.ok(CONTACT_NORMAL_BREAK_PX >= 4 && CONTACT_NORMAL_BREAK_PX <= 8, 'a few pixels\' footprint');
assert.ok(CONTACT_SHADOW_GLSL.includes('vec3 cotNormalAtGuarded( vec2 uv, vec3 P, vec3 up, float dist ) {')
  && CONTACT_SHADOW_GLSL.includes('if ( min( lx1, lx0 ) > brk || min( ly1, ly0 ) > brk ) return up;'), 'the guard in the contact block');
// (g) the GLSL: the levers, the guard, the softening, the core past the cap, the band, the berm, the cut, the grime
for (const piece of [
  'uniform vec4 uVehGroundR4;', 'uniform vec4 uVehGroundR5;',
  'N = cotNormalAtGuarded( uv, P, normalize( m1.xyz ), uVehGroundR5.y > 0.5 ? dist : 1e6 );',
  `ho *= mix( 1.0, mix( uVehGroundR5.x, 1.0, snowW ), smoothstep( 0.0, ${f4(2 * GROUND_AO_EDGE_M)}, sd ) );`,
  `float cw = 1.0 - smoothstep( mix( ${f4(GROUND_AO_CORE_FLAT * GROUND_AO_CORE_W_M)}, ${f4(GROUND_AO_CORE_FULL_SNOW_M)}, snowW ),`,
  `mix( ${f4(GROUND_AO_CORE_W_M)}, ${f4(GROUND_AO_CORE_W_SNOW_M)}, snowW ), -laneD );`,
  `occCore = max( occCore, ${f4(GROUND_AO_CORE_MAX)} * uVehGroundR4.x * cw`,
  `* mix( 1.0 - smoothstep( 0.0, ${f4(GROUND_AO_CORE_GAP_M)}, abs( dv ) ), vert, snowW ) );`,
  'float beyond = abs( q.x ) - b2.w;', 'float toward = -sign( q.x ) * sR.x;',
  `float top = b0.w + cotVgRun( uVehGroundR[ rk ], uVehGroundR[ rk + 1 ], zHit, b3 ) + ${f4(GROUND_AO_BAND_H_M)};`,
  'float berm = uVehGroundR4.z * snowW;', `if ( berm > 0.0 && beyond > 0.0 && beyond < ${f4(GROUND_AO_BERM_W_M)} ) {`,
  'float slope = berm * zw * vw',
  'vec3 bn = normalize( n - vec3( slope * sign( q.x ), 0.0, 0.0 ) );',
  'if ( t0 > 1e-3 ) bermGain *= min( max( dot( bn, sR ), 0.0 ) / t0, 2.0 );',
  'float sunCut = ( 1.0 - ( 1.0 - band ) * bermGain ) * fade;',
  'float cotVehicleGrime( vec3 P ) {', `g = min( g, 1.0 - ${f4(GROUND_AO_GRIME_MAX)} * uVehGroundR4.w * w * w );`,
]) assert.ok(g.includes(piece), piece);
assert.ok(g.indexOf('float sd = dOut') < g.indexOf('if ( lane > 0.0 ) {') && g.indexOf('vis *= 1.0 - min( ho, 1.0 )') > g.indexOf('occCore = max('),
  'the softening before the rim, the core inside the lane branch');
// the uniforms' levers: shipped on; (contact r2) the berm's lever on every map (the GLSL weighs it by the receiver's own
// snow), the grime never on a snow map (the map's lever)
const u4 = createVehicleGroundOcclusionUniforms();
updateVehicleGroundOcclusionUniforms(u4, [], true, 0.8);
assert.deepEqual(u4.uVehGroundR4.value.toArray(), [1, 1, 1, 0], 'a snow map: the berm\'s lever, no grime');
assert.deepEqual(u4.uVehGroundR5.value.toArray(), [GROUND_AO_WALL_SOFT, 1, GROUND_AO_OCC_MAX, 0],
  'the softening, the guard and the shipped cap on any map (the snow\'s by each receiver\'s cover in the GLSL)');
updateVehicleGroundOcclusionUniforms(u4, [], true, 0.25);
assert.deepEqual(u4.uVehGroundR4.value.toArray(), [1, 1, 1, 1], 'grass: the grime, the berm\'s lever (no snow, no berm)');
assert.deepEqual(u4.uVehGroundR5.value.toArray(), [GROUND_AO_WALL_SOFT, 1, GROUND_AO_OCC_MAX, 0], 'grass: the softening, the guard and the shipped cap');
// (round 4, the other side) on snow the cap rises and the broad share stays whole; on grass, sand and dark ground they are the
// round's (contact r2: by the receiver's own snow cover)
near(groundOcclusionCap(0), GROUND_AO_OCC_MAX, 1e-12, 'the cap off snow'); near(groundOcclusionCap(1), GROUND_AO_OCC_MAX_SNOW, 1e-12, 'on snow');
near(groundWallSoft(0), GROUND_AO_WALL_SOFT, 1e-12, 'the softening off snow'); near(groundWallSoft(1), 1, 1e-12, 'none on snow');
assert.ok(GROUND_AO_OCC_MAX_SNOW > GROUND_AO_OCC_MAX && GROUND_AO_OCC_MAX_SNOW <= 0.85, 'snow keeps more of its under-hull shade (round 5: 0.8), never black');
near(combineVehicleGroundOcclusion([0.99], 10, 0, groundOcclusionCap(1)), GROUND_AO_OCC_MAX_SNOW, 1e-12, 'a belly on snow: the snow cap');
// the wiring: the grime on the hulls' own pixels after their cavities, before the ground's
const grimeAt = post.indexOf('texel.rgb *= cotVehicleGrime( vgP );');
assert.ok(grimeAt > vehAt && grimeAt < groundAt, 'the grime after the cavities, before the ground');
assert.match(post, /if \( vgVehicle \) \{\s*texel\.rgb \*= cotVehicleGrime\( vgP \);/,
  'only a vehicle pixel, only near hulls');

// ---- 12. contact round 5 (2026-10-11; wave 372b, both critics: "a lime grass blade glows unshadowed under the hull between the
// centre wheels", "the snow in the gaps under the hull as bright as open snow", "no rut, no packed snow", "a hard dark band under
// the track")
// (a) the shoes carry the vehicle tag (tankFactoryCore.ts: padMat joins the link material's setup; materials.ts adds the tag),
// so the old skip exempted only grass standing in the running gear: by default a card in the lane is a receiver; the lever
// keeps the old law
const fac5 = here('../vehicles/tankFactoryCore.ts'), mats5 = here('../vehicles/materials.ts');
assert.ok(fac5.includes('const padMat = cloneVehicleMaterial(mats.trackLink || mats.dark);')
  && mats5.includes('VEHICLE_MATERIAL_SETUP.set(material, setup);') && mats5.includes('gl_FragColor.a += ${VEHICLE_ALPHA_TAG.toFixed(1)};'),
  'the shoes are tagged vehicle pixels');
const lane5 = { x: 1.5, y: 0.08, z: 0 };
assert.ok(isRunShoe(lane5, T, true), 'a card in the lane over the floor: the old law called it a shoe');
assert.equal(vehicleGroundOcclusionLocal(lane5, UP, T, ONE, true, null, 1, true), 0, 'the lever: the old skip');
assert.ok(vehicleGroundOcclusionLocal(lane5, UP, T, ONE, true, null, 1) > 0.5, 'by default a blade in the running gear is a receiver');
// (b) the running gear's cap: a card inside the lane along the ground run; never the ground, never outside the gear
near(gearWeight(lane5, T, true), 1, 1e-12, 'a blade in the lane: whole');
assert.equal(gearWeight(lane5, T, false), 0, 'the ground is never in the gear');
assert.equal(gearWeight({ x: T.xo + 0.05, y: 0.05, z: 0 }, T, true), 0, 'a blade beside the track: outside');
assert.equal(gearWeight({ x: 1.5, y: 0.05, z: T.cz0 - 0.3 }, T, true), 0, 'under the wraps (the owner\'s slab region): outside');
near(gearCap(GROUND_AO_OCC_MAX, 1), GROUND_AO_GEAR_CAP, 1e-12, 'the gear\'s cap');
near(gearCap(GROUND_AO_OCC_MAX, 0), GROUND_AO_OCC_MAX, 1e-12, 'elsewhere the joint cap');
near(gearCap(GROUND_AO_OCC_MAX_SNOW, 1), Math.max(GROUND_AO_OCC_MAX_SNOW, GROUND_AO_GEAR_CAP), 1e-12, 'never below the snow cap');
assert.ok(GROUND_AO_GEAR_CAP > GROUND_AO_OCC_MAX && GROUND_AO_GEAR_CAP <= 0.85, 'the gear darker than the open ground, never black');
const grass5 = vehicleGroundStrengths(0.25, 2);
const bladeOcc = combineVehicleGroundOcclusion([vehicleGroundOcclusionLocal(lane5, UP, T, grass5, true, null)], 0, 0,
  gearCap(GROUND_AO_OCC_MAX, gearWeight(lane5, T, true)));
assert.ok(bladeOcc > GROUND_AO_OCC_MAX + 0.2, `a blade between the road wheels in the gear's shade (${bladeOcc.toFixed(3)})`);
// (c) the contact blend: the run's lowest centimetres along the ground run, more and higher on snow
const BW = (y, z = 0, snow = 0, x = 1.5) => contactBlendWeight({ x, y, z }, T, snow);
near(BW(0), GROUND_AO_BLEND_MAX, 1e-12, 'whole at the foot'); assert.equal(BW(GROUND_AO_BLEND_H_M), 0, 'gone a blend height up');
near(BW(0, 0, 1), GROUND_AO_BLEND_MAX_SNOW, 1e-12, 'on snow: the snow\'s share');
assert.ok(BW(0.05, 0, 1) > 0 && BW(0.05) === 0, 'and higher on snow');
assert.equal(BW(0, T.cz0 - 0.2), 0, 'only along the ground run'); assert.equal(BW(0, 0, 0, T.xo + 0.05), 0, 'only in the lane');
const lifted5 = { left: new Array(8).fill(0), right: new Array(8).fill(0.13) };
near(contactBlendWeight({ x: 1.5, y: 0.13, z: 0 }, T, 0, lifted5), GROUND_AO_BLEND_MAX, 1e-9, 'the blend rides the drawn run');
assert.ok(GROUND_AO_BLEND_H_M <= 0.04 && GROUND_AO_BLEND_H_SNOW_M * (1 + GROUND_AO_BLEND_SNOW_VARY) <= 0.09, 'a few centimetres, never the whole track');
// on snow: packed snow — opaque over the solid share of its height, an uneven line along the ground (smooth, world-anchored)
near(BW(0.5 * GROUND_AO_BLEND_SNOW_SOLID * GROUND_AO_BLEND_H_SNOW_M, 0, 1), GROUND_AO_BLEND_MAX_SNOW, 1e-12, 'opaque low on the shoe');
assert.ok(BW(0.5 * GROUND_AO_BLEND_SNOW_SOLID * GROUND_AO_BLEND_H_M, 0, 0) < GROUND_AO_BLEND_MAX, 'on grass a gradient from the foot');
const snowN = []; for (let z = -2; z <= 2; z += 0.05) snowN.push(snowBlendNoise(0.3, z));
assert.ok(Math.min(...snowN) < 0.3 && Math.max(...snowN) > 0.7, `the snow line is uneven along a run (${Math.min(...snowN).toFixed(2)}..${Math.max(...snowN).toFixed(2)})`);
for (let i = 1; i < snowN.length; i++) assert.ok(Math.abs(snowN[i] - snowN[i - 1]) < 0.15, 'and smooth (5 cm steps)');
const wLow = contactBlendWeight({ x: 1.5, y: 0.04, z: 0 }, T, 1, null, 1, { x: 0, z: -1.75 });
const wHigh = contactBlendWeight({ x: 1.5, y: 0.04, z: 0 }, T, 1, null, 1, { x: 0, z: 0 });
assert.ok(Math.abs(wHigh - wLow) > 0.2, `the line's height follows the world point (${wLow.toFixed(2)} vs ${wHigh.toFixed(2)})`);
// (d) the snow's cool cast: blue over red, within a few per cent of luminance
const lumCool = 0.2126 * GROUND_AO_SNOW_COOL[0] + 0.7152 * GROUND_AO_SNOW_COOL[1] + 0.0722 * GROUND_AO_SNOW_COOL[2];
assert.ok(GROUND_AO_SNOW_COOL[2] > GROUND_AO_SNOW_COOL[0] && Math.abs(lumCool - 1) < 0.05, `blue over red, luminance ${lumCool.toFixed(3)}`);
// (e) the GLSL: the lever, the gear, the cast, the blend (its sample never a vehicle pixel, shaded as the block shades ground)
for (const piece of [
  'uniform vec4 uVehGroundR6;', 'float gearW = 0.0;',
  'if ( sunVis < 0.0 ) gearW = max( gearW, smoothstep( 0.0, 0.02, laneD ) * smoothstep( b3.z - 0.05, b3.z + 0.05, q.z )',
  'vec3 cotVehicleGroundShadeRgb( vec2 uv, vec3 P, float alpha, float dist ) {',
  `return s * mix( vec3( 1.0 ), vec3( ${GROUND_AO_SNOW_COOL.map(f4).join(', ')} ),`,
  '( 1.0 - s ) * uVehGroundR6.x * uVehGroundSnow * cotSnowOf( alpha ) );',
  'float cotVehicleContactSample( vec3 P, out vec4 gs, out vec3 gP, out vec3 gRgb ) {', 'vec4 c = uContactViewProj * vec4( Pg, 1.0 );',
  'if ( g.a >= 3.5000 ) continue;', 'gs = vec4( guv, gd, g.a ); gP = cotWorldAtDepth( guv, gd ); gRgb = g.rgb;',
  'float sn = clamp( 0.5 + 0.22 * sin( 1.9 * P.z + 0.7 * P.x + 1.7 ) + 0.16 * sin( 4.7 * P.z - 1.3 * P.x + 0.4 )',
  'if ( dv > reach || dv < -0.05 ) continue;', 'float snow = uVehGroundSnow * cotSnowOf( g.a );', 'if ( dv > height ) continue;',
  `float w = ( 1.0 - smoothstep( ${f4(GROUND_AO_BLEND_SNOW_SOLID)} * snow * height, height, dv ) )`,
  'return w;',
]) assert.ok(g.includes(piece), piece);
assert.ok(g.indexOf('float cotVehicleContactSample(') > g.indexOf('float cotVehicleGrime('), 'the new functions after the shade and the grime');
// (contact r2) the blend's snow is the borrowed ground's own cover: read off the sample (never a vehicle pixel), before the
// height test and the ground's shade (the shade evaluated only for a pixel the blend takes)
{
  const blend = g.slice(g.indexOf('float cotVehicleContactSample('));
  assert.ok(blend.indexOf('if ( g.a >= 3.5000 ) continue;') < blend.indexOf('float snow = uVehGroundSnow * cotSnowOf( g.a );')
    && blend.indexOf('float snow = uVehGroundSnow') < blend.indexOf('if ( dv > height ) continue;')
    && blend.indexOf('if ( w <= 0.003 ) continue;') < blend.indexOf('float gd = cotDepthToDist('), 'the sample\'s snow, then its depth');
  assert.ok(!blend.includes('uVehGroundR6.x'), 'no map-wide snow in the blend');
}
// the levers: shipped (no cast off snow, no shoe skip, the gear's cap, the blend on); snow's cast
const u5 = createVehicleGroundOcclusionUniforms();
updateVehicleGroundOcclusionUniforms(u5, [], true, 0.25);
assert.deepEqual(u5.uVehGroundR6.value.toArray(), [1, 0, GROUND_AO_GEAR_CAP, 1],
  'the cast\'s lever (on the receiver\'s own snow: contact r2), no skip, the gear cap, the blend');
updateVehicleGroundOcclusionUniforms(u5, [], true, 0.8);
assert.deepEqual(u5.uVehGroundR6.value.toArray(), [1, 0, GROUND_AO_GEAR_CAP, 1], 'the same on a snow map');
// the wiring: the blend on the hulls' own pixels after their grime, before the ground; the ground's shade as a colour
assert.ok(post.includes('vgW = cotVehicleContactSample( vgP, vgAt, vgQ, vgRgb );')
  && post.indexOf('vgW = cotVehicleContactSample(') > post.indexOf('texel.rgb *= cotVehicleGrime(')
  && post.indexOf('vgW = cotVehicleContactSample(') < groundAt, 'the blend\'s sample after the grime, before the one shade');
assert.ok(post.includes("if (groundModel?.mode !== 'physical') (aerial.uniforms as unknown as VehicleGroundOcclusionUniforms).uVehGroundR6.value.w = 0;"),
  'the blend only on the grounded rig (the battle maps): the Garage\'s turntable is a hard floor');

console.log(`vehicleGroundOcclusion.selftest: box and hull-solid sky shares (closed forms, ray caster), the law against the union of the hull and both runs (${unionRows.join('; ')}; 0.3 m beside: union ${unionBeside.toFixed(3)}, old sum ${oldSum.toFixed(3)}; grid worst ${worst.toFixed(3)}, beside the wraps ${worstWrap.toFixed(3)}), the T-90M's shape (belly ${F(0, 0).toFixed(3)}), the contact as a soft rim capped at ${MAXC} (the lane keeps ${(1 - F(1.5, 0)).toFixed(3)} of its sky; a run 13 cm up keeps the solid's ${liftedRun.toFixed(3)}; crest, hollow, thrown track), the interreflection (snow belly keeps ${visSnow(0, 0).toFixed(3)}, sand ${visSand.toFixed(3)}), the measured solid, the router-fed in-place uniforms, the gating, the GLSL's structure and the wiring; round 4: the crease's core past the cap, the shoe band's sun line, the softer broad share (${GROUND_AO_WALL_SOFT}), the snow berm, the run's grime, the gap normal's guard; round 5: no shoe skip (the lever), the running gear's cap, the contact blend, the snow's cool cast; contact r2: ${snowReport}, the FX lamps' cut PASS`);
