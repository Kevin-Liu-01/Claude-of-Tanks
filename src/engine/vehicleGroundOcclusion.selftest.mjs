// vehicleGroundOcclusion.selftest — the ground's sky under and beside the near hulls (2026-10-03: the skies lane's
// module; the vehicle-ground lane's exact law after wave 13's "a strip of fully-lit snow under the belly"). Pinned: the
// box's sky share against closed forms and a fixed quadrature, the hull's three boxes (continuous across the footprint's
// edge, darkest under the belly), the first-order interreflection that replaced the ground-albedo multi-bounce, the
// boxes measured from a built root, the in-place uniforms fed by the shadow router's nearest-hull selection, the tier
// gating, the GLSL against its CPU twin and the wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  GROUND_AO_BELLY_VIEW, GROUND_AO_CARD_AMBIENT_SHARE, GROUND_AO_CLIP_SLACK_M, GROUND_AO_DEFAULT_ALBEDO, GROUND_AO_EDGE_M,
  GROUND_AO_FADE_M, GROUND_AO_HULL_ALBEDO, GROUND_AO_HULL_SKIN_M, GROUND_AO_MAX_HULLS, GROUND_AO_PLATE_OVERHANG_M, GROUND_AO_RANGE_M, GROUND_AO_REACH, GROUND_AO_TRACK_LIFT_M,
  GROUND_AO_TRACK_REACH, GROUND_AO_UNDER_GROUND, VEHICLE_GROUND_OCCLUSION_GLSL, boxSkyOcclusion, combineVehicleGroundOcclusion,
  createVehicleGroundOcclusionUniforms, hullProxyOf, measureVehicleGroundBoxes, updateVehicleGroundOcclusionUniforms,
  vehicleGroundOcclusionLocal, vehicleGroundStrengths,
} from './vehicleGroundOcclusion.ts';
import {
  NEAR_VEHICLE_SHADOW_MAX, NEAR_VEHICLE_SHADOW_RANGE_M, createNearVehicleShadowPolicy, markVehicleShadowDetail,
} from './nearVehicleShadowDetail.ts';
import { POST_LIGHT_FX_OFF, resolvePostLightFx } from './postLightFxPolicy.ts';
import { PRESETS } from './quality.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const UP = Object.freeze({ x: 0, y: 1, z: 0 });
const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

