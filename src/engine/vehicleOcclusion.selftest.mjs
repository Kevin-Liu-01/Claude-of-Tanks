// Owner 2026-10-02 ("shadows on tanks make them look a lil flat"): vehicle-only cavity occlusion in the aerial pass.
// Pins the alpha tag that marks vehicle pixels (and its decode in the contact shadows), the sampling law, the
// horizon-to-cavity reduction, the ambient-share blend (a sunlit plate keeps its sunlight), the GLSL contract inside
// the aerial pass and the vehicle readability hook that writes the tag.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  VEHICLE_ALPHA_MIN, VEHICLE_ALPHA_TAG, VEHICLE_OCCLUSION_BIAS, VEHICLE_OCCLUSION_DIRECTIONS, VEHICLE_OCCLUSION_FADE_M,
  VEHICLE_OCCLUSION_GLSL, VEHICLE_OCCLUSION_MAX_PX, VEHICLE_OCCLUSION_MIN_PX, VEHICLE_OCCLUSION_RADIUS_M,
  VEHICLE_OCCLUSION_RANGE_M, VEHICLE_OCCLUSION_STEPS, VEHICLE_OCCLUSION_STRENGTH, VEHICLE_OCCLUSION_DIRECT_SHARE,
  createVehicleOcclusionUniforms,
  vehicleCavityFromHorizons, vehicleOcclusionFalloff, vehicleOcclusionRadiusPx, vehicleOcclusionRangeFade,
  vehicleOcclusionShade, vehicleOcclusionStep, vehicleSunVisibility,
} from './vehicleOcclusion.ts';
import { CONTACT_SHADOW_ALPHA_OPAQUE, CONTACT_SHADOW_GLSL, contactShadowSunVisibility } from './contactShadows.ts';
import { vehicleAmbientFloorHook } from '../vehicles/materials.ts';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1. the alpha tag: lit materials write 2 + v, vehicles 2 + v + the tag; both decode to v, cards and water stay -1
assert.equal(VEHICLE_ALPHA_TAG, 2);
assert.ok(2 + VEHICLE_ALPHA_TAG > VEHICLE_ALPHA_MIN && 2 + 1 < VEHICLE_ALPHA_MIN, 'every vehicle alpha and no other lit alpha clears the threshold');
assert.ok(VEHICLE_ALPHA_MIN > CONTACT_SHADOW_ALPHA_OPAQUE, 'a vehicle pixel is still an opaque lit occluder for the contact march');
for (const v of [0, 0.25, 0.6, 1]) {
  assert.ok(near(vehicleSunVisibility(2 + VEHICLE_ALPHA_TAG + v), v), `vehicle decode ${v}`);
  assert.ok(near(contactShadowSunVisibility(2 + VEHICLE_ALPHA_TAG + v), v), `the contact shadows decode a vehicle pixel's own visibility (${v})`);
  assert.ok(near(contactShadowSunVisibility(2 + v), v), `an ordinary lit pixel still decodes (${v})`);
  assert.equal(vehicleSunVisibility(2 + v), -1, 'an ordinary lit pixel is no vehicle');
}
for (const a of [0, 0.5, 1, 1.49]) {
  assert.equal(vehicleSunVisibility(a), -1);
  assert.equal(contactShadowSunVisibility(a), -1, 'cards, water, glass and unlit pixels decode as nothing');
}

// 2. sampling: eight fixed directions (no per-pixel noise), four steps dense near the pixel, a bounded pixel radius
assert.equal(VEHICLE_OCCLUSION_DIRECTIONS, 8);
assert.equal(VEHICLE_OCCLUSION_STEPS, 4);
let prev = 0;
for (let s = 0; s < VEHICLE_OCCLUSION_STEPS; s++) {
  const t = vehicleOcclusionStep(s);
  assert.ok(t > prev && t <= 1, 'steps advance inside the radius');
  if (s > 1) assert.ok(t - vehicleOcclusionStep(s - 1) > vehicleOcclusionStep(s - 1) - vehicleOcclusionStep(s - 2), 'spacing widens outward');
  prev = t;
}
assert.equal(vehicleOcclusionStep(VEHICLE_OCCLUSION_STEPS - 1), 1, 'the last step reaches the radius');
const pxPerM1080 = 0.5 * 1080 / Math.tan(THREE.MathUtils.degToRad(40) / 2);
assert.equal(vehicleOcclusionRadiusPx(0.2, pxPerM1080), VEHICLE_OCCLUSION_MAX_PX, 'a hull filling the lens caps the gather');
assert.equal(vehicleOcclusionRadiusPx(500, pxPerM1080), VEHICLE_OCCLUSION_MIN_PX, 'a far hull keeps a minimum gather');
assert.ok(vehicleOcclusionRadiusPx(10, pxPerM1080) > vehicleOcclusionRadiusPx(30, pxPerM1080), 'nearer hulls gather wider');
assert.equal(vehicleOcclusionFalloff(0, 1), 1);
assert.equal(vehicleOcclusionFalloff(0.5, 1), 1, 'full weight inside half the radius');
assert.equal(vehicleOcclusionFalloff(1, 1), 0, 'nothing at the radius');
assert.ok(vehicleOcclusionFalloff(0.75, 1) > 0 && vehicleOcclusionFalloff(0.75, 1) < 1);

