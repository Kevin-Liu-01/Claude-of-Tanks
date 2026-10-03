// vehicleGroundOcclusion.selftest — the ground's sky under and beside the near hulls (2026-10-03, the
// skies-and-atmosphere lane; the gauntlet's wave 0: "no ambient occlusion", the tank's shadow "a hole in the ground").
// Pinned: the analytic law (a wall's cosine-weighted sky share over the azimuth a finite hull covers, the footprint's
// fixed share), its CPU twin against the GLSL, the boxes built from the hulls' shadow proxies without allocation, the
// receivers (never a vehicle pixel), the ambient-share weighting (the contact shadows' rig terms) and the wiring: the
// shadow router's own near selection, the aerial pass's order, the lever.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  GROUND_AO_CARD_AMBIENT_SHARE, GROUND_AO_FADE_M, GROUND_AO_GEAR_DROP_M, GROUND_AO_MAX_HULLS, GROUND_AO_RANGE_M, GROUND_AO_UNDER,
  GROUND_AO_CLEARANCE_M, VEHICLE_GROUND_OCCLUSION_GLSL, createVehicleGroundOcclusionUniforms, hullProxyOf,
  updateVehicleGroundOcclusionUniforms, vehicleGroundOcclusionAt, vehicleGroundOcclusionBeside, vehicleGroundOcclusionUnder,
} from './vehicleGroundOcclusion.ts';
import { NEAR_VEHICLE_SHADOW_MAX, NEAR_VEHICLE_SHADOW_RANGE_M } from './nearVehicleShadowDetail.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---- the law
// a long wall (L → ∞) of height h at distance d hides ½ sin²(atan(h/d)) of the cosine-weighted sky
near(vehicleGroundOcclusionBeside(1, 1, 1e9), 0.5 * 0.5, 1e-6, 'a 45° wall hides a quarter of the sky');
near(vehicleGroundOcclusionBeside(2, 2 * Math.tan(Math.PI / 3), 1e9), 0.5 * 0.75, 1e-6, 'a 60° wall: ½ · sin² 60°');
// a hull: 2.4 m to the top over the ground, 3.6 m long half length
const hull = (d) => vehicleGroundOcclusionBeside(d, 2.4, 3.6);
assert.ok(hull(0.3) > 0.4 && hull(0.3) < 0.5, `at a track's side the ground loses ~0.45 of its sky (${hull(0.3).toFixed(3)})`);
assert.ok(hull(1) > 0.3 && hull(3) > 0.08 && hull(3) < 0.2, `a metre out ~0.35, three metres ~0.15 (${hull(1).toFixed(3)}, ${hull(3).toFixed(3)})`);
for (let d = 0.1; d < 12; d += 0.3) assert.ok(hull(d + 0.3) < hull(d), 'the occlusion falls with distance');
assert.ok(hull(12) < 0.02, 'and is gone a dozen metres out');
assert.equal(vehicleGroundOcclusionBeside(1, 0, 3), 0, 'a point at or over the box top is never occluded');
assert.ok(GROUND_AO_UNDER > 0.6 && GROUND_AO_UNDER < 1, 'under the belly most of the sky is gone, never all of it');
assert.ok(GROUND_AO_UNDER >= hull(0.05), 'the footprint is the darkest ground');
// under the belly (2026-10-03: the first lab frames showed a hard dark rectangle under every hull on overcast snow):
// the sky through the two side gaps — half at the edge, continuous with the law beside it, rising to the cap inside
near(vehicleGroundOcclusionUnder(0, 1.7), hull(0.05), 0.03, 'the footprint\'s edge meets the side law (no step)');
for (let s = 0; s < 1.7; s += 0.1) assert.ok(vehicleGroundOcclusionUnder(s + 0.1, 1.7) >= vehicleGroundOcclusionUnder(s, 1.7) - 1e-9, 'darker inward');
near(vehicleGroundOcclusionUnder(1.7, 1.7), GROUND_AO_UNDER, 1e-9, 'the belly\'s middle reaches the cap');
assert.ok(vehicleGroundOcclusionUnder(0.3, 1.7) < 0.75, `30 cm inside the edge still sees the gap's sky (${vehicleGroundOcclusionUnder(0.3, 1.7).toFixed(3)})`);
assert.ok(GROUND_AO_CLEARANCE_M > 0.25 && GROUND_AO_CLEARANCE_M < 0.7, 'a hull\'s ground clearance');
assert.ok(GROUND_AO_GEAR_DROP_M > 0.4 && GROUND_AO_GEAR_DROP_M < 1.5, 'the running gear under the guards');
assert.ok(GROUND_AO_CARD_AMBIENT_SHARE > 0.3 && GROUND_AO_CARD_AMBIENT_SHARE < 1, 'a card takes part of the darkening');
assert.equal(GROUND_AO_MAX_HULLS, NEAR_VEHICLE_SHADOW_MAX, 'one box per hull the shadow router selects');
assert.equal(GROUND_AO_RANGE_M, NEAR_VEHICLE_SHADOW_RANGE_M, 'over the router\'s range');
assert.ok(GROUND_AO_FADE_M > 0 && GROUND_AO_FADE_M < GROUND_AO_RANGE_M);