// ---- 1. the box's sky share: exact against closed forms and a deterministic quadrature
// a receiver under the centre of a box's bottom face (half extents a, b at height h): the parallel-rectangle form factor
const parallel = (a, b, h) => {
  const X = a / h, Y = b / h, sx = Math.sqrt(1 + X * X), sy = Math.sqrt(1 + Y * Y);
  return (2 / Math.PI) * ((X / sx) * Math.atan(Y / sx) + (Y / sy) * Math.atan(X / sy));
};
for (const [a, b, h] of [[1.8, 3.6, 0.45], [1.1, 3.2, 0.3], [0.5, 0.5, 2], [3, 1, 0.1]]) {
  near(boxSkyOcclusion({ x: 0, y: -0.7 - h, z: 0 }, UP, { x: a, y: 0.7, z: b }), parallel(a, b, h), 1e-9, `under a ${2 * a}×${2 * b} m face at ${h} m`);
}
// the same face seen from under its corner: a quarter of the face twice the size
near(boxSkyOcclusion({ x: 1.8, y: -1.15, z: 3.6 }, UP, { x: 1.8, y: 0.7, z: 3.6 }), parallel(3.6, 7.2, 0.45) / 4, 1e-9, 'under a corner');
// beside a very long box from the receiver's height to H: the infinite wall, ½ (1 − d / √(d² + H²))
for (const [d, H] of [[0.3, 1.2], [1, 1.5], [3, 2]]) {
  const wall = 0.5 * (1 - d / Math.hypot(d, H));
  near(boxSkyOcclusion({ x: -(d + 0.5), y: -H / 2 - 1e-9, z: 0 }, UP, { x: 0.5, y: H / 2, z: 1e5 }), wall, 2e-4, `a long wall ${H} m tall at ${d} m`);
}
// general receivers and normals against a fixed cosine-weighted quadrature (360² rays, ray-box slabs)
function quadrature(q, n, r, N = 360) {
  const t = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u = unit(t.y * n.z - t.z * n.y, t.z * n.x - t.x * n.z, t.x * n.y - t.y * n.x);
  const w = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
  let hits = 0;
  for (let i = 0; i < N; i++) {
    const s2 = (i + 0.5) / N, st = Math.sqrt(s2), ct = Math.sqrt(1 - s2);
    for (let j = 0; j < N; j++) {
      const ph = (2 * Math.PI * (j + 0.5)) / N, c = Math.cos(ph) * st, s = Math.sin(ph) * st;
      const d = [u.x * c + w.x * s + n.x * ct, u.y * c + w.y * s + n.y * ct, u.z * c + w.z * s + n.z * ct];
      let t0 = 0, t1 = Infinity, hit = true;
      for (const [o, dd, rr] of [[q.x, d[0], r.x], [q.y, d[1], r.y], [q.z, d[2], r.z]]) {
        if (Math.abs(dd) < 1e-12) { if (Math.abs(o) > rr) { hit = false; break; } continue; }
        let a = (-rr - o) / dd, b = (rr - o) / dd;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) { hit = false; break; }
      }
      if (hit) hits++;
    }
  }
  return hits / (N * N);
}
for (const [q, n] of [
  [{ x: 2.3, y: -1.15, z: 0 }, UP], [{ x: -2.5, y: -1.15, z: 4.5 }, UP], [{ x: 0, y: -1.15, z: 5 }, UP],
  [{ x: 2.5, y: 0, z: 0 }, unit(-1, 0, 0)], [{ x: 2.5, y: -0.9, z: 0.3 }, unit(-0.3, 0.95, 0.1)], [{ x: -2, y: -1, z: -4 }, unit(0.2, 0.97, 0.1)],
]) {
  near(boxSkyOcclusion(q, n, { x: 1.8, y: 0.7, z: 3.6 }), quadrature(q, n, { x: 1.8, y: 0.7, z: 3.6 }), 4e-3, `quadrature at ${JSON.stringify(q)}`);
}
// the brief's three laws: nearly all the sky under a wide low box, almost none far outside, monotone in clearance
assert.ok(boxSkyOcclusion({ x: 0, y: -0.9, z: 0 }, UP, { x: 1.8, y: 0.7, z: 3.6 }) > 0.95, 'under a wide box at 0.2 m');
assert.ok(boxSkyOcclusion({ x: 12, y: -1.15, z: 0 }, UP, { x: 1.8, y: 0.7, z: 3.6 }) < 0.02, 'ten metres outside its footprint');
for (let c = 0.1, prev = 2; c < 4; c += 0.1) {
  const f = boxSkyOcclusion({ x: 0.4, y: -0.7 - c, z: -1 }, UP, { x: 1.8, y: 0.7, z: 3.6 });
  assert.ok(f < prev, `falls as the clearance grows (${c.toFixed(1)} m: ${f.toFixed(4)})`);
  prev = f;
}
assert.equal(boxSkyOcclusion({ x: 0, y: 2, z: 0 }, UP, { x: 1.8, y: 0.7, z: 3.6 }), 0, 'a box under the receiver\'s horizon hides nothing');