// 3. horizons → cavity: an open plate is untouched, a right-angle corner takes about half, a pit nearly all
assert.equal(vehicleCavityFromHorizons(new Array(8).fill(0)), 0, 'open plate');
assert.equal(vehicleCavityFromHorizons(new Array(8).fill(-0.4)), 0, 'a convex edge never darkens');
assert.ok(near(vehicleCavityFromHorizons([...new Array(4).fill(1 - VEHICLE_OCCLUSION_BIAS), ...new Array(4).fill(0)]), 0.5), 'corner');
assert.ok(near(vehicleCavityFromHorizons(new Array(8).fill(1 - VEHICLE_OCCLUSION_BIAS)), 1), 'pit');
assert.ok(VEHICLE_OCCLUSION_BIAS > 0.05 && VEHICLE_OCCLUSION_BIAS < 0.3, 'a plate never shades itself; real overhangs still count');

// 4. the blend dims only the ambient share; the range fade retires it where a hull is a few dozen pixels
assert.ok(near(vehicleOcclusionShade(1, 0), 1 - VEHICLE_OCCLUSION_STRENGTH), 'a shaded cavity takes the full strength');
assert.ok(near(vehicleOcclusionShade(1, 1), 1), 'a fully sunlit plate keeps its sunlight');
assert.ok(near(vehicleOcclusionShade(0.5, 0.75), 1 - 0.5 * VEHICLE_OCCLUSION_STRENGTH * 0.25));
assert.equal(vehicleOcclusionShade(0, 0), 1, 'no cavity, no change');
assert.ok(VEHICLE_OCCLUSION_STRENGTH > 0.5 && VEHICLE_OCCLUSION_STRENGTH < 0.95, 'strong in the cavity, never black');
assert.equal(vehicleOcclusionRangeFade(0), 1);
assert.equal(vehicleOcclusionRangeFade(VEHICLE_OCCLUSION_RANGE_M - VEHICLE_OCCLUSION_FADE_M), 1);
assert.equal(vehicleOcclusionRangeFade(VEHICLE_OCCLUSION_RANGE_M), 0);
assert.equal(createVehicleOcclusionUniforms().uVehOcc.value, 0, 'off until the light effects resolve it');