// ---- the CPU twin on a box (centre 0, 1.2, 0; half 1.7, 1.2, 3.6; axes the world's)
const c = new THREE.Vector3(0, 1.2, 0), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const half = new THREE.Vector3(1.7, 1.2, 3.6);
near(vehicleGroundOcclusionAt(new THREE.Vector3(0, 0, 0), c, X, Y, Z, half), GROUND_AO_UNDER, 1e-9, 'the footprint\'s middle');
near(vehicleGroundOcclusionAt(new THREE.Vector3(1.5, 0, 0), c, X, Y, Z, half), vehicleGroundOcclusionUnder(0.2, 1.7), 1e-9, '20 cm inside its side');
near(vehicleGroundOcclusionAt(new THREE.Vector3(2.7, 0, 0), c, X, Y, Z, half), vehicleGroundOcclusionBeside(1, 2.4, 3.6), 1e-9, 'a metre beside');
assert.equal(vehicleGroundOcclusionAt(new THREE.Vector3(0, 3, 0), c, X, Y, Z, half), 0, 'over the deck: nothing');
assert.equal(vehicleGroundOcclusionAt(new THREE.Vector3(3, -2, 0), c, X, Y, Z, half), 0, 'a slope far under the hull: nothing');
// rotated: the same point in the box's frame
const yaw = 0.7, Xr = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), Zr = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
const pr = new THREE.Vector3().addScaledVector(Xr, 2.7);
near(vehicleGroundOcclusionAt(pr, c, Xr, Y, Zr, half), vehicleGroundOcclusionBeside(1, 2.4, 3.6), 1e-9, 'the box\'s own frame');

// ---- the GLSL carries the same law
const g = VEHICLE_GROUND_OCCLUSION_GLSL;
assert.match(g, /float s = h \/ sqrt\( h \* h \+ dd \* dd \);/);
assert.match(g, /occ = min\( [\d.]+, 0\.5 \* s \* s \* 0\.6366 \* atan\( uVehGroundC\[ i \]\.w \/ dd \) \);/, 'the beside law, capped at the footprint\'s');
assert.match(g, /float dist = length\( max\( abs\( l\.xz \) - hf\.xz, vec2\( 0\.0 \) \) \);/, 'the horizontal distance to the box');
assert.match(g, /float si = clamp\( min\( hf\.x - abs\( l\.x \), hf\.z - abs\( l\.z \) \), 0\.0, W \);/, 'the depth inside the footprint');
assert.match(g, /occ = min\( [\d.]+, 1\.0 - 0\.5 \* c2 \/ \( c2 \+ g1 \* g1 \) - 0\.5 \* c2 \/ \( c2 \+ g2 \* g2 \) \);/, 'the side-gap law under the belly');
assert.match(g, /if \( h <= 0\.0 \|\| l\.y < -hf\.y - 0\.6 \) continue;/, 'over the box or far under it: nothing');
assert.match(g, /vis \*= 1\.0 - occ;/, 'several hulls combine as independent occluders');
assert.match(g, /return 1\.0 - occ \* ambShare;/, 'only the ambient share darkens');
assert.match(g, /ambShare = A \/ max\( T \+ A, 1e-4 \);/, 'the rig\'s ambient over the pixel\'s whole light (contactShadows.ts)');