// ---- 2. a hull: the measured T-90M (belly 0.31 m, deck 1.32 m, runs 1.11–1.72 m out), exact boxes, darkest under the belly
const T90 = Object.freeze({ hx: 1.79, yb: 0.31, yt: 1.32, hz0: -2.89, hz1: 3.61, xi: 1.11, xo: 1.72, y0: 0.02, tz0: -2.89, tz1: 3.43 });
const ONE = Object.freeze({ belly: 1, wall: 1 });
const F = (x, z, y = 0, n = UP) => vehicleGroundOcclusionLocal({ x, y, z }, n, T90, ONE);
const bellyOnly = boxSkyOcclusion({ x: 0, y: -0.31 - 0.505, z: 0.3 - 0.36 }, UP, { x: 1.79, y: 0.505, z: 3.25 });
assert.ok(F(0, 0.3) >= bellyOnly && F(0, 0.3) - bellyOnly < 0.05, `the belly dominates under the hull, the runs close its sides (${bellyOnly.toFixed(3)})`);
assert.ok(F(0, 0.3) > 0.97 && F(0, 0.3) <= 1, `the belly's middle loses almost all its sky (${F(0, 0.3).toFixed(3)})`);
near(F(0, T90.hz0), 0.5, 0.06, 'half at the rear edge');
assert.ok(F(0, T90.hz0 + 0.3) > 0.8, `0.3 m inside the rear edge (${F(0, T90.hz0 + 0.3).toFixed(3)}; the old side-gap law hid 0.65)`);
assert.ok(F(0, T90.hz0 - 1.6) > 0.05 && F(0, T90.hz0 - 1.6) < 0.15 && F(0, T90.hz0 - 4.1) === 0, 'behind the hull it fades, and is gone past its reach');
assert.ok(F(-1.8, 0.3) > 0.8 && F(-2.2, 0.3) > 0.35 && F(-3.2, 0.3) < 0.2, 'the run\'s contact line, then a short skirt');
assert.equal(F(0, 0.3, 1.5), 0, 'over the deck: nothing');
// the hull's own surface over the belly (a marking decal blended over it reads as a card or lit ground): never a receiver
for (const [x, y, z] of [[1.82, 0.9, 0], [0.5, 1.0, 0.5], [-1.85, 0.6, -2], [0.2, 0.8, 3.65]]) {
  assert.equal(F(x, z, y), 0, `the hull's skin at ${x}, ${y}, ${z}`);
  assert.equal(F(x, z, y, unit(0.3, 0.2, 0.9)), 0, 'whatever its normal');
}
assert.ok(F(1.82, 0, 0) > 0.4 && F(1.95, 0, 0.9) > 0, 'the ground at the hull\'s foot, and a wall pixel just past its skin, still are');
assert.ok(F(0, 0.3, -8) === 0, 'a slope far under the hull: nothing');
// continuous across every edge: the footprint's, the runs' faces and ends, a corner (1 mm steps; a step function would
// keep its jump at any step, a steep wall-side gradient shrinks with it)
for (const [line, label] of [[(t) => [0, T90.hz0 - 0.9 + t], 'the rear edge'], [(t) => [-2.6 + t, 0.3], 'a side'], [(t) => [-2.6 + t, 4.4 - t], 'a corner'],
  [(t) => [-1.4, 2.7 + t], 'a run\'s front end'], [(t) => [-2.6 + t, -3.2], 'past the runs\' rear ends']]) {
  let prev = null, worst = 0;
  for (let t = 0; t <= 1.7; t += 0.001) {
    const [x, z] = line(t), v = F(x, z);
    if (prev !== null) worst = Math.max(worst, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(worst < 0.01, `${label}: no step (worst 1 mm change ${worst.toFixed(4)})`);
}
// the law is mirror-symmetric (a far run hides behind the near one either way); a wall facing the hull keeps the box its
// horizon clip would drop for a level receiver
for (const [x, z] of [[2.4, 0.3], [0.5, -3.3], [1.9, 3.9], [3.1, -1]]) near(F(x, z), F(-x, z), 1e-9, `mirror at ${x}, ${z}`);
assert.ok(vehicleGroundOcclusionLocal({ x: -2.3, y: 0.6, z: 0.3 }, unit(1, 0, 0), T90, ONE) > 0.3, 'a wall facing the hull is shaded by it');

// ---- 3. the interreflection: what a blocked direction keeps (the belly enclosure, the walls), first order
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
// belly's middle and 0.81 at the rear edge; the belly here keeps an eighth, the strip under the rear plate a quarter
const jimenez = (v, rho) => { const a = 2.0404 * rho - 0.3324, b = -4.7951 * rho + 0.6417, c = 2.7552 * rho + 0.6903; return Math.max(v, ((a * v + b) * v + c) * v); };
near(jimenez(0.15, 0.8), 0.367, 0.002, 'the old middle on snow'); near(jimenez(0.5, 0.8), 0.81, 0.005, 'the old rear edge on snow');
const visSnow = (x, z) => 1 - vehicleGroundOcclusionLocal({ x, y: 0, z }, UP, T90, snow);
assert.ok(visSnow(0, 0.3) < 0.16, `snow under the belly keeps ${visSnow(0, 0.3).toFixed(3)} of its sky`);
assert.ok(visSnow(0, T90.hz0 + 0.3) < 0.3 && visSnow(0, T90.hz0) < 0.65, `the rear strip: ${visSnow(0, T90.hz0 + 0.3).toFixed(3)} 0.3 m in, ${visSnow(0, T90.hz0).toFixed(3)} at the edge`);
// photographs of hulls on sand: the belly at 0.07–0.16 of the sunlit ground in display light ≈ 0.18–0.32 of its sky
// (through AgX on the lane's measured Sirocco frames); sunny sand's belly middle lands inside
const visSand = 1 - vehicleGroundOcclusionLocal({ x: 0, y: 0, z: 0.3 }, UP, T90, sand);
assert.ok(visSand > 0.15 && visSand < 0.32, `sunny sand's belly keeps ${visSand.toFixed(3)}`);
// several hulls as independent occluders, the range fade over the selection's last stretch
near(combineVehicleGroundOcclusion([0.5, 0.5], 10), 0.75, 1e-12, 'two halves');
near(combineVehicleGroundOcclusion([0.8], GROUND_AO_RANGE_M), 0, 1e-12, 'gone at the range');
near(combineVehicleGroundOcclusion([0.8], GROUND_AO_RANGE_M - GROUND_AO_FADE_M), 0.8, 1e-12, 'whole inside the fade');

// ---- 4. the boxes from a built root: contact geometry, the hull proxy, the track bands
function builtHull(name, { z = 0, bands = true, contact = true } = {}) {
  const root = new THREE.Group(); root.name = name; root.position.set(0, 0, z);
  const hullG = new THREE.Group(); root.add(hullG);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(3.58, 1.01, 7.1).translate(0, 0.865, 0.13), new THREE.MeshBasicMaterial({ colorWrite: false }));
  proxy.name = 'procShadow_hull'; hullG.add(proxy);
  if (bands) {
    for (const [nameSide, x] of [['gearTrackBandL', -1.415], ['gearTrackBandR', 1.415]]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.61, 1.02, 6.32), new THREE.MeshStandardMaterial());
      band.name = nameSide; band.position.set(x, 0.55, 0.27); hullG.add(band);
    }
  }
  if (contact) root.userData.contactGeom = { bottomYM: 0, panYM: 0.31, halfWidM: 1.72, halfLenM: 2.35, zCenterM: 0.36 };
  markVehicleShadowDetail(root, { detail: [new THREE.Object3D()], proxies: [proxy] });
  return { root, proxy };
}
{
  const { root, proxy } = builtHull('t90');
  assert.equal(hullProxyOf(root), proxy, 'the hull proxy');
  const b = measureVehicleGroundBoxes(root);
  // the box proxy has no low vertices between the runs: the belly runs the contact run ± GROUND_AO_BELLY_BEYOND_RUN_M
  for (const [key, want] of Object.entries({ hx: 1.79, yb: 0.31, yt: 1.37, hz0: 0.36 - 2.35 - 0.6 - 0.3, hz1: 0.36 + 2.35 + 0.6 + 0.3, xi: 1.11, xo: 1.72, y0: GROUND_AO_TRACK_LIFT_M, tz0: -2.89, tz1: 3.43 })) {
    near(b[key], want, 1e-6, `measured ${key}`);
  }
  assert.equal(measureVehicleGroundBoxes(root), b, 'measured once, cached on the root');
  const hero = builtHull('bare', { bands: false, contact: false }).root;
  const bare = measureVehicleGroundBoxes(hero);
  assert.ok(bare && bare.xo - bare.xi > 0.5 && bare.yb > bare.y0 && bare.tz1 > bare.tz0, 'without bands or contact geometry: the fallbacks');
  hero.userData.contactGeom = { bottomYM: 0.05, panYM: 0.5, halfWidM: 1.7, halfLenM: 2.4, zCenterM: 0 };
  const lent = measureVehicleGroundBoxes(hero);
  assert.ok(lent !== bare && Math.abs(lent.yb - 0.5) < 1e-9 && Math.abs(lent.y0 - (0.05 + GROUND_AO_TRACK_LIFT_M)) < 1e-9,
    'a showroom hero lent to a battle is measured again from its contact geometry');
  assert.equal(measureVehicleGroundBoxes(new THREE.Group()), null, 'no proxy, no boxes');
  // a rear plate rising off the ground over the last metre (the M1A2's: 0.41 m to 1.0 m): the box keeps the belly
  // plate's own length plus a short overhang, so the ground under the sloped plate keeps much of its sky
  const slopedHull = builtHull('sloped');
  const g2 = new THREE.BoxGeometry(3.58, 1.01, 7.1, 4, 1, 14).translate(0, 0.865, 0.13), sp = g2.getAttribute('position');
  for (let i = 0; i < sp.count; i++) if (sp.getY(i) < 0.4 && sp.getZ(i) < -2.4) sp.setY(i, sp.getY(i) + (-2.4 - sp.getZ(i)) * 0.6);
  g2.computeBoundingBox();
  slopedHull.proxy.geometry = g2;
  const sb = measureVehicleGroundBoxes(slopedHull.root);
  near(sb.hz0, -3.42 + 2 * (7.1 / 14) - GROUND_AO_PLATE_OVERHANG_M, 1e-6, 'the hull box ends a short overhang past the belly plate');
  near(sb.hz1, 3.68, 1e-6, 'the flat nose keeps the proxy\'s length');
}