// 5. the GLSL carries the same constants and the same laws
const glsl = VEHICLE_OCCLUSION_GLSL;
// (fleet lane 2026-10-08: the strength and the direct share are uniforms defaulting to the constants)
const uniforms = createVehicleOcclusionUniforms();
assert.equal(uniforms.uVehOccStrength.value, VEHICLE_OCCLUSION_STRENGTH, 'the strength uniform ships the constant');
assert.equal(uniforms.uVehOccDirect.value, VEHICLE_OCCLUSION_DIRECT_SHARE, 'the direct-share uniform ships the constant');
assert.match(glsl, /uVehOccStrength \* mix\( ambShare, 1\.0, uVehOccDirect \)/, 'the GLSL dims ambient, plus the direct share of sunlight');
assert.ok(near(vehicleOcclusionShade(1, 1, 1, 0.8, 0.5), 1 - 0.8 * 0.5), 'a sunlit cavity dims by the direct share');
assert.ok(near(vehicleOcclusionShade(1, 0.5, 1, 0.8, 0), vehicleOcclusionShade(1, 0.5)), 'share 0 is the ambient-only law');
for (const [name, value] of [['radius', VEHICLE_OCCLUSION_RADIUS_M], ['bias', VEHICLE_OCCLUSION_BIAS],
  ['min px', VEHICLE_OCCLUSION_MIN_PX], ['max px', VEHICLE_OCCLUSION_MAX_PX], ['alpha', VEHICLE_ALPHA_MIN]]) {
  assert.ok(glsl.includes(value.toFixed(4)), `GLSL carries the ${name}`);
}
assert.match(glsl, new RegExp(`d < ${VEHICLE_OCCLUSION_DIRECTIONS}; d\\+\\+`), 'fixed direction count');
assert.match(glsl, new RegExp(`s < ${VEHICLE_OCCLUSION_STEPS}; s\\+\\+`), 'fixed step count');
assert.match(glsl, /t \*= 0\.35 \+ 0\.65 \* t;/, 'the step law');
assert.match(glsl, /texture2D\( tDiffuse, q \)\.a >= 1\.5/, 'grass and leaf cards never occlude');
assert.match(glsl, /smoothstep\( 0\.5 \* rM, rM, l \)/, 'the distance falloff');
assert.match(glsl, /float ambShare = amb \/ max\( T \+ amb, 1e-4 \);/, 'only the ambient share is dimmed');
assert.ok(!/interleavedGradientNoise|fract\( sin/.test(glsl), 'no per-pixel noise (the speckle the owner turned GTAO off for)');
assert.match(CONTACT_SHADOW_GLSL, /if \( a >= 3\.5000 \) return clamp\( a - 4\.0, 0\.0, 1\.0 \);/, 'the contact march decodes a vehicle pixel');

// 6. the aerial pass: the block after the contact shadows, gated on its lever and on vehicle pixels in range
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.match(post, /\$\{CONTACT_SHADOW_GLSL\}\s*\$\{VEHICLE_OCCLUSION_GLSL\}/, 'included after the contact shadow helpers it uses');
assert.match(post, /if \( uVehOcc > 0\.5 && texel\.a >= \$\{VEHICLE_ALPHA_MIN\.toFixed\(1\)\} && -viewZ < \$\{VEHICLE_OCCLUSION_RANGE_M\.toFixed\(1\)\} \) \{\s*texel\.rgb \*= cotVehicleOcclusionShade\( vUv, uCamPos \+ ray \* rayT, -viewZ, texel\.a \);/,
  'only vehicle pixels in range, before the haze');
assert.ok(post.indexOf('cotVehicleOcclusionShade( vUv') < post.indexOf('texel.a = 1.0;'), 'consumed before the pass restores alpha');
assert.match(post, /aerial\.uniforms\.uVehOcc\.value = lightFx\.vehicleOcclusion \? 1 : 0;/, 'the lever drives the uniform');
// (2026-10-03, the skies-and-atmosphere lane: the far cloud shadows read the same uniforms, so they refresh for them too)
assert.match(post, /updateContactShadowUniforms\(aerial\.uniforms, camera, scene, lightFx\.contactShadows,\s*lightFx\.contactShadows \|\| lightFx\.vehicleOcclusion\);/,
  'the sun / ambient uniforms refresh for the occlusion even with the contact march off');

// 7. the vehicle hook writes the tag once, under the same guard as the lighting.ts write it extends
const material = new THREE.MeshStandardMaterial();
material.onBeforeCompile = vehicleAmbientFloorHook;
const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
material.onBeforeCompile(shader, {});
const tag = `#include <opaque_fragment>\n#if defined( COT_SUN_VIS_CAPTURED ) && defined( OPAQUE ) && defined( USE_CSM )\n\tgl_FragColor.a += ${VEHICLE_ALPHA_TAG.toFixed(1)};\n#endif`;
assert.equal(shader.fragmentShader.split(tag).length, 2, 'the vehicle hook tags its pixels exactly once');
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lighting, /#if defined\( COT_SUN_VIS_CAPTURED \) && defined\( OPAQUE \) && defined\( USE_CSM \)\ngl_FragColor\.a = 2\.0 \+ cotSunVis;/,
  'the lit materials still write 2 + v (the base the tag adds to)');
material.dispose();

console.log(`vehicleOcclusion.selftest: alpha tag ${VEHICLE_ALPHA_TAG} (vehicle >= ${VEHICLE_ALPHA_MIN}), ${VEHICLE_OCCLUSION_DIRECTIONS}x${VEHICLE_OCCLUSION_STEPS} fixed taps over ${VEHICLE_OCCLUSION_RADIUS_M} m, strength ${VEHICLE_OCCLUSION_STRENGTH} on the ambient share`);