// ---- the boxes: from the hull's shadow proxy, carried down over the running gear, written in place
const root = new THREE.Group();
const hullG = new THREE.Group(); root.add(hullG);
const proxy = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 7.2).translate(0, 1.4, 0), new THREE.MeshBasicMaterial());
proxy.name = 'procShadow_hull';
hullG.add(proxy);
root.userData.nearShadowDetail = { detail: [new THREE.Object3D()], proxies: [proxy] };
root.position.set(100, 5, -40); root.rotation.y = 0.5; root.updateMatrixWorld(true);
assert.equal(hullProxyOf(root), proxy, 'the hull proxy');
assert.equal(hullProxyOf(root), proxy, 'cached on the root');
const u = createVehicleGroundOcclusionUniforms();
const firstC = u.uVehGroundC.value[0];
updateVehicleGroundOcclusionUniforms(u, [{ root }], true);
assert.equal(u.uVehGround.value, 1);
assert.equal(u.uVehGroundC.value[0], firstC, 'the uniform objects are reused (no per-frame allocation)');
near(u.uVehGroundH.value[0].x, 1.7, 1e-6, 'half width'); near(u.uVehGroundH.value[0].z, 3.6, 1e-6, 'half length');
near(u.uVehGroundH.value[0].y, 0.5 + GROUND_AO_GEAR_DROP_M / 2, 1e-6, 'half height with the gear drop');
near(u.uVehGroundC.value[0].y, 5 + 1.4 - GROUND_AO_GEAR_DROP_M / 2, 1e-6, 'the centre comes down with the box');
near(u.uVehGroundC.value[0].w, 3.6, 1e-6, 'the long half length');
near(u.uVehGroundX.value[0].dot(new THREE.Vector3(Math.cos(0.5), 0, -Math.sin(0.5))), 1, 1e-6, 'the hull\'s own axes');
updateVehicleGroundOcclusionUniforms(u, [{ root }], false);
assert.equal(u.uVehGround.value, 0, 'the lever off: no boxes');
root.visible = false; updateVehicleGroundOcclusionUniforms(u, [{ root }], true);
assert.equal(u.uVehGround.value, 0, 'a hidden hull casts no occlusion');

// ---- the wiring
const post = here('./post.ts'), lighting = here('./lighting.ts');
assert.match(lighting, /scene\.userData\.nearVehicles = nearVehiclePolicy\.selected;/, 'the shadow router\'s near selection, published once (updated in place)');
assert.match(post, /if \( uVehGround > 0\.5 && texel\.a < \$\{VEHICLE_ALPHA_MIN\.toFixed\(1\)\} && -viewZ < \$\{GROUND_AO_RANGE_M\.toFixed\(1\)\} \) \{\s*texel\.rgb \*= cotVehicleGroundShade\( vUv, uCamPos \+ ray \* rayT, texel\.a, -viewZ \);/,
  'the ground (never a vehicle pixel) within the range');
const vehAt = post.indexOf('texel.rgb *= cotVehicleOcclusionShade(');
const groundAt = post.indexOf('texel.rgb *= cotVehicleGroundShade(');
const hazeAt = post.indexOf('float wy = uCamPos.y + ray.y * rayT;');
assert.ok(vehAt > 0 && groundAt > vehAt && hazeAt > groundAt, 'after the vehicle cavities, before the haze');
assert.ok(post.indexOf('${VEHICLE_GROUND_OCCLUSION_GLSL}') > post.indexOf('${CONTACT_SHADOW_GLSL}'), 'after the contact block it calls');
assert.match(post, /updateVehicleGroundOcclusionUniforms\(aerial\.uniforms as unknown as VehicleGroundOcclusionUniforms,\s*scene\.userData\.nearVehicles as readonly \{ root: THREE\.Object3D \}\[\] \| undefined, lightFx\.vehicleOcclusion && lightTune\('VEHICLE_GROUND_AO', 1\) > 0\);/,
  'every frame, on the owner\'s vehicle-occlusion lever');

console.log(`vehicleGroundOcclusion.selftest: the wall law (½ sin²α over the hull's azimuth), the footprint ${GROUND_AO_UNDER}, the CPU twin and the GLSL, the in-place boxes, the receivers and the wiring PASS`);