// ---- 5. the uniforms: the router's nearest hulls, each frame from its pose, written in place
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
assert.equal(u.uVehGroundM.value[0], firstRow, 'rows reused'); assert.equal(u.uVehGroundB.value[0], firstBox, 'boxes reused');
assert.equal(u.uVehGroundLight.value, light, 'light reused');
near(u.uVehGroundLight.value.x, 0.8, 1e-9, 'the ground albedo'); near(u.uVehGroundLight.value.y, GROUND_AO_HULL_ALBEDO, 1e-9, 'the hull albedo');
// the nearest first: its frame maps its own origin to the root frame's origin
const nearRoot = hulls[0].root;
const row = (i, p) => u.uVehGroundM.value[i].x * p.x + u.uVehGroundM.value[i].y * p.y + u.uVehGroundM.value[i].z * p.z + u.uVehGroundM.value[i].w;
near(row(2, nearRoot.position), 0, 1e-9, 'the nearest hull first'); near(u.uVehGroundB.value[0].x, 1.79, 1e-6, 'its hull half width');
near(u.uVehGroundB.value[2].z, 1, 1e-12, 'weight one');
// a moved, turned, scaled hull: read from its pose this frame, not its last render's world matrix
nearRoot.position.set(7, 2, -9); nearRoot.rotation.set(0.05, 0.9, -0.03, 'YXZ'); nearRoot.scale.setScalar(1.15);
const local = new THREE.Vector3(1.2, 0.4, -2.5), world = local.clone().applyMatrix4(new THREE.Matrix4().compose(nearRoot.position, nearRoot.quaternion, nearRoot.scale));
updateVehicleGroundOcclusionUniforms(u, policy.selected, true, 0.8);
near(row(0, world), local.x, 1e-6, 'x in the root frame'); near(row(1, world), local.y, 1e-6, 'y'); near(row(2, world), local.z, 1e-6, 'z');
nearRoot.visible = false; updateVehicleGroundOcclusionUniforms(u, policy.selected, true);
assert.equal(u.uVehGround.value, 3, 'a hidden hull casts nothing'); nearRoot.visible = true;
updateVehicleGroundOcclusionUniforms(u, policy.selected, false);
assert.equal(u.uVehGround.value, 0, 'the lever off: no hulls');

// ---- 6. tier gating: the block rides the vehicle-occlusion lever, never on the phones or under ?fx=off
for (const name of ['ultra', 'high']) assert.equal(resolvePostLightFx(PRESETS[name], 'desktop', null).vehicleOcclusion, true, `${name} runs it`);
for (const name of ['low', 'mobile-low', 'mobile', 'mobile-high']) assert.equal(!!resolvePostLightFx(PRESETS[name], 'desktop', null).vehicleOcclusion, false, `${name} never does`);
assert.deepEqual(resolvePostLightFx(PRESETS.ultra, 'mobile', null), POST_LIGHT_FX_OFF, 'the mobile tier never enters the block');
assert.deepEqual(resolvePostLightFx(PRESETS.ultra, 'desktop', 'off'), POST_LIGHT_FX_OFF, '?fx=off never enters it');

// ---- 7. the GLSL carries the CPU twin's law
const g = VEHICLE_GROUND_OCCLUSION_GLSL;
const f4 = (x) => x.toFixed(4);
assert.match(g, new RegExp(`uniform vec4 uVehGroundM\\[ ${GROUND_AO_MAX_HULLS * 3} \\];`)); assert.match(g, new RegExp(`uniform vec4 uVehGroundB\\[ ${GROUND_AO_MAX_HULLS * 3} \\];`));
assert.match(g, /return s > 1e-6 \? atan\( s, dot\( a, b \) \) \* dot\( n, c \) \/ s : 0\.0;/, 'Lambert\'s edge term');
for (const v of ['vec3( 1.0, 1.0, -1.0 ) * fq', 'vec3( 1.0, si.x, si.x ) * fq', 'vec3( 1.0, -1.0, 1.0 ) * fq', 'vec3( si.z, si.z, 1.0 ) * fq',
  'vec3( -1.0, 1.0, 1.0 ) * fq', 'vec3( si.y, 1.0, si.y ) * fq']) assert.ok(g.includes(v), `the hexagon vertex ${v}`);
assert.ok(g.includes(`k * sg.x * sg.y * sg.z * ${(1 / (2 * Math.PI)).toFixed(7)}`), 'signed by the mirror parity, over 2π');
assert.ok(g.includes(`float yc = q.y + 0.002 - ${f4(GROUND_AO_CLIP_SLACK_M)} * ( 1.0 - n.y );`), 'the horizon clip');
assert.ok(g.includes(`smoothstep( H * ${f4(GROUND_AO_REACH[0])}, H * ${f4(GROUND_AO_REACH[1])}, dOut )`), 'the hull\'s reach');
assert.ok(g.includes(`th * ${f4(GROUND_AO_TRACK_REACH[0])}, th * ${f4(GROUND_AO_TRACK_REACH[1])}`), 'the runs\' reach');
assert.match(g, /float wl = clamp\( \( b1\.z - q\.x \) \/ span, 0\.0, 1\.0 \)/, 'the left run hides past the right one');
assert.match(g, /float wr = clamp\( \( q\.x \+ b1\.z \) \/ span, 0\.0, 1\.0 \)/, 'and the reverse');
assert.ok(g.includes(`float inside = 1.0 - smoothstep( ${f4(-GROUND_AO_EDGE_M)}, ${f4(GROUND_AO_EDGE_M)}, sd );`)
  && g.includes('mix( sWall, sBelly, inside )'), 'the strengths across the edge');
assert.match(g, /float sBelly = clamp\( 1\.0 - lt\.y \* lt\.x \* \( lt\.z \* \( 1\.0 \+ kSun \) \+ \( 1\.0 - lt\.z \) \* lt\.w \), 0\.0, 1\.0 \);/, 'the belly\'s interreflection');
assert.match(g, /float sWall = clamp\( 1\.0 - lt\.y \* \( 0\.5 \+ 0\.5 \* lt\.x \* \( 1\.0 \+ 0\.5 \* kSun \) \), 0\.0, 1\.0 \);/, 'the walls\'');
assert.match(g, /float kSun = uContactSunLum \* max\( uSunDir\.y, 0\.0 \) \/ max\( aUp, 1e-4 \);/, 'the rig\'s sun over its sky');
assert.match(g, /vis \*= 1\.0 - min\( ho, 1\.0 \) \*/, 'hulls combine as independent occluders');
assert.ok(g.includes(`smoothstep( ${f4(GROUND_AO_RANGE_M - GROUND_AO_FADE_M)}, ${f4(GROUND_AO_RANGE_M)}, dist )`), 'the range fade');
assert.ok(g.includes(`float ambShare = mix( ${f4(GROUND_AO_CARD_AMBIENT_SHARE)}, 1.0, under );`), 'a card\'s ambient share: fixed in the open, whole under a belly');
assert.match(g, /under = max\( under, inside \* step\( q\.y, b0\.y \) \);/, 'under = inside a footprint and below its belly');
assert.match(g, /ambShare = A \/ max\( T \+ A, 1e-4 \);/, 'only the ambient share darkens');
assert.match(g, /return 1\.0 - occ \* ambShare;/);
assert.ok(!/2\.0404|Jimenez|fract\( sin/.test(g), 'no ground-albedo multi-bounce, no per-pixel noise');
assert.ok(g.indexOf('if ( !haveN )') > g.indexOf('continue;'), 'the depth normal only for a pixel some hull reaches');
assert.ok(g.includes(`if ( q.y > b0.y + 0.02 && dOut < ${f4(GROUND_AO_HULL_SKIN_M)} ) continue;`), 'the hull\'s own skin is skipped');

// ---- 8. the wiring: the router's selection, the aerial pass's order, the lever, the ground's albedo
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

console.log(`vehicleGroundOcclusion.selftest: exact box sky shares (closed forms, quadrature), the hull's three boxes (belly ${F(0, 0.3).toFixed(3)}, rear edge ${F(0, T90.hz0).toFixed(3)}), the first-order interreflection (snow belly keeps ${visSnow(0, 0.3).toFixed(3)}, sand ${visSand.toFixed(3)}), the measured boxes, the router-fed in-place uniforms, the gating, the GLSL and the wiring PASS`);
